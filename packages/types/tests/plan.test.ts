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

describe('Task.depends', () => {
  const base = {
    schemaVersion: 1 as const,
    id: '01-01',
    phase: '01-foundation',
    tier: 'standard' as const,
    title: 'x',
    objective: 'x',
    acceptanceCriteria: [{ id: 'AC-1', given: '-', when: '-', then: '-' }],
    boundaries: [],
    status: 'PENDING' as const,
  };

  it('is optional — a task with no depends parses fine', () => {
    const parsed = DraftZ.parse({
      ...base,
      tasks: [{ id: 'T1', name: 'n', files: ['a.ts'], action: 'a', verify: 'v', done: 'AC-1' }],
    });
    expect(parsed.tasks[0]?.depends).toBeUndefined();
  });

  it('round-trips a declared depends list', () => {
    const parsed = DraftZ.parse({
      ...base,
      tasks: [
        { id: 'T1', name: 'n', files: ['a.ts'], action: 'a', verify: 'v', done: 'AC-1' },
        {
          id: 'T2',
          name: 'n2',
          files: ['b.ts'],
          action: 'a',
          verify: 'v',
          done: 'AC-1',
          depends: ['T1'],
        },
      ],
    });
    expect(parsed.tasks[1]?.depends).toEqual(['T1']);
  });

  it('rejects non-string depends entries', () => {
    expect(() =>
      DraftZ.parse({
        ...base,
        tasks: [
          {
            id: 'T1',
            name: 'n',
            files: ['a.ts'],
            action: 'a',
            verify: 'v',
            done: 'AC-1',
            depends: [7] as never,
          },
        ],
      }),
    ).toThrow();
  });
});

describe('Task.class', () => {
  const base = {
    schemaVersion: 1 as const,
    id: '01-01',
    phase: '01-foundation',
    tier: 'standard' as const,
    title: 'x',
    objective: 'x',
    acceptanceCriteria: [{ id: 'AC-1', given: '-', when: '-', then: '-' }],
    boundaries: [],
    status: 'PENDING' as const,
  };

  it('is optional — a task with no class parses fine', () => {
    const parsed = DraftZ.parse({
      ...base,
      tasks: [{ id: 'T1', name: 'n', files: ['a.ts'], action: 'a', verify: 'v', done: 'AC-1' }],
    });
    expect(parsed.tasks[0]?.class).toBeUndefined();
  });

  it('round-trips a declared class value', () => {
    for (const cls of ['mechanical', 'standard', 'complex'] as const) {
      const parsed = DraftZ.parse({
        ...base,
        tasks: [
          {
            id: 'T1',
            name: 'n',
            files: ['a.ts'],
            action: 'a',
            verify: 'v',
            done: 'AC-1',
            class: cls,
          },
        ],
      });
      expect(parsed.tasks[0]?.class).toBe(cls);
    }
  });

  it('rejects an invalid class value', () => {
    expect(() =>
      DraftZ.parse({
        ...base,
        tasks: [
          {
            id: 'T1',
            name: 'n',
            files: ['a.ts'],
            action: 'a',
            verify: 'v',
            done: 'AC-1',
            class: 'bogus' as never,
          },
        ],
      }),
    ).toThrow();
  });
});

describe('Task.stop', () => {
  const base = {
    schemaVersion: 1 as const,
    id: '01-01',
    phase: '01-foundation',
    tier: 'standard' as const,
    title: 'x',
    objective: 'x',
    acceptanceCriteria: [{ id: 'AC-1', given: '-', when: '-', then: '-' }],
    boundaries: [],
    status: 'PENDING' as const,
  };

  it('is optional — a task with no stop parses fine', () => {
    const parsed = DraftZ.parse({
      ...base,
      tasks: [{ id: 'T1', name: 'n', files: ['a.ts'], action: 'a', verify: 'v', done: 'AC-1' }],
    });
    expect(parsed.tasks[0]?.stop).toBeUndefined();
  });

  it('round-trips a declared stop value', () => {
    const parsed = DraftZ.parse({
      ...base,
      tasks: [
        {
          id: 'T1',
          name: 'n',
          files: ['a.ts'],
          action: 'a',
          verify: 'v',
          done: 'AC-1',
          stop: 'If the migration touches more than 3 tables, halt and ask a human before continuing',
        },
      ],
    });
    expect(parsed.tasks[0]?.stop).toBe(
      'If the migration touches more than 3 tables, halt and ask a human before continuing',
    );
  });

  // No "rejects an invalid value" sub-case here (unlike Task.class's enum
  // check above): `stop` is a plain `z.string()`, not an enum, so every
  // string is a valid stop-condition — there is no invalid value to reject.
});

describe('Draft.redundantWorkEnforcement override', () => {
  const base = {
    schemaVersion: 1 as const,
    id: '01-01',
    phase: '01-foundation',
    tier: 'standard' as const,
    title: 'x',
    objective: 'x',
    acceptanceCriteria: [],
    tasks: [],
    boundaries: [],
    status: 'PENDING' as const,
  };

  it('is optional — omitting it parses fine', () => {
    expect(() => DraftZ.parse(base)).not.toThrow();
  });

  it('accepts "off" | "warn" | "block"', () => {
    for (const v of ['off', 'warn', 'block'] as const) {
      expect(DraftZ.parse({ ...base, redundantWorkEnforcement: v }).redundantWorkEnforcement).toBe(v);
    }
  });

  it('rejects an unknown value', () => {
    expect(() => DraftZ.parse({ ...base, redundantWorkEnforcement: 'nope' as never })).toThrow();
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
