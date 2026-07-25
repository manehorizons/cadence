/**
 * `cadence verify phase [phase] [num]` (phase 204, T5) — state-independent,
 * phase-scoped re-derivation of whether a settled phase's AC coverage still
 * holds. Exercises `runVerifyPhase` directly (not the spawned CLI binary,
 * unlike `verify-coverage.test.ts`) since this is a thin service wrapper
 * over `replayPhaseCoverage` / `discoverChangedPhases` / `runTestCommand`,
 * all already covered at their own layer — this suite is about the wiring,
 * exit codes, and `--json` shape.
 */
import { describe, it, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, runGit } from '@manehorizons/cadence-testkit';
import { runVerifyPhase } from '../../src/services/verify.js';

function makeIo() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } };
}

const DRAFT = `---
phase: 200-example-phase
id: 200-01
tier: standard
status: PENDING
---

# 200-01 — Example

## Objective

Example.

## Acceptance Criteria

### AC-1: example
Given a precondition
When an action
Then an outcome

## Tasks

### T1: Implement
- files: \`src/example.ts\`, \`src/example.test.ts\`
- action: implement
- verify: tests pass
- done: AC-1

## Boundaries

- None.
`;

function summaryJson(pass: boolean, evidence?: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    draftId: '200-01',
    completedAt: '2026-07-20T00:00:00.000Z',
    acResults: [{ id: 'AC-1', pass, ...(evidence ? { evidence } : {}) }],
    taskResults: [{ id: 'T1', status: 'DONE', notes: '' }],
    decisions: [],
    deferred: [],
    skillAudit: { required: [], invoked: [] },
  });
}

async function seedInitializedPhase(
  root: string,
  opts: { pass: boolean; evidence?: string; testFileContent: string | null },
): Promise<void> {
  await mkdir(join(root, '.cadence'), { recursive: true });
  await writeFile(join(root, '.cadence', 'config.json'), '{}');
  const dir = join(root, '.cadence', 'phases', '200-example-phase');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, '200-01-DRAFT.md'), DRAFT);
  await writeFile(join(dir, '200-01-SUMMARY.json'), summaryJson(opts.pass, opts.evidence));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'example.ts'), 'export const x = 1;\n');
  if (opts.testFileContent !== null) {
    await writeFile(join(root, 'src', 'example.test.ts'), opts.testFileContent);
  }
}

describe('runVerifyPhase (single-phase mode)', () => {
  it('exits 0 with no drift when coverage still holds', async () => {
    const fx = await tempRepo();
    try {
      await seedInitializedPhase(fx.root, {
        pass: true,
        evidence: 'executed',
        testFileContent: "it('covers AC-1', () => { expect(1).toBe(1); });\n",
      });
      const { io, out } = makeIo();
      const res = await runVerifyPhase(
        { cwd: fx.root, phase: '200-example-phase', num: '01', testRun: false },
        io,
      );
      expect(res.exitCode).toBe(0);
      expect(out.join('')).toContain('no drift');
    } finally {
      await fx.cleanup();
    }
  });

  it('exits 1 when drift is found', async () => {
    const fx = await tempRepo();
    try {
      await seedInitializedPhase(fx.root, { pass: true, evidence: 'executed', testFileContent: null });
      const { io } = makeIo();
      const res = await runVerifyPhase(
        { cwd: fx.root, phase: '200-example-phase', num: '01', testRun: false },
        io,
      );
      expect(res.exitCode).toBe(1);
    } finally {
      await fx.cleanup();
    }
  });

  it('exits 2 with neither [phase][num] nor --changed (usage error)', async () => {
    const fx = await tempRepo();
    try {
      await mkdir(join(fx.root, '.cadence'), { recursive: true });
      await writeFile(join(fx.root, '.cadence', 'config.json'), '{}');
      const { io } = makeIo();
      const res = await runVerifyPhase({ cwd: fx.root }, io);
      expect(res.exitCode).toBe(2);
    } finally {
      await fx.cleanup();
    }
  });

  it('exits 2 with a distinct message on a missing SUMMARY.json', async () => {
    const fx = await tempRepo();
    try {
      await mkdir(join(fx.root, '.cadence'), { recursive: true });
      await writeFile(join(fx.root, '.cadence', 'config.json'), '{}');
      const dir = join(fx.root, '.cadence', 'phases', '200-example-phase');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, '200-01-DRAFT.md'), DRAFT);
      const { io, err } = makeIo();
      const res = await runVerifyPhase(
        { cwd: fx.root, phase: '200-example-phase', num: '01' },
        io,
      );
      expect(res.exitCode).toBe(2);
      expect(err.join('')).toContain('no SUMMARY.json found');
    } finally {
      await fx.cleanup();
    }
  });
});

describe('runVerifyPhase (--changed mode)', () => {
  it('reports "nothing to verify" and exits 0 when the diff is genuinely empty', async () => {
    const fx = await tempRepo();
    try {
      runGit(fx.root, ['init', '-q']);
      runGit(fx.root, ['config', 'user.email', 'test@test.com']);
      runGit(fx.root, ['config', 'user.name', 'Test']);
      await mkdir(join(fx.root, '.cadence'), { recursive: true });
      await writeFile(join(fx.root, '.cadence', 'config.json'), '{}');
      runGit(fx.root, ['add', '-A']);
      runGit(fx.root, ['commit', '-q', '-m', 'base']);
      const sha = runGit(fx.root, ['rev-parse', 'HEAD']).trim();

      const { io, out } = makeIo();
      const res = await runVerifyPhase({ cwd: fx.root, changed: true, base: sha, testRun: false }, io);
      expect(res.exitCode).toBe(0);
      expect(out.join('')).toContain('nothing to verify');
    } finally {
      await fx.cleanup();
    }
  });

  it('exits 2 with a distinct message when the diff computation fails', async () => {
    const fx = await tempRepo();
    try {
      runGit(fx.root, ['init', '-q']);
      runGit(fx.root, ['config', 'user.email', 'test@test.com']);
      runGit(fx.root, ['config', 'user.name', 'Test']);
      await mkdir(join(fx.root, '.cadence'), { recursive: true });
      await writeFile(join(fx.root, '.cadence', 'config.json'), '{}');
      runGit(fx.root, ['add', '-A']);
      runGit(fx.root, ['commit', '-q', '-m', 'base']);

      const { io, err } = makeIo();
      const res = await runVerifyPhase(
        { cwd: fx.root, changed: true, base: 'not-a-real-ref', testRun: false },
        io,
      );
      expect(res.exitCode).toBe(2);
      expect(err.join('')).toContain('could not compute git diff');
    } finally {
      await fx.cleanup();
    }
  });

  it('exits 2 when --changed is passed without --base', async () => {
    const fx = await tempRepo();
    try {
      await mkdir(join(fx.root, '.cadence'), { recursive: true });
      await writeFile(join(fx.root, '.cadence', 'config.json'), '{}');
      const { io } = makeIo();
      const res = await runVerifyPhase({ cwd: fx.root, changed: true }, io);
      expect(res.exitCode).toBe(2);
    } finally {
      await fx.cleanup();
    }
  });
});

describe('runVerifyPhase (test-command re-run)', () => {
  it('reports the test command as passed and exits 0 when coverage is clean and the test command succeeds', async () => {
    const fx = await tempRepo();
    try {
      await seedInitializedPhase(fx.root, {
        pass: true,
        evidence: 'executed',
        testFileContent: "it('covers AC-1', () => { expect(1).toBe(1); });\n",
      });
      await writeFile(
        join(fx.root, '.cadence', 'config.json'),
        JSON.stringify({ verification: { testCommand: 'node -e "process.exit(0)"' } }),
      );
      const { io, out } = makeIo();
      const res = await runVerifyPhase(
        { cwd: fx.root, phase: '200-example-phase', num: '01' },
        io,
      );
      expect(res.exitCode).toBe(0);
      expect(out.join('')).toContain('test command: passed');
      expect(out.join('')).toContain('suite-wide');
    } finally {
      await fx.cleanup();
    }
  });

  it('exits 1 when coverage is clean but the test command fails', async () => {
    const fx = await tempRepo();
    try {
      await seedInitializedPhase(fx.root, {
        pass: true,
        evidence: 'executed',
        testFileContent: "it('covers AC-1', () => { expect(1).toBe(1); });\n",
      });
      await writeFile(
        join(fx.root, '.cadence', 'config.json'),
        JSON.stringify({ verification: { testCommand: 'node -e "process.exit(1)"' } }),
      );
      const { io, out, err } = makeIo();
      const res = await runVerifyPhase(
        { cwd: fx.root, phase: '200-example-phase', num: '01' },
        io,
      );
      expect(res.exitCode).toBe(1);
      expect(out.join('')).toContain('test command: FAILED');
      expect(err.join('')).toContain('verify phase: test command failed:');
      expect(err.join('')).toContain('exited');
    } finally {
      await fx.cleanup();
    }
  });
});

describe('runVerifyPhase --json', () => {
  it('emits { mode, results, testRun } with results always an array', async () => {
    const fx = await tempRepo();
    try {
      await seedInitializedPhase(fx.root, {
        pass: true,
        evidence: 'executed',
        testFileContent: "it('covers AC-1', () => { expect(1).toBe(1); });\n",
      });
      const { io, out } = makeIo();
      const res = await runVerifyPhase(
        { cwd: fx.root, phase: '200-example-phase', num: '01', testRun: false, json: true },
        io,
      );
      expect(res.exitCode).toBe(0);
      const parsed = JSON.parse(out.join(''));
      expect(parsed.mode).toBe('single');
      expect(Array.isArray(parsed.results)).toBe(true);
      expect(parsed.results).toHaveLength(1);
      expect(parsed.testRun).toBeNull();
    } finally {
      await fx.cleanup();
    }
  });
});
