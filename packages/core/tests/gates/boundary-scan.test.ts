import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, mkdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBoundaryScanGate } from '../../src/gates/boundary-scan.js';
import type { SettleContext, ProgressJson } from '../../src/gates/types.js';
import type { Task } from '@thomas-powers-jr/cadence-types';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

async function initRepo(root: string): Promise<void> {
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(root, 'README.md'), '# test\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'init']);
  git(root, ['checkout', '-b', 'feature']);
}

const roots: string[] = [];
async function makeRepo(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cadence-boundary-scan-')));
  roots.push(root);
  await initRepo(root);
  return root;
}

afterEach(async () => {
  while (roots.length) {
    const root = roots.pop()!;
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  }
});

function task(files: string[]): Task {
  return { id: 'T1', name: 't', files, action: 'a', verify: 'v', done: 'AC-1' };
}

function ctx(over: {
  cwd: string;
  boundaryEnforcement?: 'warn' | 'block';
  declaredFiles?: string[];
  force?: boolean;
  allowBoundaryScanFailure?: boolean;
  sealed?: string[];
  errs?: string[];
  progressTasks?: ProgressJson['tasks'];
}): SettleContext {
  const errs = over.errs ?? [];
  return {
    cwd: over.cwd,
    state: { draftReadAt: null, activePhase: '156-x', activeDraft: '156-01' } as never,
    draft: {
      boundaryEnforcement: over.boundaryEnforcement,
      acceptanceCriteria: [],
      tasks: [task(over.declaredFiles ?? [])],
    } as never,
    progress: { draftId: '156-01', tasks: over.progressTasks ?? {} },
    config: over.sealed ? ({ gates: { sealed: over.sealed } } as never) : null,
    gateSet: { gates: ['boundary-scan'], softCap: false } as never,
    opts: {
      ...(over.force ? { force: true } : {}),
      ...(over.allowBoundaryScanFailure ? { allowBoundaryScanFailure: true } : {}),
    },
    explicitIds: new Set<string>(),
    touchedFiles: [],
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    diff: () => '',
    verifiers: {
      deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) },
      codeReview: { verify: async () => ({ findings: {}, provider: 'mock' }) },
      securityAudit: { verify: async () => ({ findings: [], provider: 'mock' }) },
    },
    emit: { anomalies: async () => {}, codeReviewHigh: async () => {}, codeReviewUnconverged: async () => {} },
    runner: { test: async () => ({ ran: false, ok: true }) },
    prompter: { create: () => ({ ask: async () => '' }) },
    codeReviewSidecar: { read: async () => ({ attemptsSoFar: 0, history: [] }), write: async () => {} },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('runBoundaryScanGate', () => {
  // AC-1: no-op unless boundaryEnforcement resolves to 'block'.
  it('passes as a no-op in warn mode (default), without touching git', async () => {
    const res = await runBoundaryScanGate(ctx({ cwd: '/does-not-exist', boundaryEnforcement: 'warn' }));
    expect(res).toEqual({ outcome: 'pass' });
  });

  // AC-4 fail-open: empty declared files union means no boundary to enforce.
  it('passes when the declared files: union is empty, even with an offending file present', async () => {
    const root = await makeRepo();
    await writeFile(join(root, 'src.txt'), 'untracked offender\n');

    const res = await runBoundaryScanGate(
      ctx({ cwd: root, boundaryEnforcement: 'block', declaredFiles: [] }),
    );

    expect(res.outcome).toBe('pass');
  });

  // AC-3: .cadence/** self-writes are dropped before the boundary comparison.
  it('ignores .cadence/** paths and passes when only they are out-of-boundary', async () => {
    const root = await makeRepo();
    await mkdir(join(root, '.cadence', 'phases', '156-x'), { recursive: true });
    await writeFile(join(root, '.cadence', 'phases', '156-x', '156-01-SUMMARY.md'), 'summary\n');
    await writeFile(join(root, 'declared.ts'), 'declared\n');

    const res = await runBoundaryScanGate(
      ctx({ cwd: root, boundaryEnforcement: 'block', declaredFiles: ['declared.ts'] }),
    );

    expect(res.outcome).toBe('pass');
    // Phase 226 (T3): a genuine pass (nothing to bypass) must not carry the
    // bypass flag — it wasn't bypassed, there was simply nothing to refuse.
    expect(res.flags?.boundaryScanBypassed).toBeUndefined();
  });

  // AC-4: a real out-of-boundary file refuses settle, naming the offender.
  it('refuses when a real out-of-boundary file is found', async () => {
    const root = await makeRepo();
    await writeFile(join(root, 'declared.ts'), 'declared\n');
    await writeFile(join(root, 'undeclared.ts'), 'oops\n');
    const errs: string[] = [];

    const res = await runBoundaryScanGate(
      ctx({ cwd: root, boundaryEnforcement: 'block', declaredFiles: ['declared.ts'], errs }),
    );

    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('undeclared.ts');
    expect(errs.join('')).toContain('settle run refused');
    // AC-2: reason matches the exact refusal message written to stderr.
    expect(res.reason).toBe(
      'settle run refused: boundary-scan found file(s) outside the declared boundary. ' +
        'Pass --allow-boundary-scan-failure to record them and settle anyway, or --force to bypass.',
    );
  });

  // AC-5: --force bypasses the refusal and records an audit trail.
  it('bypasses via --force and records the offenders in summaryPatch', async () => {
    const root = await makeRepo();
    await writeFile(join(root, 'declared.ts'), 'declared\n');
    await writeFile(join(root, 'undeclared.ts'), 'oops\n');
    const errs: string[] = [];

    const res = await runBoundaryScanGate(
      ctx({ cwd: root, boundaryEnforcement: 'block', declaredFiles: ['declared.ts'], force: true, errs }),
    );

    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.boundaryScan?.offenders).toEqual(['undeclared.ts']);
    expect(errs.join('')).toContain('--force set; proceeding past 1 offending file(s)');
    // Phase 226 (T3): a genuine unsealed bypass carries flags.boundaryScanBypassed
    // so the registry can record 'skipped (bypassed)' provenance instead of 'ran'.
    expect(res.flags?.boundaryScanBypassed).toBe(true);
  });

  // AC-5: --allow-boundary-scan-failure bypasses the refusal the same way.
  it('bypasses via --allow-boundary-scan-failure', async () => {
    const root = await makeRepo();
    await writeFile(join(root, 'declared.ts'), 'declared\n');
    await writeFile(join(root, 'undeclared.ts'), 'oops\n');
    const errs: string[] = [];

    const res = await runBoundaryScanGate(
      ctx({
        cwd: root,
        boundaryEnforcement: 'block',
        declaredFiles: ['declared.ts'],
        allowBoundaryScanFailure: true,
        errs,
      }),
    );

    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.boundaryScan?.offenders).toEqual(['undeclared.ts']);
    expect(errs.join('')).toContain('--allow-boundary-scan-failure set; proceeding past 1 offending file(s)');
    expect(res.flags?.boundaryScanBypassed).toBe(true);
  });

  // AC-5: a sealed gate ignores both bypass flags and still refuses.
  it('ignores --force and --allow-boundary-scan-failure when the gate is sealed', async () => {
    const root = await makeRepo();
    await writeFile(join(root, 'declared.ts'), 'declared\n');
    await writeFile(join(root, 'undeclared.ts'), 'oops\n');
    const errs: string[] = [];

    const res = await runBoundaryScanGate(
      ctx({
        cwd: root,
        boundaryEnforcement: 'block',
        declaredFiles: ['declared.ts'],
        force: true,
        allowBoundaryScanFailure: true,
        sealed: ['boundary-scan'],
        errs,
      }),
    );

    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('sealed');
    // AC-2: reason matches the sealed refusal message written to stderr.
    expect(res.reason).toBe(
      'settle run refused: boundary-scan found file(s) outside the declared boundary. ' +
        'This gate is sealed (gates.sealed) and cannot be bypassed with --force or ' +
        '--allow-boundary-scan-failure.',
    );
  });

  // AC-2 (bonus, gate-level integration): an unresolvable base ref still lets
  // the working-tree-only scan run, with a loud stderr notice.
  it('emits a loud notice when no base ref resolves, but still scans working-tree files', async () => {
    const root = await makeRepo();
    await writeFile(join(root, 'declared.ts'), 'declared\n');
    await writeFile(join(root, 'undeclared.ts'), 'oops\n');
    const errs: string[] = [];
    const cfg = { phaseGuard: { integrationRef: 'does-not-exist-anywhere' } } as never;

    const res = await runBoundaryScanGate({
      ...ctx({ cwd: root, boundaryEnforcement: 'block', declaredFiles: ['declared.ts'], errs }),
      config: cfg,
    });

    expect(errs.join('')).toContain('could not resolve a base ref');
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('undeclared.ts');
  });

  it('AC-2: escalates to block mode when a PROGRESS task carries execution:dispatch, even under a warn config', async () => {
    const root = await makeRepo();
    await writeFile(join(root, 'declared.ts'), 'declared\n');
    await writeFile(join(root, 'undeclared.ts'), 'oops\n');
    const errs: string[] = [];

    const res = await runBoundaryScanGate(
      ctx({
        cwd: root,
        boundaryEnforcement: 'warn',
        declaredFiles: ['declared.ts'],
        progressTasks: {
          T0: {
            status: 'DONE',
            notes: '',
            touchedFiles: [],
            updatedAt: new Date().toISOString(),
            execution: 'dispatch',
          },
        },
        errs,
      }),
    );

    // Config alone says 'warn' (a no-op pass); the dispatch-scoped escalation
    // (T9's effectiveBoundaryEnforcement progressSignal) must still force the
    // gate to run in block mode and refuse on the real stray file.
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('undeclared.ts');
  });

  // Phase 286-01 (dec-20260821-001, D-Y) -- `files:` glob expansion. This
  // gate is one of the three call sites the decision leaves UNTOUCHED for
  // the new zero-match anomaly (that wiring is build-task.ts only), but it
  // calls the shared `runBoundaryCheck` directly, so T2's wildcard-matcher
  // change flows through here automatically. RED cases below fail today
  // because the pre-T2 exact-Set.has comparison can't match a wildcard
  // against anything.

  it('286-01/AC-2: every pre-existing literal declared-file scenario in this suite matches an explicit hand-written expected value', async () => {
    // Covers every distinct literal (non-wildcard) declared-file scenario
    // pre-existing in this describe block, per dec-20260821-002's "every
    // existing scenario" reading -- run together and asserted against an
    // explicit hand-written expected value so the AC-2 claim is genuinely
    // comprehensive for this file, not a curated subset.
    const scenarios: Array<{ scenario: string; result: unknown }> = [];

    {
      const res = await runBoundaryScanGate(
        ctx({ cwd: '/does-not-exist', boundaryEnforcement: 'warn' }),
      );
      scenarios.push({
        scenario: 'passes as a no-op in warn mode (default), without touching git',
        result: res,
      });
    }

    {
      const root = await makeRepo();
      await writeFile(join(root, 'src.txt'), 'untracked offender\n');
      const res = await runBoundaryScanGate(
        ctx({ cwd: root, boundaryEnforcement: 'block', declaredFiles: [] }),
      );
      scenarios.push({
        scenario: 'empty declared files: union passes even with an offending file present',
        result: { outcome: res.outcome },
      });
    }

    {
      const root = await makeRepo();
      await mkdir(join(root, '.cadence', 'phases', '156-x'), { recursive: true });
      await writeFile(join(root, '.cadence', 'phases', '156-x', '156-01-SUMMARY.md'), 'summary\n');
      await writeFile(join(root, 'declared.ts'), 'declared\n');
      const res = await runBoundaryScanGate(
        ctx({ cwd: root, boundaryEnforcement: 'block', declaredFiles: ['declared.ts'] }),
      );
      scenarios.push({
        scenario: '.cadence/** self-writes are dropped, passes when only they are out-of-boundary',
        result: { outcome: res.outcome, boundaryScanBypassed: res.flags?.boundaryScanBypassed },
      });
    }

    {
      const root = await makeRepo();
      await writeFile(join(root, 'declared.ts'), 'declared\n');
      await writeFile(join(root, 'undeclared.ts'), 'oops\n');
      const errs: string[] = [];
      const res = await runBoundaryScanGate(
        ctx({ cwd: root, boundaryEnforcement: 'block', declaredFiles: ['declared.ts'], errs }),
      );
      scenarios.push({
        scenario: 'a real out-of-boundary file refuses, naming the offender',
        result: { outcome: res.outcome, reason: res.reason, errs },
      });
    }

    {
      const root = await makeRepo();
      await writeFile(join(root, 'declared.ts'), 'declared\n');
      await writeFile(join(root, 'undeclared.ts'), 'oops\n');
      const errs: string[] = [];
      const res = await runBoundaryScanGate(
        ctx({
          cwd: root,
          boundaryEnforcement: 'block',
          declaredFiles: ['declared.ts'],
          force: true,
          errs,
        }),
      );
      scenarios.push({
        scenario: '--force bypasses the refusal, recording offenders in summaryPatch',
        result: {
          outcome: res.outcome,
          offenders: res.summaryPatch?.boundaryScan?.offenders,
          boundaryScanBypassed: res.flags?.boundaryScanBypassed,
          errs,
        },
      });
    }

    {
      const root = await makeRepo();
      await writeFile(join(root, 'declared.ts'), 'declared\n');
      await writeFile(join(root, 'undeclared.ts'), 'oops\n');
      const errs: string[] = [];
      const res = await runBoundaryScanGate(
        ctx({
          cwd: root,
          boundaryEnforcement: 'block',
          declaredFiles: ['declared.ts'],
          allowBoundaryScanFailure: true,
          errs,
        }),
      );
      scenarios.push({
        scenario: '--allow-boundary-scan-failure bypasses the refusal the same way',
        result: {
          outcome: res.outcome,
          offenders: res.summaryPatch?.boundaryScan?.offenders,
          boundaryScanBypassed: res.flags?.boundaryScanBypassed,
          errs,
        },
      });
    }

    {
      const root = await makeRepo();
      await writeFile(join(root, 'declared.ts'), 'declared\n');
      await writeFile(join(root, 'undeclared.ts'), 'oops\n');
      const errs: string[] = [];
      const res = await runBoundaryScanGate(
        ctx({
          cwd: root,
          boundaryEnforcement: 'block',
          declaredFiles: ['declared.ts'],
          force: true,
          allowBoundaryScanFailure: true,
          sealed: ['boundary-scan'],
          errs,
        }),
      );
      scenarios.push({
        scenario: 'a sealed gate ignores both bypass flags and still refuses',
        result: { outcome: res.outcome, reason: res.reason, errs },
      });
    }

    {
      const root = await makeRepo();
      await writeFile(join(root, 'declared.ts'), 'declared\n');
      await writeFile(join(root, 'undeclared.ts'), 'oops\n');
      const errs: string[] = [];
      const cfg = { phaseGuard: { integrationRef: 'does-not-exist-anywhere' } } as never;
      const res = await runBoundaryScanGate({
        ...ctx({ cwd: root, boundaryEnforcement: 'block', declaredFiles: ['declared.ts'], errs }),
        config: cfg,
      });
      scenarios.push({
        scenario: 'emits a loud notice when no base ref resolves, but still scans working-tree files',
        result: { outcome: res.outcome, errs },
      });
    }

    {
      const root = await makeRepo();
      await writeFile(join(root, 'declared.ts'), 'declared\n');
      await writeFile(join(root, 'undeclared.ts'), 'oops\n');
      const errs: string[] = [];
      const res = await runBoundaryScanGate(
        ctx({
          cwd: root,
          boundaryEnforcement: 'warn',
          declaredFiles: ['declared.ts'],
          progressTasks: {
            T0: {
              status: 'DONE',
              notes: '',
              touchedFiles: [],
              updatedAt: new Date().toISOString(),
              execution: 'dispatch',
            },
          },
          errs,
        }),
      );
      scenarios.push({
        scenario:
          'escalates to block mode when a PROGRESS task carries execution:dispatch, even under a warn config',
        result: { outcome: res.outcome, errs },
      });
    }

    // Hand-written expected value, not a `.snap` file (dec-20260821-002):
    // a literal inline expectation is auditable from a static read, with no
    // claim about when it was captured.
    const EXPECTED: Array<{ scenario: string; result: unknown }> = [
      {
        scenario: 'passes as a no-op in warn mode (default), without touching git',
        result: { outcome: 'pass' },
      },
      {
        scenario: 'empty declared files: union passes even with an offending file present',
        result: { outcome: 'pass' },
      },
      {
        scenario: '.cadence/** self-writes are dropped, passes when only they are out-of-boundary',
        result: { outcome: 'pass', boundaryScanBypassed: undefined },
      },
      {
        scenario: 'a real out-of-boundary file refuses, naming the offender',
        result: {
          outcome: 'refuse',
          reason:
            'settle run refused: boundary-scan found file(s) outside the declared boundary. Pass --allow-boundary-scan-failure to record them and settle anyway, or --force to bypass.',
          errs: [
            "boundary-scan: undeclared.ts touched but not declared in any task's files:\n",
            'settle run refused: boundary-scan found file(s) outside the declared boundary. Pass --allow-boundary-scan-failure to record them and settle anyway, or --force to bypass.\n',
          ],
        },
      },
      {
        scenario: '--force bypasses the refusal, recording offenders in summaryPatch',
        result: {
          outcome: 'pass',
          offenders: ['undeclared.ts'],
          boundaryScanBypassed: true,
          errs: [
            "boundary-scan: undeclared.ts touched but not declared in any task's files:\n",
            'boundary-scan: --force set; proceeding past 1 offending file(s).\n',
          ],
        },
      },
      {
        scenario: '--allow-boundary-scan-failure bypasses the refusal the same way',
        result: {
          outcome: 'pass',
          offenders: ['undeclared.ts'],
          boundaryScanBypassed: true,
          errs: [
            "boundary-scan: undeclared.ts touched but not declared in any task's files:\n",
            'boundary-scan: --allow-boundary-scan-failure set; proceeding past 1 offending file(s).\n',
          ],
        },
      },
      {
        scenario: 'a sealed gate ignores both bypass flags and still refuses',
        result: {
          outcome: 'refuse',
          reason:
            'settle run refused: boundary-scan found file(s) outside the declared boundary. ' +
            'This gate is sealed (gates.sealed) and cannot be bypassed with --force or ' +
            '--allow-boundary-scan-failure.',
          errs: [
            "boundary-scan: undeclared.ts touched but not declared in any task's files:\n",
            'settle run refused: boundary-scan found file(s) outside the declared boundary. ' +
              'This gate is sealed (gates.sealed) and cannot be bypassed with --force or ' +
              '--allow-boundary-scan-failure.\n',
          ],
        },
      },
      {
        scenario: 'emits a loud notice when no base ref resolves, but still scans working-tree files',
        result: {
          outcome: 'refuse',
          errs: [
            'boundary-scan: could not resolve a base ref against `does-not-exist-anywhere` — committed-file scan skipped, only working-tree changes were checked\n',
            "boundary-scan: undeclared.ts touched but not declared in any task's files:\n",
            'settle run refused: boundary-scan found file(s) outside the declared boundary. Pass --allow-boundary-scan-failure to record them and settle anyway, or --force to bypass.\n',
          ],
        },
      },
      {
        scenario:
          'escalates to block mode when a PROGRESS task carries execution:dispatch, even under a warn config',
        result: {
          outcome: 'refuse',
          errs: [
            "boundary-scan: undeclared.ts touched but not declared in any task's files:\n",
            'settle run refused: boundary-scan found file(s) outside the declared boundary. Pass --allow-boundary-scan-failure to record them and settle anyway, or --force to bypass.\n',
          ],
        },
      },
    ];
    expect(scenarios).toEqual(EXPECTED);
  });

  it('286-01/AC-1: a wildcard declared entry (`.changeset/*.md`) matches a touched file of the same shape -- gate passes (RED pre-T2)', async () => {
    const root = await makeRepo();
    await mkdir(join(root, '.changeset'), { recursive: true });
    await writeFile(join(root, '.changeset/foo.md'), '# changeset\n');
    const errs: string[] = [];

    const res = await runBoundaryScanGate(
      ctx({ cwd: root, boundaryEnforcement: 'block', declaredFiles: ['.changeset/*.md'], errs }),
    );

    expect(res.outcome).toBe('pass');
  });

  it("286-01/AC-3: a wildcard entry covers its own file but a second genuinely undeclared file still refuses, and the wildcard-matched file is never named (RED pre-T2)", async () => {
    const root = await makeRepo();
    await mkdir(join(root, '.changeset'), { recursive: true });
    await writeFile(join(root, '.changeset/foo.md'), '# changeset\n');
    await writeFile(join(root, 'undeclared.ts'), 'oops\n');
    const errs: string[] = [];

    const res = await runBoundaryScanGate(
      ctx({ cwd: root, boundaryEnforcement: 'block', declaredFiles: ['.changeset/*.md'], errs }),
    );

    // Refuses today AND after the fix -- undeclared.ts is genuinely
    // undeclared either way. Discriminating (RED today, GREEN after T2):
    // '.changeset/foo.md' must stop being named as an offender.
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('undeclared.ts');
    expect(errs.join('')).not.toContain('changeset/foo.md');
  });

  it('286-01: a declared wildcard entry with zero matching touched files never itself causes a block-mode refusal at this gate (GREEN today and must stay GREEN -- the new zero-match anomaly is warn-only and wired only into build-task.ts, never this gate)', async () => {
    const root = await makeRepo();
    await writeFile(join(root, 'declared.ts'), 'declared\n');
    const errs: string[] = [];

    const res = await runBoundaryScanGate(
      ctx({
        cwd: root,
        boundaryEnforcement: 'block',
        declaredFiles: ['.changeset/*.md', 'declared.ts'],
        errs,
      }),
    );

    expect(res.outcome).toBe('pass');
  });
});
