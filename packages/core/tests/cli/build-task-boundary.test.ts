// Phase 280-dispatch-contract, DRAFT 280-01 (DP-B), T1 — adversarial fixtures
// seeded ahead of the code that satisfies them (this repo's "corpus before
// code" standing rule). This file carries DRAFT T1's fixtures (a) and (c):
// both are CLI-level `cadence build task` record-time behaviors, so they
// live here rather than in ../parse/stop-field.test.ts (which carries
// fixture (b), the parser/coherence-level half).
//
// DO NOT implement production code changes here. T11
// (packages/core/src/services/build-task.ts) is the task that wires the
// boundary check into `build task` and turns fixture (a) green; T7-T10 are
// its prerequisites. Fixture (c) turns "meaningfully red" (i.e. exercises a
// real no-git skip path rather than trivially passing because no check
// exists) once T11 lands too.

import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { buildTaskService } from '../../src/services/build-task.js';
import { bufferIO } from '../../src/services/io.js';

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'dist',
  'cli',
  'index.js',
);

function run(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

/** Set up a real git workdir with an initial commit (mirrors build-per-task.test.ts). */
function initGitRepo(root: string): void {
  execSync('git init -q', { cwd: root, stdio: 'ignore' });
  execSync('git config user.email "test@cadence.local"', { cwd: root, stdio: 'ignore' });
  execSync('git config user.name "Cadence Test"', { cwd: root, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'ignore' });
  execSync('git add -A', { cwd: root, stdio: 'ignore' });
  execSync('git commit -q -m init --allow-empty', { cwd: root, stdio: 'ignore' });
}

const BLOCK_MODE_DRAFT = `---
phase: 01-foundation
id: 01-01
tier: standard
status: PENDING
boundaryEnforcement: block
---

# 01-01 — Demo

## Objective

One task with a declared file, for boundary-check fixtures.

## Acceptance Criteria

### AC-1: one
Given a
When b
Then c

## Tasks

### T1: t1
- files: \`src/allowed.ts\`
- action: a
- verify: v
- done: AC-1

## Boundaries

- none
`;

// T11 coverage extension: two-task draft, boundaryEnforcement left unset
// (default 'warn') -- used by the redundancy-check and dispatch-escalation
// fixtures below, which need more than one task.
const TWO_TASK_DRAFT = `---
phase: 01-foundation
id: 01-01
tier: standard
status: PENDING
---

# 01-01 — Demo

## Objective

Two tasks, for redundancy-check and dispatch-escalation fixtures.

## Acceptance Criteria

### AC-1: one
Given a
When b
Then c

## Tasks

### T1: t1
- files: \`src/a.ts\`
- action: a
- verify: v
- done: AC-1

### T2: t2
- files: \`src/b.ts\`
- action: a
- verify: v
- done: AC-1

## Boundaries

- none
`;

// T11 coverage extension: a task that declares no `files:` at all -- the
// declared-files-union-is-empty half of AC-3's skip rule.
const NO_FILES_DRAFT = `---
phase: 01-foundation
id: 01-01
tier: standard
status: PENDING
---

# 01-01 — Demo

## Objective

One task declaring no files, for the declared-files-union-empty skip fixture.

## Acceptance Criteria

### AC-1: one
Given a
When b
Then c

## Tasks

### T1: t1
- action: a
- verify: v
- done: AC-1

## Boundaries

- none
`;

/** Switch the anomaly-notify transport to `file` so a test can inspect the
 *  structured event (context.bypassed/taskId), not just the rendered stderr
 *  line the default `stderr` transport produces. Uses an ABSOLUTE log path —
 *  `FileNotifier` resolves a relative `notify.file` against the calling
 *  process's cwd, not repoRoot; the CLI-spawn tests get that for free
 *  (`cwd: active.root`), but a direct in-process `buildTaskService` call
 *  (this file's T11 extension tests) runs with the vitest worker's cwd, so
 *  a relative path would silently miss the write. */
function anomaliesLogPath(root: string): string {
  return join(root, '.cadence/anomalies-test.log');
}
async function setFileNotifyTransport(root: string): Promise<void> {
  const cfgPath = join(root, '.cadence/config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  cfg.notify = { transport: 'file', file: anomaliesLogPath(root) };
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('draft T1 fixture (a) — boundaryEnforcement:block + stray file (RED pre-T11)', () => {
  it('280-01/AC-2: exit 1 and no PROGRESS mutation for T1 when a stray file exists outside declared files:', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await writeFile(
      join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md'),
      BLOCK_MODE_DRAFT,
    );
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    await mkdir(join(active.root, 'src'), { recursive: true });
    // T1's declared file.
    await writeFile(join(active.root, 'src/allowed.ts'), 'export const allowed = 1;\n');
    // The stray file: untracked, outside the union of all declared `files:`.
    await writeFile(join(active.root, 'src/stray.ts'), 'export const stray = 1;\n');

    const r = await run(['build', 'task', 'T1', '--status=DONE'], active.root);

    // RED today, for the right reason: buildTaskService (services/build-task.ts,
    // pre-T11) runs no boundary check at all -- it validates the task id
    // against the loaded draft, optionally runs the per-task-verify gate,
    // then unconditionally calls recordTaskOutcome. A stray file outside
    // declared `files:` is invisible to it, block mode or not. Actual
    // observed behavior pre-DP-B: exit 0, PROGRESS.json IS written for T1.
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/stray\.ts/);

    const progressPath = join(
      active.root,
      '.cadence/phases/01-foundation/01-01-PROGRESS.json',
    );
    if (existsSync(progressPath)) {
      const progress = JSON.parse(await readFile(progressPath, 'utf8'));
      expect(progress.tasks?.T1).toBeUndefined();
    }
  });
});

describe('draft T1 fixture (c) — no .git directory, build task still succeeds (baseline-preserving pin)', () => {
  it('tempRepo({initialized:true}) does not create a .git directory (confirms the fixture premise)', async () => {
    active = await tempRepo({ initialized: true });
    // `initialized: true` scaffolds `.cadence/**` only (config.json,
    // state.json, PROJECT.md, ROADMAP.md, STATE.md, MILESTONES.md) --
    // packages/testkit/src/fixture.ts never shells out to `git init` under
    // any option. Confirmed by reading the testkit source directly: there is
    // no separate "no-git variant" name to reach for, because plain
    // tempRepo() (any options) is already git-less unless a test opts in via
    // testkit's `runGit`/a local `initGitRepo` helper, as the other describe
    // block above does.
    expect(existsSync(join(active.root, '.git'))).toBe(false);
  });

  it('280-01/AC-4: cadence build task T1 --status=DONE still exits 0 with no git present (PASS today -- expected, not a bug)', async () => {
    active = await tempRepo({ initialized: true });
    expect(existsSync(join(active.root, '.git'))).toBe(false);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(['build', 'task', 'T1', '--status=DONE'], active.root);

    // PASSES today already, and that is expected: pre-DP-B there is no
    // boundary/redundancy step at all, so there is nothing that could throw
    // on a missing `.git`. This assertion is a baseline-preserving regression
    // pin, not a red fixture -- its job is only to fail loudly if some later
    // task in this phase accidentally makes `build task` start requiring
    // git to succeed. The genuinely red half of AC-4 (the stated
    // "skipped: git unavailable" reason) is the next test below.
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Recorded T1: DONE/);
  });

  it('280-01/AC-4: reports a skip reason naming git-unavailability on stderr (RED pre-T11)', async () => {
    active = await tempRepo({ initialized: true });
    expect(existsSync(join(active.root, '.git'))).toBe(false);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(['build', 'task', 'T1', '--status=DONE'], active.root);

    // RED today, for the right reason: pre-T11, `build task` has no
    // boundary/redundancy step to report skipping in the first place, so
    // stderr is empty (confirmed: today's `build task` for this scenario
    // prints nothing to stderr at all). AC-4 requires the step to report
    // "skipped: git unavailable" (or equivalent) on stderr once T11 wires
    // `deriveTaskTouchedFiles`/`collectUnscopedTouchedFiles` in -- this
    // assertion is deliberately loose (case-insensitive "skip" + "git"
    // somewhere in stderr, not an exact string) since T11 owns the precise
    // wording; it should still flip green once that reason line exists.
    expect(r.stderr).toMatch(/skip/i);
    expect(r.stderr).toMatch(/git/i);
  });
});

// --- T11 extended coverage: everything below this line targets behavior the
// T1 fixtures above don't already nail down -- the --allow-boundary-breach
// bypass path, both-statuses firing, warn-mode's near-invisible anomaly +
// ground-truth touchedFiles, the two distinct AC-3 skip reasons, the
// redundancy check's own (never-blocking) anomaly, and the dispatch-scoped
// escalation from T9/T10 wired into this record seam.

describe('T11 — AC-2 bypass path (--allow-boundary-breach)', () => {
  it('280-01/AC-2: records past the refusal with the git-derived touchedFiles and emits a bypassed error-severity anomaly', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);
    await setFileNotifyTransport(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await writeFile(
      join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md'),
      BLOCK_MODE_DRAFT,
    );
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(join(active.root, 'src/allowed.ts'), 'export const allowed = 1;\n');
    await writeFile(join(active.root, 'src/stray.ts'), 'export const stray = 1;\n');

    const io = bufferIO();
    const result = await buildTaskService(
      active.root,
      { taskId: 'T1', status: 'DONE', allowBoundaryBreach: true },
      io,
    );

    expect(result.exitCode).toBe(0);
    expect(io.stdout()).toMatch(/Recorded T1: DONE/);
    expect(io.stderr()).toMatch(/allow-boundary-breach/);

    const progress = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'),
        'utf8',
      ),
    );
    expect(progress.tasks.T1.status).toBe('DONE');
    expect([...progress.tasks.T1.touchedFiles].sort()).toEqual(['src/allowed.ts', 'src/stray.ts']);

    const events = (await readFile(anomaliesLogPath(active.root), 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { type: string; severity: string; context: Record<string, unknown> });
    const boundaryEvent = events.find((e) => e.type === 'files-outside-boundary');
    expect(boundaryEvent).toBeDefined();
    expect(boundaryEvent!.severity).toBe('error');
    expect(boundaryEvent!.context.bypassed).toBe(true);
    expect(boundaryEvent!.context.taskId).toBe('T1');
    expect(boundaryEvent!.context.file).toBe('src/stray.ts');
  });
});

describe('T11 — block mode fires on DONE_WITH_CONCERNS too (not just DONE)', () => {
  it('280-01/AC-2: refuses for --status=DONE_WITH_CONCERNS the same way it does for DONE', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await writeFile(
      join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md'),
      BLOCK_MODE_DRAFT,
    );
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(join(active.root, 'src/allowed.ts'), 'export const allowed = 1;\n');
    await writeFile(join(active.root, 'src/stray.ts'), 'export const stray = 1;\n');

    const r = await run(['build', 'task', 'T1', '--status=DONE_WITH_CONCERNS'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/stray\.ts/);

    const progressPath = join(
      active.root,
      '.cadence/phases/01-foundation/01-01-PROGRESS.json',
    );
    if (existsSync(progressPath)) {
      const progress = JSON.parse(await readFile(progressPath, 'utf8'));
      expect(progress.tasks?.T1).toBeUndefined();
    }
  });
});

describe('T11 — AC-3 warn mode (default enforcement)', () => {
  it('280-01/AC-3: records with the git-derived touchedFiles and emits a warn-severity anomaly for a stray file', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    // Default scaffold's T1 declares `path/to/file.ts` (nonexistent) --
    // declaredFiles.length === 1, not 0, so the check runs (not skipped).

    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(join(active.root, 'src/stray.ts'), 'export const stray = 1;\n');

    const r = await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Recorded T1: DONE/);
    expect(r.stderr).toMatch(/cadence anomaly \[warn\] files-outside-boundary:.*stray\.ts/);

    const progress = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'),
        'utf8',
      ),
    );
    // Ground truth, not the (empty, pre-DP-B) self-report.
    expect(progress.tasks.T1.touchedFiles).toContain('src/stray.ts');
  });
});

describe('T11 — AC-3 skip: no active draft loaded', () => {
  it('280-01/AC-3: DRAFT.md missing at record time -> stated skip reason, self-report fallback, exit 0', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    // Remove the DRAFT.md after approve -- state still points at it
    // (activePhase/activeDraft survive), but `draft` parses to undefined.
    await rm(join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md'));

    const r = await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Recorded T1: DONE/);
    expect(r.stderr).toMatch(/skip/i);
    expect(r.stderr).toMatch(/no active draft/i);

    const progress = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'),
        'utf8',
      ),
    );
    // Self-report fallback, unchanged from pre-DP-B -- never a silent blend
    // with a git-derived list.
    expect(progress.tasks.T1.touchedFiles).toEqual([]);
  });
});

describe('T11 — AC-3 skip: declared-files union is empty', () => {
  it('280-01/AC-3: no task declares files: -> stated skip reason, self-report fallback, exit 0', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await writeFile(
      join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md'),
      NO_FILES_DRAFT,
    );
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Recorded T1: DONE/);
    expect(r.stderr).toMatch(/skip/i);
    expect(r.stderr).toMatch(/no task declares files/i);

    const progress = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'),
        'utf8',
      ),
    );
    expect(progress.tasks.T1.touchedFiles).toEqual([]);
  });
});

describe('T11 — redundancy check integration (warn-only, never blocks)', () => {
  it('flags a file re-touched after its declared owning task is DONE, still records normally', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await writeFile(
      join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md'),
      TWO_TASK_DRAFT,
    );
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    // T1 recorded DONE without ever touching its own declared file --
    // `src/a.ts` is not yet in T1's own touchedFiles, so it's not excluded
    // by first-sighting semantics on T2's turn below.
    const r1 = await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    expect(r1.code).toBe(0);

    // Now `src/a.ts` (T1's declared file, T1 already DONE) appears for the
    // first time, during T2's window. It's still inside the declared union
    // (T1 declared it) so this is NOT a boundary violation -- it's
    // redundant-work territory instead.
    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(join(active.root, 'src/a.ts'), 'export const a = 1;\n');

    const r2 = await run(['build', 'task', 'T2', '--status=DONE'], active.root);
    expect(r2.code).toBe(0);
    expect(r2.stdout).toMatch(/Recorded T2: DONE/);
    expect(r2.stderr).toMatch(/src\/a\.ts belongs to T1, already DONE/);
    expect(r2.stderr).toMatch(/cadence anomaly \[warn\] redundant-task-work:/);

    const progress = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'),
        'utf8',
      ),
    );
    expect(progress.tasks.T2.status).toBe('DONE');
    expect(progress.tasks.T2.touchedFiles).toContain('src/a.ts');
  });
});

describe('T11 — dispatch-scoped escalation (AC-2)', () => {
  it('a prior execution:dispatch recording escalates boundary enforcement to block for a later plain recording', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await writeFile(
      join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md'),
      TWO_TASK_DRAFT,
    );
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    // T1 recorded via execution:'dispatch' -- no stray files exist yet, so
    // this recording succeeds regardless of the mode it escalates to.
    const io1 = bufferIO();
    const r1 = await buildTaskService(
      active.root,
      { taskId: 'T1', status: 'DONE', execution: 'dispatch' },
      io1,
    );
    expect(r1.exitCode).toBe(0);

    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(join(active.root, 'src/stray.ts'), 'export const stray = 1;\n');

    // T2's own recording carries no execution flag at all -- draft/config
    // both leave boundaryEnforcement unset (default 'warn'), but T1's prior
    // execution:'dispatch' recording is enough to escalate this call to
    // block mode (the dispatch-scoped escalation, T9/T10's precedent wired
    // into this record seam by T11).
    const io2 = bufferIO();
    const r2 = await buildTaskService(active.root, { taskId: 'T2', status: 'DONE' }, io2);
    expect(r2.exitCode).toBe(1);
    expect(io2.stderr()).toMatch(/stray\.ts/);

    const progress = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'),
        'utf8',
      ),
    );
    expect(progress.tasks.T1.execution).toBe('dispatch');
    expect(progress.tasks.T2).toBeUndefined();
  });
});

describe('T11 — re-recording the same task id preserves its own touchedFiles (regression)', () => {
  it('280-01: re-recording T1 (DONE, then DONE_WITH_CONCERNS) with no new working-tree changes leaves touchedFiles unchanged, not wiped to []', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    // Default scaffold's T1 declares `path/to/file.ts` (nonexistent) --
    // declaredFiles.length === 1, not 0, so the check runs (not skipped).

    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(join(active.root, 'src/stray.ts'), 'export const stray = 1;\n');

    const r1 = await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    expect(r1.code).toBe(0);

    const progressPath = join(
      active.root,
      '.cadence/phases/01-foundation/01-01-PROGRESS.json',
    );
    const progressAfterFirst = JSON.parse(await readFile(progressPath, 'utf8'));
    expect(progressAfterFirst.tasks.T1.touchedFiles).toContain('src/stray.ts');

    // Re-record the SAME task id -- e.g. a fix-dispatch re-record that
    // upgrades DONE to DONE_WITH_CONCERNS -- with no new working-tree
    // changes since the first recording.
    const r2 = await run(['build', 'task', 'T1', '--status=DONE_WITH_CONCERNS'], active.root);
    expect(r2.code).toBe(0);

    const progressAfterSecond = JSON.parse(await readFile(progressPath, 'utf8'));
    expect(progressAfterSecond.tasks.T1.status).toBe('DONE_WITH_CONCERNS');
    // Bug: `previouslyRecorded` incorrectly included T1's own prior
    // touchedFiles (readProgressRows' priorTasks includes T1 itself on a
    // re-record), subtracting them from T1's own new delta computation and
    // silently overwriting touchedFiles with []. It must stay unchanged.
    expect(progressAfterSecond.tasks.T1.touchedFiles).toContain('src/stray.ts');
  });
});

// --- T12: build.ts CLI flags -- --execution/--isolation/--model-class thread
// as DATA into recordTaskOutcome's options object (recorded regardless of
// outcome), and the CONTROL-FLOW --allow-boundary-breach flag (already
// consumed by buildTaskService since T11) gets a real CLI surface for the
// first time -- AC-2's own Given/When/Then names it, but until this task
// landed it had no way to reach `cadence build task` at all.

describe('T12 — --execution/--isolation/--model-class round-trip into PROGRESS.json', () => {
  it('280-01/AC-5: all three flags, passed explicitly, are recorded verbatim on progress.tasks[id]', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(
      [
        'build',
        'task',
        'T1',
        '--status=DONE',
        '--execution=dispatch',
        '--isolation=worktree',
        '--model-class=standard',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Recorded T1: DONE/);

    const progress = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'),
        'utf8',
      ),
    );
    expect(progress.tasks.T1.execution).toBe('dispatch');
    expect(progress.tasks.T1.isolation).toBe('worktree');
    expect(progress.tasks.T1.modelClass).toBe('standard');
  });

  it('280-01/AC-5: --execution=inline round-trips too (not just the dispatch value)', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(
      ['build', 'task', 'T1', '--status=DONE', '--execution=inline'],
      active.root,
    );
    expect(r.code).toBe(0);

    const progress = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'),
        'utf8',
      ),
    );
    expect(progress.tasks.T1.execution).toBe('inline');
  });

  it('280-01/AC-5: omitting all three flags leaves them absent on progress.tasks[id] -- no forced default written into recorded state', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    expect(r.code).toBe(0);

    const progress = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'),
        'utf8',
      ),
    );
    expect(progress.tasks.T1.execution).toBeUndefined();
    expect(progress.tasks.T1.isolation).toBeUndefined();
    expect(progress.tasks.T1.modelClass).toBeUndefined();
  });

  it('280-01: rejects an invalid --execution value, records nothing', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(
      ['build', 'task', 'T1', '--status=DONE', '--execution=bogus'],
      active.root,
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/--execution/);

    const progressPath = join(
      active.root,
      '.cadence/phases/01-foundation/01-01-PROGRESS.json',
    );
    if (existsSync(progressPath)) {
      const progress = JSON.parse(await readFile(progressPath, 'utf8'));
      expect(progress.tasks?.T1).toBeUndefined();
    }
  });

  it('280-01: rejects an invalid --isolation value, records nothing', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(
      ['build', 'task', 'T1', '--status=DONE', '--isolation=bogus'],
      active.root,
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/--isolation/);
  });

  it('280-01: rejects an invalid --model-class value, records nothing', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(
      ['build', 'task', 'T1', '--status=DONE', '--model-class=bogus'],
      active.root,
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/--model-class/);
  });
});

describe('T12 — --allow-boundary-breach through the real CLI surface (AC-2)', () => {
  it('280-01/AC-2: cadence build task T1 --status=DONE --allow-boundary-breach records past the refusal and emits a bypassed files-outside-boundary anomaly end-to-end', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);
    await setFileNotifyTransport(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await writeFile(
      join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md'),
      BLOCK_MODE_DRAFT,
    );
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(join(active.root, 'src/allowed.ts'), 'export const allowed = 1;\n');
    await writeFile(join(active.root, 'src/stray.ts'), 'export const stray = 1;\n');

    // Real CLI spawn (dist/cli/index.js), not a direct buildTaskService()
    // call -- AC-2's Given/When/Then describes `cadence build task ...`
    // itself, so this is the surface that has to prove the bypass path,
    // not just the function underneath it.
    const r = await run(
      ['build', 'task', 'T1', '--status=DONE', '--allow-boundary-breach'],
      active.root,
    );

    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Recorded T1: DONE/);
    expect(r.stderr).toMatch(/allow-boundary-breach/);

    const progress = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'),
        'utf8',
      ),
    );
    expect(progress.tasks.T1.status).toBe('DONE');
    expect([...progress.tasks.T1.touchedFiles].sort()).toEqual([
      'src/allowed.ts',
      'src/stray.ts',
    ]);

    const events = (await readFile(anomaliesLogPath(active.root), 'utf8'))
      .trim()
      .split('\n')
      .map(
        (l) =>
          JSON.parse(l) as { type: string; severity: string; context: Record<string, unknown> },
      );
    const boundaryEvent = events.find((e) => e.type === 'files-outside-boundary');
    expect(boundaryEvent).toBeDefined();
    expect(boundaryEvent!.severity).toBe('error');
    expect(boundaryEvent!.context.bypassed).toBe(true);
    expect(boundaryEvent!.context.taskId).toBe('T1');
    expect(boundaryEvent!.context.file).toBe('src/stray.ts');
  });

  it('280-01/AC-2: without --allow-boundary-breach the same CLI invocation still refuses (regression pin)', async () => {
    active = await tempRepo({ initialized: true });
    initGitRepo(active.root);

    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await writeFile(
      join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md'),
      BLOCK_MODE_DRAFT,
    );
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(join(active.root, 'src/allowed.ts'), 'export const allowed = 1;\n');
    await writeFile(join(active.root, 'src/stray.ts'), 'export const stray = 1;\n');

    const r = await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/allow-boundary-breach/);

    const progressPath = join(
      active.root,
      '.cadence/phases/01-foundation/01-01-PROGRESS.json',
    );
    if (existsSync(progressPath)) {
      const progress = JSON.parse(await readFile(progressPath, 'utf8'));
      expect(progress.tasks?.T1).toBeUndefined();
    }
  });
});
