import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseExceptionsTable,
  isExpired,
  decideAdvisories,
  extractHighSeverityAdvisories,
  AuditUnavailableError,
} from '../../../../scripts/check-audit-exceptions.mjs';

// Resolve the repo-root CodeQL workflow from this test file's location:
// packages/core/tests/docs → ../../../../.github/workflows/codeql.yml
const CODEQL_YML = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'codeql.yml',
);

// Resolve the repo-root consolidated security workflow from this test file's
// location: packages/core/tests/docs → ../../../../.github/workflows/security.yml
const SECURITY_YML = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'security.yml',
);

// Resolve the repo-root audit exceptions doc from this test file's location:
// packages/core/tests/docs → ../../../../docs/security/audit-exceptions.md
const AUDIT_EXCEPTIONS_MD = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'docs',
  'security',
  'audit-exceptions.md',
);

// AC-1 (phase 182) — CodeQL static analysis must run on push, pull_request,
// and a weekly schedule, independent of push/PR activity, so static analysis
// coverage doesn't silently lapse if nobody pushes for a while.
describe('CodeQL workflow', () => {
  const yml = readFileSync(CODEQL_YML, 'utf8');

  it('analyzes the javascript-typescript language (AC-1)', () => {
    expect(yml).toMatch(/language[s]?:\s*\n?\s*[[-]?\s*['"]?javascript-typescript['"]?/);
  });

  it('triggers on push to main (AC-1)', () => {
    // Anchored to the line immediately after `push:` so a future edit that
    // widens push to all branches (removing this branches clause, or moving
    // it elsewhere) fails this test instead of matching some unrelated
    // `branches: [main]` later in the file.
    expect(yml).toMatch(/push:\n\s*branches:\s*\[main\]/);
  });

  it('triggers on pull_request (AC-1)', () => {
    expect(yml).toMatch(/pull_request:\n\s*branches:\s*\[main\]/);
  });

  it('triggers on a weekly schedule cron (AC-1)', () => {
    expect(yml).toMatch(/schedule:\s*\n\s*-\s*cron:\s*['"][^'"]+['"]/);
  });

  it('grants the permissions CodeQL analysis requires (AC-1)', () => {
    expect(yml).toContain('actions: read');
    expect(yml).toContain('contents: read');
    expect(yml).toContain('security-events: write');
  });
});

// AC-2 (phase 182) — a secret-scanning job must run on every push and pull
// request so leaked credentials are caught before/at merge time.
// AC-5 (phase 182) — the consolidated security workflow (secret-scan, audit,
// SBOM) must also run on a weekly schedule, independent of push/PR activity,
// so coverage doesn't silently lapse if the repo goes quiet.
describe('security workflow', () => {
  const yml = readFileSync(SECURITY_YML, 'utf8');

  it('runs a gitleaks-based secret-scan job (AC-2)', () => {
    expect(yml).toMatch(/secret-scan:/);
    expect(yml).toMatch(/gitleaks\/gitleaks-action@v\d+/);
  });

  it('triggers on push to main (AC-2)', () => {
    // Anchored to the line immediately after `push:` — see the CodeQL test
    // above for why a loose regex is rejected here.
    expect(yml).toMatch(/push:\n\s*branches:\s*\[main\]/);
  });

  it('triggers on pull_request to main (AC-2)', () => {
    expect(yml).toMatch(/pull_request:\n\s*branches:\s*\[main\]/);
  });

  it('triggers on a weekly schedule cron, independent of push/PR (AC-5)', () => {
    expect(yml).toMatch(/schedule:\s*\n\s*-\s*cron:\s*['"][^'"]+['"]/);
  });

  it('grants pull-requests read so the pull_request scan path does not 403 (AC-2)', () => {
    // gitleaks-action's pull_request path fetches the PR's commit list via
    // an unguarded GitHub API call before scanning; without this scope that
    // call 403s and the job errors instead of actually scanning PRs.
    const secretScanJob = yml.slice(yml.indexOf('secret-scan:'));
    expect(secretScanJob).toMatch(/permissions:[\s\S]*?pull-requests:\s*read/);
  });
});

// AC-3 (phase 182) — an audit job must run pnpm audit and cross-check any
// high/critical advisory against the documented exceptions allowlist,
// failing on anything undocumented or expired. Triggers are already covered
// by the workflow-level `on:` block asserted above (T2) — no need to re-test
// them here.
describe('security workflow — audit job', () => {
  const yml = readFileSync(SECURITY_YML, 'utf8');

  it('defines an audit job (AC-3)', () => {
    expect(yml).toMatch(/^\s*audit:\s*$/m);
  });

  it("documents that the job performs a pnpm audit (AC-3)", () => {
    // The actual pnpm-audit invocation lives inside check-audit-exceptions.mjs
    // (asserted directly below and unit-tested separately) — this just checks
    // the job is documented as being about a pnpm audit, not that the
    // workflow itself calls `pnpm audit` inline.
    expect(yml).toMatch(/pnpm audit/);
  });

  it('invokes the audit-exceptions check script (AC-3)', () => {
    expect(yml).toMatch(/node scripts\/check-audit-exceptions\.mjs/);
  });
});

// 253-01, AC-4 (phase 253) — the audit job must also invoke the
// pnpm.overrides lockfile-coverage detector, on the same install path as
// check-audit-exceptions.mjs, so a regressed override target fails CI
// before reaching main. Mirrors release-integrity.test.ts's "Release
// workflow integrity wiring" describe block: reads the real workflow file
// off disk and asserts step ordering/content, no subprocess or mocking.
describe('security workflow — audit job invokes the lockfile-overrides detector', () => {
  const yml = readFileSync(SECURITY_YML, 'utf8');
  const auditJobStart = yml.indexOf('\n  audit:');
  const auditJobEnd = yml.indexOf('\n  sbom:', auditJobStart);
  const auditJob = yml.slice(auditJobStart, auditJobEnd);

  it('invokes the lockfile-overrides check script (253-01/AC-4)', () => {
    expect(auditJob).toMatch(/node scripts\/check-lockfile-overrides\.mjs/);
  });

  it('runs the lockfile-overrides check on the same install path as check-audit-exceptions.mjs, after pnpm install --frozen-lockfile (253-01/AC-4)', () => {
    const installIdx = auditJob.indexOf('pnpm install --frozen-lockfile');
    const auditExceptionsIdx = auditJob.indexOf('node scripts/check-audit-exceptions.mjs');
    const lockfileOverridesIdx = auditJob.indexOf('node scripts/check-lockfile-overrides.mjs');

    expect(installIdx).toBeGreaterThan(-1);
    expect(auditExceptionsIdx).toBeGreaterThan(installIdx);
    expect(lockfileOverridesIdx).toBeGreaterThan(installIdx);
  });

  it('does not introduce a second install step or a new job (253-01/AC-4)', () => {
    // Only one `pnpm install --frozen-lockfile` in the audit job — the new
    // detector reuses the existing install, it does not add its own. And the
    // detector invocation itself lives inside the audit job block (auditJob
    // is already sliced to end at the next top-level job, `sbom:`) rather
    // than under a new job name.
    expect(auditJobEnd).toBeGreaterThan(-1);
    const installOccurrences = auditJob.match(/pnpm install --frozen-lockfile/g) ?? [];
    expect(installOccurrences).toHaveLength(1);
    expect(auditJob).toMatch(/node scripts\/check-lockfile-overrides\.mjs/);
  });
});

// AC-3 (phase 182) — the documented exceptions allowlist must exist with the
// columns the audit job's script relies on to cross-check advisories.
describe('audit exceptions doc', () => {
  const md = readFileSync(AUDIT_EXCEPTIONS_MD, 'utf8');

  it('documents the advisory id column (AC-3)', () => {
    expect(md).toMatch(/Advisory ID/i);
  });

  it('documents the package column (AC-3)', () => {
    expect(md).toMatch(/\|\s*Package\s*\|/i);
  });

  it('documents the justification column (AC-3)', () => {
    expect(md).toMatch(/Justification/i);
  });

  it('documents the expiry column (AC-3)', () => {
    expect(md).toMatch(/Expiry/i);
  });

  it('documents at least one real, non-expired exception with every column populated (AC-3)', () => {
    // phase 182's own audit run found genuine high/critical advisories in this
    // repo's current dependency tree (vitest/vite/hono, all dev-only or
    // unreachable-transport transitive deps — see the file for the real
    // justifications); the table intentionally documents them rather than
    // starting empty, so this asserts the documented rows are well-formed
    // and currently valid, not that the table is empty.
    const rows = parseExceptionsTable(md);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.id).toBeTruthy();
      expect(row.package).toBeTruthy();
      expect(row.justification).toBeTruthy();
      expect(isExpired(row.expiry)).toBe(false);
    }
  });
});

// 253-01 / AC-5 (phase 253, still valid) — the pre-253 doc asserted, as a
// flat factual claim, that pnpm's `pnpm.overrides` mechanism is
// non-functional under this repo's pinned pnpm 9.12.0. Phase 253 corrected
// that. This guard is scoped to the whole document, not to any one
// exception row, so it survives phase 254's removal of the (now-unrelated)
// brace-expansion row below — restored here after phase 254's T1
// mistakenly deleted it along with two other, genuinely row-specific
// assertions from the same now-removed describe block.
//
// Deliberate space between the qualifier and AC id above and in the
// describe() title below (matching the coverage scanner's own documented
// adjacency rule — see the it() title inside, which uses the hard-adjacent
// qualifying form on purpose): the scanner records only the FIRST qualified
// occurrence per token per file, so a hard-adjacent form sitting in a
// header comment before the real asserting it() would wrongly become the
// one recorded (non-qualifying) ref, discarding the real assertion below.
describe('audit exceptions doc — overrides mechanism narrative stays corrected (253-01 / AC-5)', () => {
  const md = readFileSync(AUDIT_EXCEPTIONS_MD, 'utf8');

  it('no longer asserts pnpm.overrides is non-functional/broken/dead/ignored as a flat claim (253-01/AC-5)', () => {
    // Matches the shape of the pre-253 assertion ("Overrides are therefore
    // non-functional...", "was found to be silently dead") without also
    // matching the corrected prose's own references to the past
    // misdiagnosis (which describe it as corrected, not assert it as fact).
    const lower = md.toLowerCase();
    expect(lower).not.toContain('overrides are therefore non-functional');
    expect(lower).not.toContain('overrides are non-functional');
    expect(lower).not.toContain('found to be silently dead');
    expect(lower).not.toContain("regardless of where they're declared");
  });
});

// 254-01 / AC-1 (phase 254) — the GHSA-mh99-v99m-4gvg (brace-expansion)
// exception row is dead weight since phase 253 refreshed the override
// target past its patched floor (script confirmed no longer flagging it).
// This asserts the row (and its GHSA id) is gone from the doc rather than
// left to expire on 2026-08-20. Qualifier and AC id kept apart here (see
// the note on the 253-01 / AC-5 block above) so this comment doesn't
// shadow the real, hard-adjacent-qualified assertion in the it() below.
describe('audit exceptions doc — dead brace-expansion exception retired (254-01 / AC-1)', () => {
  it('no longer documents GHSA-mh99-v99m-4gvg as an exception (254-01/AC-1)', () => {
    const md = readFileSync(AUDIT_EXCEPTIONS_MD, 'utf8');
    expect(md).not.toContain('GHSA-mh99-v99m-4gvg');
  });
});

// 254-01 / AC-2 (phase 254) — the three exceptions expiring 2026-08-13
// (vitest/vite/postcss) were re-justified with fresh reachability analysis
// and their expiry extended past this phase's 2026-08-12 deadline; the
// vitest major-version upgrade that would close them permanently is
// recorded as a named, deferred blocker rather than silently dropped.
// Qualifier and AC id kept apart here for the same reason noted above.
describe('audit exceptions doc — expiring exceptions re-justified, vitest-major deferred (254-01 / AC-2)', () => {
  const md = readFileSync(AUDIT_EXCEPTIONS_MD, 'utf8');
  const asOfPhaseDeadline = new Date('2026-08-12T23:59:59Z');

  it('each of the three previously-expiring rows now has an expiry past the phase deadline (254-01/AC-2)', () => {
    const rows = parseExceptionsTable(md);
    const previouslyExpiring = ['GHSA-5xrq-8626-4rwp', 'GHSA-fx2h-pf6j-xcff', 'GHSA-r28c-9q8g-f849'];
    for (const id of previouslyExpiring) {
      const row = rows.find((r) => r.id === id);
      expect(row).toBeTruthy();
      expect(isExpired(row.expiry, asOfPhaseDeadline)).toBe(false);
    }
  });

  it('records the deferred vitest-major upgrade blocker, naming PR #235 as not revivable (254-01/AC-2)', () => {
    expect(md).toContain('Deferred: vitest major-version upgrade');
    expect(md).toContain('PR #235');
    expect(md.toLowerCase()).toContain('do not reopen');
  });
});

// AC-3 (phase 182) — unit tests for the pure decision logic behind the audit
// job's script: parsing the exceptions table, expiry evaluation, and the
// allow/fail decision for a given set of high/critical advisories.
describe('check-audit-exceptions pure logic', () => {
  it('parses a documented exception row out of a markdown table (AC-3)', () => {
    const md = [
      '| Advisory ID | Package | Justification | Expiry |',
      '| --- | --- | --- | --- |',
      '| GHSA-aaaa-bbbb-cccc | left-pad | Not reachable in our usage. | 2099-01-01 |',
      '',
    ].join('\n');

    expect(parseExceptionsTable(md)).toEqual([
      {
        id: 'GHSA-aaaa-bbbb-cccc',
        package: 'left-pad',
        justification: 'Not reachable in our usage.',
        expiry: '2099-01-01',
      },
    ]);
  });

  it('ignores an example row placed inside an HTML comment (AC-3)', () => {
    const md = [
      '| Advisory ID | Package | Justification | Expiry |',
      '| --- | --- | --- | --- |',
      '<!--',
      '| GHSA-example-only | some-pkg | illustrative only | 2026-12-31 |',
      '-->',
      '',
    ].join('\n');

    expect(parseExceptionsTable(md)).toEqual([]);
  });

  it('treats a future expiry date as not expired (AC-3)', () => {
    expect(isExpired('2099-01-01', new Date('2026-07-14T00:00:00Z'))).toBe(false);
  });

  it('treats a past expiry date as expired (AC-3)', () => {
    expect(isExpired('2020-01-01', new Date('2026-07-14T00:00:00Z'))).toBe(true);
  });

  it('fails an advisory that is not in the exceptions list (AC-3)', () => {
    const decision = decideAdvisories(
      [{ id: 'GHSA-undocumented', package: 'some-pkg', severity: 'high' }],
      [],
      new Date('2026-07-14T00:00:00Z'),
    );

    expect(decision.ok).toBe(false);
    expect(decision.failures).toHaveLength(1);
    expect(decision.failures[0]?.reason).toMatch(/not listed/);
  });

  it('passes an advisory listed with a future expiry (AC-3)', () => {
    const decision = decideAdvisories(
      [{ id: 'GHSA-covered', package: 'some-pkg', severity: 'critical' }],
      [{ id: 'GHSA-covered', package: 'some-pkg', justification: 'Justified.', expiry: '2099-01-01' }],
      new Date('2026-07-14T00:00:00Z'),
    );

    expect(decision.ok).toBe(true);
    expect(decision.failures).toHaveLength(0);
    expect(decision.allowed).toHaveLength(1);
  });

  it('fails an advisory whose listed exception has expired (AC-3)', () => {
    const decision = decideAdvisories(
      [{ id: 'GHSA-lapsed', package: 'some-pkg', severity: 'high' }],
      [{ id: 'GHSA-lapsed', package: 'some-pkg', justification: 'Was justified.', expiry: '2020-01-01' }],
      new Date('2026-07-14T00:00:00Z'),
    );

    expect(decision.ok).toBe(false);
    expect(decision.failures).toHaveLength(1);
    expect(decision.failures[0]?.reason).toMatch(/expired/);
  });

  it('extracts high/critical advisories and skips low/moderate ones (AC-3)', () => {
    const auditJson = {
      advisories: {
        1: { id: 1, github_advisory_id: 'GHSA-high-one', module_name: 'pkg-a', severity: 'high' },
        2: { id: 2, github_advisory_id: 'GHSA-low-one', module_name: 'pkg-b', severity: 'low' },
      },
    };

    const advisories = extractHighSeverityAdvisories(auditJson);
    expect(advisories).toEqual([{ id: 'GHSA-high-one', package: 'pkg-a', severity: 'high' }]);
  });

  it('throws AuditUnavailableError when pnpm audit itself reports an error (AC-3)', () => {
    expect(() => extractHighSeverityAdvisories({ error: { message: 'endpoint retired' } })).toThrow(
      AuditUnavailableError,
    );
  });
});

// AC-4 (phase 182) — an SBOM job must generate a CycloneDX SBOM and a
// license inventory and upload both as workflow artifacts. Triggers are
// already covered by the workflow-level `on:` block asserted above (T2/AC-5)
// — no need to re-test them here.
describe('security workflow — sbom job', () => {
  const yml = readFileSync(SECURITY_YML, 'utf8');

  it('defines an sbom job (AC-4)', () => {
    expect(yml).toMatch(/^\s*sbom:\s*$/m);
  });

  it('invokes a CycloneDX SBOM generator (AC-4)', () => {
    expect(yml).toMatch(/@cyclonedx\/cyclonedx-npm/);
  });

  it('invokes a license-listing step (AC-4)', () => {
    expect(yml).toMatch(/pnpm licenses list/);
  });

  it('uploads the SBOM and license inventory as workflow artifacts (AC-4)', () => {
    expect(yml).toMatch(/actions\/upload-artifact@v\d+/);
    expect(yml).toContain('sbom.cdx.json');
    expect(yml).toContain('licenses.json');
  });
});

// Resolve the repo-root phase 255 DRAFT from this test file's location:
// packages/core/tests/docs → ../../../../.cadence/phases/255-make-security-merge-blocking/255-01-DRAFT.md
const PHASE_255_DRAFT_MD = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '.cadence',
  'phases',
  '255-make-security-merge-blocking',
  '255-01-DRAFT.md',
);

// 255-01 / AC-1 (phase 255) — security-success must aggregate secret-scan
// and audit only (sbom deliberately excluded -- it's a compliance-artifact
// generation step, not a security verdict), mirroring ci-success's
// if: always() + explicit needs.<job>.result string-comparison pattern.
// Sliced from `\n  security-success:` to the end of the file (it is the
// last job in security.yml), the same slice-between-job-markers technique
// the 253-01 audit-job block above uses. Qualifier and AC id kept apart in
// this comment and in the describe() title below; the asserting it() titles
// use the hard-adjacent form on purpose — see the 253-01/AC-5 note above for
// why (the coverage scanner records only the first qualified occurrence per
// AC token per file).
describe('security workflow — security-success aggregator (255-01 / AC-1)', () => {
  const yml = readFileSync(SECURITY_YML, 'utf8');
  const jobStart = yml.indexOf('\n  security-success:');
  const job = yml.slice(jobStart);

  it('defines security-success needing exactly [secret-scan, audit], with sbom excluded (255-01/AC-1)', () => {
    expect(jobStart).toBeGreaterThan(-1);
    expect(job).toMatch(/needs:\s*\[secret-scan,\s*audit\]/);
    expect(job).not.toMatch(/needs:\s*\[[^\]]*sbom[^\]]*\]/);
  });

  it('runs security-success with if: always() so it reports even when a dependency is skipped (255-01/AC-1)', () => {
    expect(job).toMatch(/if:\s*always\(\)/);
  });

  it("string-compares both needs['secret-scan'].result and needs.audit.result to success (255-01/AC-1)", () => {
    // Single-line comparisons in the actual step body — `.` (no dotAll) is
    // deliberately used instead of `[\s\S]*` here so this can't cross a line
    // boundary and pair a mutated/broken secret-scan comparison with the
    // unrelated audit comparison's own `!= "success"` a few lines below.
    expect(job).toMatch(/needs\[[\x27\x22]secret-scan[\x27\x22]\]\.result.*!=\s*[\x22\x27]success[\x22\x27]/);
    expect(job).toMatch(/needs\.audit\.result.*!=\s*[\x22\x27]success[\x22\x27]/);
  });
});

// 255-01 / AC-2 (phase 255) — codeql-success must give CodeQL a stable,
// non-matrix-derived required-check name, needing only [analyze], with the
// same if: always() + string-compare-to-success pattern as ci-success and
// security-success. Sliced from `\n  codeql-success:` to the end of the
// file (it is the last job in codeql.yml). Qualifier/AC-id spacing follows
// the same convention noted above.
describe('CodeQL workflow — codeql-success aggregator (255-01 / AC-2)', () => {
  const yml = readFileSync(CODEQL_YML, 'utf8');
  const jobStart = yml.indexOf('\n  codeql-success:');
  const job = yml.slice(jobStart);

  it('defines codeql-success needing exactly [analyze] (255-01/AC-2)', () => {
    expect(jobStart).toBeGreaterThan(-1);
    expect(job).toMatch(/needs:\s*\[analyze\]/);
  });

  it('runs codeql-success with if: always() so it reports even when analyze is skipped (255-01/AC-2)', () => {
    expect(job).toMatch(/if:\s*always\(\)/);
  });

  it('string-compares needs.analyze.result to "success" (255-01/AC-2)', () => {
    // `.` (no dotAll), not `[\s\S]*` — see the 255-01/AC-1 block above for
    // why: keeps this pinned to the single line where the real comparison
    // lives instead of matching across an unrelated line.
    expect(job).toMatch(/needs\.analyze\.result.*!=\s*[\x22\x27]success[\x22\x27]/);
  });
});

// 255-01 / AC-3 (phase 255) — the honest gate-scope distinction must be
// documented, not just implemented: codeql-success gates on the analyze job
// *completing*, not on zero CodeQL findings (CodeQL's analyze step does not
// fail its own job by default on alerts), while security-success's
// secret-scan/audit dependencies genuinely fail on real conditions. Also
// asserts the audit-exceptions.md "What blocks a merge" section states the
// not-yet-a-required-check caveat, so a reader can't come away believing
// either aggregator already blocks anything today.
describe('audit exceptions doc + CodeQL workflow — honest gate-scope note (255-01 / AC-3)', () => {
  const md = readFileSync(AUDIT_EXCEPTIONS_MD, 'utf8');
  const codeqlYml = readFileSync(CODEQL_YML, 'utf8');
  // Collapse whitespace (including line wraps) so a substring that happens
  // to wrap across two lines in the source markdown still matches — several
  // of the sentences asserted below wrap mid-phrase in the actual file.
  const normalizedMd = md.replace(/\s+/g, ' ');

  it('documents a "What blocks a merge" section in audit-exceptions.md (255-01/AC-3)', () => {
    expect(md).toContain('## What blocks a merge');
  });

  it('states neither aggregator is a required check yet, alongside describing what "blocks a merge" (255-01/AC-3)', () => {
    expect(md).toContain('blocks a merge');
    expect(md).toContain('neither check below actually blocks a merge yet');
  });

  it('states codeql-success only means the analyze job ran, not that CodeQL found nothing (255-01/AC-3)', () => {
    expect(codeqlYml).toContain('does not fail its job by default when it finds alerts');
    expect(normalizedMd).toContain("does not fail its own job by default when it finds alerts");
  });
});

// 255-01 / AC-4 (phase 255) — a meta-assertion that both new aggregator
// jobs are present and wired the same way: needing a job list, gated with
// if: always(). The detailed needs-list/string-compare assertions live in
// the 255-01/AC-1 and 255-01/AC-2 blocks above; this is the combined token
// proving both aggregators are covered by tests.
describe('security + codeql workflows — both merge-blocking aggregators covered (255-01 / AC-4)', () => {
  const securityYml = readFileSync(SECURITY_YML, 'utf8');
  const codeqlYml = readFileSync(CODEQL_YML, 'utf8');

  it('security-success and codeql-success both exist as if: always() jobs with a needs: list (255-01/AC-4)', () => {
    const securityJob = securityYml.slice(securityYml.indexOf('\n  security-success:'));
    const codeqlJob = codeqlYml.slice(codeqlYml.indexOf('\n  codeql-success:'));
    expect(securityJob).toMatch(/if:\s*always\(\)[\s\S]*needs:\s*\[/);
    expect(codeqlJob).toMatch(/if:\s*always\(\)[\s\S]*needs:\s*\[/);
  });
});

// 255-01 / AC-5 (phase 255) — the branch-protection follow-up must be
// recorded as an explicit, sequenced, non-automated operator task in the
// DRAFT (T5), not a side note: a human, via GitHub Settings (or an
// equivalent `gh api` call typed by that human), only after this PR has
// merged and both aggregators have reported at least once on main. Sliced
// from `### T5:` to the next `## Boundaries` heading.
describe('phase 255 DRAFT — T5 branch-protection runbook (255-01 / AC-5)', () => {
  const draft = readFileSync(PHASE_255_DRAFT_MD, 'utf8');
  const t5Start = draft.indexOf('### T5:');
  const t5End = draft.indexOf('## Boundaries', t5Start);
  const t5 = draft.slice(t5Start, t5End);

  it('names both exact branch-protection context strings, security-success and codeql-success (255-01/AC-5)', () => {
    expect(t5Start).toBeGreaterThan(-1);
    expect(t5End).toBeGreaterThan(t5Start);
    expect(t5).toContain('security-success');
    expect(t5).toContain('codeql-success');
  });

  it('states this is a manual, human, GitHub Settings operator action, not a cadence/CLI command (255-01/AC-5)', () => {
    expect(t5).toContain('Manual execution only');
    expect(t5).toContain('a human with repo admin rights');
    expect(t5).toContain('GitHub web UI');
    expect(t5).toContain('NOT something any `cadence` CLI command performs');
  });

  it('states the merge-then-both-report-then-add ordering constraint (255-01/AC-5)', () => {
    expect(t5).toContain('perform step 1 ONLY after');
    expect(t5).toContain("this phase's PR has merged to `main`");
    expect(t5).toContain('posted at least one real status on a commit on `main`');
  });

  it('disambiguates that marking T5 DONE does not mean the contexts were actually added (255-01/AC-5)', () => {
    expect(t5).toContain('Marking T5 DONE');
    expect(t5).toContain('it is not a signal that the branch-protection contexts have been added');
  });
});
