import { describe, it, expect } from 'vitest';
import { coherenceCheck } from '../../src/coherence/check.js';
import { emptyState } from '@thomas-powers-jr/cadence-types';

const baseDraft = {
  schemaVersion: 1 as const,
  id: '01-01',
  phase: '01-foundation',
  tier: 'standard' as const,
  title: 'demo',
  objective: 'do thing',
  acceptanceCriteria: [{ id: 'AC-1', given: 'x', when: 'y', then: 'z' }],
  tasks: [
    {
      id: 'T1',
      name: 'edit foo',
      files: ['src/foo.ts'],
      action: 'change x',
      verify: 'tests pass',
      // Present so unrelated tests using baseDraft as-is aren't polluted by
      // the AC-7 STOP_CONDITION_MISSING warning below.
      stop: 'halt if the change breaks downstream callers',
      done: 'AC-1',
    },
  ],
  boundaries: [],
  status: 'PENDING' as const,
};

describe('coherenceCheck', () => {
  it('passes when draft does not touch a decided file', () => {
    const result = coherenceCheck(baseDraft, emptyState(), 'PROJECT body');
    expect(result.issues).toHaveLength(0);
  });

  it('warns when draft touches a file named in a decision', () => {
    const state = emptyState();
    state.decisions = [
      { id: 'D-001', phase: '00', title: 'src/foo.ts is locked to v1 API', rationale: 'no ADR', decidedAt: '2026-05-01' },
    ];
    const result = coherenceCheck(baseDraft, state, 'PROJECT body');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]?.severity).toBe('warn');
  });

  it('blocks when PROJECT.md says DO NOT edit a touched file', () => {
    const result = coherenceCheck(baseDraft, emptyState(), 'Project rules:\n- DO NOT edit src/foo.ts.');
    expect(result.issues.some((i) => i.severity === 'block')).toBe(true);
  });

  it('279-01/AC-4: warns CLASS_MISMATCH when the heuristic disagrees with a declared class (depends-precedence case)', () => {
    const draft = {
      ...baseDraft,
      tasks: [
        {
          id: 'T1',
          name: 'edit foo',
          files: ['a.ts'],
          depends: ['T1', 'T2'],
          class: 'mechanical' as const,
          action: 'change x',
          verify: 'tests pass',
          done: 'AC-1',
        },
      ],
    };
    const result = coherenceCheck(draft, emptyState(), 'PROJECT body');
    const mismatches = result.issues.filter((i) => i.code === 'CLASS_MISMATCH');
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.severity).toBe('warn');
    expect(mismatches[0]?.message).toContain('mechanical');
    expect(mismatches[0]?.message).toContain('complex');
  });

  it('does not warn CLASS_MISMATCH when the declared class matches the heuristic', () => {
    const draft = {
      ...baseDraft,
      tasks: [
        {
          id: 'T1',
          name: 'edit foo',
          files: ['a.ts'],
          class: 'mechanical' as const,
          action: 'change x',
          verify: 'tests pass',
          done: 'AC-1',
        },
      ],
    };
    const result = coherenceCheck(draft, emptyState(), 'PROJECT body');
    expect(result.issues.filter((i) => i.code === 'CLASS_MISMATCH')).toHaveLength(0);
  });

  it('does not warn CLASS_MISMATCH when the task has no class line at all', () => {
    const draft = {
      ...baseDraft,
      tasks: [
        {
          id: 'T1',
          name: 'edit foo',
          files: ['a.ts'],
          depends: ['T1', 'T2'],
          action: 'change x',
          verify: 'tests pass',
          done: 'AC-1',
        },
      ],
    };
    const result = coherenceCheck(draft, emptyState(), 'PROJECT body');
    expect(result.issues.filter((i) => i.code === 'CLASS_MISMATCH')).toHaveLength(0);
  });

  it('280-01/AC-7: warns STOP_CONDITION_MISSING (warn severity) when a task declares files: and no stop:', () => {
    const draft = {
      ...baseDraft,
      tasks: [
        {
          id: 'T1',
          name: 'risky task',
          files: ['src/risky.ts'],
          action: 'do a risky thing',
          verify: 'tests pass',
          done: 'AC-1',
          // deliberately no `stop:`
        },
      ],
    };
    const result = coherenceCheck(draft, emptyState(), 'PROJECT body');
    const stopIssues = result.issues.filter((i) => i.code === 'STOP_CONDITION_MISSING');
    expect(stopIssues).toHaveLength(1);
    expect(stopIssues[0]?.severity).toBe('warn');
    expect(stopIssues[0]?.message).toContain('T1');
  });

  it('280-01/AC-7: does not warn STOP_CONDITION_MISSING when the task declares files: and a stop:', () => {
    const draft = {
      ...baseDraft,
      tasks: [
        {
          id: 'T1',
          name: 'risky task',
          files: ['src/risky.ts'],
          action: 'do a risky thing',
          verify: 'tests pass',
          done: 'AC-1',
          stop: 'halt if more than 3 tables are touched',
        },
      ],
    };
    const result = coherenceCheck(draft, emptyState(), 'PROJECT body');
    expect(result.issues.filter((i) => i.code === 'STOP_CONDITION_MISSING')).toHaveLength(0);
  });

  it('280-01/AC-7: does not warn STOP_CONDITION_MISSING for a task with no files:, regardless of stop:', () => {
    const draft = {
      ...baseDraft,
      tasks: [
        {
          id: 'T1',
          name: 'process task',
          files: [],
          action: 'do a process thing',
          verify: 'tests pass',
          done: 'AC-1',
          // no stop:, but also no files: -- must not warn
        },
      ],
    };
    const result = coherenceCheck(draft, emptyState(), 'PROJECT body');
    expect(result.issues.filter((i) => i.code === 'STOP_CONDITION_MISSING')).toHaveLength(0);
  });
});
