import { describe, it, expect } from 'vitest';
import { renderPacket, renderPacketBase, recommendIsolation } from '../../src/dispatch/packet.js';
import type { ExecutionVerdict } from '../../src/dispatch/policy.js';
import type { Draft, Task } from '@thomas-powers-jr/cadence-types';

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

const dispatchVerdict: ExecutionVerdict = {
  execution: 'dispatch',
  modelClass: 'complex',
  model: 'claude-opus',
  reasons: ['largeTaskTokens: estimated weight ~5000 tokens (threshold 4000)'],
};

const inlineVerdict: ExecutionVerdict = {
  execution: 'inline',
  modelClass: 'mechanical',
  model: 'claude-haiku',
  reasons: [],
};

describe('renderPacketBase', () => {
  it('includes the phase objective', () => {
    expect(renderPacketBase(task, draft)).toContain('Make the widget glow.');
  });

  it('includes the task id, action, verify, and done fields', () => {
    const packet = renderPacketBase(task, draft);
    expect(packet).toContain('T1');
    expect(packet).toContain('add a boolean glow prop');
    expect(packet).toContain('vitest passes');
    expect(packet).toContain('AC-1');
  });

  it('states the files boundary explicitly', () => {
    const packet = renderPacketBase(task, draft);
    expect(packet).toContain('src/widget.ts');
    expect(packet).toContain('tests/widget.test.ts');
  });

  it('reminds the subagent about redundant-work monitoring instead of silently redoing finished work', () => {
    const packet = renderPacketBase(task, draft);
    expect(packet.toLowerCase()).toContain('redundant');
  });

  it('tells the subagent to stop and report to the orchestrator instead of recording its own outcome', () => {
    const packet = renderPacketBase(task, draft);
    expect(packet.toLowerCase()).toContain('stop');
    expect(packet.toLowerCase()).toContain('orchestrat');
    expect(packet).not.toContain('cadence build task T1');
  });

  it('includes a mandatory prohibition block naming forbidden action classes', () => {
    const packet = renderPacketBase(task, draft);
    expect(packet).toContain('cadence build');
    expect(packet).toContain('cadence settle');
    expect(packet).toContain('git commit');
    expect(packet).toContain('git push');
    expect(packet).toContain('gh ');
    expect(packet).toContain('AskUserQuestion');
  });

  it('handles a task with no declared files', () => {
    const noFiles: Task = { ...task, files: [] };
    expect(() => renderPacketBase(noFiles, draft)).not.toThrow();
  });

  it('recommends worktree isolation in the packet text for a task with declared files', () => {
    const packet = renderPacketBase(task, draft);
    expect(packet.toLowerCase()).toContain('worktree');
  });

  it('recommends no isolation in the packet text for a task with no declared files', () => {
    const noFiles: Task = { ...task, files: [] };
    const packet = renderPacketBase(noFiles, draft);
    expect(packet).toContain('**Recommended isolation:** none');
    expect(packet).not.toContain('**Recommended isolation:** worktree');
  });
});

describe('renderPacket', () => {
  it('includes both the Execution and Model lines when the verdict is dispatch', () => {
    const packet = renderPacket(task, draft, dispatchVerdict);
    expect(packet).toContain(
      '**Execution:** dispatch — largeTaskTokens: estimated weight ~5000 tokens (threshold 4000)',
    );
    expect(packet).toContain('**Model:** claude-opus (complex)');
  });

  it('includes only the Execution line, with no Model line, when the verdict is inline', () => {
    const packet = renderPacket(task, draft, inlineVerdict);
    expect(packet).toContain('**Execution:** inline — no dispatch trigger met');
    expect(packet).not.toContain('**Model:**');
  });

  it('stripping the Execution/Model lines from a dispatch-verdict packet reproduces renderPacketBase byte-for-byte', () => {
    const withVerdict = renderPacket(task, draft, dispatchVerdict);
    const stripped = withVerdict
      .split('\n')
      .filter((line) => !/^\*\*Execution:\*\* /.test(line) && !/^\*\*Model:\*\* /.test(line))
      .join('\n');
    expect(stripped).toBe(renderPacketBase(task, draft));
  });

  it('stripping the Execution/Model lines from an inline-verdict packet reproduces renderPacketBase byte-for-byte', () => {
    const withVerdict = renderPacket(task, draft, inlineVerdict);
    const stripped = withVerdict
      .split('\n')
      .filter((line) => !/^\*\*Execution:\*\* /.test(line) && !/^\*\*Model:\*\* /.test(line))
      .join('\n');
    expect(stripped).toBe(renderPacketBase(task, draft));
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
