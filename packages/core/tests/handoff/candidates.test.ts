// packages/core/tests/handoff/candidates.test.ts
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseHandoffMeta, gatherHandoffCandidates } from '../../src/handoff/candidates.js';
import * as locate from '../../src/handoff/locate.js';
import type * as LocateModule from '../../src/handoff/locate.js';
import { isSameWorktree } from '../../src/git/worktrees.js';

const FULL_FRONTMATTER = [
  '---',
  'cadence_handoff: 1',
  'generated_at: 2026-07-02T10:00:00.000Z',
  'label: phase-142',
  'loop_position: BUILD',
  'active_phase: 142-05',
  'active_draft: 01',
  'tier: standard',
  'git_branch: feat/candidates',
  'git_dirty: true',
  'git_head: abc1234',
  'git_ahead: 1',
  'git_behind: 0',
  'context_packet: .cadence/context/handoff.json',
  '---',
  '# Session Handoff — 2026-07-02 (phase-142)',
  '',
].join('\n');

describe('parseHandoffMeta', () => {
  it('AC-3: extracts every field from a realistic full frontmatter block', () => {
    const meta = parseHandoffMeta(FULL_FRONTMATTER);
    expect(meta).toEqual({
      generatedAt: '2026-07-02T10:00:00.000Z',
      label: 'phase-142',
      loopPosition: 'BUILD',
      activePhase: '142-05',
      gitBranch: 'feat/candidates',
      tier: 'standard',
    });
  });

  it('AC-3: returns null for missing keys while still extracting present ones', () => {
    const partial = [
      '---',
      'cadence_handoff: 1',
      'generated_at: 2026-07-02T10:00:00.000Z',
      'loop_position: IDLE',
      '---',
    ].join('\n');
    const meta = parseHandoffMeta(partial);
    expect(meta).toEqual({
      generatedAt: '2026-07-02T10:00:00.000Z',
      label: null,
      loopPosition: 'IDLE',
      activePhase: null,
      gitBranch: null,
      tier: null,
    });
  });

  it('AC-3: returns all-null for an empty string without throwing', () => {
    expect(() => parseHandoffMeta('')).not.toThrow();
    expect(parseHandoffMeta('')).toEqual({
      generatedAt: null,
      label: null,
      loopPosition: null,
      activePhase: null,
      gitBranch: null,
      tier: null,
    });
  });

  it('AC-3: returns all-null for content with no frontmatter at all', () => {
    expect(parseHandoffMeta('# just a heading\n\nsome text\n')).toEqual({
      generatedAt: null,
      label: null,
      loopPosition: null,
      activePhase: null,
      gitBranch: null,
      tier: null,
    });
  });

  it('AC-3: treats a key present with an empty value as null', () => {
    const withEmptyLabel = [
      '---',
      'generated_at: 2026-07-02T10:00:00.000Z',
      'label: ',
      'loop_position: IDLE',
      'active_phase: ',
      'git_branch: main',
      'tier: ',
      '---',
    ].join('\n');
    const meta = parseHandoffMeta(withEmptyLabel);
    expect(meta).toEqual({
      generatedAt: '2026-07-02T10:00:00.000Z',
      label: null,
      loopPosition: 'IDLE',
      activePhase: null,
      gitBranch: 'main',
      tier: null,
    });
  });
});

vi.mock('../../src/handoff/locate.js', async (importOriginal) => {
  const actual = await importOriginal<typeof LocateModule>();
  return { ...actual };
});

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** Init a git repo with a deterministic `main` branch and an initial commit. */
async function initRepo(root: string): Promise<void> {
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  await writeFile(join(root, 'README.md'), '# test\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'init']);
}

async function writeState(
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
  lines.push('---', `# Session Handoff`, '');
  await writeFile(join(dir, fileName), lines.join('\n'));
}

describe('gatherHandoffCandidates (AC-4, AC-5, real git worktree fixtures)', () => {
  let parent: string;
  beforeAll(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), 'cadence-cand-')));
  });
  afterAll(async () => {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(
      () => {},
    );
  });
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('case 1: local only, zero siblings → exactly 1 candidate, source local', async () => {
    const root = await realpath(await mkdtemp(join(parent, 'solo-')));
    await initRepo(root);
    await writeState(root, { loopPosition: 'BUILD' });
    await writeHandoffDoc(root, 'SESSION-2026-07-01-a.md', '2026-07-01T10:00:00.000Z');

    const result = await gatherHandoffCandidates(root);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('local');
    expect(result[0]?.worktreePath).toBe(root);
    expect(result[0]?.liveLoopPosition).toBe('BUILD');
  });

  it('case 2: two siblings each with own doc + valid state.json → 3 candidates', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-')));
    await initRepo(main);
    await writeState(main, { loopPosition: 'DRAFT' });
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');

    const sib1 = join(parent, `sib1-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-1', sib1]);
    await writeState(sib1, { loopPosition: 'BUILD' });
    await writeHandoffDoc(sib1, 'SESSION-2026-07-02-s1.md', '2026-07-02T09:00:00.000Z');

    const sib2 = join(parent, `sib2-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-2', sib2]);
    await writeState(sib2, { loopPosition: 'SETTLE' });
    await writeHandoffDoc(sib2, 'SESSION-2026-07-03-s2.md', '2026-07-03T09:00:00.000Z');

    const result = await gatherHandoffCandidates(main);
    expect(result).toHaveLength(3);

    const sib1Real = await realpath(sib1);
    const sib2Real = await realpath(sib2);

    const c1 = result.find((c) => isSameWorktree(c.worktreePath, sib1Real));
    expect(c1).toBeDefined();
    expect(c1?.source).toBe('sibling');
    expect(c1?.worktreeBranch).toBe('feature-1');
    expect(c1?.liveLoopPosition).toBe('BUILD');

    const c2 = result.find((c) => isSameWorktree(c.worktreePath, sib2Real));
    expect(c2).toBeDefined();
    expect(c2?.source).toBe('sibling');
    expect(c2?.worktreeBranch).toBe('feature-2');
    expect(c2?.liveLoopPosition).toBe('SETTLE');

    const local = result.find((c) => c.source === 'local');
    expect(local).toBeDefined();
    expect(local?.liveLoopPosition).toBe('DRAFT');
  });

  it('case 3: sibling with corrupt state.json but valid handoff doc still appears, liveLoopPosition null', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main3-')));
    await initRepo(main);

    const sib = join(parent, `sib3-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-corrupt', sib]);
    await mkdir(join(sib, '.cadence'), { recursive: true });
    await writeFile(join(sib, '.cadence', 'state.json'), '{ not valid json ][');
    await writeHandoffDoc(sib, 'SESSION-2026-07-01-corrupt.md', '2026-07-01T12:00:00.000Z');

    const result = await gatherHandoffCandidates(main);
    const c = result.find((r) => r.source === 'sibling');
    expect(c).toBeDefined();
    expect(c?.liveLoopPosition).toBeNull();
  });

  it('case 4: sibling with no state.json at all still appears, liveLoopPosition null', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main4-')));
    await initRepo(main);

    const sib = join(parent, `sib4-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-nostate', sib]);
    await writeHandoffDoc(sib, 'SESSION-2026-07-01-nostate.md', '2026-07-01T12:00:00.000Z');

    const result = await gatherHandoffCandidates(main);
    const c = result.find((r) => r.source === 'sibling');
    expect(c).toBeDefined();
    expect(c?.liveLoopPosition).toBeNull();
  });

  it('case 5: sibling with no .cadence/handoff/ contributes nothing, no throw', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main5-')));
    await initRepo(main);
    await writeState(main);
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T12:00:00.000Z');

    const sib = join(parent, `sib5-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-empty', sib]);
    // no .cadence/handoff/ at all in sibling

    let result: Awaited<ReturnType<typeof gatherHandoffCandidates>> = [];
    await expect(
      (async () => {
        result = await gatherHandoffCandidates(main);
      })(),
    ).resolves.not.toThrow();
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('local');
  });

  it('case 6: ghost worktree (dir rm -rf, not pruned) contributes nothing, no throw', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main6-')));
    await initRepo(main);
    await writeState(main);
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T12:00:00.000Z');

    const ghost = join(parent, `ghost6-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-ghost', ghost]);
    await writeHandoffDoc(ghost, 'SESSION-2026-07-01-ghost.md', '2026-07-01T12:00:00.000Z');
    await rm(ghost, { recursive: true, force: true });

    let result: Awaited<ReturnType<typeof gatherHandoffCandidates>> = [];
    await expect(
      (async () => {
        result = await gatherHandoffCandidates(main);
      })(),
    ).resolves.not.toThrow();
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('local');
  });

  it('case 7: local lastHandoff pointer is honored over merely-freshest-on-disk', async () => {
    const root = await realpath(await mkdtemp(join(parent, 'pointer-')));
    await initRepo(root);
    await writeHandoffDoc(root, 'SESSION-2026-07-01-older.md', '2026-07-01T08:00:00.000Z');
    await writeHandoffDoc(root, 'SESSION-2026-07-02-newer.md', '2026-07-02T08:00:00.000Z');
    await writeState(root, { lastHandoff: 'SESSION-2026-07-01-older.md' });

    const result = await gatherHandoffCandidates(root);
    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe('SESSION-2026-07-01-older.md');
    expect(result[0]?.generatedAt).toBe('2026-07-01T08:00:00.000Z');
  });

  it('case 8a: freshest-first ranking — sibling newer than local', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main8a-')));
    await initRepo(main);
    await writeState(main);
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T08:00:00.000Z');

    const sib = join(parent, `sib8a-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-8a', sib]);
    await writeState(sib);
    await writeHandoffDoc(sib, 'SESSION-2026-07-05-sib.md', '2026-07-05T08:00:00.000Z');

    const result = await gatherHandoffCandidates(main);
    expect(result[0]?.source).toBe('sibling');
    expect(result[0]?.generatedAt).toBe('2026-07-05T08:00:00.000Z');
  });

  it('case 8b: freshest-first ranking — local newer than sibling', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main8b-')));
    await initRepo(main);
    await writeState(main);
    await writeHandoffDoc(main, 'SESSION-2026-07-09-local.md', '2026-07-09T08:00:00.000Z');

    const sib = join(parent, `sib8b-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-8b', sib]);
    await writeState(sib);
    await writeHandoffDoc(sib, 'SESSION-2026-07-01-sib.md', '2026-07-01T08:00:00.000Z');

    const result = await gatherHandoffCandidates(main);
    expect(result[0]?.source).toBe('local');
    expect(result[0]?.generatedAt).toBe('2026-07-09T08:00:00.000Z');
  });

  it('does not conflate doc frontmatter git_branch with live worktreeBranch', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'branch-')));
    await initRepo(main);
    await writeState(main);
    // Doc claims a stale branch name that does not match the live HEAD.
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T08:00:00.000Z', {
      git_branch: 'some-stale-branch-name',
    });

    const result = await gatherHandoffCandidates(main);
    const local = result.find((c) => c.source === 'local');
    expect(local?.worktreeBranch).toBe('main');
    expect(local?.worktreeBranch).not.toBe('some-stale-branch-name');
  });

  it('regression: a throw from locateFreshestHandoff on the LOCAL worktree must not drop siblings too', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-throw-')));
    await initRepo(main);
    await writeState(main);
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T08:00:00.000Z');

    const sib = join(parent, `sib-throw-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'feature-throw', sib]);
    await writeState(sib);
    await writeHandoffDoc(sib, 'SESSION-2026-07-02-sib.md', '2026-07-02T08:00:00.000Z');

    // Simulate `locateFreshestHandoff` throwing for the LOCAL worktree only
    // (e.g. an EACCES on .cadence/handoff/, or a TOCTOU race between
    // readdir and readFile) while behaving normally for the sibling. Before
    // the fix, gatherLocalCandidate had no outer try/catch, so this throw
    // would reject the whole `Promise.all` in gatherHandoffCandidates and
    // silently drop the sibling candidate along with the local one.
    const real = locate.locateFreshestHandoff;
    vi.spyOn(locate, 'locateFreshestHandoff').mockImplementation(async (root, lastHandoff) => {
      if (root === main) throw new Error('simulated EACCES reading local handoff dir');
      return real(root, lastHandoff);
    });

    let result: Awaited<ReturnType<typeof gatherHandoffCandidates>> = [];
    await expect(
      (async () => {
        result = await gatherHandoffCandidates(main);
      })(),
    ).resolves.not.toThrow();

    // The local candidate is dropped (its own lookup threw)...
    expect(result.find((c) => c.source === 'local')).toBeUndefined();
    // ...but the sibling still surfaces — proving the local throw did not
    // reject the shared Promise.all and take the sibling result with it.
    const sibReal = await realpath(sib);
    const siblingResult = result.find((c) => isSameWorktree(c.worktreePath, sibReal));
    expect(siblingResult).toBeDefined();
    expect(siblingResult?.source).toBe('sibling');
    expect(result).toHaveLength(1);
  });
});
