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
  it('accepts a 3-digit phase id (rec-20260610-001)', () => {
    expect(() => SpecZ.parse({ ...valid, id: '100-01' })).not.toThrow();
    expect(() => SpecZ.parse({ ...valid, id: '100-100' })).not.toThrow();
  });
  it('still requires min-2 digits each half', () => {
    expect(() => SpecZ.parse({ ...valid, id: '1-1' })).toThrow();
    expect(() => SpecZ.parse({ ...valid, id: '100-1' })).toThrow();
  });
  it('AC-2: reuses AcceptanceCriterionZ shape (rejects AC missing then)', () => {
    expect(() =>
      SpecZ.parse({ ...valid, acceptanceCriteria: [{ id: 'AC-1', given: 'g', when: 'w' } as never] }),
    ).toThrow();
  });
  it('AC-4: AC without name defaults to "" (back-compat)', () => {
    const parsed = SpecZ.parse(valid);
    expect(parsed.acceptanceCriteria[0]!.name).toBe('');
  });
  it('AC-4: a populated AC name round-trips', () => {
    const parsed = SpecZ.parse({
      ...valid,
      acceptanceCriteria: [
        { id: 'AC-1', name: 'convergence wrap', given: 'g', when: 'w', then: 't' },
      ],
    });
    expect(parsed.acceptanceCriteria[0]!.name).toBe('convergence wrap');
  });
});
