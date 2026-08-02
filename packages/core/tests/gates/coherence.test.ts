import { describe, it, expect } from 'vitest';
import {
  runCoherenceGate,
  emitCoherenceWarns,
  printAllCoherenceIssues,
} from '../../src/gates/coherence.js';
import type { DraftGateContext } from '../../src/gates/draft-types.js';
import type { CoherenceIssue } from '../../src/coherence/check.js';
import type { AnomalyEvent } from '@thomas-powers-jr/cadence-types';

const BLOCK: CoherenceIssue = { severity: 'block', code: 'C1', message: 'boom' };
const WARN: CoherenceIssue = { severity: 'warn', code: 'C2', message: 'meh' };

function ctx(over: {
  issues?: CoherenceIssue[];
  gates?: string[];
  emits?: AnomalyEvent[][];
  errs?: string[];
}): DraftGateContext {
  const emits = over.emits ?? [];
  const errs = over.errs ?? [];
  return {
    cwd: '/x',
    state: {} as never,
    draft: {} as never,
    config: null,
    gateSet: { gates: over.gates ?? [], softCap: false } as never,
    phase: '01-foundation',
    id: '01-01',
    opts: {},
    coherence: () => ({ issues: over.issues ?? [] }),
    verifiers: { planReview: { verify: async () => ({ pass: true, findings: [], provider: 'mock' }) } },
    emit: {
      coherenceWarn: async (events) => {
        emits.push(events);
      },
      planReviewUnconverged: async () => {},
    },
    prompter: { create: () => ({ ask: async () => '' }) },
    planReviewSidecar: { read: async () => ({ attemptsSoFar: 0, history: [] }), write: async () => {} },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as DraftGateContext;
}

describe('runCoherenceGate (approve blocker step)', () => {
  it('passes with no blockers', async () => {
    const res = await runCoherenceGate(ctx({ issues: [WARN] }));
    expect(res.outcome).toBe('pass');
  });

  it('refuses + prints [BLOCK] lines on a block-severity issue', async () => {
    const errs: string[] = [];
    const res = await runCoherenceGate(ctx({ issues: [BLOCK, WARN], errs }));
    expect(res.outcome).toBe('refuse');
    expect(errs).toEqual(['[BLOCK] C1: boom\n']);
  });
});

describe('emitCoherenceWarns', () => {
  it('no-ops when there are no warns', async () => {
    const emits: AnomalyEvent[][] = [];
    await emitCoherenceWarns(ctx({ issues: [BLOCK], gates: ['anomaly-notify'], emits }), 'coherence.approve');
    expect(emits).toEqual([]);
  });

  it('no-ops when anomaly-notify is not in the set', async () => {
    const emits: AnomalyEvent[][] = [];
    await emitCoherenceWarns(ctx({ issues: [WARN], gates: [], emits }), 'coherence.check');
    expect(emits).toEqual([]);
  });

  it('emits one coherence-warn event per warn, tagged with the source', async () => {
    const emits: AnomalyEvent[][] = [];
    await emitCoherenceWarns(
      ctx({ issues: [WARN, BLOCK], gates: ['anomaly-notify'], emits }),
      'coherence.check',
    );
    expect(emits).toHaveLength(1);
    expect(emits[0]).toHaveLength(1);
    expect(emits[0]?.[0]).toMatchObject({
      type: 'coherence-warn',
      severity: 'warn',
      message: 'meh',
      context: { code: 'C2', source: 'coherence.check' },
    });
  });
});

describe('printAllCoherenceIssues', () => {
  it('prints [BLOCK] for blocks and double-[WARN] for warns, returning blocked', () => {
    const errs: string[] = [];
    const blocked = printAllCoherenceIssues([BLOCK, WARN], { err: (s) => errs.push(s) });
    expect(blocked).toBe(true);
    expect(errs).toEqual(['[BLOCK] C1: boom\n', '[WARN] [WARN] C2: meh\n']);
  });

  it('returns false when there are no blocks', () => {
    const errs: string[] = [];
    const blocked = printAllCoherenceIssues([WARN], { err: (s) => errs.push(s) });
    expect(blocked).toBe(false);
  });
});
