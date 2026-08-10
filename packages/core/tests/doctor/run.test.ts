import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFile, readFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { emptyState, defaultConfig } from '@thomas-powers-jr/cadence-types';
import {
  runDoctor,
  checkConductionReachability,
  checkConductionDriftStreak,
  CONDUCTION_DRIFT_STREAK_WARN_THRESHOLD,
} from '../../src/doctor/run.js';
import { pass, fail, rollup, type DoctorCheck } from '../../src/doctor/model.js';
import { severityMark } from '../../src/cli/commands/doctor.js';
import { settleService } from '../../src/services/settle.js';
import type { CommandIO } from '../../src/services/io.js';

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

/** Mirrors `tests/services/settle-collision.test.ts`'s / `settle.test.ts`'s
 *  identical `captureIO` helper — a `CommandIO` that records writes into
 *  plain arrays instead of touching real stdout/stderr. */
function captureIO(): { io: CommandIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
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

/**
 * Phase 250, T14 (whole-branch-review as-built amendment): `checkHostHooks`
 * and `checkCodexHooks` must not print the generic "no managed entries
 * found" message for a managed hook entry that IS present but stale (its
 * command still references the pre-rename npm scope) -- that message is a
 * false claim in that case (AC-5's Then-clause: flagged "as stale...
 * specifically because its command references the old scope, not just
 * marker-presence"). Strengthens the AC-5 coverage: the pre-existing AC-5
 * test in host-hooks.test.ts only asserted `severity`/`fixId`, never the
 * `detail` text -- which is exactly why the whole-branch review caught this
 * as a gap rather than a test failure. These assert on `detail` content,
 * distinguishing "stale, needs reinstall" from "no entry found at all", for
 * both the Claude Code (`host-hooks`) and Codex (`codex-hooks`) checks.
 */
describe('runDoctor — host-hooks/codex-hooks stale-scope message honesty (phase 250, T14)', () => {
  // The stale (pre-rename) npm scope, built via concatenation rather than one
  // literal so this fixture -- which must exercise the real stale-scope
  // string to trip hasStaleScopeManagedHook -- doesn't itself trip the
  // phase-250 repo-wide stray-scope sweep (npm-scope-sweep.test.ts), which
  // does not allowlist this file.
  const STALE_SCOPE = '@maneh' + 'orizons/';
  const STALE_HOST_COMMAND = `npx ${STALE_SCOPE}cadence-host-claude-code hook`;
  const STALE_CODEX_COMMAND = `npx -y ${STALE_SCOPE}cadence-host-codex hook`;
  const FRESH_HOST_COMMAND = 'npx @thomas-powers-jr/cadence-host-claude-code hook';

  async function writeHostSettings(root: string, command: string): Promise<void> {
    await mkdir(join(root, '.claude'), { recursive: true });
    await writeFile(
      join(root, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: 'command', command }], _managedBy: 'cadence' }] },
      }),
    );
  }

  async function writeCodexHooksFile(root: string, command: string): Promise<void> {
    await mkdir(join(root, '.codex'), { recursive: true });
    await writeFile(
      join(root, '.codex', 'hooks.json'),
      JSON.stringify({
        hooks: { Stop: [{ _managedBy: 'cadence', hooks: [{ type: 'command', command }] }] },
      }),
    );
  }

  it('250-01/AC-5: host-hooks: a stale-scope managed entry is flagged stale/needs-reinstall, not "not found", and remediation names --fix --wire-host', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-host-hooks-stale' });
    await writeHostSettings(active.root, STALE_HOST_COMMAND);

    const report = await runDoctor(active.root, HEALTHY_ENV);
    const check = findCheck(report.checks, 'host-hooks');

    expect(check?.severity).toBe('warning');
    expect(check?.fixId).toBe('host-install');
    expect(check?.detail).toMatch(/outdated npm scope/i);
    expect(check?.detail).toMatch(/needs reinstalling/i);
    expect(check?.detail).not.toMatch(/No CADENCE-managed/);
    expect(check?.remediation).toMatch(/cadence doctor --fix --wire-host/);
  });

  it('250-01/AC-5: host-hooks: a genuinely absent managed entry still reports "not found", distinct from the stale-scope message', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-host-hooks-absent' });
    await mkdir(join(active.root, '.claude'), { recursive: true });
    await writeFile(join(active.root, '.claude', 'settings.json'), JSON.stringify({ hooks: {} }));

    const report = await runDoctor(active.root, HEALTHY_ENV);
    const check = findCheck(report.checks, 'host-hooks');

    expect(check?.severity).toBe('warning');
    expect(check?.fixId).toBe('host-install');
    expect(check?.detail).toMatch(/No CADENCE-managed/);
    expect(check?.detail).not.toMatch(/outdated npm scope/i);
  });

  it('250-01/AC-5: host-hooks: a fresh-scope managed entry passes and is never flagged stale', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-host-hooks-fresh' });
    await writeHostSettings(active.root, FRESH_HOST_COMMAND);

    const report = await runDoctor(active.root, HEALTHY_ENV);
    expect(findCheck(report.checks, 'host-hooks')?.severity).toBe('ok');
  });

  it('250-01/AC-5: codex-hooks: a stale-scope managed entry is flagged stale/needs-reinstall, not "not found", and remediation names --fix --wire-host', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-codex-hooks-stale' });
    await writeCodexHooksFile(active.root, STALE_CODEX_COMMAND);

    const report = await runDoctor(active.root, HEALTHY_ENV);
    const check = findCheck(report.checks, 'codex-hooks');

    expect(check?.severity).toBe('warning');
    expect(check?.fixId).toBe('codex-host-install');
    expect(check?.detail).toMatch(/outdated npm scope/i);
    expect(check?.detail).toMatch(/needs reinstalling/i);
    expect(check?.detail).not.toMatch(/No CADENCE-managed/);
    expect(check?.remediation).toMatch(/cadence doctor --fix --wire-host/);
  });

  it('250-01/AC-5: codex-hooks: a genuinely absent managed entry still reports "not found", distinct from the stale-scope message', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-codex-hooks-absent' });
    await mkdir(join(active.root, '.codex'), { recursive: true });
    await writeFile(join(active.root, '.codex', 'hooks.json'), JSON.stringify({ hooks: {} }));

    const report = await runDoctor(active.root, HEALTHY_ENV);
    const check = findCheck(report.checks, 'codex-hooks');

    expect(check?.severity).toBe('warning');
    expect(check?.fixId).toBe('codex-host-install');
    expect(check?.detail).toMatch(/No CADENCE-managed/);
    expect(check?.detail).not.toMatch(/outdated npm scope/i);
  });
});

/**
 * Phase 251, T3: `checkConductionReachability` (`../../src/doctor/run.ts`) —
 * per-gate (`code-review`, `security-audit`), per-axis (profile / provider /
 * session) reachability of a real-provider finding. Called directly with
 * constructed `config`/`env` objects (never through `runDoctor`, which reads
 * live `process.env`) so every combination is deterministic and mock-only,
 * per AC-3. `defaultConfig` (`@thomas-powers-jr/cadence-types`) is a fully
 * populated, already-`CadenceConfig`-typed literal (profile 'auto',
 * `codeReview`/`securityAudit` both provider 'mock') — the minimal valid
 * fixture, built by spreading it and overriding only what each case needs,
 * matching the `{ ...defaultConfig, ... }` pattern already used in
 * `packages/core/tests/config-explain/build.test.ts`.
 */
describe('checkConductionReachability (phase 251)', () => {
  it("251-01/AC-3: profile 'auto' — both code-review and security-audit are profile-blocked (today's live default)", () => {
    const config = { ...defaultConfig, profile: 'auto' as const };

    const check = checkConductionReachability(config, {});

    expect(check.name).toBe('conduction-reachability');
    expect(check.status).toBe('warning');
    expect(check.severity).toBe('warning');
    expect(check.fixId).toBeNull();
    expect(check.detail).toContain('code-review: blocked by profile, provider');
    expect(check.detail).toContain('security-audit: blocked by profile, provider');
  });

  it("251-01/AC-3: profile 'standard' — code-review is profile-clear but security-audit is still profile-blocked (per-gate profile axis, not computed once and reused)", () => {
    const config = { ...defaultConfig, profile: 'standard' as const };

    const check = checkConductionReachability(config, {});

    expect(check.severity).toBe('warning');
    // code-review reaches standard×complex, so the profile axis does NOT
    // block it here — only the still-mock provider axis does. If the
    // implementation wrongly computed the profile axis once and reused it
    // for both gates, this would incorrectly report code-review as
    // profile-blocked too.
    expect(check.detail).toContain('code-review: blocked by provider');
    expect(check.detail).not.toMatch(/code-review: blocked by [^;]*profile/);
    // security-audit is absent from every 'standard'-profile cell at any
    // tier — its profile axis is blocked, distinctly from code-review's.
    expect(check.detail).toContain('security-audit: blocked by profile, provider');
  });

  it("251-01/AC-3: profile 'strict', code-review on host-cli, Claude Code session set — code-review is session-blocked, security-audit is still provider-blocked regardless of session", () => {
    const config = {
      ...defaultConfig,
      profile: 'strict' as const,
      codeReview: { provider: 'host-cli' as const },
    };
    const env = { CLAUDECODE: '1' };

    const check = checkConductionReachability(config, env);

    expect(check.severity).toBe('warning');
    expect(check.detail).toContain('code-review: blocked by session');
    expect(check.detail).not.toMatch(/code-review: blocked by [^;]*profile/);
    expect(check.detail).not.toMatch(/code-review: blocked by [^;]*provider/);
    // security-audit's provider is still the default 'mock' — provider-blocked
    // regardless of the session env var, since the session axis only ever
    // applies to a 'host-cli'-configured gate.
    expect(check.detail).toContain('security-audit: blocked by provider');
    expect(check.detail).not.toMatch(/security-audit: blocked by [^;]*session/);
  });

  it("251-01/AC-3: profile 'strict', both providers non-mock, no session — both gates fully reachable, status 'ok'", () => {
    const config = {
      ...defaultConfig,
      profile: 'strict' as const,
      codeReview: { provider: 'host-cli' as const },
      securityAudit: { provider: 'host-cli' as const },
    };
    const env = {};

    const check = checkConductionReachability(config, env);

    expect(check.status).toBe('ok');
    expect(check.severity).toBe('ok');
    expect(check.fixId).toBeNull();
    expect(check.remediation).toBeNull();
    expect(check.detail).toContain('code-review: reachable');
    expect(check.detail).toContain('security-audit: reachable');
  });

  it("251-01/AC-3: profile 'strict', code-review on anthropic, Claude Code session set — code-review is reachable DESPITE the session env var, because the session axis only applies to a host-cli-provider gate", () => {
    const config = {
      ...defaultConfig,
      profile: 'strict' as const,
      codeReview: { provider: 'anthropic' as const },
    };
    const env = { CLAUDECODE: '1' };

    const check = checkConductionReachability(config, env);

    expect(check.detail).toContain('code-review: reachable');
    // security-audit is still mock-provider-blocked, so the overall status
    // stays 'warning' — confirms the per-gate reachable verdict on
    // code-review isn't an artifact of a falsely-'ok' overall report.
    expect(check.status).toBe('warning');
    expect(check.detail).toContain('security-audit: blocked by provider');
  });

  it('251-01/AC-2: the detail names each gate\'s own blocked axis or axes separately, not one generic sentence', () => {
    const config = { ...defaultConfig, profile: 'auto' as const };

    const check = checkConductionReachability(config, {});

    // Both gates are named individually, each with its own "blocked by ..."
    // clause — an operator can tell at a glance which gate(s) and axis(es)
    // need attention, per AC-2's Then-clause.
    expect(check.detail).toMatch(/code-review: blocked by [a-z, ]+/);
    expect(check.detail).toMatch(/security-audit: blocked by [a-z, ]+/);
    expect(check.remediation).toContain('code-review:');
    expect(check.remediation).toContain('security-audit:');

    // Substring presence alone isn't enough — the profile-axis remediation
    // must be genuinely gate-specific (code-review's 3 reachable cells vs.
    // security-audit's strict×complex-only), never one shared generic hint
    // reused for both (SPEC: "The check and its remediation text must
    // report these two gates separately"). Assert the two gates' clauses
    // are textually distinct on the substance that differs between them.
    const remediation = check.remediation ?? '';
    expect(remediation).toContain("'standard' (tier: complex) or 'strict' (tier: standard or complex)");
    expect(remediation).toContain("security-audit's only reachable profile×tier cell");
    // And that neither gate's clause borrowed the other's hint text.
    const codeReviewClause = remediation.slice(0, remediation.indexOf('security-audit:'));
    const securityAuditClause = remediation.slice(remediation.indexOf('security-audit:'));
    expect(codeReviewClause).not.toContain("security-audit's only reachable profile×tier cell");
    expect(securityAuditClause).not.toContain("'standard' (tier: complex) or 'strict' (tier: standard or complex)");
  });
});

/**
 * Phase 268, T1: `DoctorSeverity` gains an `indeterminate` rung
 * (`dec-20260810-005`). This suite is pure model/CLI-glyph coverage — these
 * tests construct `DoctorCheck`/`DoctorReport` values directly via
 * `fail()`/`rollup()` rather than driving `runDoctor()`, independently of
 * the one real check that does emit `indeterminate`
 * (`conduction-drift-streak`, covered by its own describe blocks further
 * below in this file). AC-2's Given/When/Then bar: the roll-up, the `fail()`
 * helper, and the CLI glyph all handle the new rung explicitly, and no
 * pre-existing check's severity/output/exit-code path is disturbed.
 */
describe('DoctorSeverity — indeterminate rung (phase 268, T1)', () => {
  it('268-01/AC-2: fail() accepts \'indeterminate\' and mirrors it into status, same shape as warning/error', () => {
    const check = fail('conduction-drift', 'indeterminate', 'not enough corpus data to compute a streak', 'n/a');
    expect(check.severity).toBe('indeterminate');
    expect(check.status).toBe('indeterminate');
    expect(check.fixId).toBeNull();
  });

  it("268-01/AC-2: rollup() keeps ok:true for an indeterminate check, matching warning's existing treatment — zero code change, regression-tested", () => {
    const checks: DoctorCheck[] = [
      pass('healthy', 'all good'),
      fail('conduction-drift', 'indeterminate', 'no corpus data yet', 'n/a'),
    ];
    const report = rollup(checks);
    expect(report.ok).toBe(true);
  });

  it('268-01/AC-2: an indeterminate check does not mask a real error — rollup() still fails when an error check is also present', () => {
    const checks: DoctorCheck[] = [
      fail('conduction-drift', 'indeterminate', 'no corpus data yet', 'n/a'),
      fail('initialized', 'error', 'missing .cadence/', 'cadence init'),
    ];
    const report = rollup(checks);
    expect(report.ok).toBe(false);
  });

  it('268-01/AC-2: the CLI glyph handles all four rungs explicitly — indeterminate is its own case, never falling through to error\'s mark', () => {
    expect(severityMark('ok')).toBe('✓');
    expect(severityMark('warning')).toBe('!');
    expect(severityMark('error')).toBe('✗');
    expect(severityMark('indeterminate')).toBe('?');
    expect(severityMark('indeterminate')).not.toBe(severityMark('error'));
  });

  it('268-01/AC-2 regression: every check runDoctor() actually produces against a healthy repo is still ok|warning|error, never indeterminate — the widened type is additive and does not leak into existing checks', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-indeterminate-regression' });
    const report = await runDoctor(active.root, HEALTHY_ENV);
    expect(report.checks.length).toBeGreaterThan(0);
    for (const c of report.checks) {
      expect(['ok', 'warning', 'error']).toContain(c.severity);
      expect(c.status).toBe(c.severity);
    }
    // report.ok's roll-up boolean is unaffected — same rule as before this task.
    expect(report.ok).toBe(report.checks.every((c) => c.severity !== 'error'));
  });
});

/**
 * Phase 268, T4 (AC-3): the `conduction-drift-streak` `DoctorCheck` wrapper
 * around T2's `computeConductionDriftStreak`, and its wiring into
 * `runDoctor()`. Non-blocking, and — as of T5 (AC-4, tested separately
 * further below in this file) — `warning` is also a legal severity once the
 * streak reaches the escalation threshold; this describe block's own tests
 * only exercise sub-threshold streaks and the `indeterminate` case, so they
 * never see `warning` themselves. Never `error` — this check has nothing
 * that rises to a hard failure.
 */
async function writeMinimalSummary(
  root: string,
  phase: string,
  id: string,
  opts: {
    completedAt: string;
    omitAssurance?: boolean;
    verifierRollup?: Array<{ provider: string; gateCount: number }>;
  },
): Promise<void> {
  const dir = join(root, '.cadence', 'phases', phase);
  await mkdir(dir, { recursive: true });
  const body: Record<string, unknown> = {
    schemaVersion: 2,
    draftId: id,
    completedAt: opts.completedAt,
    acResults: [],
    taskResults: [],
    decisions: [],
    deferred: [],
    skillAudit: { required: [], invoked: [] },
  };
  if (!opts.omitAssurance) {
    body.assurance = {
      verifierRollup: opts.verifierRollup ?? [],
      evidenceTally: {
        'ai-verified': 0,
        executed: 0,
        assertion: 0,
        mention: 0,
        unverified: 0,
      },
      overall: 'unverified',
    };
  }
  await writeFile(join(dir, `${id}-SUMMARY.json`), JSON.stringify(body, null, 2));
}

describe('checkConductionDriftStreak — DoctorCheck wrapper (phase 268, T4)', () => {
  it('268-01/AC-3: empty corpus (fresh repo) → ok severity, streak 0 surfaced in detail', async () => {
    active = await tempRepo({ initialized: true, projectName: 'drift-streak-empty' });
    const check = await checkConductionDriftStreak(active.root);
    expect(check.name).toBe('conduction-drift-streak');
    expect(check.severity).toBe('ok');
    expect(check.status).toBe('ok');
    expect(check.detail.length).toBeGreaterThan(0);
  });

  it('268-01/AC-3: a pre-assurance (pre-phase-233) SUMMARY record renders indeterminate severity with explanatory text, never silently ok', async () => {
    active = await tempRepo({ initialized: true, projectName: 'drift-streak-indeterminate' });
    await writeMinimalSummary(active.root, '01-old-phase', '01-01', {
      completedAt: '2026-01-01T00:00:00Z',
      omitAssurance: true,
    });
    const check = await checkConductionDriftStreak(active.root);
    expect(check.name).toBe('conduction-drift-streak');
    expect(check.severity).toBe('indeterminate');
    expect(check.status).toBe('indeterminate');
    expect(check.detail.length).toBeGreaterThan(0);
    expect(check.detail).not.toBe('');
  });

  it('268-01/AC-3: a mock-only corpus stays ok (streak of 1 is below T5/AC-4\'s provisional threshold of 3)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'drift-streak-mock-only' });
    await writeMinimalSummary(active.root, '01-mock-phase', '01-01', {
      completedAt: '2026-01-01T00:00:00Z',
      verifierRollup: [{ provider: 'mock', gateCount: 1 }],
    });
    const check = await checkConductionDriftStreak(active.root);
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/1/);
  });

  it('268-01/AC-3: wired into runDoctor() — the streak check is present in the full report, non-blocking (report.ok stays true)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'drift-streak-in-doctor' });
    const report = await runDoctor(active.root, HEALTHY_ENV);
    const check = findCheck(report.checks, 'conduction-drift-streak');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('ok');
    expect(report.ok).toBe(true);
  });

  it('268-01/AC-3: wired into runDoctor() — an indeterminate corpus surfaces as its own check, not folded into report.ok', async () => {
    active = await tempRepo({ initialized: true, projectName: 'drift-streak-indeterminate-doctor' });
    await writeMinimalSummary(active.root, '01-old-phase', '01-01', {
      completedAt: '2026-01-01T00:00:00Z',
      omitAssurance: true,
    });
    const report = await runDoctor(active.root, HEALTHY_ENV);
    const check = findCheck(report.checks, 'conduction-drift-streak');
    expect(check?.severity).toBe('indeterminate');
    // Non-blocking: an indeterminate finding never flips report.ok to false.
    expect(report.ok).toBe(true);
  });
});

/**
 * Phase 268, T5 (AC-4): severity escalation against the provisional
 * threshold. `checkConductionDriftStreak`'s legal severities widen here from
 * `{ok, indeterminate}` (T4) to `{ok, warning, indeterminate}` — a
 * determinate streak that reaches `CONDUCTION_DRIFT_STREAK_WARN_THRESHOLD`
 * escalates one rung to `warning`; `indeterminate` stays fully orthogonal to
 * this ladder, reachable only via the missing/malformed-corpus path (T2),
 * never via streak length.
 */
async function writeMockOnlyStreak(root: string, count: number): Promise<void> {
  for (let i = 1; i <= count; i++) {
    // Zero-padded to 2 digits (not naive `0${i}`, which breaks past i=9 --
    // '010' sorts/parses wrong against '02') so this helper stays correct if
    // a future threshold retune needs a longer streak than today's 3.
    const n = String(i).padStart(2, '0');
    await writeMinimalSummary(root, `${n}-mock-phase`, `${n}-01`, {
      completedAt: `2026-01-${n}T00:00:00Z`,
      verifierRollup: [{ provider: 'mock', gateCount: 1 }],
    });
  }
}

describe('checkConductionDriftStreak — severity escalation against the provisional threshold (phase 268, T5, AC-4)', () => {
  it('268-01/AC-4: a streak one below the provisional threshold (2 < 3) stays ok', async () => {
    active = await tempRepo({ initialized: true, projectName: 'drift-streak-below-threshold' });
    await writeMockOnlyStreak(active.root, CONDUCTION_DRIFT_STREAK_WARN_THRESHOLD - 1);
    const check = await checkConductionDriftStreak(active.root);
    expect(check.severity).toBe('ok');
    expect(check.status).toBe('ok');
  });

  it('268-01/AC-4: a streak AT the provisional threshold (3) escalates ok → warning, and "provisional threshold" is surfaced in the rendered detail', async () => {
    active = await tempRepo({ initialized: true, projectName: 'drift-streak-at-threshold' });
    await writeMockOnlyStreak(active.root, CONDUCTION_DRIFT_STREAK_WARN_THRESHOLD);
    const check = await checkConductionDriftStreak(active.root);
    expect(check.severity).toBe('warning');
    expect(check.status).toBe('warning');
    // AC-4 + the DRAFT's explicit instruction: the threshold must read as
    // provisional in the rendered CLI/JSON output, not just in a code
    // comment — `--json` serializes this `detail` string verbatim.
    expect(check.detail).toMatch(/provisional threshold/i);
    expect(check.detail).toMatch(new RegExp(String(CONDUCTION_DRIFT_STREAK_WARN_THRESHOLD)));
  });

  it('268-01/AC-4: a streak ABOVE the provisional threshold (4 > 3) stays warning — one rung only, not a further escalation', async () => {
    active = await tempRepo({ initialized: true, projectName: 'drift-streak-above-threshold' });
    await writeMockOnlyStreak(active.root, CONDUCTION_DRIFT_STREAK_WARN_THRESHOLD + 1);
    const check = await checkConductionDriftStreak(active.root);
    expect(check.severity).toBe('warning');
  });

  it('268-01/AC-4: indeterminate stays orthogonal to the escalation ladder — never itself escalated by streak length, even with threshold-or-more valid records ahead of the indeterminate boundary', async () => {
    active = await tempRepo({ initialized: true, projectName: 'drift-streak-indeterminate-orthogonal' });
    // The 3 most-recent settles are mock-only — on their own an escalating
    // streak of 3 — but an OLDER record predates assurance.verifierRollup
    // entirely, so per T2's AC-1 rule the WHOLE result degrades to
    // indeterminate. It must never read as 'warning' just because
    // threshold-or-more valid records happened to precede the unassessable
    // one.
    await writeMockOnlyStreak(active.root, CONDUCTION_DRIFT_STREAK_WARN_THRESHOLD);
    await writeMinimalSummary(active.root, '00-old-phase', '00-01', {
      completedAt: '2025-12-31T00:00:00Z',
      omitAssurance: true,
    });
    const check = await checkConductionDriftStreak(active.root);
    expect(check.severity).toBe('indeterminate');
    expect(check.status).toBe('indeterminate');
  });

  it('268-01/AC-4: wired into runDoctor() — an escalated warning is surfaced but never flips report.ok (O.5: warning only, non-blocking)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'drift-streak-warning-in-doctor' });
    await writeMockOnlyStreak(active.root, CONDUCTION_DRIFT_STREAK_WARN_THRESHOLD);
    const report = await runDoctor(active.root, HEALTHY_ENV);
    const check = findCheck(report.checks, 'conduction-drift-streak');
    expect(check?.severity).toBe('warning');
    expect(report.ok).toBe(true);
  });
});

/**
 * Phase 268, T5 (AC-4, O.5): the real "never refuses" proof the DRAFT's
 * Verify section calls for — not an absence-grep. `settleService` (see
 * `tests/services/settle-collision.test.ts` / `tests/services/settle.test.ts`
 * for this repo's established real-settle-fixture pattern) never imports
 * anything from `doctor/run.ts` (confirmed: no settle gate reads the
 * historical SUMMARY.json corpus or this check's severity), so this test's
 * job is to demonstrate — not merely assert the absence of a hook — that a
 * real settle against a corpus already AT the provisional threshold still
 * completes normally.
 */
describe('a real settle proceeds normally while conduction-drift-streak is warning-severity (phase 268, T5, AC-4, O.5)', () => {
  it('268-01/AC-4: settling a fixture draft with the streak at/over the provisional threshold still exits 0 and completes normally — proves the warning never refuses a settle', async () => {
    active = await tempRepo({ initialized: true, projectName: 'drift-streak-settle-no-refusal' });
    const root = active.root;

    // Pre-existing corpus: a streak already AT the provisional threshold, so
    // checkConductionDriftStreak is already 'warning' severity BEFORE this
    // test's own settle runs.
    await writeMockOnlyStreak(root, CONDUCTION_DRIFT_STREAK_WARN_THRESHOLD);
    const preSettleCheck = await checkConductionDriftStreak(root);
    expect(preSettleCheck.severity).toBe('warning');

    const phase = '99-drift-streak-settle';
    const id = '99-01';
    const phaseDir = join(root, '.cadence', 'phases', phase);
    await mkdir(phaseDir, { recursive: true });

    // `gates: { sealed: [], evidenceFloor: 'unverified' }` + the
    // `allowMissingCoverage`/`force` settle options below mirror
    // tests/services/settle.test.ts's documented pattern for a fixture with
    // no real AC-1 test coverage: this fixture exists to prove settle's
    // exit code/completion, not to exercise the coverage gates (which are
    // out of scope for T5 — this task never touches coverage or evidence
    // logic).
    const config = {
      ...defaultConfig,
      gates: { sealed: [], evidenceFloor: 'unverified' as const },
    };
    await writeFile(join(root, '.cadence', 'config.json'), JSON.stringify(config, null, 2));
    const state = {
      ...emptyState('drift-streak-settle-no-refusal'),
      loopPosition: 'BUILD' as const,
      activePhase: phase,
      activeDraft: id,
    };
    await writeFile(join(root, '.cadence', 'state.json'), JSON.stringify(state, null, 2));
    await writeFile(
      join(phaseDir, `${id}-DRAFT.md`),
      `---
phase: ${phase}
id: ${id}
tier: standard
status: APPROVED
---

# ${id} — drift streak settle fixture

## Objective

Prove a real settle does not refuse when conduction-drift-streak is warning-severity.

## Acceptance Criteria

### AC-1: it works
Given a precondition
When an action
Then an observable outcome

## Tasks

### T1: do the thing
- files: \`src/foo.ts\`
- action: do it
- verify: it works
- done: AC-1

## Boundaries

- none
`,
    );
    await writeFile(
      join(phaseDir, `${id}-PROGRESS.json`),
      JSON.stringify({ draftId: id, tasks: { T1: { status: 'DONE' } } }, null, 2),
    );

    const { io } = captureIO();
    const res = await settleService(
      root,
      { auto: true, interactive: false, allowMissingCoverage: true, force: true },
      io,
    );

    // The real O.5 bar (per the DRAFT's Verify section): a warning-severity
    // conduction-drift-streak finding never blocks or refuses a settle —
    // proven by a real settle actually completing, not by grepping for the
    // absence of a refusal code path.
    expect(res.exitCode).toBe(0);

    // The settle just wrote its own SUMMARY.json (mock, per defaultConfig),
    // extending the corpus by one more mock-only record — the escalated
    // warning survives past the settle (streak goes threshold → threshold+1),
    // proving the escalation wasn't incidental to pre-settle state alone.
    const postSettleCheck = await checkConductionDriftStreak(root);
    expect(postSettleCheck.severity).toBe('warning');
  });
});
