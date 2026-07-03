// packages/core/tests/services/resume.test.ts
import { afterEach, describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { resumeService } from '../../src/services/resume.js';
import { bufferIO } from '../../src/services/io.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('resumeService', () => {
  it('reports "no handoff found" via the passed-in io when there is none', async () => {
    active = await tempRepo({ initialized: true });
    const io = bufferIO();
    const res = await resumeService(active.root, {}, io);
    expect(res.exitCode).toBe(0);
    expect(io.stdout()).toContain('resume: no handoff found');
  });
});

// ---------------------------------------------------------------------------
// Phase 143 task 6: resumeService must forward its own `io` into `runResume`
// so the "N other worktree(s) have resumable handoffs" nudge is captured by
// the caller's CommandIO (in-memory buffers, for the MCP surface) instead of
// leaking to the real process.stderr. Mirrors the real-worktree fixture
// pattern from tests/handoff/run-resume.test.ts.
// ---------------------------------------------------------------------------

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
}

async function writeRepoState(
  root: string,
  overrides: { lastHandoff?: string | null; loopPosition?: string } = {},
): Promise<void> {
  const dir = join(root, '.cadence');
  await mkdir(dir, { recursive: true });
  const state = {
    schemaVersion: 1,
    project: { name: 'test', createdAt: '2026-01-01T00:00:00.000Z' },
    activePhase: null,
    activeDraft: null,
    activeSpec: null,
    loopPosition: overrides.loopPosition ?? 'IDLE',
    tier: null,
    draftReadAt: null,
    openDrafts: [],
    decisions: [],
    deferred: [],
    session: {
      tokenUtilization: 0,
      lastHandoff: overrides.lastHandoff ?? null,
      subagentSpawns: 0,
    },
    skillAudit: { required: [], invoked: [] },
    activeTask: null,
  };
  await writeFile(join(dir, 'state.json'), JSON.stringify(state, null, 2));
}

async function writeHandoffDoc(
  root: string,
  fileName: string,
  generatedAt: string,
  extra: Record<string, string> = {},
): Promise<void> {
  const dir = join(root, '.cadence', 'handoff');
  await mkdir(dir, { recursive: true });
  const lines = ['---', 'cadence_handoff: 1', `generated_at: ${generatedAt}`];
  for (const [k, v] of Object.entries(extra)) lines.push(`${k}: ${v}`);
  lines.push('---', '# Session Handoff', '', '## Next action', '', 'do the thing', '');
  await writeFile(join(dir, fileName), lines.join('\n'));
}

describe('resumeService: forwards io into runResume (phase 143 task 6)', () => {
  let parent: string;
  beforeAll(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), 'cadence-resume-svc-')));
  });
  afterAll(async () => {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(
      () => {},
    );
  });

  it('captures the "other worktree(s)" nudge on the passed-in io, not real stderr', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-svc-')));
    await initRepo(main);
    await writeRepoState(main, { loopPosition: 'DRAFT' });
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');

    const sib1 = join(parent, `sib1-svc-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'svc-feature-1', sib1]);
    await writeRepoState(sib1, { loopPosition: 'BUILD' });
    await writeHandoffDoc(sib1, 'SESSION-2026-07-02-s1.md', '2026-07-02T09:00:00.000Z');

    const sib2 = join(parent, `sib2-svc-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'svc-feature-2', sib2]);
    await writeRepoState(sib2, { loopPosition: 'SETTLE' });
    await writeHandoffDoc(sib2, 'SESSION-2026-07-03-s2.md', '2026-07-03T09:00:00.000Z');

    const realStderrWrite = process.stderr.write.bind(process.stderr);
    let leaked = '';
    process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
      leaked += typeof chunk === 'string' ? chunk : String(chunk);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return realStderrWrite(chunk as any, ...(rest as any));
    }) as typeof process.stderr.write;

    try {
      const io = bufferIO();
      const res = await resumeService(main, {}, io);

      expect(res.exitCode).toBe(0);
      expect(io.stderr()).toContain('2 other worktree(s)');
      expect(io.stderr()).toContain('cadence resume --list');
      // The nudge must not have leaked to the real process.stderr — it should
      // only ever reach resumeService's own `io`.
      expect(leaked).not.toContain('resumable handoffs');
    } finally {
      process.stderr.write = realStderrWrite;
    }
  });
});
