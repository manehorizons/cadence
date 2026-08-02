import { describe, it, expect } from 'vitest';
import { computeWaves } from '../../src/dispatch/wave-planner.js';
import type { Draft, Task } from '@thomas-powers-jr/cadence-types';

function makeDraft(tasks: Task[]): Draft {
  return {
    schemaVersion: 1,
    id: '01-01',
    phase: '01-foundation',
    tier: 'standard',
    title: 't',
    objective: 'o',
    acceptanceCriteria: [],
    tasks,
    boundaries: [],
    status: 'IN_PROGRESS',
  };
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    files: [],
    action: 'do it',
    verify: 'check it',
    done: 'AC-1',
    ...overrides,
  };
}

const NO_PROGRESS = { draftId: '01-01', tasks: {} };

describe('computeWaves', () => {
  it('zero-depends backward compat: independent tasks land in wave 1', () => {
    const draft = makeDraft([task('T1', { files: ['a.ts'] }), task('T2', { files: ['b.ts'] })]);
    const waves = computeWaves(draft, NO_PROGRESS);
    expect(waves).toEqual([{ wave: 1, taskIds: ['T1', 'T2'] }]);
  });

  it('files: disjointness veto splits same-level tasks that touch overlapping files', () => {
    const draft = makeDraft([task('T1', { files: ['a.ts'] }), task('T2', { files: ['a.ts'] })]);
    const waves = computeWaves(draft, NO_PROGRESS);
    expect(waves).toEqual([
      { wave: 1, taskIds: ['T1'] },
      { wave: 2, taskIds: ['T2'] },
    ]);
  });

  it('depends: topological leveling puts a dependent task in the next wave', () => {
    const draft = makeDraft([
      task('T1', { files: ['a.ts'] }),
      task('T2', { files: ['b.ts'], depends: ['T1'] }),
    ]);
    const waves = computeWaves(draft, NO_PROGRESS);
    expect(waves).toEqual([
      { wave: 1, taskIds: ['T1'] },
      { wave: 2, taskIds: ['T2'] },
    ]);
  });

  it('a dependency already DONE is satisfied — the dependent can join wave 1', () => {
    const draft = makeDraft([
      task('T1', { files: ['a.ts'] }),
      task('T2', { files: ['b.ts'], depends: ['T1'] }),
    ]);
    const progress = { draftId: '01-01', tasks: { T1: { status: 'DONE', notes: '', touchedFiles: [], updatedAt: '' } } };
    const waves = computeWaves(draft, progress);
    expect(waves).toEqual([{ wave: 1, taskIds: ['T2'] }]);
  });

  it('terminal tasks (DONE, DONE_WITH_CONCERNS) are excluded from every wave', () => {
    const draft = makeDraft([
      task('T1', { files: ['a.ts'] }),
      task('T2', { files: ['b.ts'] }),
      task('T3', { files: ['c.ts'] }),
    ]);
    const progress = {
      draftId: '01-01',
      tasks: {
        T1: { status: 'DONE', notes: '', touchedFiles: [], updatedAt: '' },
        T2: { status: 'DONE_WITH_CONCERNS', notes: '', touchedFiles: [], updatedAt: '' },
      },
    };
    const waves = computeWaves(draft, progress);
    expect(waves).toEqual([{ wave: 1, taskIds: ['T3'] }]);
  });

  it('every task terminal returns an empty wave list', () => {
    const draft = makeDraft([task('T1', { files: ['a.ts'] })]);
    const progress = { draftId: '01-01', tasks: { T1: { status: 'DONE', notes: '', touchedFiles: [], updatedAt: '' } } };
    expect(computeWaves(draft, progress)).toEqual([]);
  });

  it('a dependency cycle is a clean thrown error naming the cycle, never a crash', () => {
    const draft = makeDraft([
      task('T1', { files: ['a.ts'], depends: ['T2'] }),
      task('T2', { files: ['b.ts'], depends: ['T1'] }),
    ]);
    expect(() => computeWaves(draft, NO_PROGRESS)).toThrow(/cycle/i);
  });

  it('a depends id that matches no task anywhere in the draft throws a clear error', () => {
    const draft = makeDraft([task('T1', { files: ['a.ts'], depends: ['T9'] })]);
    expect(() => computeWaves(draft, NO_PROGRESS)).toThrow(/T9/);
  });

  it('cascading collision: a task bumped by a files: collision can collide again one level up', () => {
    // T1, T2, T3 all touch `shared.ts`, no depends — T1 claims wave 1,
    // T2 bumps to wave 2, T3 (declared after T2) must also avoid T2 there
    // and bump to wave 3.
    const draft = makeDraft([
      task('T1', { files: ['shared.ts'] }),
      task('T2', { files: ['shared.ts'] }),
      task('T3', { files: ['shared.ts'] }),
    ]);
    const waves = computeWaves(draft, NO_PROGRESS);
    expect(waves).toEqual([
      { wave: 1, taskIds: ['T1'] },
      { wave: 2, taskIds: ['T2'] },
      { wave: 3, taskIds: ['T3'] },
    ]);
  });

  it('a files: collision bump can never land a task in the same (or an earlier) wave as its own dependent', () => {
    // T0 and T1 share a file (no depends between them) — T1 would be
    // bumped one level past T0 by the files: veto alone. T2 depends on
    // T1 and shares no files with anything. A buggy two-phase
    // implementation (level by depends: first, then splice-bump for
    // files: collisions afterward, using each task's ORIGINAL computed
    // bucket-array length to decide whether to allocate a new bucket)
    // can land T1's bump directly into T2's pre-existing bucket, putting
    // a task in the same wave as something that depends on it. The
    // correct result keeps T2 strictly after T1.
    const draft = makeDraft([
      task('T0', { files: ['a.ts'] }),
      task('T1', { files: ['a.ts'] }),
      task('T2', { files: ['c.ts'], depends: ['T1'] }),
    ]);
    const waves = computeWaves(draft, NO_PROGRESS);
    const waveOf = (id: string): number => waves.find((w) => w.taskIds.includes(id))!.wave;
    expect(waveOf('T1')).toBeLessThan(waveOf('T2'));
  });
});
