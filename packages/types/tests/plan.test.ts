import { describe, it, expect } from 'vitest';
import { DraftZ, type Draft } from '../src/plan.js';
import { SummaryZ } from '../src/summary.js';

describe('DraftZ', () => {
  it('accepts a minimal quick-fix draft', () => {
    const draft: Draft = {
      schemaVersion: 1,
      id: '01-01',
      phase: '01-foundation',
      tier: 'quick-fix',
      title: 'Fix typo',
      objective: 'Correct misspelling',
      acceptanceCriteria: [{ id: 'AC-1', given: '-', when: '-', then: 'word is correct' }],
      tasks: [
        {
          id: 'T1',
          name: 'Edit file',
          files: ['README.md'],
          action: 'fix typo',
          verify: 'grep returns correct word',
          done: 'AC-1',
        },
      ],
      boundaries: [],
      status: 'PENDING',
    };
    expect(() => DraftZ.parse(draft)).not.toThrow();
  });

  it('rejects task missing required fields', () => {
    expect(() =>
      DraftZ.parse({
        schemaVersion: 1,
        id: '01-01',
        phase: '01-foundation',
        tier: 'quick-fix',
        title: 't',
        objective: 'o',
        acceptanceCriteria: [],
        tasks: [{ id: 'T1', name: 'incomplete' }],
        boundaries: [],
        status: 'PENDING',
      }),
    ).toThrow();
  });

  // AC-1 (Phase 34.1) — DraftZ.requiredSkills optional.
  const baseDraft: Draft = {
    schemaVersion: 1,
    id: '01-01',
    phase: '01-foundation',
    tier: 'quick-fix',
    title: 't',
    objective: 'o',
    acceptanceCriteria: [{ id: 'AC-1', given: '-', when: '-', then: '-' }],
    tasks: [
      { id: 'T1', name: 'n', files: ['a.ts'], action: 'a', verify: 'v', done: 'AC-1' },
    ],
    boundaries: [],
    status: 'PENDING',
  };

  it('requiredSkills is optional — absent → undefined (AC-1)', () => {
    const parsed = DraftZ.parse(baseDraft);
    expect(parsed.requiredSkills).toBeUndefined();
  });

  it('requiredSkills round-trips a declared list (AC-1)', () => {
    const parsed = DraftZ.parse({ ...baseDraft, requiredSkills: ['brainstorming', 'tdd'] });
    expect(parsed.requiredSkills).toEqual(['brainstorming', 'tdd']);
  });

  it('rejects non-string requiredSkills entries (AC-1)', () => {
    expect(() => DraftZ.parse({ ...baseDraft, requiredSkills: [7] as never })).toThrow();
  });
});

describe('DraftZ id schema (rec-20260610-001)', () => {
  const base: Draft = {
    schemaVersion: 1,
    id: '01-01',
    phase: '01-foundation',
    tier: 'quick-fix',
    title: 't',
    objective: 'o',
    acceptanceCriteria: [{ id: 'AC-1', given: '-', when: '-', then: '-' }],
    tasks: [{ id: 'T1', name: 'n', files: ['a.ts'], action: 'a', verify: 'v', done: 'AC-1' }],
    boundaries: [],
    status: 'PENDING',
  };

  it('accepts a 3-digit phase id', () => {
    expect(() => DraftZ.parse({ ...base, id: '100-01' })).not.toThrow();
    expect(() => DraftZ.parse({ ...base, id: '100-100' })).not.toThrow();
  });
  it('rejects sub-2-digit halves', () => {
    expect(() => DraftZ.parse({ ...base, id: '1-1' })).toThrow();
    expect(() => DraftZ.parse({ ...base, id: '100-1' })).toThrow();
  });
});

describe('SummaryZ', () => {
  it('accepts a minimal summary', () => {
    expect(() =>
      SummaryZ.parse({
        schemaVersion: 1,
        draftId: '01-01',
        completedAt: new Date().toISOString(),
        acResults: [{ id: 'AC-1', pass: true }],
        taskResults: [{ id: 'T1', status: 'DONE', notes: '' }],
        decisions: [],
        deferred: [],
        skillAudit: { required: [], invoked: [] },
      }),
    ).not.toThrow();
  });
});
