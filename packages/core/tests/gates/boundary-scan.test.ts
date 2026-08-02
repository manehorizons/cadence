import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, mkdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBoundaryScanGate } from '../../src/gates/boundary-scan.js';
import type { SettleContext } from '../../src/gates/types.js';
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
    progress: { draftId: '156-01', tasks: {} },
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
});
