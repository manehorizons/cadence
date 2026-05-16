import { describe, it, expect } from 'vitest';
import { SpecZ, type Spec } from '../src/spec.js';

const valid: Spec = {
  schemaVersion: 1,
  id: '36-01',
  phase: '36-spec-stage',
  objective: 'Build the thing.',
  acceptanceCriteria: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
  constraints: ['no new deps'],
  openQuestions: [],
  status: 'PENDING',
};

describe('SpecZ (AC-2)', () => {
  it('AC-2: accepts a minimal valid spec', () => {
    expect(() => SpecZ.parse(valid)).not.toThrow();
  });
  it('AC-2: rejects missing objective', () => {
    const { objective: _drop, ...withoutObjective } = valid;
    expect(() => SpecZ.parse(withoutObjective)).toThrow();
  });
  it('AC-2: rejects bad id format', () => {
    expect(() => SpecZ.parse({ ...valid, id: 'nope' })).toThrow();
  });
  it('AC-2: reuses AcceptanceCriterionZ shape (rejects AC missing then)', () => {
    expect(() =>
      SpecZ.parse({ ...valid, acceptanceCriteria: [{ id: 'AC-1', given: 'g', when: 'w' } as never] }),
    ).toThrow();
  });
});
