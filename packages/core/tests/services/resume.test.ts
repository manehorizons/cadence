// packages/core/tests/services/resume.test.ts
import { afterEach, describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig } from '@manehorizons/cadence-types';
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

async function writeResumeConfig(
  root: string,
  resume: { crossWorktree?: boolean; autoList?: boolean },
): Promise<void> {
  const dir = join(root, '.cadence');
  await mkdir(dir, { recursive: true });
  const config = { ...defaultConfig, resume: { ...defaultConfig.resume, ...resume } };
  await writeFile(join(dir, 'config.json'), JSON.stringify(config, null, 2));
}

describe('resumeService: CLI-parity rendering for cross-worktree candidates (phase 143 task 9)', () => {
  let parent: string;
  beforeAll(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), 'cadence-resume-svc-render-')));
  });
  afterAll(async () => {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(
      () => {},
    );
  });

  it('renders the candidate menu (not the generic message) when !found but candidates exist', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-render-')));
    await initRepo(main);
    await writeRepoState(main, { loopPosition: 'DRAFT' });
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');
    await writeResumeConfig(main, { autoList: true });

    const sib1 = join(parent, `sib1-render-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'render-feature-1', sib1]);
    await writeRepoState(sib1, { loopPosition: 'BUILD' });
    await writeHandoffDoc(sib1, 'SESSION-2026-07-02-s1.md', '2026-07-02T09:00:00.000Z');

    // MCP is always non-TTY: force bypass regardless of the actual test-runner
    // TTY state, matching run-resume.test.ts's AC-7 non-TTY case.
    const previous = process.env.CADENCE_NONINTERACTIVE;
    process.env.CADENCE_NONINTERACTIVE = '1';
    try {
      const io = bufferIO();
      const res = await resumeService(main, {}, io);

      expect(res.exitCode).toBe(0);
      expect(res.data).toBeDefined();
      const data = res.data as { found: boolean; candidates?: unknown[] };
      expect(data.found).toBe(false);
      expect(data.candidates).toBeDefined();
      expect(data.candidates).toHaveLength(2);
      expect(io.stdout()).toContain('Handoff candidates:');
      expect(io.stdout()).not.toContain('resume: no handoff found');
    } finally {
      if (previous === undefined) delete process.env.CADENCE_NONINTERACTIVE;
      else process.env.CADENCE_NONINTERACTIVE = previous;
    }
  });

  it('keeps the exact generic message when !found and there are no candidates', async () => {
    active = await tempRepo({ initialized: true });
    const io = bufferIO();
    const res = await resumeService(active.root, {}, io);
    expect(res.exitCode).toBe(0);
    expect(io.stdout()).toContain('resume: no handoff found — run `cadence handoff` to create one.\n');
  });

  it('prints the sibling-worktree header + full-mode footer when resuming a sibling doc', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-sibling-full-')));
    await initRepo(main);
    await writeRepoState(main, { loopPosition: 'DRAFT' });
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');
    await writeResumeConfig(main, { autoList: true });

    const sib1 = join(parent, `sib1-full-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'sibling-full-feature', sib1]);
    await writeRepoState(sib1, { loopPosition: 'BUILD' });
    await writeHandoffDoc(sib1, 'SESSION-2026-07-02-s1.md', '2026-07-02T09:00:00.000Z');

    // Script the interactive prompt to pick the sibling candidate (the
    // freshest of the two, index 1) so `runResume` resolves to it directly —
    // mirrors run-resume.test.ts's "AC-7: scripted/TTY-interactive prompt".
    const previous = process.env.CADENCE_PROMPTER_SCRIPT;
    process.env.CADENCE_PROMPTER_SCRIPT = '1\n';
    try {
      const io = bufferIO();
      const res = await resumeService(main, { mode: 'full' }, io);

      expect(res.exitCode).toBe(0);
      const data = res.data as { found: boolean; pickedSource?: string; pickedWorktree?: string };
      expect(data.found).toBe(true);
      expect(data.pickedSource).toBe('sibling');
      expect(io.stdout()).toContain(`--- from sibling worktree: ${data.pickedWorktree} ---\n\n`);
      expect(io.stdout()).toContain(
        `live context recompute skipped: ${data.pickedWorktree} is a different worktree — cd there and run \`cadence resume --full\` to get its live context`,
      );
    } finally {
      if (previous === undefined) delete process.env.CADENCE_PROMPTER_SCRIPT;
      else process.env.CADENCE_PROMPTER_SCRIPT = previous;
    }
  });

  it('prints the sibling-worktree header + brief-mode footer when resuming a sibling doc', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-sibling-brief-')));
    await initRepo(main);
    await writeRepoState(main, { loopPosition: 'DRAFT' });
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');
    await writeResumeConfig(main, { autoList: true });

    const sib1 = join(parent, `sib1-brief-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'sibling-brief-feature', sib1]);
    await writeRepoState(sib1, { loopPosition: 'BUILD' });
    await writeHandoffDoc(sib1, 'SESSION-2026-07-02-s1.md', '2026-07-02T09:00:00.000Z');

    const previous = process.env.CADENCE_PROMPTER_SCRIPT;
    process.env.CADENCE_PROMPTER_SCRIPT = '1\n';
    try {
      const io = bufferIO();
      const res = await resumeService(main, { mode: 'brief' }, io);

      expect(res.exitCode).toBe(0);
      const data = res.data as { found: boolean; pickedSource?: string; pickedWorktree?: string };
      expect(data.found).toBe(true);
      expect(data.pickedSource).toBe('sibling');
      expect(io.stdout()).toContain(`--- from sibling worktree: ${data.pickedWorktree} ---\n\n`);
      expect(io.stdout()).toContain(
        `brief mode: ${data.pickedWorktree} is a different worktree — cd there and run \`cadence resume --full\` (or re-supply the same --pick/--path from there) to get its full doc + live context`,
      );
    } finally {
      if (previous === undefined) delete process.env.CADENCE_PROMPTER_SCRIPT;
      else process.env.CADENCE_PROMPTER_SCRIPT = previous;
    }
  });
});

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
