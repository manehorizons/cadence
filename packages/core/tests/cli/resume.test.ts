// packages/core/tests/cli/resume.test.ts
import { afterEach, describe, expect, it, afterAll, beforeAll } from 'vitest';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { SimpleStateBackend } from '../../src/state/simple.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');
function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CLI, ...args], { cwd });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}
let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence resume', () => {
  it('AC-24: with no handoff, prints a hint and exits 0', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['resume'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/no handoff found/i);
    expect(r.stdout).toMatch(/cadence handoff/);
  });

  it('AC-25: --full replays the whole freshest doc', async () => {
    active = await tempRepo({ initialized: true });
    await run(['handoff', '--label', 'cli'], active.root);
    const r = await run(['resume', '--full'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/# Session Handoff/);
    expect(r.stdout).toMatch(/SESSION-\d{4}-\d{2}-\d{2}-cli\.md/);
  });

  it('AC-26: --json --full emits a parseable ResumeResult with context', async () => {
    active = await tempRepo({ initialized: true });
    await run(['handoff'], active.root);
    const r = await run(['resume', '--json', '--full'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.found).toBe(true);
    expect(parsed.mode).toBe('full');
    expect(parsed.context.scope).toBe('handoff');
  });

  it('AC-29: defaults to brief output with a full-mode pointer', async () => {
    active = await tempRepo({ initialized: true });
    await run(['handoff', '--label', 'cli'], active.root);
    const r = await run(['resume'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('## Next action');
    expect(r.stdout).not.toContain('## CADENCE context');
    expect(r.stdout).toMatch(/cadence resume --full/);
  });

  it('AC-32: --json carries mode; context is null in brief', async () => {
    active = await tempRepo({ initialized: true });
    await run(['handoff'], active.root);
    const brief = JSON.parse((await run(['resume', '--json'], active.root)).stdout);
    expect(brief.mode).toBe('brief');
    expect(brief.context).toBeNull();
  });

  it('AC-34: --full and --brief together are rejected with exit 1', async () => {
    active = await tempRepo({ initialized: true });
    await run(['handoff'], active.root);
    const r = await run(['resume', '--full', '--brief'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/mutually exclusive/i);
  });

  it('AC-35: --brief forces brief output even when state has drifted', async () => {
    active = await tempRepo({ initialized: true });
    await run(['handoff'], active.root);
    const backend = new SimpleStateBackend(active.root);
    const state = await backend.readState();
    const moved = state.loopPosition === 'IDLE' ? 'BUILD' : 'IDLE';
    await backend.commit({ ...state, loopPosition: moved as typeof state.loopPosition });
    const r = await run(['resume', '--brief', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.mode).toBe('brief'); // --brief wins over the drift heuristic
    expect(parsed.context).toBeNull();
    expect(parsed.drift).not.toBeNull(); // drift is still detected + reported
  });

  // ---------------------------------------------------------------------
  // Phase 143 T7: --list / --pick / --path / --local flag wiring + the new
  // validation refusals. These fixtures are plain (non-git) tempRepo dirs —
  // `gatherHandoffCandidates` degrades gracefully with no siblings found,
  // so single-candidate flag-wiring behavior doesn't require a real repo.
  // ---------------------------------------------------------------------

  describe('phase 143: --list', () => {
    it('--list with no handoff at all renders the empty-candidates menu, not the old "no handoff" message', async () => {
      active = await tempRepo({ initialized: true });
      const r = await run(['resume', '--list'], active.root);
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/no handoff candidates found/i);
      expect(r.stdout).not.toMatch(/no handoff found — run/i);
    });

    it('--list with one local candidate renders the numbered menu and resumes nothing', async () => {
      active = await tempRepo({ initialized: true });
      await run(['handoff', '--label', 'cli'], active.root);
      const r = await run(['resume', '--list'], active.root);
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/Handoff candidates:/);
      expect(r.stdout).toMatch(/\[local]/);
      expect(r.stdout).not.toMatch(/# Session Handoff/); // no narrative replay
    });

    it('--list --json emits { found: false, candidates: [...] }', async () => {
      active = await tempRepo({ initialized: true });
      await run(['handoff', '--label', 'cli'], active.root);
      const r = await run(['resume', '--list', '--json'], active.root);
      expect(r.code).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.found).toBe(false);
      expect(Array.isArray(parsed.candidates)).toBe(true);
      expect(parsed.candidates).toHaveLength(1);
    });
  });

  describe('phase 143: --pick / --path (local resolution)', () => {
    it('--pick 1 resolves the single local candidate directly, same output as a bare resume', async () => {
      active = await tempRepo({ initialized: true });
      await run(['handoff', '--label', 'cli'], active.root);
      const bare = await run(['resume', '--json'], active.root);
      const picked = await run(['resume', '--pick', '1', '--json'], active.root);
      expect(picked.code).toBe(0);
      const bareParsed = JSON.parse(bare.stdout);
      const pickedParsed = JSON.parse(picked.stdout);
      expect(pickedParsed.found).toBe(true);
      expect(pickedParsed.doc).toBe(bareParsed.doc);
      expect(pickedParsed.handoffPath).toBe(bareParsed.handoffPath);
    });

    it('--path <exact path> resolves directly to that candidate', async () => {
      active = await tempRepo({ initialized: true });
      await run(['handoff', '--label', 'cli'], active.root);
      const listed = JSON.parse((await run(['resume', '--list', '--json'], active.root)).stdout);
      const path = listed.candidates[0].path;
      const r = await run(['resume', '--path', path, '--json'], active.root);
      expect(r.code).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.found).toBe(true);
      expect(parsed.handoffPath).toBe(path);
    });
  });

  describe('phase 143: --local', () => {
    it('--local forces the pre-143 fast path and carries no candidates key', async () => {
      active = await tempRepo({ initialized: true });
      await run(['handoff', '--label', 'cli'], active.root);
      const r = await run(['resume', '--local', '--json'], active.root);
      expect(r.code).toBe(0);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.found).toBe(true);
      expect(parsed).not.toHaveProperty('candidates');
      expect(parsed).not.toHaveProperty('pickedSource');
    });
  });

  describe('phase 143: new validation refusals', () => {
    it('--list and --pick together are rejected with exit 1', async () => {
      active = await tempRepo({ initialized: true });
      const r = await run(['resume', '--list', '--pick', '1'], active.root);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/mutually exclusive/i);
      expect(r.stderr).toMatch(/--list/);
      expect(r.stderr).toMatch(/--pick/);
    });

    it('--list and --path together are rejected with exit 1', async () => {
      active = await tempRepo({ initialized: true });
      const r = await run(['resume', '--list', '--path', '/tmp/whatever.md'], active.root);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/mutually exclusive/i);
    });

    it('--pick and --path together are rejected with exit 1', async () => {
      active = await tempRepo({ initialized: true });
      const r = await run(['resume', '--pick', '1', '--path', '/tmp/whatever.md'], active.root);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/mutually exclusive/i);
    });

    it('--list, --pick, and --path all together names all three in the refusal', async () => {
      active = await tempRepo({ initialized: true });
      const r = await run(
        ['resume', '--list', '--pick', '1', '--path', '/tmp/whatever.md'],
        active.root,
      );
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/--list/);
      expect(r.stderr).toMatch(/--pick/);
      expect(r.stderr).toMatch(/--path/);
    });

    it('--local and --list together are rejected with exit 1', async () => {
      active = await tempRepo({ initialized: true });
      const r = await run(['resume', '--local', '--list'], active.root);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/mutually exclusive/i);
      expect(r.stderr).toMatch(/--local/);
    });

    it('--local and --pick together are rejected with exit 1', async () => {
      active = await tempRepo({ initialized: true });
      const r = await run(['resume', '--local', '--pick', '1'], active.root);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/mutually exclusive/i);
    });

    it('--local and --path together are rejected with exit 1', async () => {
      active = await tempRepo({ initialized: true });
      const r = await run(['resume', '--local', '--path', '/tmp/whatever.md'], active.root);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/mutually exclusive/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 143 T7: sibling-worktree text-mode rendering (AC-5/AC-6's CLI share).
// Real `git worktree add` fixtures, mirroring
// packages/core/tests/handoff/run-resume.test.ts's setup pattern exactly, but
// driven through the compiled CLI binary rather than calling runResume directly.
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

describe('cadence resume: sibling-worktree text rendering (phase 143)', () => {
  let parent: string;
  beforeAll(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), 'cadence-resume-cli-')));
  });
  afterAll(async () => {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(
      () => {},
    );
  });

  it('AC-5: --pick resolving to a sibling prints a header naming the sibling worktree path', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-hdr-')));
    await initRepo(main);
    await writeRepoState(main, { loopPosition: 'IDLE' });
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');

    const sib = join(parent, `sib-hdr-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'hdr-feature', sib]);
    await writeRepoState(sib, { loopPosition: 'BUILD' });
    await writeHandoffDoc(sib, 'SESSION-2026-07-02-s.md', '2026-07-02T09:00:00.000Z');
    const sibReal = await realpath(sib);

    const listed = JSON.parse((await run(['resume', '--list', '--json'], main)).stdout);
    const sibIdx = (listed.candidates as Array<{ source: string }>).findIndex(
      (c) => c.source === 'sibling',
    );
    expect(sibIdx).toBeGreaterThanOrEqual(0);

    const r = await run(['resume', '--pick', String(sibIdx + 1)], main);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/from sibling worktree/i);
    expect(r.stdout).toContain(sibReal);
    // Header must precede the narrative line.
    expect(r.stdout.indexOf('from sibling worktree')).toBeLessThan(
      r.stdout.indexOf('--- narrative from'),
    );
  });

  it('AC-6: sibling pick + --full prints a cd/re-run hint instead of the brief footer, and context stays null', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-full-')));
    await initRepo(main);
    await writeRepoState(main, { loopPosition: 'IDLE' });
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');

    const sib = join(parent, `sib-full-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'full-feature', sib]);
    await writeRepoState(sib, { loopPosition: 'BUILD' });
    await writeHandoffDoc(sib, 'SESSION-2026-07-02-s.md', '2026-07-02T09:00:00.000Z');
    const sibReal = await realpath(sib);

    const listed = JSON.parse((await run(['resume', '--list', '--json'], main)).stdout);
    const sibIdx = (listed.candidates as Array<{ source: string }>).findIndex(
      (c) => c.source === 'sibling',
    );

    const r = await run(['resume', '--pick', String(sibIdx + 1), '--full'], main);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/cd there|cd .* and (re-)?run/i);
    expect(r.stdout).toContain('cadence resume --full');
    expect(r.stdout).toContain(sibReal);
    // The old local-brief-only footer must not appear for this sibling+full case.
    expect(r.stdout).not.toMatch(/live context recompute skipped[\s\S]*brief mode; run/);

    const jsonR = JSON.parse(
      (await run(['resume', '--pick', String(sibIdx + 1), '--full', '--json'], main)).stdout,
    );
    expect(jsonR.pickedSource).toBe('sibling');
    expect(jsonR.context).toBeNull();
  });

  it('sibling pick in (default) brief mode prints a cd/re-run hint naming the sibling worktree, not the generic local-brief footer', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-brief-')));
    await initRepo(main);
    await writeRepoState(main, { loopPosition: 'IDLE' });
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');

    const sib = join(parent, `sib-brief-${Date.now().toString(36)}`);
    git(main, ['worktree', 'add', '-b', 'brief-feature', sib]);
    // Give the sibling doc/live state the same loop position so mode defaults
    // to brief (no drift to force full).
    await writeRepoState(sib, { loopPosition: 'IDLE' });
    await writeHandoffDoc(sib, 'SESSION-2026-07-02-s.md', '2026-07-02T09:00:00.000Z', {
      loop_position: 'IDLE',
    });
    const sibReal = await realpath(sib);

    const listed = JSON.parse((await run(['resume', '--list', '--json'], main)).stdout);
    const sibIdx = (listed.candidates as Array<{ source: string }>).findIndex(
      (c) => c.source === 'sibling',
    );

    const r = await run(['resume', '--pick', String(sibIdx + 1)], main);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/from sibling worktree/i);
    // Must NOT print the generic local-brief footer verbatim (no cd/worktree
    // qualifier) — that phrasing, run unqualified from the local dir, would
    // silently resolve against the wrong (local) worktree.
    expect(r.stdout).not.toMatch(
      /brief mode; run `cadence resume --full` \(or `cadence context handoff`\) for the full doc \+ live context/,
    );
    // Must instead mention the sibling's worktree path and a cd-style hint.
    expect(r.stdout).toMatch(/cd there|cd .* and (re-)?run/i);
    expect(r.stdout).toContain(sibReal);
    expect(r.stdout).toContain('cadence resume --full');
  });

  it('--pick with a non-numeric value refuses cleanly instead of resolving as NaN', async () => {
    const main = await realpath(await mkdtemp(join(parent, 'main-pick-nan-')));
    await initRepo(main);
    await writeRepoState(main, { loopPosition: 'IDLE' });
    await writeHandoffDoc(main, 'SESSION-2026-07-01-local.md', '2026-07-01T09:00:00.000Z');

    const r = await run(['resume', '--pick', 'abc'], main);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/--pick must be a number/i);
    // No candidates side-effect should leak into stdout as if it were a
    // normal successful response.
    expect(r.stdout).toBe('');
  });
});
