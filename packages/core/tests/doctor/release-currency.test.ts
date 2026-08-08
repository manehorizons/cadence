import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import {
  evaluateReleaseCurrency,
  gatherLocalReleaseFacts,
  checkReleaseCurrency,
  isSafeNpmPackageName,
  runDoctor,
  type LocalReleaseFacts,
  type PublishedReleaseFacts,
} from '../../src/doctor/run.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

const ENV = { nodeVersion: 'v22.11.0', platform: 'linux' as const };

/** Default local facts: current version, an explicit `engines` constraint,
 *  no pending changesets — override per test. */
function localFacts(overrides: Partial<LocalReleaseFacts> = {}): LocalReleaseFacts {
  return {
    name: '@thomas-powers-jr/cadence-core',
    version: '1.55.0',
    engines: { node: '>=22' },
    pendingChangesets: [],
    ...overrides,
  };
}

/** Default published facts: a successful fetch matching {@link localFacts}'s
 *  defaults exactly (so composing both defaults unmodified is the "fully in
 *  sync" case) — override per test. */
function publishedFacts(overrides: Partial<PublishedReleaseFacts> = {}): PublishedReleaseFacts {
  return {
    fetchFailed: false,
    version: '1.55.0',
    engines: { node: '>=22' },
    ...overrides,
  };
}

/** Writes a fabricated `packages/core/package.json` under a `tempRepo` root. */
async function writeLocalPackageJson(root: string, content: Record<string, unknown>): Promise<void> {
  await mkdir(join(root, 'packages', 'core'), { recursive: true });
  await writeFile(join(root, 'packages', 'core', 'package.json'), JSON.stringify(content, null, 2));
}

/** Writes a `.changeset/<filename>` under a `tempRepo` root. */
async function writeChangeset(root: string, filename: string, content: string): Promise<void> {
  await mkdir(join(root, '.changeset'), { recursive: true });
  await writeFile(join(root, '.changeset', filename), content);
}

describe('evaluateReleaseCurrency (pure, no I/O)', () => {
  it('(a) engines divergence with a successful fetch -> warning, fixId null, non-null remediation, detail names local version, published version, and both engines values verbatim (262-01/AC-1)', () => {
    const check = evaluateReleaseCurrency({
      local: localFacts({ version: '1.55.0', engines: { node: '>=22' } }),
      published: publishedFacts({ version: '1.55.0', engines: { node: '>=20' } }),
    });
    expect(check.name).toBe('release-currency');
    expect(check.severity).toBe('warning');
    expect(check.fixId).toBeNull();
    expect(check.remediation).not.toBeNull();
    // Both version labels must be named, not just a bare version substring
    // that could pass even if the published version were silently dropped.
    expect(check.detail).toMatch(/local version 1\.55\.0/);
    expect(check.detail).toMatch(/published version 1\.55\.0/);
    expect(check.detail).toContain('>=22');
    expect(check.detail).toContain('>=20');
  });

  it('(a2) published engines empty (field absent) vs. local declaring a real constraint -> also a divergence (262-01/AC-1)', () => {
    const check = evaluateReleaseCurrency({
      local: localFacts({ engines: { node: '>=22' } }),
      published: publishedFacts({ engines: {} }),
    });
    expect(check.severity).toBe('warning');
    expect(check.detail).toContain('>=22');
  });

  it('(a2-reverse) local engines empty (field absent) vs. published declaring a real constraint -> also a divergence, not "in sync" (262-01/AC-1)', () => {
    // Mirrors (a2) in the opposite direction: a local package.json that
    // dropped `engines` while npm still serves one. Both directions must be
    // pinned independently — an equal-length-check bug (e.g. comparing only
    // key counts) could let one direction silently pass as "equal" while the
    // other correctly diverges.
    const check = evaluateReleaseCurrency({
      local: localFacts({ engines: {} }),
      published: publishedFacts({ engines: { node: '>=22' } }),
    });
    expect(check.severity).toBe('warning');
    expect(check.detail).not.toMatch(/in sync/i);
    expect(check.detail).toContain('>=22');
  });

  it('(a3) engines absent on BOTH sides ({} vs {}) is NOT a divergence -> falls through to the in-sync pass when no pending changesets (262-01/AC-1)', () => {
    const check = evaluateReleaseCurrency({
      local: localFacts({ engines: {}, pendingChangesets: [] }),
      published: publishedFacts({ engines: {} }),
    });
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/in sync/i);
  });

  it('the type-legal-but-inconsistent {fetchFailed:false, engines:null} shape is NOT treated as "in sync" even though fetchFailed is false (262-01/AC-3)', () => {
    // The real gatherer never produces this combination, but evaluateReleaseCurrency
    // is pure and a hand-fabricated facts object can still construct it — it must
    // degrade exactly like a genuine fetch failure (enginesComparable gates on
    // `published.engines !== null` too, not just `!fetchFailed`), not silently claim
    // a comparison happened when published.engines was never actually known.
    const check = evaluateReleaseCurrency({
      local: localFacts({ engines: { node: '>=22' }, pendingChangesets: [] }),
      published: { fetchFailed: false, version: '1.55.0', engines: null },
    });
    expect(check.severity).toBe('ok');
    expect(check.detail).not.toMatch(/in sync/i);
    expect(check.detail).toMatch(/could not be verified/i);
  });

  it('(b) engines match + pending changesets with no major/minor bump (a mix of patch and no-bump changesets) -> warning, routine wording, lists filenames (262-01/AC-2)', () => {
    const check = evaluateReleaseCurrency({
      local: localFacts({
        pendingChangesets: [
          { filename: 'a-patch-fix.md', bumpTypes: ['patch'] },
          { filename: 'a-no-bump-change.md', bumpTypes: [] },
        ],
      }),
      published: publishedFacts(),
    });
    expect(check.severity).toBe('warning');
    expect(check.fixId).toBeNull();
    expect(check.remediation).not.toBeNull();
    // Pin the actual bump-type rendering, not just filename presence — a
    // formatter that dropped the "(patch)" suffix entirely would still pass
    // a bare `toContain('a-patch-fix.md')` check.
    expect(check.detail).toContain('a-patch-fix.md (patch)');
    // A no-bump changeset renders with no parenthetical bump-type suffix.
    expect(check.detail).toContain('a-no-bump-change.md');
    expect(check.detail).not.toContain('a-no-bump-change.md (');
    expect(check.detail).not.toMatch(/major|minor/i);
  });

  it('(c) engines match + a pending minor changeset -> warning, visibly escalated wording (262-01/AC-2)', () => {
    const check = evaluateReleaseCurrency({
      local: localFacts({
        pendingChangesets: [{ filename: 'a-minor-change.md', bumpTypes: ['minor'] }],
      }),
      published: publishedFacts(),
    });
    expect(check.severity).toBe('warning');
    expect(check.detail).toContain('a-minor-change.md');
    // Assert the branch-distinguishing phrase itself, not a bare /minor/i
    // match — formatPendingChangesetList renders "a-minor-change.md (minor)"
    // regardless of which wording branch fires, so a bare word match would
    // stay green even if hasMajorOrMinorBump wrongly returned false.
    expect(check.detail).toMatch(/declare a major or minor version bump/i);
    expect(check.detail).not.toMatch(/patch-level or unspecified/i);
  });

  it('a pending major changeset also escalates the wording (same branch-distinguishing phrase) (262-01/AC-2)', () => {
    const check = evaluateReleaseCurrency({
      local: localFacts({
        pendingChangesets: [{ filename: 'a-major-change.md', bumpTypes: ['major'] }],
      }),
      published: publishedFacts(),
    });
    expect(check.severity).toBe('warning');
    expect(check.detail).toMatch(/declare a major or minor version bump/i);
    expect(check.detail).not.toMatch(/patch-level or unspecified/i);
  });

  it('(d) engines match + no pending changesets + fetch succeeded -> ok, detail positively asserts sync was verified ("in sync") (262-01/AC-3)', () => {
    const check = evaluateReleaseCurrency({
      local: localFacts({ pendingChangesets: [] }),
      published: publishedFacts(),
    });
    expect(check.severity).toBe('ok');
    expect(check.fixId).toBeNull();
    expect(check.remediation).toBeNull();
    expect(check.detail).toMatch(/in sync/i);
  });

  it('(d2) fetch failed (fetchFailed:true) + no pending changesets -> ok, detail positively asserts the published side could not be verified (262-01/AC-3, 262-01/AC-5)', () => {
    const check = evaluateReleaseCurrency({
      local: localFacts({ pendingChangesets: [] }),
      published: { fetchFailed: true, version: null, engines: null },
    });
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/could not be verified/i);
  });

  it('(e) both an engines divergence AND pending changesets present -> exactly one warning that leads with the engines finding and appends the changeset clause (262-01/AC-4)', () => {
    const check = evaluateReleaseCurrency({
      local: localFacts({
        engines: { node: '>=22' },
        pendingChangesets: [{ filename: 'a-pending-change.md', bumpTypes: ['patch'] }],
      }),
      published: publishedFacts({ engines: { node: '>=20' } }),
    });
    expect(check.severity).toBe('warning');
    expect(check.detail).toContain('>=22');
    expect(check.detail).toContain('>=20');
    expect(check.detail).toContain('a-pending-change.md');
    // The engines-divergence finding leads; the changeset clause is appended after it.
    expect(check.detail.indexOf('>=22')).toBeLessThan(check.detail.indexOf('a-pending-change.md'));
  });

  it('(f) fetchFailed:true + pending changesets present -> the 262-01/AC-2 warning still fires, with the published-engines-unverified clause appended (proves a network failure never suppresses the local-only changeset signal)', () => {
    const check = evaluateReleaseCurrency({
      local: localFacts({
        pendingChangesets: [{ filename: 'a-pending-change.md', bumpTypes: ['patch'] }],
      }),
      published: { fetchFailed: true, version: null, engines: null },
    });
    expect(check.severity).toBe('warning');
    expect(check.detail).toContain('a-pending-change.md');
    expect(check.detail).toMatch(/published engines could not be verified/i);
  });

  it('the type-legal-but-inconsistent {fetchFailed:false, engines:null} shape ALSO appends the provenance clause in the pending-changesets branch, not just the no-changesets branch (262-01/AC-2, 262-01/AC-3)', () => {
    // The no-pending-changesets version of this shape is covered above (the
    // AC-3 test at the top of this block), which pins the pass()-branch
    // wording. This is the AC-2/warning-branch sibling: `enginesComparable`
    // (not `!published.fetchFailed`) must gate the provenance clause here
    // too, or a fix that only patches the pass() branch leaves this branch
    // silently able to regress back to a bare, unqualified changesets
    // warning that doesn't say the published side was never checked.
    const check = evaluateReleaseCurrency({
      local: localFacts({
        pendingChangesets: [{ filename: 'a-pending-change.md', bumpTypes: ['patch'] }],
      }),
      published: { fetchFailed: false, version: '1.55.0', engines: null },
    });
    expect(check.severity).toBe('warning');
    expect(check.detail).toContain('a-pending-change.md');
    expect(check.detail).toMatch(/published engines could not be verified/i);
  });

  it('local unreadable/private (local: null) -> ok, "not determinable (best-effort)" detail, never a warning (262-01/AC-5)', () => {
    const check = evaluateReleaseCurrency({
      local: null,
      published: { fetchFailed: true, version: null, engines: null },
    });
    expect(check.name).toBe('release-currency');
    expect(check.severity).toBe('ok');
    expect(check.fixId).toBeNull();
    expect(check.detail).toMatch(/not determinable/i);
  });
});

describe('gatherLocalReleaseFacts (local fs, tempRepo, no network)', () => {
  it('reads name/version/engines from packages/core/package.json and pending changesets from .changeset/*.md, excluding README.md, parsing bump-type frontmatter (262-01/AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    await writeLocalPackageJson(active.root, {
      name: '@thomas-powers-jr/cadence-core',
      version: '1.55.0',
      engines: { node: '>=22' },
    });
    await writeChangeset(
      active.root,
      'a-minor-change.md',
      '---\n"@thomas-powers-jr/cadence-core": minor\n---\n\nSome minor change.\n',
    );
    await writeChangeset(active.root, 'README.md', '# Changesets\n\nThis is not a real changeset.\n');

    const local = await gatherLocalReleaseFacts(active.root);
    expect(local).not.toBeNull();
    expect(local?.name).toBe('@thomas-powers-jr/cadence-core');
    expect(local?.version).toBe('1.55.0');
    expect(local?.engines).toEqual({ node: '>=22' });
    // README.md must never be treated as a changeset.
    expect(local?.pendingChangesets).toEqual([
      { filename: 'a-minor-change.md', bumpTypes: ['minor'] },
    ]);
  });

  it('an engines key absent from package.json normalizes to {} rather than a read failure', async () => {
    active = await tempRepo({ initialized: true });
    await writeLocalPackageJson(active.root, { name: 'some-pkg', version: '1.0.0' });

    const local = await gatherLocalReleaseFacts(active.root);
    expect(local).not.toBeNull();
    expect(local?.engines).toEqual({});
  });

  it('missing packages/core/package.json -> null (262-01/AC-5)', async () => {
    active = await tempRepo({ initialized: true });
    const local = await gatherLocalReleaseFacts(active.root);
    expect(local).toBeNull();
  });

  it('private: true -> null, the whole check is not determinable/not applicable (262-01/AC-5)', async () => {
    active = await tempRepo({ initialized: true });
    await writeLocalPackageJson(active.root, { name: 'internal-only', version: '1.0.0', private: true });
    const local = await gatherLocalReleaseFacts(active.root);
    expect(local).toBeNull();
  });
});

describe('checkReleaseCurrency (orchestrator, injected gatherPublished — never node:child_process)', () => {
  it('calls the injected gatherPublished with the local package name and evaluates its result (262-01/AC-1)', async () => {
    active = await tempRepo({ initialized: true });
    await writeLocalPackageJson(active.root, {
      name: '@thomas-powers-jr/cadence-core',
      version: '1.55.0',
      engines: { node: '>=22' },
    });
    const calls: string[] = [];
    const gather = async (pkgName: string): Promise<PublishedReleaseFacts> => {
      calls.push(pkgName);
      return { fetchFailed: false, version: '1.55.0', engines: { node: '>=22' } };
    };

    const check = await checkReleaseCurrency(active.root, gather);
    expect(calls).toEqual(['@thomas-powers-jr/cadence-core']);
    expect(check.severity).toBe('ok');
  });

  it('a thrown/rejected gatherPublished is caught and degrades to the 262-01/AC-5(b) path rather than propagating, while still evaluating the already-gathered pending-changesets signal', async () => {
    active = await tempRepo({ initialized: true });
    await writeLocalPackageJson(active.root, {
      name: '@thomas-powers-jr/cadence-core',
      version: '1.55.0',
      engines: {},
    });
    await writeChangeset(
      active.root,
      'a-pending-change.md',
      '---\n"@thomas-powers-jr/cadence-core": patch\n---\n',
    );
    const gather = async (): Promise<PublishedReleaseFacts> => {
      throw new Error('npm view exploded');
    };

    const check = await checkReleaseCurrency(active.root, gather);
    expect(check.severity).toBe('warning');
    expect(check.detail).toContain('a-pending-change.md');
    expect(check.detail).toMatch(/could not be verified/i);
  });

  it('gatherPublished is never invoked when the tempRepo has no packages/core/package.json (262-01/AC-5)', async () => {
    active = await tempRepo({ initialized: true });
    let callCount = 0;
    const gather = async (): Promise<PublishedReleaseFacts> => {
      callCount++;
      return { fetchFailed: false, version: null, engines: {} };
    };

    const check = await checkReleaseCurrency(active.root, gather);
    expect(callCount).toBe(0);
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/not determinable/i);
  });

  it('wired into runDoctor full check list, without ever producing severity error, and the real default gatherer never touches the network in a bare tempRepo (262-01/AC-1)', async () => {
    active = await tempRepo({ initialized: true });
    const report = await runDoctor(active.root, ENV);
    const check = report.checks.find((c) => c.name === 'release-currency');
    expect(check).toBeDefined();
    expect(check?.severity).not.toBe('error');
    // No packages/core/package.json in this bare tempRepo, so the real
    // default gatherPublishedReleaseFacts must never fire — this is what
    // proves the AC-5(a) short-circuit holds through runDoctor's actual
    // check-array wiring, not just through the injected-gather unit tests
    // above.
    expect(check?.detail).toMatch(/not determinable/i);
  });
});

// isSafeNpmPackageName was exported as the fix for a real argument-injection
// finding caught by independent review of T1's implementation: a package
// name like "-f" previously got parsed by npm as a CLI flag rather than a
// package name, silently resolving an unrelated real package instead of
// failing loudly. It has real branching logic of its own and no other test
// coverage anywhere in the repo, so it gets direct unit tests here even
// though it isn't one of this phase's ACs — it is part of AC-5's best-effort
// degrade machinery (a rejected name short-circuits gatherPublishedReleaseFacts
// straight to fetchFailed:true without ever shelling out).
describe('isSafeNpmPackageName', () => {
  it('accepts legitimate unscoped and scoped npm package names, including digits, ".", "_", and "~" (262-01/AC-5)', () => {
    expect(isSafeNpmPackageName('left-pad')).toBe(true);
    expect(isSafeNpmPackageName('@thomas-powers-jr/cadence-core')).toBe(true);
    expect(isSafeNpmPackageName('some.pkg_name~1')).toBe(true);
    expect(isSafeNpmPackageName('pkg123')).toBe(true);
  });

  it('rejects a leading "-" (npm CLI flag injection) and other dangerous/malformed shapes', () => {
    expect(isSafeNpmPackageName('-f')).toBe(false);
    expect(isSafeNpmPackageName('--force')).toBe(false);
    expect(isSafeNpmPackageName('has a space')).toBe(false);
    expect(isSafeNpmPackageName('pkg; rm -rf /')).toBe(false);
    expect(isSafeNpmPackageName('$(whoami)')).toBe(false);
  });
});
