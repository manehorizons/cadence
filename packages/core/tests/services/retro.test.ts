import { describe, it, expect } from 'vitest';
import type { Summary } from '@manehorizons/cadence-types';
import { buildRetroDigest, isDigestEmpty, retroFrictionCount } from '../../src/services/retro.js';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRetroArtifacts } from '../../src/services/retro.js';
import { EventEmitter } from 'node:events';
import { resolveIssueTarget, createGithubIssue, addIssueLabel, type SpawnFn, type SpawnedProcessLike } from '../../src/services/retro.js';

function baseSummary(overrides: Partial<Summary> = {}): Summary {
  return {
    schemaVersion: 1,
    draftId: '01-01',
    completedAt: '2026-07-12T00:00:00.000Z',
    acResults: [],
    taskResults: [{ id: 'T1', status: 'DONE', notes: '' }],
    decisions: [],
    deferred: [],
    skillAudit: { required: [], invoked: [] },
    ...overrides,
  };
}

describe('buildRetroDigest', () => {
  it('returns an empty digest for a clean settle', () => {
    const digest = buildRetroDigest(baseSummary());
    expect(digest).toEqual({ bypasses: [], roughTasks: [], findings: {} });
  });

  it('surfaces gate bypasses', () => {
    const digest = buildRetroDigest(
      baseSummary({
        gateBypasses: [{ gate: 'test-coverage', flag: '--allow-missing-coverage', reason: 'legacy', severity: 'warn' }],
      }),
    );
    expect(digest.bypasses).toHaveLength(1);
    expect(digest.bypasses[0]?.gate).toBe('test-coverage');
  });

  it('surfaces non-DONE tasks as rough, and excludes plain DONE', () => {
    const digest = buildRetroDigest(
      baseSummary({
        taskResults: [
          { id: 'T1', status: 'DONE', notes: '' },
          { id: 'T2', status: 'DONE_WITH_CONCERNS', notes: 'flaky test' },
          { id: 'T3', status: 'BLOCKED', notes: 'waiting on infra' },
        ],
      }),
    );
    expect(digest.roughTasks.map((t) => t.id)).toEqual(['T2', 'T3']);
  });

  it('surfaces codeReview, securityAudit, and boundaryScan when present', () => {
    const digest = buildRetroDigest(
      baseSummary({
        codeReview: { 'src/foo.ts': [{ severity: 'high', message: 'no error handling' }] },
        securityAudit: [{ severity: 'critical', message: 'hardcoded secret' }],
        boundaryScan: { offenders: ['src/out-of-scope.ts'] },
      }),
    );
    expect(digest.findings.codeReview?.['src/foo.ts']).toHaveLength(1);
    expect(digest.findings.securityAudit).toHaveLength(1);
    expect(digest.findings.boundaryScan?.offenders).toEqual(['src/out-of-scope.ts']);
  });

  it('omits codeReview/securityAudit from findings when the gate ran but found nothing (present-but-empty on Summary)', () => {
    // A clean pass from the code-review/security-audit gates leaves `codeReview: {}` /
    // `securityAudit: []` on Summary (not `undefined`) — buildRetroDigest must not
    // surface those as friction, or every clean settle misreports as having some.
    const digest = buildRetroDigest(baseSummary({ codeReview: {}, securityAudit: [] }));
    expect(digest.findings.codeReview).toBeUndefined();
    expect(digest.findings.securityAudit).toBeUndefined();
    expect(isDigestEmpty(digest)).toBe(true);
    expect(retroFrictionCount(digest)).toBe(0);
  });
});

describe('isDigestEmpty', () => {
  it('is true for an all-empty digest', () => {
    expect(isDigestEmpty({ bypasses: [], roughTasks: [], findings: {} })).toBe(true);
  });

  it('is false when any one field is populated', () => {
    expect(isDigestEmpty({ bypasses: [], roughTasks: [{ id: 'T1', status: 'BLOCKED', notes: '' }], findings: {} })).toBe(false);
    expect(
      isDigestEmpty({ bypasses: [], roughTasks: [], findings: { securityAudit: [{ severity: 'low', message: 'x' }] } }),
    ).toBe(false);
  });

  it('is true when findings are present but structurally empty (defense in depth, not just presence)', () => {
    expect(isDigestEmpty({ bypasses: [], roughTasks: [], findings: { codeReview: {} } })).toBe(true);
    expect(isDigestEmpty({ bypasses: [], roughTasks: [], findings: { securityAudit: [] } })).toBe(true);
    expect(isDigestEmpty({ bypasses: [], roughTasks: [], findings: { boundaryScan: { offenders: [] } } })).toBe(true);
  });
});

describe('retroFrictionCount', () => {
  it('is 0 for an empty digest', () => {
    expect(retroFrictionCount({ bypasses: [], roughTasks: [], findings: {} })).toBe(0);
  });

  it('flat-counts across every populated field, including per-file codeReview findings', () => {
    const digest = {
      bypasses: [{ gate: 'g', flag: '--f', reason: 'r', severity: 'warn' as const }],
      roughTasks: [{ id: 'T1', status: 'BLOCKED' as const, notes: '' }],
      findings: {
        codeReview: {
          'a.ts': [{ severity: 'high' as const, message: 'x' }, { severity: 'low' as const, message: 'y' }],
          'b.ts': [{ severity: 'medium' as const, message: 'z' }],
        },
        securityAudit: [{ severity: 'critical' as const, message: 'x' }],
        boundaryScan: { offenders: ['c.ts', 'd.ts'] },
      },
    };
    // 1 bypass + 1 rough task + 3 codeReview findings + 1 securityAudit + 2 boundaryScan offenders = 8
    expect(retroFrictionCount(digest)).toBe(8);
  });
});

// deja:new per-file test fixture helper, matching this suite's existing convention (doctor.test.ts, settle-auto-archive.test.ts, and others each define their own copy rather than importing across test files)
function captureIO() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) }, out, err };
}

describe('writeRetroArtifacts', () => {
  it('writes both .json and .md for a friction-having digest, JSON first', async () => {
    const root = await mkdtemp(join(tmpdir(), 'retro-write-'));
    try {
      const phaseDir = join(root, '.cadence', 'phases', '174-retro');
      await mkdir(phaseDir, { recursive: true });
      const digest = {
        bypasses: [],
        roughTasks: [{ id: 'T1', status: 'BLOCKED' as const, notes: 'stuck' }],
        findings: {},
      };
      const { io } = captureIO();
      await writeRetroArtifacts(digest, { cwd: root, activePhase: '174-retro', draftId: '174-01', io });

      const json = JSON.parse(await readFile(join(phaseDir, '174-01-RETRO.json'), 'utf8'));
      expect(json).toEqual(digest);
      const md = await readFile(join(phaseDir, '174-01-RETRO.md'), 'utf8');
      expect(md).toContain('## Rough tasks');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('writes the "no friction" form for a clean digest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'retro-write-'));
    try {
      const phaseDir = join(root, '.cadence', 'phases', '174-retro');
      await mkdir(phaseDir, { recursive: true });
      const digest = { bypasses: [], roughTasks: [], findings: {} };
      const { io } = captureIO();
      await writeRetroArtifacts(digest, { cwd: root, activePhase: '174-retro', draftId: '174-01', io });

      const md = await readFile(join(phaseDir, '174-01-RETRO.md'), 'utf8');
      expect(md).toContain('No friction detected this settle.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

/** Builds a fake `SpawnFn` that records every invocation and replays one scripted result per call, in order. */
function fakeSpawn(
  results: Array<{ code: number | null; stdout?: string; stderr?: string } | 'enoent'>,
): { spawn: SpawnFn; calls: Array<{ bin: string; args: string[] }> } {
  const calls: Array<{ bin: string; args: string[] }> = [];
  let cursor = 0;
  const spawn: SpawnFn = (bin, args) => {
    calls.push({ bin, args });
    const result = results[cursor];
    cursor += 1;
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const proc = Object.assign(new EventEmitter(), {
      stdout: stdout as unknown as SpawnedProcessLike['stdout'],
      stderr: stderr as unknown as SpawnedProcessLike['stderr'],
    }) as unknown as SpawnedProcessLike;
    queueMicrotask(() => {
      if (result === 'enoent') {
        (proc as unknown as EventEmitter).emit('error', Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        return;
      }
      if (result?.stdout) stdout.emit('data', result.stdout);
      if (result?.stderr) stderr.emit('data', result.stderr);
      (proc as unknown as EventEmitter).emit('close', result?.code ?? 0);
    });
    return proc;
  };
  return { spawn, calls };
}

describe('resolveIssueTarget', () => {
  it('returns the trimmed owner/repo on success', async () => {
    const { spawn, calls } = fakeSpawn([{ code: 0, stdout: 'manehorizons/cadence\n' }]);
    const target = await resolveIssueTarget(spawn);
    expect(target).toBe('manehorizons/cadence');
    expect(calls[0]).toEqual({
      bin: 'gh',
      args: ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
    });
  });

  it('returns undefined on a non-zero exit', async () => {
    const { spawn } = fakeSpawn([{ code: 1, stderr: 'no remote' }]);
    expect(await resolveIssueTarget(spawn)).toBeUndefined();
  });

  it('returns undefined when gh is not installed (ENOENT)', async () => {
    const { spawn } = fakeSpawn(['enoent']);
    expect(await resolveIssueTarget(spawn)).toBeUndefined();
  });
});

describe('createGithubIssue', () => {
  it('passes --repo, --title, --body and returns the created URL', async () => {
    const { spawn, calls } = fakeSpawn([{ code: 0, stdout: 'https://github.com/manehorizons/cadence/issues/42\n' }]);
    const result = await createGithubIssue('manehorizons/cadence', 'Retro: 174/174-01 — 2 friction item(s)', 'body text', spawn);
    expect(result).toEqual({ url: 'https://github.com/manehorizons/cadence/issues/42' });
    expect(calls[0]?.args).toEqual([
      'issue', 'create', '--repo', 'manehorizons/cadence',
      '--title', 'Retro: 174/174-01 — 2 friction item(s)', '--body', 'body text',
    ]);
  });

  it('returns an error on non-zero exit, without a --label flag ever being sent', async () => {
    const { spawn, calls } = fakeSpawn([{ code: 1, stderr: 'authentication required' }]);
    const result = await createGithubIssue('owner/repo', 't', 'b', spawn);
    expect(result).toEqual({ error: 'authentication required' });
    expect(calls[0]?.args).not.toContain('--label');
  });
});

describe('addIssueLabel', () => {
  it('edits the created issue by URL to add the label', async () => {
    const { spawn, calls } = fakeSpawn([{ code: 0 }]);
    const result = await addIssueLabel('owner/repo', 'https://github.com/owner/repo/issues/42', 'needs-triage', spawn);
    expect(result).toEqual({ ok: true });
    expect(calls[0]?.args).toEqual([
      'issue', 'edit', 'https://github.com/owner/repo/issues/42', '--repo', 'owner/repo', '--add-label', 'needs-triage',
    ]);
  });

  it('returns an error when the label does not exist in the target repo', async () => {
    const { spawn } = fakeSpawn([{ code: 1, stderr: "could not add label: 'needs-triage' not found" }]);
    const result = await addIssueLabel('owner/repo', 'https://github.com/owner/repo/issues/42', 'needs-triage', spawn);
    expect(result).toEqual({ error: "could not add label: 'needs-triage' not found" });
  });
});

import { ScriptedPrompter, type Prompter } from '../../src/verify/prompter.js';
import { askRetroIssueVerdict, runRetroOffer } from '../../src/services/retro.js';
import { defaultConfig } from '@manehorizons/cadence-types';

describe('askRetroIssueVerdict', () => {
  it('names the target repo in the question and accepts y/yes/n/no case-insensitively', async () => {
    const questions: string[] = [];
    const prompter: Prompter = { ask: async (q) => { questions.push(q); return 'YES'; } };
    const verdict = await askRetroIssueVerdict(prompter, 'owner/repo');
    expect(verdict).toBe('yes');
    expect(questions[0]).toContain('owner/repo');
  });

  it('retries up to 3 times then defaults to no', async () => {
    let calls = 0;
    const prompter: Prompter = { ask: async () => { calls++; return 'banana'; } };
    const verdict = await askRetroIssueVerdict(prompter, 'owner/repo');
    expect(verdict).toBe('no');
    expect(calls).toBe(3);
  });
});

function offerCtx(overrides: Partial<Parameters<typeof runRetroOffer>[1]> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    ctx: {
      cwd: '/repo',
      activePhase: '174-retro',
      draftId: '174-01',
      io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) },
      interactivity: 'interactive' as const,
      isRealTTY: true,
      createPrompter: () => new ScriptedPrompter(['y']),
      cadenceConfig: defaultConfig,
      ...overrides,
    },
    out,
    err,
  };
}

const FRICTION_DIGEST = { bypasses: [{ gate: 'g', flag: '--f', reason: 'r', severity: 'warn' as const }], roughTasks: [], findings: {} };
const EMPTY_DIGEST = { bypasses: [], roughTasks: [], findings: {} };

describe('runRetroOffer', () => {
  it('skips silently when the digest is empty', async () => {
    const { ctx, out, err } = offerCtx();
    await runRetroOffer(EMPTY_DIGEST, ctx);
    expect(out).toHaveLength(0);
    expect(err).toHaveLength(0);
  });

  it('skips silently when interactivity is bypass (non-TTY, no script)', async () => {
    const { ctx, out, err } = offerCtx({ interactivity: 'bypass' });
    await runRetroOffer(FRICTION_DIGEST, ctx);
    expect(out).toHaveLength(0);
    expect(err).toHaveLength(0);
  });

  it('skips silently, and never spawns gh, when interactivity is "interactive" but isRealTTY is false (CADENCE_PROMPTER_SCRIPT-only, no real TTY)', async () => {
    // Regression test: resolveInteractivity resolves to 'interactive' whenever
    // CADENCE_PROMPTER_SCRIPT is set, even off a real TTY — this is the exact
    // combination that caused a real, unmocked `gh repo view` spawn to hang
    // tests/cli/settle-interactive.test.ts on Windows CI (a pre-existing test
    // driving the interactive-verdict gate via CADENCE_PROMPTER_SCRIPT, whose
    // failed AC verdict produces a force-used bypass — friction — with no
    // real TTY anywhere in the process).
    let ghSpawned = false;
    const spawn: SpawnFn = () => {
      ghSpawned = true;
      throw new Error('gh must never be spawned when isRealTTY is false');
    };
    const { ctx, out, err } = offerCtx({ interactivity: 'interactive', isRealTTY: false, spawn });
    await runRetroOffer(FRICTION_DIGEST, ctx);
    expect(ghSpawned).toBe(false);
    expect(out).toHaveLength(0);
    expect(err).toHaveLength(0);
  });

  it('skips with no notice when retro.enabled is false (an intentional opt-out, not a fallback)', async () => {
    const { ctx, err } = offerCtx({ cadenceConfig: { ...defaultConfig, retro: { enabled: false, offerGithubIssue: true } } });
    await runRetroOffer(FRICTION_DIGEST, ctx);
    expect(err).toHaveLength(0);
  });

  it('skips silently when offerGithubIssue is false but retro.enabled stays true', async () => {
    const { ctx, out, err } = offerCtx({ cadenceConfig: { ...defaultConfig, retro: { enabled: true, offerGithubIssue: false } } });
    await runRetroOffer(FRICTION_DIGEST, ctx);
    expect(out).toHaveLength(0);
    expect(err).toHaveLength(0);
  });

  it('skips with a notice when gh cannot resolve a target', async () => {
    const failingSpawn = ((): never => {
      const proc = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
      queueMicrotask(() => (proc as unknown as EventEmitter).emit('close', 1));
      return proc as never;
    }) as unknown as Parameters<typeof runRetroOffer>[1]['spawn'];
    const { ctx, err } = offerCtx({ spawn: failingSpawn });
    await runRetroOffer(FRICTION_DIGEST, ctx);
    expect(err.some((l) => l.includes('gh CLI unavailable or repo unresolved'))).toBe(true);
  });

  it('end-to-end: resolves target, prompts, creates the issue, and adds the label', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    const created = ['https://github.com/owner/repo/issues/9\n'];
    let cursor = 0;
    const spawn = ((bin: string, args: string[]) => {
      calls.push({ bin, args });
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const proc = Object.assign(new EventEmitter(), { stdout, stderr });
      const isRepoView = args[0] === 'repo';
      const isCreate = args[0] === 'issue' && args[1] === 'create';
      queueMicrotask(() => {
        if (isRepoView) stdout.emit('data', 'owner/repo\n');
        else if (isCreate) stdout.emit('data', created[cursor++] ?? '');
        (proc as unknown as EventEmitter).emit('close', 0);
      });
      return proc as never;
    }) as unknown as Parameters<typeof runRetroOffer>[1]['spawn'];

    const { ctx, out } = offerCtx({ spawn, createPrompter: () => new ScriptedPrompter(['y']) });
    await runRetroOffer(FRICTION_DIGEST, ctx);

    expect(calls[0]?.args).toEqual(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
    expect(calls[1]?.args).toContain('create');
    expect(calls[2]?.args).toEqual([
      'issue', 'edit', 'https://github.com/owner/repo/issues/9', '--repo', 'owner/repo', '--add-label', 'needs-triage',
    ]);
    expect(out.some((l) => l.includes('https://github.com/owner/repo/issues/9'))).toBe(true);
  });

  it('does not spawn gh past target-resolution when the user declines', async () => {
    const calls: string[] = [];
    const spawn = ((bin: string, args: string[]) => {
      calls.push(args[0] ?? '');
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const proc = Object.assign(new EventEmitter(), { stdout, stderr });
      queueMicrotask(() => {
        stdout.emit('data', 'owner/repo\n');
        (proc as unknown as EventEmitter).emit('close', 0);
      });
      return proc as never;
    }) as unknown as Parameters<typeof runRetroOffer>[1]['spawn'];
    const { ctx } = offerCtx({ spawn, createPrompter: () => new ScriptedPrompter(['n']) });
    await runRetroOffer(FRICTION_DIGEST, ctx);
    expect(calls).toEqual(['repo']); // only the target-resolution call — never "issue"
  });
});
