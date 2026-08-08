import { describe, it, expect } from 'vitest';
import { nextConvergence, runConvergentReview, readProviderSelection } from '../../src/verify/converge.js';

describe('nextConvergence (AC-1)', () => {
  it('AC-1: pass short-circuits regardless of attempts', () => {
    expect(nextConvergence(true, 0, 3)).toEqual({ verdict: 'pass', attempt: 0 });
    expect(nextConvergence(true, 9, 3)).toEqual({ verdict: 'pass', attempt: 9 });
  });
  it('AC-1: fail reloops while attemptsSoFar+1 < max (max 3)', () => {
    expect(nextConvergence(false, 0, 3)).toEqual({ verdict: 'reloop', attempt: 1 });
    expect(nextConvergence(false, 1, 3)).toEqual({ verdict: 'reloop', attempt: 2 });
  });
  it('AC-1: fail escalates when attemptsSoFar+1 >= max (max 3 → 3rd)', () => {
    expect(nextConvergence(false, 2, 3)).toEqual({ verdict: 'escalate', attempt: 3 });
  });
  it('AC-1: maxAttempts=1 → first fail escalates immediately', () => {
    expect(nextConvergence(false, 0, 1)).toEqual({ verdict: 'escalate', attempt: 1 });
  });
});

describe('runConvergentReview (phase 225 — T2)', () => {
  const AT = '2026-07-26T00:00:00.000Z';
  const now = () => AT;

  it('pass: reproduces plan-review\'s exact sidecar shape (idField: draftId)', () => {
    const result = runConvergentReview({
      pass: true,
      findingsCount: 0,
      provider: 'mock',
      attemptsSoFar: 0,
      history: [],
      maxAttempts: 3,
      bypassed: false,
      idField: 'draftId',
      idValue: '01-01',
      now,
    });
    expect(result.nv).toEqual({ verdict: 'pass', attempt: 0 });
    expect(result.sidecarJson).toEqual({
      draftId: '01-01',
      converged: true,
      attempts: 0,
      maxAttempts: 3,
      history: [
        {
          at: AT,
          pass: true,
          findingsCount: 0,
          provider: 'mock',
          verdict: 'pass',
        },
      ],
      pass: true,
      provider: 'mock',
      findings: 0,
      at: AT,
    });
  });

  it('reloop: first failure under maxAttempts (idField: draftId)', () => {
    const result = runConvergentReview({
      pass: false,
      findingsCount: 1,
      provider: 'mock',
      attemptsSoFar: 0,
      history: [],
      maxAttempts: 3,
      bypassed: false,
      idField: 'draftId',
      idValue: '01-01',
      now,
    });
    expect(result.nv).toEqual({ verdict: 'reloop', attempt: 1 });
    expect(result.sidecarJson).toEqual({
      draftId: '01-01',
      converged: false,
      attempts: 1,
      maxAttempts: 3,
      history: [
        {
          at: AT,
          pass: false,
          findingsCount: 1,
          provider: 'mock',
          verdict: 'reloop',
        },
      ],
      pass: false,
      provider: 'mock',
      findings: 1,
      at: AT,
    });
  });

  it('escalate: attempt ceiling reached, no bypass (idField: draftId)', () => {
    const result = runConvergentReview({
      pass: false,
      findingsCount: 1,
      provider: 'mock',
      attemptsSoFar: 2,
      history: [],
      maxAttempts: 3,
      bypassed: false,
      idField: 'draftId',
      idValue: '01-01',
      now,
    });
    expect(result.nv).toEqual({ verdict: 'escalate', attempt: 3 });
    expect(result.sidecarJson).toEqual({
      draftId: '01-01',
      converged: false,
      attempts: 3,
      maxAttempts: 3,
      history: [
        {
          at: AT,
          pass: false,
          findingsCount: 1,
          provider: 'mock',
          verdict: 'escalate',
        },
      ],
      pass: false,
      provider: 'mock',
      findings: 1,
      at: AT,
    });
    expect(result.historyEntry).not.toHaveProperty('bypassed');
  });

  it('bypassed at reloop: history entry + sidecar carry bypassed:true on a reloop verdict', () => {
    const result = runConvergentReview({
      pass: false,
      findingsCount: 1,
      provider: 'mock',
      attemptsSoFar: 0,
      history: [],
      maxAttempts: 3,
      bypassed: true,
      idField: 'draftId',
      idValue: '01-01',
      now,
    });
    expect(result.nv).toEqual({ verdict: 'reloop', attempt: 1 });
    expect(result.historyEntry.bypassed).toBe(true);
    expect(result.sidecarJson).toEqual({
      draftId: '01-01',
      converged: false,
      attempts: 1,
      maxAttempts: 3,
      history: [
        {
          at: AT,
          pass: false,
          findingsCount: 1,
          provider: 'mock',
          verdict: 'reloop',
          bypassed: true,
        },
      ],
      pass: false,
      provider: 'mock',
      findings: 1,
      at: AT,
    });
  });

  it('bypassed at escalate: history entry + sidecar carry bypassed:true on an escalate verdict', () => {
    const result = runConvergentReview({
      pass: false,
      findingsCount: 1,
      provider: 'mock',
      attemptsSoFar: 2,
      history: [],
      maxAttempts: 3,
      bypassed: true,
      idField: 'draftId',
      idValue: '01-01',
      now,
    });
    expect(result.nv).toEqual({ verdict: 'escalate', attempt: 3 });
    expect(result.historyEntry.bypassed).toBe(true);
    expect(result.sidecarJson).toEqual({
      draftId: '01-01',
      converged: false,
      attempts: 3,
      maxAttempts: 3,
      history: [
        {
          at: AT,
          pass: false,
          findingsCount: 1,
          provider: 'mock',
          verdict: 'escalate',
          bypassed: true,
        },
      ],
      pass: false,
      provider: 'mock',
      findings: 1,
      at: AT,
    });
  });

  it('includes model in both history entry and legacy top-level field when provided', () => {
    const result = runConvergentReview({
      pass: true,
      findingsCount: 0,
      provider: 'anthropic',
      model: 'claude-x',
      attemptsSoFar: 0,
      history: [],
      maxAttempts: 3,
      bypassed: false,
      idField: 'draftId',
      idValue: '01-01',
      now,
    });
    expect(result.sidecarJson).toEqual({
      draftId: '01-01',
      converged: true,
      attempts: 0,
      maxAttempts: 3,
      history: [
        {
          at: AT,
          pass: true,
          findingsCount: 0,
          provider: 'anthropic',
          model: 'claude-x',
          verdict: 'pass',
        },
      ],
      pass: true,
      provider: 'anthropic',
      model: 'claude-x',
      findings: 0,
      at: AT,
    });
  });

  // Phase 263 (T3) — closing the test-coverage gap: no prior test in this
  // file ever passed `providerSelection`, so the
  // `...(providerSelection ? { providerSelection } : {})` spreads (into both
  // the history entry and the sidecar's legacy top-level field) were never
  // exercised. This would fail if T3's threading were reverted.
  it('includes providerSelection (history + legacy top-level) in both history entry and sidecar when provided (fallback)', () => {
    const result = runConvergentReview({
      pass: true,
      findingsCount: 0,
      provider: 'mock',
      providerSelection: 'fallback',
      attemptsSoFar: 0,
      history: [],
      maxAttempts: 3,
      bypassed: false,
      idField: 'draftId',
      idValue: '01-01',
      now,
    });
    expect(result.historyEntry.providerSelection).toBe('fallback');
    expect(result.sidecarJson).toEqual({
      draftId: '01-01',
      converged: true,
      attempts: 0,
      maxAttempts: 3,
      history: [
        {
          at: AT,
          pass: true,
          findingsCount: 0,
          provider: 'mock',
          providerSelection: 'fallback',
          verdict: 'pass',
        },
      ],
      pass: true,
      provider: 'mock',
      providerSelection: 'fallback',
      findings: 0,
      at: AT,
    });
  });

  it('includes providerSelection: configured the same way when the caller supplies it', () => {
    const result = runConvergentReview({
      pass: true,
      findingsCount: 0,
      provider: 'anthropic',
      model: 'claude-x',
      providerSelection: 'configured',
      attemptsSoFar: 0,
      history: [],
      maxAttempts: 3,
      bypassed: false,
      idField: 'draftId',
      idValue: '01-01',
      now,
    });
    expect(result.historyEntry).toEqual({
      at: AT,
      pass: true,
      findingsCount: 0,
      provider: 'anthropic',
      model: 'claude-x',
      providerSelection: 'configured',
      verdict: 'pass',
    });
    expect(result.sidecarJson.providerSelection).toBe('configured');
  });

  it('omits providerSelection from both history entry and sidecar (including its nested history entry) when the caller does not supply it', () => {
    const result = runConvergentReview({
      pass: true,
      findingsCount: 0,
      provider: 'mock',
      attemptsSoFar: 0,
      history: [],
      maxAttempts: 3,
      bypassed: false,
      idField: 'draftId',
      idValue: '01-01',
      now,
    });
    expect(result.historyEntry).not.toHaveProperty('providerSelection');
    expect(result.sidecarJson).not.toHaveProperty('providerSelection');
    const historyInSidecar = result.sidecarJson.history as Array<Record<string, unknown>>;
    expect(historyInSidecar[0]).not.toHaveProperty('providerSelection');
  });

  it('appends to (and does not mutate) an existing prior history array, reproducing spec-approve\'s shape (idField: specId)', () => {
    const prior = [
      {
        at: '2026-07-25T00:00:00.000Z',
        pass: false,
        findingsCount: 2,
        provider: 'mock',
        verdict: 'reloop',
      },
    ];
    const result = runConvergentReview({
      pass: false,
      findingsCount: 1,
      provider: 'mock',
      attemptsSoFar: 1,
      history: prior,
      maxAttempts: 3,
      bypassed: false,
      idField: 'specId',
      idValue: '40-01',
      now,
    });
    expect(prior).toHaveLength(1); // input history not mutated
    expect(result.nv).toEqual({ verdict: 'reloop', attempt: 2 });
    expect(result.sidecarJson).toEqual({
      specId: '40-01',
      converged: false,
      attempts: 2,
      maxAttempts: 3,
      history: [
        prior[0],
        {
          at: AT,
          pass: false,
          findingsCount: 1,
          provider: 'mock',
          verdict: 'reloop',
        },
      ],
      pass: false,
      provider: 'mock',
      findings: 1,
      at: AT,
    });
  });

  it('defaults `now` to a real ISO timestamp when not injected', () => {
    const before = Date.now();
    const result = runConvergentReview({
      pass: true,
      findingsCount: 0,
      provider: 'mock',
      attemptsSoFar: 0,
      history: [],
      maxAttempts: 3,
      bypassed: false,
      idField: 'draftId',
      idValue: '01-01',
    });
    const at = result.sidecarJson.at as string;
    expect(new Date(at).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(at).toISOString()).toBe(at);
  });
});

// Phase 263 (T3) — closing the test-coverage gap: `readProviderSelection` was
// added and used by gates/plan-review.ts + services/spec-approve.ts (both
// call sites) but had no test of its own. It must read `providerSelection`
// off the result by exact name (never derive/invent it), and return
// `undefined` when the result doesn't carry it — these would fail if the
// function's body changed to anything other than a plain property read.
describe('readProviderSelection (phase 263 — T3)', () => {
  it('reads providerSelection: fallback off the result by exact name', () => {
    expect(readProviderSelection({ provider: 'anthropic', providerSelection: 'fallback' })).toBe(
      'fallback',
    );
  });

  it('reads providerSelection: configured off the result by exact name', () => {
    expect(readProviderSelection({ provider: 'mock', providerSelection: 'configured' })).toBe(
      'configured',
    );
  });

  it('returns undefined when the result does not carry providerSelection', () => {
    expect(readProviderSelection({ provider: 'mock' })).toBeUndefined();
  });

  // The other tests in this block set providerSelection as a plain
  // (enumerable) property, but verify-factory.ts's real `tagProviderSelection`
  // defines it non-enumerable on purpose (so pre-existing exact-shape
  // `toEqual` assertions elsewhere keep passing — see that function's own
  // comment). A named property read like `res.providerSelection` doesn't
  // care about enumerability, but this pins that assumption explicitly: it
  // would fail if `readProviderSelection` were ever changed to something
  // enumerability-sensitive (`{...res}`, `Object.entries`, a JSON round-trip).
  it('reads providerSelection even when it is defined non-enumerable — the shape verifier-factory.ts actually tags', () => {
    const res: { provider: string; providerSelection?: 'configured' | 'fallback' } = {
      provider: 'host-cli',
    };
    Object.defineProperty(res, 'providerSelection', {
      value: 'fallback',
      enumerable: false,
      configurable: true,
    });
    expect(Object.keys(res)).not.toContain('providerSelection'); // sanity: truly non-enumerable
    expect(readProviderSelection(res)).toBe('fallback');
  });
});
