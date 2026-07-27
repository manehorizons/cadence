import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { emptyState } from '@manehorizons/cadence-types';
import { runDoctor } from '../../src/doctor/run.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

const HEALTHY_ENV = { nodeVersion: 'v22.11.0', platform: 'linux' as const };

async function writeCoverageMode(root: string, coverageMode: 'assertion' | 'mention'): Promise<void> {
  const path = join(root, '.cadence', 'config.json');
  const raw = JSON.parse(await readFile(path, 'utf8'));
  raw.verification = { ...raw.verification, coverageMode };
  await writeFile(path, JSON.stringify(raw, null, 2));
}

function findCheck(checks: { name: string }[], name: string) {
  return checks.find((c) => c.name === name);
}

describe('runDoctor', () => {
  it('AC-1: healthy initialized project → no errors, report.ok true', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc' });
    const report = await runDoctor(active.root, HEALTHY_ENV);
    expect(report.ok).toBe(true);
    // Warnings are allowed (e.g. verification-readiness warns on default mock config).
    // Errors must be absent for report.ok to be true.
    expect(report.checks.every((c) => c.severity !== 'error')).toBe(true);
    expect(report.checks.map((c) => c.name)).toEqual(
      expect.arrayContaining(['node', 'initialized', 'state']),
    );
  });

  it('AC-2: uninitialized project → initialized is error, report.ok false', async () => {
    active = await tempRepo({ initialized: false });
    const report = await runDoctor(active.root, HEALTHY_ENV);
    const init = report.checks.find((c) => c.name === 'initialized');
    expect(init?.severity).toBe('error');
    expect(init?.detail).toMatch(/\.cadence\//);
    expect(init?.remediation).toMatch(/cadence init/);
    expect(report.ok).toBe(false);
  });

  it('AC-2/AC-5: sub-floor node → node is error, report.ok false', async () => {
    active = await tempRepo({ initialized: true });
    const report = await runDoctor(active.root, {
      nodeVersion: 'v18.20.0',
      platform: 'linux',
    });
    const node = report.checks.find((c) => c.name === 'node');
    expect(node?.severity).toBe('error');
    expect(report.ok).toBe(false);
  });

  /**
   * Phase 197, T3 (issue #177 fallout from phase 196): since state.json/
   * STATE.md became gitignored and per-worktree, the old "run any cadence
   * command, or `cadence init`" advice for a missing state.json no longer
   * works — `cadence init` refuses outright when `.cadence/` already exists
   * (the exact situation that produces this check). `cadence onboard` is the
   * command built to bootstrap state.json for an already-`.cadence/`-
   * committed checkout, so the fix suggestion must name it instead.
   */
  it('AC-3: missing state.json → error names `cadence onboard`, not `cadence init`, as the fix', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-state-missing' });
    await unlink(join(active.root, '.cadence', 'state.json'));

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'state');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('error');
    expect(check?.detail).toMatch(/state\.json is missing/);
    expect(check?.remediation).toMatch(/cadence onboard/);
    expect(check?.remediation).not.toMatch(/cadence progress/);
    expect(report.ok).toBe(false);
  });
});

/**
 * T4 (phase 166, AC-4, fix round): `runDoctor` — not just the MCP
 * `doctorService` seam — flags `verification.coverageMode: 'assertion'`
 * paired with a detected project language that has no assertion-mode
 * span-parsing support yet. This is the check `cadence doctor` (the CLI
 * command) must surface, since the CLI calls `runDoctor` directly and never
 * goes through `doctorService`.
 *
 * Phase 167 shipped real assertion-mode span support for python/go/rust/php
 * (previously js/ts-only), checked against the live coverage-profile
 * registry rather than a hardcoded language list (`../../src/doctor/run.ts`,
 * `checkCoverageModeLanguageSupport`) — a phase-167 doc review caught that
 * this check had originally been left hardcoded to `lang === 'js'` even
 * after all five profiles landed, which would have kept producing a false
 * "no support yet" warning for exactly the four languages the phase built
 * support for. The python-warns case below no longer applies (python now
 * has real support, like js/go/rust/php); only `unknown` (no recognized
 * marker file) still warns.
 */
describe('runDoctor — coverage-mode language support (phase 166 AC-4, phase 167 registry-driven fix)', () => {
  it('flags coverageMode:assertion paired with an unrecognized project language (no marker file)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-lang-unknown' });
    // No package.json/pyproject.toml/go.mod/Cargo.toml/composer.json — detectProjectLanguage() → 'unknown'.

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'coverage-mode-language-support');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('warning');
    expect(check?.detail).toMatch(/coverageMode/);
    expect(check?.detail).toMatch(/assertion/);
    expect(check?.detail).toMatch(/unknown/);
    expect(check?.remediation).toMatch(/cadence config edit coverageMode/);
    // A warning must not fail the overall report.
    expect(report.ok).toBe(true);
  });

  it('does not flag coverageMode:assertion paired with a detected js project', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-lang-js' });
    await writeFile(join(active.root, 'package.json'), JSON.stringify({ name: 'demo' }));

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'coverage-mode-language-support');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('ok');
  });

  it.each([
    ['python', 'pyproject.toml', '[tool.poetry]\nname = "demo"\n'],
    ['go', 'go.mod', 'module demo\n\ngo 1.22\n'],
    ['rust', 'Cargo.toml', '[package]\nname = "demo"\n'],
    ['php', 'composer.json', JSON.stringify({ name: 'demo/demo' })],
  ])(
    'does not flag coverageMode:assertion paired with a detected %s project (phase 167: real span support now exists)',
    async (lang, markerFile, markerContent) => {
      active = await tempRepo({ initialized: true, projectName: `doc-lang-${lang}` });
      await writeFile(join(active.root, markerFile), markerContent);

      const report = await runDoctor(active.root, HEALTHY_ENV);

      const check = findCheck(report.checks, 'coverage-mode-language-support');
      expect(check).toBeDefined();
      expect(check?.severity).toBe('ok');
      expect(check?.detail).toMatch(new RegExp(lang));
    },
  );

  it('does not flag coverageMode:mention regardless of detected language', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-lang-mention' });
    await writeCoverageMode(active.root, 'mention');
    await writeFile(join(active.root, 'pyproject.toml'), '[tool.poetry]\nname = "demo"\n');

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'coverage-mode-language-support');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('ok');
  });
});

/**
 * Phase 196 (issue #177): `.cadence/state.json`/`STATE.md` (and the other two
 * CADENCE-owned ephemeral paths) are per-worktree loop state that must never
 * be a tracked file — tracking any of them guarantees a real git merge
 * conflict the moment two CADENCE worktrees on different phases sync.
 */
describe('runDoctor — state-tracked (phase 196, issue #177, AC-2)', () => {
  it('AC-2: a tracked CADENCE-owned path fails, names the path, and is tagged fixId untrack-state', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-state-tracked' });
    execFileSync('git', ['init', '-q'], { cwd: active.root });
    // Staged-but-uncommitted still counts as tracked per `git ls-files`.
    execFileSync('git', ['add', '.cadence/state.json'], { cwd: active.root });

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'state-tracked');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('warning');
    expect(check?.detail).toMatch(/\.cadence\/state\.json/);
    expect(check?.remediation).toMatch(/cadence doctor --fix/);
    expect(check?.fixId).toBe('untrack-state');
    expect(report.ok).toBe(true); // warning, not error — must not fail the report
  });

  it('AC-2: none of the four CADENCE-owned paths tracked → passes', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-state-untracked' });
    execFileSync('git', ['init', '-q'], { cwd: active.root });

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'state-tracked');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('ok');
    expect(check?.detail).toMatch(/No CADENCE-owned ephemeral paths/);
  });

  it('AC-2: outside a git repository, degrades to a pass and never throws', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-state-nogit' });
    // Deliberately no `git init` — active.root is not a git repository.

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'state-tracked');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('ok');
    expect(check?.detail).toMatch(/could not verify/i);
  });
});

/**
 * Phase 196 (issue #177), T4: `checkState`'s corrupt-JSON fallback is
 * sharpened specifically for the unresolved-git-merge-conflict shape — when
 * `.cadence/state.json` still has literal `<<<<<<<`/`=======`/`>>>>>>>`
 * markers (the AC-2 `state-tracked` check flags the underlying cause; this
 * is the AC-5 diagnosis half for whoever already hit the conflict). Only
 * sharpened when BOTH sides of the conflict cleanly parse as JSON AND
 * validate against `CadenceStateZ` — anything less clean (invalid JSON on
 * either side, or valid JSON that fails schema validation) falls all the way
 * back to today's unchanged generic "not valid JSON" message, never a guess.
 */
describe('runDoctor — state conflict-marker diagnosis (phase 196, issue #177, AC-5)', () => {
  function conflictBody(local: unknown, incoming: unknown, marker = 'HEAD', incomingMarker = 'worktree-branch'): string {
    return [
      `<<<<<<< ${marker}`,
      JSON.stringify(local, null, 2),
      '=======',
      JSON.stringify(incoming, null, 2),
      `>>>>>>> ${incomingMarker}`,
      '',
    ].join('\n');
  }

  it('both sides valid + schema-conformant → sharpened field-by-field diff, fixId resolve-state-conflict', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-state-conflict-clean' });
    const local = { ...emptyState('doc-state-conflict-clean'), activePhase: '30', loopPosition: 'BUILD' as const };
    const incoming = { ...emptyState('doc-state-conflict-clean'), activePhase: '31', loopPosition: 'SETTLE' as const };
    await writeFile(join(active.root, '.cadence', 'state.json'), conflictBody(local, incoming));

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'state');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('error');
    expect(check?.fixId).toBe('resolve-state-conflict');
    expect(check?.detail).toMatch(/unresolved git merge conflict/i);
    // Both differing fields, both sides' actual values, must be named.
    expect(check?.detail).toContain('activePhase');
    expect(check?.detail).toContain('30');
    expect(check?.detail).toContain('31');
    expect(check?.detail).toContain('loopPosition');
    expect(check?.detail).toContain('BUILD');
    expect(check?.detail).toContain('SETTLE');
    expect(check?.remediation).toMatch(/cadence doctor --fix --resolve-state-conflict=local/);
  });

  it('only session differs between the two sides → diff detail names the session field', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-state-conflict-session' });
    const base = emptyState('doc-state-conflict-session');
    const local = { ...base, session: { ...base.session, tokenUtilization: 0 } };
    const incoming = { ...base, session: { ...base.session, tokenUtilization: 0.5 } };
    await writeFile(join(active.root, '.cadence', 'state.json'), conflictBody(local, incoming));

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'state');
    expect(check?.severity).toBe('error');
    expect(check?.fixId).toBe('resolve-state-conflict');
    expect(check?.detail).toContain('session');
    expect(check?.detail).toContain('0.5');
  });

  it('conflict-shaped but one side is invalid JSON → falls back to the generic corrupt-JSON message, fixId not resolve-state-conflict', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-state-conflict-badjson' });
    const local = emptyState('doc-state-conflict-badjson');
    const raw = [
      '<<<<<<< HEAD',
      JSON.stringify(local, null, 2),
      '=======',
      '{ this is not valid json,,,',
      '>>>>>>> worktree-branch',
      '',
    ].join('\n');
    await writeFile(join(active.root, '.cadence', 'state.json'), raw);

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'state');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('error');
    expect(check?.detail).toMatch(/state\.json is not valid JSON/);
    expect(check?.fixId).not.toBe('resolve-state-conflict');
    expect(check?.remediation).toMatch(/Restore \.cadence\/state\.json from version control, or re-init\./);
  });

  it('conflict-shaped, both sides valid JSON, but one fails CadenceStateZ schema validation → falls back to the generic message', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-state-conflict-badschema' });
    const local = emptyState('doc-state-conflict-badschema');
    // Missing the required `schemaVersion` literal field → fails CadenceStateZ.safeParse.
    const incoming: Record<string, unknown> = { ...emptyState('doc-state-conflict-badschema') };
    delete incoming.schemaVersion;
    await writeFile(join(active.root, '.cadence', 'state.json'), conflictBody(local, incoming));

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'state');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('error');
    expect(check?.detail).toMatch(/state\.json is not valid JSON/);
    expect(check?.fixId).not.toBe('resolve-state-conflict');
  });

  it('plain garbage, not conflict-marker-shaped at all → unchanged regression guard on today\'s generic message', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-state-plain-garbage' });
    await writeFile(join(active.root, '.cadence', 'state.json'), '{invalid json');

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'state');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('error');
    expect(check?.detail).toMatch(/state\.json is not valid JSON/);
    expect(check?.fixId).toBeNull();
    expect(check?.remediation).toBe('Restore .cadence/state.json from version control, or re-init.');
  });
});
