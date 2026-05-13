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
