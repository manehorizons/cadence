import { describe, it, expect } from 'vitest';
import {
  runRedundancyCheck,
  redundantWorkMessage,
  TERMINAL_TASK_STATUSES,
} from '../../src/checks/task-redundancy.js';

const FIXED = '2026-07-06T00:00:00.000Z';
const stampFixed = () => FIXED;

describe('TERMINAL_TASK_STATUSES', () => {
  it('contains DONE and DONE_WITH_CONCERNS only', () => {
    expect([...TERMINAL_TASK_STATUSES].sort()).toEqual(['DONE', 'DONE_WITH_CONCERNS']);
  });
});

describe('runRedundancyCheck', () => {
  it('flags a file owned by an already-DONE task', () => {
    const events = runRedundancyCheck({
      tasks: [{ taskId: 'T1', files: ['src/a.ts'] }],
      taskStatuses: { T1: 'DONE' },
      touchedFiles: ['src/a.ts'],
      stamp: stampFixed,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'redundant-task-work',
      severity: 'warn',
      message: redundantWorkMessage('src/a.ts', 'T1', 'DONE'),
      context: { file: 'src/a.ts', taskId: 'T1', status: 'DONE' },
      ts: FIXED,
    });
  });

  it('flags DONE_WITH_CONCERNS the same as DONE', () => {
    const events = runRedundancyCheck({
      tasks: [{ taskId: 'T1', files: ['src/a.ts'] }],
      taskStatuses: { T1: 'DONE_WITH_CONCERNS' },
      touchedFiles: ['src/a.ts'],
      stamp: stampFixed,
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.context.status).toBe('DONE_WITH_CONCERNS');
  });

  it('does not flag PENDING/IN_PROGRESS/NEEDS_CONTEXT/BLOCKED tasks', () => {
    for (const status of ['PENDING', 'IN_PROGRESS', 'NEEDS_CONTEXT', 'BLOCKED']) {
      const events = runRedundancyCheck({
        tasks: [{ taskId: 'T1', files: ['src/a.ts'] }],
        taskStatuses: { T1: status },
        touchedFiles: ['src/a.ts'],
        stamp: stampFixed,
      });
      expect(events).toEqual([]);
    }
  });

  it('does not flag a file with no owning task', () => {
    const events = runRedundancyCheck({
      tasks: [{ taskId: 'T1', files: ['src/a.ts'] }],
      taskStatuses: { T1: 'DONE' },
      touchedFiles: ['src/unowned.ts'],
      stamp: stampFixed,
    });
    expect(events).toEqual([]);
  });

  it('flags if ANY owning task is terminal, when a file has multiple owners', () => {
    const events = runRedundancyCheck({
      tasks: [
        { taskId: 'T1', files: ['src/shared.ts'] },
        { taskId: 'T2', files: ['src/shared.ts'] },
      ],
      taskStatuses: { T1: 'PENDING', T2: 'DONE' },
      touchedFiles: ['src/shared.ts'],
      stamp: stampFixed,
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.context.taskId).toBe('T2');
  });

  it('treats a task with no recorded status as PENDING (never flags)', () => {
    const events = runRedundancyCheck({
      tasks: [{ taskId: 'T1', files: ['src/a.ts'] }],
      taskStatuses: {},
      touchedFiles: ['src/a.ts'],
      stamp: stampFixed,
    });
    expect(events).toEqual([]);
  });

  it('emits one event per flagged file, preserving caller order', () => {
    const events = runRedundancyCheck({
      tasks: [
        { taskId: 'T1', files: ['src/a.ts'] },
        { taskId: 'T2', files: ['src/b.ts'] },
      ],
      taskStatuses: { T1: 'DONE', T2: 'DONE' },
      touchedFiles: ['src/a.ts', 'src/b.ts'],
      stamp: stampFixed,
    });
    expect(events.map((e) => e.context.file)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('merges extraContext after the file/taskId/status keys', () => {
    const events = runRedundancyCheck({
      tasks: [{ taskId: 'T1', files: ['src/a.ts'] }],
      taskStatuses: { T1: 'DONE' },
      touchedFiles: ['src/a.ts'],
      stamp: stampFixed,
      extraContext: { source: 'hook.preToolEdit' },
    });
    expect(events[0]!.context).toEqual({
      file: 'src/a.ts',
      taskId: 'T1',
      status: 'DONE',
      source: 'hook.preToolEdit',
    });
  });

  it('applies root-relative normalization for comparison, keeps the original path in the event', () => {
    const root = '/home/u/repo';
    const events = runRedundancyCheck({
      root,
      tasks: [{ taskId: 'T1', files: ['src/a.ts'] }],
      taskStatuses: { T1: 'DONE' },
      touchedFiles: [`${root}/src/a.ts`],
      stamp: stampFixed,
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.context.file).toBe(`${root}/src/a.ts`);
  });

  it('defaults severity to warn; accepts an explicit severity override', () => {
    const base = {
      tasks: [{ taskId: 'T1', files: ['src/a.ts'] }],
      taskStatuses: { T1: 'DONE' },
      touchedFiles: ['src/a.ts'],
      stamp: stampFixed,
    };
    expect(runRedundancyCheck(base)[0]!.severity).toBe('warn');
    expect(runRedundancyCheck({ ...base, severity: 'error' })[0]!.severity).toBe('error');
  });

  it('exposes the shared message builder', () => {
    expect(redundantWorkMessage('src/a.ts', 'T1', 'DONE')).toBe(
      "src/a.ts belongs to T1, already DONE — this edit looks like duplicate/redundant work",
    );
  });
});
