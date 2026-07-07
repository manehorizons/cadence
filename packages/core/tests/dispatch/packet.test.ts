import { describe, it, expect } from 'vitest';
import { renderPacket } from '../../src/dispatch/packet.js';
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

  it('tells the subagent to record its own outcome via cadence build task', () => {
    const packet = renderPacket(task, draft);
    expect(packet).toContain('cadence build task T1');
  });

  it('handles a task with no declared files', () => {
    const noFiles: Task = { ...task, files: [] };
    expect(() => renderPacket(noFiles, draft)).not.toThrow();
  });
});
