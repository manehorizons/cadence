// packages/core/tests/handoff/run-resume.test.ts
import { afterEach, describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, mkdir, writeFile, rm, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { defaultConfig } from '@manehorizons/cadence-types';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { runHandoff } from '../../src/handoff/run-handoff.js';
import { runResume } from '../../src/handoff/run-resume.js';
import { gatherHandoffCandidates } from '../../src/handoff/candidates.js';
import { SimpleStateBackend } from '../../src/state/simple.js';
import { isSameWorktree } from '../../src/git/worktrees.js';
import { bufferIO } from '../../src/services/io.js';
import * as contextModule from '../../src/intelligence/context.js';
import type * as ContextModule from '../../src/intelligence/context.js';

vi.mock('../../src/intelligence/context.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ContextModule>();
  return { ...actual };
});

const NOW = new Date('2026-06-03T14:02:00.000Z');
let active: Fixture | null = null;
afterEach(async () => {
  vi.restoreAllMocks();
  if (active) { await active.cleanup(); active = null; }
});

describe('runResume', () => {
  it('AC-18: returns { found: false } when there is no handoff', async () => {
    active = await tempRepo({ initialized: true });
    const res = await runResume(active.root);
    expect(res.found).toBe(false);
  });

  it('AC-19: --full replays the whole doc with a fresh live context packet', async () => {
    active = await tempRepo({ initialized: true });
    await runHandoff(active.root, { label: 'demo' }, NOW);
    const res = await runResume(active.root, { mode: 'full' });
    expect(res.found).toBe(true);
    if (res.found) {
      expect(res.mode).toBe('full');
      expect(res.doc).toMatch(/# Session Handoff/);
      expect(res.context?.scope).toBe('handoff');
      expect(res.handoffPath.endsWith('SESSION-2026-06-03-demo.md')).toBe(true);
    }
  });

  it('AC-20: does not mutate state.json (read-only)', async () => {
    active = await tempRepo({ initialized: true });
    await runHandoff(active.root, {}, NOW);
    const before = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');
    await runResume(active.root);
    const after = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');
    expect(after).toBe(before);
  });

  it('AC-21: defaults to brief output (no context recompute) with no drift', async () => {
    active = await tempRepo({ initialized: true });
    await runHandoff(active.root, { label: 'demo' }, NOW);
    const res = await runResume(active.root);
    expect(res.found).toBe(true);
    if (res.found) {
      expect(res.mode).toBe('brief');
      expect(res.context).toBeNull();
      expect(res.doc).toContain('## Next action');
      expect(res.doc).not.toContain('## CADENCE context');
    }
  });

  it('AC-22: auto-promotes to full output when live state has drifted', async () => {
    active = await tempRepo({ initialized: true });
    await runHandoff(active.root, { label: 'demo' }, NOW);
    const backend = new SimpleStateBackend(active.root);
    const state = await backend.readState();
    // The fixture starts IDLE; move to any other position to diverge from the
    // handoff doc's captured loop_position and trigger drift.
    const moved = state.loopPosition === 'IDLE' ? 'BUILD' : 'IDLE';
    await backend.commit({ ...state, loopPosition: moved as typeof state.loopPosition });
    const res = await runResume(active.root);
    expect(res.found).toBe(true);
    if (res.found) {
      expect(res.mode).toBe('full');
      expect(res.drift).not.toBeNull();
      expect(res.context?.scope).toBe('handoff');
      expect(res.doc).toMatch(/# Session Handoff/);
    }
  });

  it('AC-23: explicit mode overrides the drift heuristic', async () => {
    active = await tempRepo({ initialized: true });
    await runHandoff(active.root, { label: 'demo' }, NOW);
    const full = await runResume(active.root, { mode: 'full' });
    expect(full.found).toBe(true);
    if (full.found) {
      expect(full.mode).toBe('full');
      expect(full.context?.scope).toBe('handoff');
    }
    const brief = await runResume(active.root, { mode: 'brief' });
    expect(brief.found).toBe(true);
    if (brief.found) {
      expect(brief.mode).toBe('brief');
      expect(brief.context).toBeNull();
    }
  });

  // T6 — the concrete, checkable form of "byte-identical to the
  // pre-phase-143 baseline" for the JSON/`--json` surface: a single-worktree
  // repo (no siblings) must never grow the new phase-143 keys.
  it('phase 143 T6: single-worktree result carries no candidates/pickedSource/pickedWorktree keys', async () => {
    active = await tempRepo({ initialized: true });
    await runHandoff(active.root, { label: 'demo' }, NOW);
    const res = await runResume(active.root);
    expect(res.found).toBe(true);
    expect(res).not.toHaveProperty('candidates');
    expect(res).not.toHaveProperty('pickedSource');
    expect(res).not.toHaveProperty('pickedWorktree');
  });
});

// ---------------------------------------------------------------------------
// Phase 143 (T4/T5/T6): cross-worktree candidate wiring in runResume itself.
// Real `git worktree add` fixtures — mirrors
// packages/core/tests/handoff/candidates.test.ts's setup pattern exactly.
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

async function listFilesRecursive(dir: string, base = dir): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await listFilesRecursive(full, base)));
    } else if (e.isFile()) {
      files.push(relative(base, full));
    }
  }
  return files.sort();
}

/** Snapshot every file under `<root>/.cadence` as a sorted `{relPath: content}` map. */
async function snapshotCadenceDir(root: string): Promise<Record<string, string>> {
  const dir = join(root, '.cadence');
  const rels = await listFilesRecursive(dir);
  const snap: Record<string, string> = {};
  for (const rel of rels) {
    snap[rel] = await readFile(join(dir, rel), 'utf8');
  }
  return snap;
}

describe('runResume: cross-worktree candidates (phase 143)', () => {
  let parent: string;
  beforeAll(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), 'cadence-resume-')));
  });
  afterAll(async () => {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(
      () => {},
    );
  });

  it('AC-1: single candidate (no siblings) is byte-identical regardless of --local/crossWorktree', async () => {
    const root = await realpath(await mkdtemp(join(parent, 'solo-')));
    await initRepo(root);
    await writeRepoState(root, { loopPosition: 'BUILD' });
    await writeHandoffDoc(root, 'SESSION-2026-07-01-a.md', '2026-07-01T10:00:00.000Z');

    const bare = await runResume(root, {}, NOW);
    const local = await runResume(root, { local: true }, NOW);
    await writeResumeConfig(root, { crossWorktree: false });
    const optedOut = await runResume(root, {}, NOW);

    for (const res of [bare, local, optedOut]) {
      expect(res.found).toBe(true);
      expect(res).not.toHaveProperty('candidates');
      expect(res).not.toHaveProperty('pickedSource');
      expect(res).not.toHaveProperty('pickedWorktree');
    }
    expect(bare).toEqual(local);
  });

  it('AC-2: 2+ candidates, autoList:false (default), no flags — resumes local + attaches candidates + one stderr nudge', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-ac2-')));
    await initRepo(main);
    await writeRepoState(main, { loopPosition: 'DRAFT' });
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');

    const sib1 = join(parent, `sib1-ac2-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'ac2-feature-1', sib1]);
    await writeRepoState(sib1, { loopPosition: 'BUILD' });
    await writeHandoffDoc(sib1, 'SESSION-2026-07-02-s1.md', '2026-07-02T09:00:00.000Z');

    const sib2 = join(parent, `sib2-ac2-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'ac2-feature-2', sib2]);
    await writeRepoState(sib2, { loopPosition: 'SETTLE' });
    await writeHandoffDoc(sib2, 'SESSION-2026-07-03-s2.md', '2026-07-03T09:00:00.000Z');

    const io = bufferIO();
    const res = await runResume(main, {}, NOW, io);

    expect(res.found).toBe(true);
    expect(res).toHaveProperty('candidates');
    if ('candidates' in res) {
      expect(res.candidates).toHaveLength(3);
    }
    expect(io.stderr()).toContain('2 other worktree(s)');
    expect(io.stderr()).toContain('cadence resume --list');
  });

  it('AC-3: --list renders every candidate and resumes nothing', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-ac3-')));
    await initRepo(main);
    await writeRepoState(main);
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');

    const sib = join(parent, `sib-ac3-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'ac3-feature', sib]);
    await writeRepoState(sib);
    await writeHandoffDoc(sib, 'SESSION-2026-07-02-s.md', '2026-07-02T09:00:00.000Z');

    const io = bufferIO();
    const res = await runResume(main, { list: true }, NOW, io);
    expect(res.found).toBe(false);
    expect('candidates' in res && res.candidates).toBeTruthy();
    if ('candidates' in res && res.candidates) {
      expect(res.candidates).toHaveLength(2);
    }
  });

  it('AC-4: --pick resolving to the local candidate returns the local-resolution result + candidates, no prompt', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-ac4local-')));
    await initRepo(main);
    await writeRepoState(main, { loopPosition: 'IDLE' });
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');

    const sib = join(parent, `sib-ac4local-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'ac4-local-feature', sib]);
    await writeRepoState(sib);
    await writeHandoffDoc(sib, 'SESSION-2026-07-02-s.md', '2026-07-02T09:00:00.000Z');

    const candidates = await gatherHandoffCandidates(main);
    const localIdx = candidates.findIndex((c) => c.source === 'local');
    expect(localIdx).toBeGreaterThanOrEqual(0);

    const withoutPick = await runResume(main, {}, NOW, bufferIO());
    const picked = await runResume(main, { pick: localIdx + 1 }, NOW, bufferIO());

    expect(picked.found).toBe(true);
    expect(picked).not.toHaveProperty('pickedSource');
    expect(picked).not.toHaveProperty('pickedWorktree');
    if ('candidates' in picked) expect(picked.candidates).toHaveLength(2);
    // Same underlying local-resolution result, modulo the attached `candidates`.
    if (picked.found && withoutPick.found) {
      expect(picked.doc).toBe(withoutPick.doc);
      expect(picked.handoffPath).toBe(withoutPick.handoffPath);
    }
  });

  it('AC-4: --pick resolving to a sibling returns pickedSource/pickedWorktree + the sibling\'s own doc + drift', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-ac4sib-')));
    await initRepo(main);
    await writeRepoState(main, { loopPosition: 'IDLE' });
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');

    const sib = join(parent, `sib-ac4sib-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'ac4-sib-feature', sib]);
    // Sibling's live state is BUILD, but its handoff doc claims DRAFT — drift.
    await writeRepoState(sib, { loopPosition: 'BUILD' });
    await writeHandoffDoc(sib, 'SESSION-2026-07-02-s.md', '2026-07-02T09:00:00.000Z', {
      loop_position: 'DRAFT',
    });

    const candidates = await gatherHandoffCandidates(main);
    const sibReal = await realpath(sib);
    const sibIdx = candidates.findIndex((c) => isSameWorktree(c.worktreePath, sibReal));
    expect(sibIdx).toBeGreaterThanOrEqual(0);

    const res = await runResume(main, { pick: sibIdx + 1 }, NOW);
    expect(res.found).toBe(true);
    if (res.found) {
      expect(res.pickedSource).toBe('sibling');
      expect(isSameWorktree(res.pickedWorktree ?? '', sibReal)).toBe(true);
      expect(res.drift).toEqual({ docLoopPosition: 'DRAFT', liveLoopPosition: 'BUILD' });
      // drift forces mode 'full' by default — the doc is the sibling's own full content.
      expect(res.mode).toBe('full');
      expect(res.doc).toContain('# Session Handoff');
      expect(res.context).toBeNull();
    }
    if ('candidates' in res) expect(res.candidates).toHaveLength(2);
  });

  it('AC-4: --path is an equivalent resolution path for both local and sibling candidates', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-ac4path-')));
    await initRepo(main);
    await writeRepoState(main);
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');

    const sib = join(parent, `sib-ac4path-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'ac4-path-feature', sib]);
    await writeRepoState(sib);
    await writeHandoffDoc(sib, 'SESSION-2026-07-02-s.md', '2026-07-02T09:00:00.000Z');

    const candidates = await gatherHandoffCandidates(main);
    const localCand = candidates.find((c) => c.source === 'local');
    const sibCand = candidates.find((c) => c.source === 'sibling');
    expect(localCand).toBeDefined();
    expect(sibCand).toBeDefined();

    const localRes = await runResume(main, { path: localCand!.path }, NOW);
    expect(localRes.found).toBe(true);
    expect(localRes).not.toHaveProperty('pickedSource');

    const sibRes = await runResume(main, { path: sibCand!.path }, NOW);
    expect(sibRes.found).toBe(true);
    if (sibRes.found) {
      expect(sibRes.pickedSource).toBe('sibling');
      expect(sibRes.pickedWorktree).toBe(sibCand!.worktreePath);
      expect(sibRes.handoffPath).toBe(sibCand!.path);
    }
  });

  it('AC-5/AC-6: sibling pick + --full never writes to either .cadence/, never stamps local lastHandoff, never calls runContext', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-ac56-')));
    await initRepo(main);
    await writeRepoState(main, { loopPosition: 'IDLE' });
    await runHandoff(main, { label: 'local-doc' }, NOW);

    const sib = join(parent, `sib-ac56-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'ac56-feature', sib]);
    await writeRepoState(sib, { loopPosition: 'BUILD' });
    await writeHandoffDoc(sib, 'SESSION-2026-07-02-s.md', '2026-07-02T09:00:00.000Z');

    const candidates = await gatherHandoffCandidates(main);
    const sibReal = await realpath(sib);
    const sibIdx = candidates.findIndex((c) => isSameWorktree(c.worktreePath, sibReal));
    expect(sibIdx).toBeGreaterThanOrEqual(0);

    const runContextSpy = vi.spyOn(contextModule, 'runContext');

    const beforeMain = await snapshotCadenceDir(main);
    const beforeSib = await snapshotCadenceDir(sib);
    const mainStateBefore = await new SimpleStateBackend(main).readState();

    const res = await runResume(main, { pick: sibIdx + 1, mode: 'full' }, NOW);

    const afterMain = await snapshotCadenceDir(main);
    const afterSib = await snapshotCadenceDir(sib);
    const mainStateAfter = await new SimpleStateBackend(main).readState();

    expect(res.found).toBe(true);
    if (res.found) {
      expect(res.pickedSource).toBe('sibling');
      expect(isSameWorktree(res.pickedWorktree ?? '', sibReal)).toBe(true);
      expect(res.context).toBeNull();
      expect(res.mode).toBe('full');
      expect(res.doc).toContain('# Session Handoff');
    }

    // No filesystem side effect anywhere — neither worktree's .cadence/ moved.
    expect(afterMain).toEqual(beforeMain);
    expect(afterSib).toEqual(beforeSib);
    // The local session pointer specifically is untouched by a sibling pick.
    expect(mainStateAfter.session.lastHandoff).toBe(mainStateBefore.session.lastHandoff);
    // runContext must never be invoked for a sibling pick.
    expect(runContextSpy).not.toHaveBeenCalled();
  });

  it('AC-7: non-TTY + autoList:true + 2+ candidates + no pick/path never hangs — returns candidates, resumes nothing', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-ac7nontty-')));
    await initRepo(main);
    await writeRepoState(main);
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');
    await writeResumeConfig(main, { autoList: true });

    const sib = join(parent, `sib-ac7nontty-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'ac7-nontty-feature', sib]);
    await writeRepoState(sib);
    await writeHandoffDoc(sib, 'SESSION-2026-07-02-s.md', '2026-07-02T09:00:00.000Z');

    const forceNonInteractive = Boolean(process.stdin.isTTY);
    if (forceNonInteractive) process.env.CADENCE_NONINTERACTIVE = '1';
    try {
      const io = bufferIO();
      const res = await runResume(main, {}, NOW, io);
      expect(res.found).toBe(false);
      expect('candidates' in res && res.candidates).toBeTruthy();
      if ('candidates' in res && res.candidates) {
        expect(res.candidates).toHaveLength(2);
      }
    } finally {
      if (forceNonInteractive) delete process.env.CADENCE_NONINTERACTIVE;
    }
  });

  it('AC-7: a scripted/TTY-interactive prompt picks the corresponding candidate', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-ac7tty-')));
    await initRepo(main);
    await writeRepoState(main);
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');
    await writeResumeConfig(main, { autoList: true });

    const sib = join(parent, `sib-ac7tty-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'ac7-tty-feature', sib]);
    await writeRepoState(sib);
    await writeHandoffDoc(sib, 'SESSION-2026-07-02-s.md', '2026-07-02T09:00:00.000Z');

    const candidates = await gatherHandoffCandidates(main);
    const sibReal = await realpath(sib);
    const sibIdx = candidates.findIndex((c) => isSameWorktree(c.worktreePath, sibReal));
    expect(sibIdx).toBeGreaterThanOrEqual(0);

    const previous = process.env.CADENCE_PROMPTER_SCRIPT;
    process.env.CADENCE_PROMPTER_SCRIPT = `${sibIdx + 1}\n`;
    try {
      const io = bufferIO();
      const res = await runResume(main, {}, NOW, io);
      expect(res.found).toBe(true);
      if (res.found) {
        expect(res.pickedSource).toBe('sibling');
        expect(isSameWorktree(res.pickedWorktree ?? '', sibReal)).toBe(true);
      }
    } finally {
      if (previous === undefined) delete process.env.CADENCE_PROMPTER_SCRIPT;
      else process.env.CADENCE_PROMPTER_SCRIPT = previous;
    }
  });
});
