import { describe, it, expect } from 'vitest';
import { renderPacket, recommendIsolation } from '../../src/dispatch/packet.js';
import type { Draft, Task } from '@manehorizons/cadence-types';

const draft: Draft = {
  schemaVersion: 1,
  id: '01-01',
  phase: '01-foundation',
  tier: 'standard',
  title: 't',
  objective: 'Make the widget glow.',
  acceptanceCriteria: [],
  tasks: [],
  boundaries: [],
  status: 'IN_PROGRESS',
};

const task: Task = {
  id: 'T1',
  name: 'Add glow flag',
  files: ['src/widget.ts', 'tests/widget.test.ts'],
  action: 'add a boolean glow prop',
  verify: 'vitest passes',
  done: 'AC-1',
};

describe('renderPacket', () => {
  it('includes the phase objective', () => {
    expect(renderPacket(task, draft)).toContain('Make the widget glow.');
  });

  it('includes the task id, action, verify, and done fields', () => {
    const packet = renderPacket(task, draft);
    expect(packet).toContain('T1');
    expect(packet).toContain('add a boolean glow prop');
    expect(packet).toContain('vitest passes');
    expect(packet).toContain('AC-1');
  });

  it('states the files boundary explicitly', () => {
    const packet = renderPacket(task, draft);
    expect(packet).toContain('src/widget.ts');
    expect(packet).toContain('tests/widget.test.ts');
  });

  it('reminds the subagent about redundant-work monitoring instead of silently redoing finished work', () => {
    const packet = renderPacket(task, draft);
    expect(packet.toLowerCase()).toContain('redundant');
  });

  it('tells the subagent to stop and report to the orchestrator instead of recording its own outcome', () => {
    const packet = renderPacket(task, draft);
    expect(packet.toLowerCase()).toContain('stop');
    expect(packet.toLowerCase()).toContain('orchestrat');
    expect(packet).not.toContain('cadence build task T1');
  });

  it('includes a mandatory prohibition block naming forbidden action classes', () => {
    const packet = renderPacket(task, draft);
    expect(packet).toContain('cadence build');
    expect(packet).toContain('cadence settle');
    expect(packet).toContain('git commit');
    expect(packet).toContain('git push');
    expect(packet).toContain('gh ');
    expect(packet).toContain('AskUserQuestion');
  });

  it('handles a task with no declared files', () => {
    const noFiles: Task = { ...task, files: [] };
    expect(() => renderPacket(noFiles, draft)).not.toThrow();
  });

  it('recommends worktree isolation in the packet text for a task with declared files', () => {
    const packet = renderPacket(task, draft);
    expect(packet.toLowerCase()).toContain('worktree');
  });

  it('recommends no isolation in the packet text for a task with no declared files', () => {
    const noFiles: Task = { ...task, files: [] };
    const packet = renderPacket(noFiles, draft);
    expect(packet).toContain('**Recommended isolation:** none');
    expect(packet).not.toContain('**Recommended isolation:** worktree');
  });
});

describe('recommendIsolation', () => {
  it('returns worktree when the task declares one or more files', () => {
    expect(recommendIsolation(task)).toBe('worktree');
  });

  it('returns none when the task declares no files', () => {
    const noFiles: Task = { ...task, files: [] };
    expect(recommendIsolation(noFiles)).toBe('none');
  });
});
