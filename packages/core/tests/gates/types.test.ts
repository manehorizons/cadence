import { describe, it, expect } from 'vitest';
import { mergeInto, type SettleAccumulator, type GateResult } from '../../src/gates/types.js';

describe('mergeInto', () => {
  // AC-4: gate summaryPatch + flags merge into the accumulator
  it('merges summaryPatch fields and flags without dropping prior data', () => {
    const acc: SettleAccumulator = { flags: {} };
    const a: GateResult = { outcome: 'pass', flags: { coverageBypassed: true } };
    const b: GateResult = {
      outcome: 'pass',
      summaryPatch: { deepVerify: { 'AC-1': { pass: true, reason: 'ok', provider: 'mock' } } },
      flags: { verifierFailure: { message: 'boom', provider: 'mock' } },
    };
    mergeInto(acc, a);
    mergeInto(acc, b);
    expect(acc.flags).toEqual({
      coverageBypassed: true,
      verifierFailure: { message: 'boom', provider: 'mock' },
    });
    expect(acc.deepVerify).toEqual({ 'AC-1': { pass: true, reason: 'ok', provider: 'mock' } });
  });

  // AC-4: a result with no patch/flags is a no-op
  it('is a no-op for an empty result', () => {
    const acc: SettleAccumulator = { flags: { coverageBypassed: false } };
    mergeInto(acc, { outcome: 'pass' });
    expect(acc).toEqual({ flags: { coverageBypassed: false } });
  });

  // AC-4: a patch-only result merges its data and leaves prior flags untouched
  it('merges a summaryPatch without flags and preserves existing flags', () => {
    const acc: SettleAccumulator = { flags: { coverageBypassed: true } };
    mergeInto(acc, {
      outcome: 'pass',
      summaryPatch: { acResults: [{ id: 'AC-1', pass: true }] },
    });
    expect(acc.acResults).toEqual([{ id: 'AC-1', pass: true }]);
    expect(acc.flags).toEqual({ coverageBypassed: true });
  });
});
