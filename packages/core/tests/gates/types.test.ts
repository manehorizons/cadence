import { describe, it, expect } from 'vitest';
import {
  mergeInto,
  isGateSealed,
  type SettleAccumulator,
  type GateResult,
  type SettleContext,
} from '../../src/gates/types.js';

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

describe('isGateSealed', () => {
  // AC-3/AC-4: a gate id present in ctx.config.gates.sealed is sealed
  it('returns true when the gate id is in ctx.config.gates.sealed', () => {
    const ctx = {
      config: { gates: { sealed: ['test-coverage', 'build-test-must-pass'] } },
    } as unknown as SettleContext;
    expect(isGateSealed(ctx, 'test-coverage')).toBe(true);
    expect(isGateSealed(ctx, 'build-test-must-pass')).toBe(true);
  });

  // AC-5: a gate id absent from the sealed list is unsealed
  it('returns false when the gate id is not in ctx.config.gates.sealed', () => {
    const ctx = {
      config: { gates: { sealed: ['test-coverage'] } },
    } as unknown as SettleContext;
    expect(isGateSealed(ctx, 'build-test-must-pass')).toBe(false);
  });

  // AC-5: no config at all (ctx.config === null) never throws, never seals
  it('returns false when ctx.config is null', () => {
    const ctx = { config: null } as unknown as SettleContext;
    expect(isGateSealed(ctx, 'test-coverage')).toBe(false);
  });

  // AC-5: gates.sealed absent or empty behaves like unsealed
  it('returns false when gates.sealed is empty', () => {
    const ctx = { config: { gates: { sealed: [] } } } as unknown as SettleContext;
    expect(isGateSealed(ctx, 'test-coverage')).toBe(false);
  });

  it('returns false when gates is absent from config entirely', () => {
    const ctx = { config: {} } as unknown as SettleContext;
    expect(isGateSealed(ctx, 'test-coverage')).toBe(false);
  });
});
