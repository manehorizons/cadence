import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

// A two-task, two-AC PENDING draft — used to put BUILD into a state with a
// remaining (not-yet-recorded) task after T1 is marked DONE.
const TWO_TASK_DRAFT = `---
phase: 01-foundation
id: 01-01
tier: standard
status: PENDING
---

# 01-01 — Demo

## Objective

Build the widget system.

## Acceptance Criteria

### AC-1: First thing
Given a
When b
Then c

### AC-2: Second thing
Given d
When e
Then f

## Tasks

### T1: Do first
- files: \`src/a.ts\`
- action: do a
- verify: tests pass
- done: AC-1

### T2: Do second
- files: \`src/b.ts\`
- action: do b
- verify: tests pass
- done: AC-2

## Boundaries

- Do not touch \`src/legacy.ts\`
`;

async function seedDraft(root: string, content: string): Promise<void> {
  await mkdir(join(root, '.cadence/phases/01-foundation'), { recursive: true });
  await writeFile(join(root, '.cadence/phases/01-foundation/01-01-DRAFT.md'), content);
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence next', () => {
  it('AC-1: IDLE with no ledger activity reports one ranked legal move (draft-new)', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['next'], active.root);
    expect(r.code).toBe(0);
    // AC-1: prints the current position plus 1-3 ranked legal moves with exact commands.
    expect(r.stdout).toMatch(/^Position: IDLE$/m);
    expect(r.stdout).toContain('cadence draft new --title "..."');
  });

  it('AC-2: IDLE --json emits schemaVersion 1 and the full {position, remainingTasks, blockedOn, legalMoves[]} shape', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['next', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    // AC-2: schemaVersion: 1 and the exact top-level shape.
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed).toEqual({
      schemaVersion: 1,
      position: 'IDLE',
      remainingTasks: [],
      blockedOn: [],
      legalMoves: [
        expect.objectContaining({
          position: 'draft-new',
          command: 'cadence draft new --title "..."',
          reason: expect.any(String),
          remainingTasks: [],
          blockedOn: [],
        }),
      ],
    });
    expect(parsed.legalMoves.length).toBeGreaterThanOrEqual(1);
    expect(parsed.legalMoves.length).toBeLessThanOrEqual(3);
  });

  it('AC-1: DRAFT position ranks approve-draft with the real phase + num, no placeholders', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    const r = await run(['next'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^Position: DRAFT$/m);
    expect(r.stdout).toMatch(/cadence draft approve 01-foundation 01/);
    expect(r.stdout).not.toMatch(/<phase>|<num>/);
  });

  it('AC-2: DRAFT --json exposes legalMoves[0] as approve-draft, no remaining tasks/blockers', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    const r = await run(['next', '--json'], active.root);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.position).toBe('DRAFT');
    expect(parsed.remainingTasks).toEqual([]);
    expect(parsed.blockedOn).toEqual([]);
    expect(parsed.legalMoves[0]).toMatchObject({
      position: 'approve-draft',
      command: 'cadence draft approve 01-foundation 01',
    });
  });

  it('AC-1: mid-BUILD with a remaining task ranks record-task and names the exact remaining task id', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, TWO_TASK_DRAFT);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);

    const r = await run(['next'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^Position: BUILD$/m);
    // AC-1: names the exact command for the remaining task, never a compound
    // "OR" fallback (T1 is done; only T2 has no recorded outcome).
    expect(r.stdout).toContain('cadence build task T2 --status=DONE');
    expect(r.stdout).not.toContain('OR');
  });

  it('AC-2: mid-BUILD --json surfaces remainingTasks/blockedOn mirroring legalMoves[0]', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, TWO_TASK_DRAFT);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);

    const r = await run(['next', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.position).toBe('BUILD');
    // AC-2: top-level remainingTasks/blockedOn mirror legalMoves[0]'s own
    // fields — T2 is the only remaining task; AC-2 (the draft's own AC-2,
    // linked to T2) is the only unresolved AC.
    expect(parsed.remainingTasks).toEqual(['T2']);
    expect(parsed.blockedOn).toEqual(['AC-2']);
    expect(parsed.legalMoves[0]).toMatchObject({
      position: 'record-task',
      command: 'cadence build task T2 --status=DONE',
      remainingTasks: ['T2'],
      blockedOn: ['AC-2'],
    });
  });

  it('AC-1: BUILD names settle once every task is recorded', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, TWO_TASK_DRAFT);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await run(['build', 'task', 'T2', '--status=DONE'], active.root);

    const r = await run(['next'], active.root);
    expect(r.stdout).toContain('cadence settle run --auto');

    const jsonR = await run(['next', '--json'], active.root);
    const parsed = JSON.parse(jsonR.stdout);
    expect(parsed.schemaVersion).toBe(1);
    // AC-2: both tasks done — no task remains, and both ACs pass.
    expect(parsed.remainingTasks).toEqual([]);
    expect(parsed.blockedOn).toEqual([]);
    expect(parsed.legalMoves[0]).toMatchObject({ position: 'settle', command: 'cadence settle run --auto' });
  });

  it('AC-1: IDLE with a real unconverted recommendation ranks promote-recommendation with its real id', async () => {
    active = await tempRepo({ initialized: true });
    const added = await run(
      ['recommendation', 'add', '--title', 'Adopt widget caching', '--summary', 'Cache widget lookups.'],
      active.root,
    );
    expect(added.code).toBe(0);
    const recId = added.stdout.match(/Added (rec-\d{8}-\d{3})/)?.[1];
    expect(recId).toBeDefined();

    // AC-1: "settled with a converted/unconverted rec" — this is the
    // unconverted case, exercised end to end through the real ledger file
    // on disk (resolveIdleLedgerHints reading recommendations.json), not
    // just nextAction()'s pure-hint unit path already covered above.
    const r = await run(['next'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^Position: IDLE$/m);
    expect(r.stdout).toContain(`cadence recommendation promote ${recId} --status=accepted --readiness=ready-for-milestone`);
    expect(r.stdout).toContain(recId as string);

    const jsonR = await run(['next', '--json'], active.root);
    expect(jsonR.code).toBe(0);
    const parsed = JSON.parse(jsonR.stdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.position).toBe('IDLE');
    // AC-1: the real recommendation id is surfaced in the ranked
    // legalMoves — never a placeholder — via the same ranking
    // (partitionLedger + scoreRecommendation) cadence recommend applies.
    expect(parsed.legalMoves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          position: 'promote-recommendation',
          command: `cadence recommendation promote ${recId} --status=accepted --readiness=ready-for-milestone`,
        }),
      ]),
    );
  });

  it('does not print implementation guidance — only the door (the command), never the path through it', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, TWO_TASK_DRAFT);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const r = await run(['next'], active.root);
    // Sanity: reasons are short factual statements from nextAction(), never
    // step-by-step how-to prose. This is a boundary check, not itself an AC.
    expect(r.stdout).not.toMatch(/step \d|how to implement|here'?s how/i);
  });
});
