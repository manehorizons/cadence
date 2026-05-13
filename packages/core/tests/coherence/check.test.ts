import { describe, it, expect } from 'vitest';
import { coherenceCheck } from '../../src/coherence/check.js';
import { emptyState } from '@keel/types';

const baseDraft = {
  schemaVersion: 1 as const,
  id: '01-01',
  phase: '01-foundation',
  tier: 'standard' as const,
  title: 'demo',
  objective: 'do thing',
  acceptanceCriteria: [{ id: 'AC-1', given: 'x', when: 'y', then: 'z' }],
  tasks: [
    { id: 'T1', name: 'edit foo', files: ['src/foo.ts'], action: 'change x', verify: 'tests pass', done: 'AC-1' },
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
});
