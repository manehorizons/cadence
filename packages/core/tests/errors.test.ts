import { describe, it, expect } from 'vitest';
import { CadenceError, StateCorruptError, NotInitializedError, ConfigInvalidError, LoopViolationError, StateConflictError } from '../src/errors.js';

describe('errors', () => {
  it('CadenceError carries a code', () => {
    const e = new CadenceError('boom', 'GENERIC');
    expect(e.code).toBe('GENERIC');
    expect(e instanceof Error).toBe(true);
  });

  it('StateCorruptError code is STATE_CORRUPT', () => {
    const e = new StateCorruptError('bad');
    expect(e.code).toBe('STATE_CORRUPT');
  });

  // AC-1 — distinct not-initialized error
  it('NotInitializedError carries NOT_INITIALIZED code and names cadence init', () => {
    const e = new NotInitializedError();
    expect(e.code).toBe('NOT_INITIALIZED');
    expect(e.name).toBe('NotInitializedError');
    expect(e.message).toMatch(/cadence init/);
  });

  it('ConfigInvalidError code is CONFIG_INVALID', () => {
    expect(new ConfigInvalidError('bad').code).toBe('CONFIG_INVALID');
  });

  it('LoopViolationError code is LOOP_VIOLATION', () => {
    expect(new LoopViolationError('bad').code).toBe('LOOP_VIOLATION');
  });

  // AC-2 (Phase 23.3) — LoopViolationError carries expected + actual
  it('LoopViolationError with no opts has undefined fields (backwards-compat)', () => {
    const e = new LoopViolationError('bad');
    expect(e.expected).toBeUndefined();
    expect(e.actual).toBeUndefined();
  });

  it('LoopViolationError with opts records expected + actual (AC-2)', () => {
    const e = new LoopViolationError('bad', { expected: 'BUILD', actual: 'IDLE' });
    expect(e.expected).toBe('BUILD');
    expect(e.actual).toBe('IDLE');
    expect(e.message).toBe('bad');
    expect(e.code).toBe('LOOP_VIOLATION');
  });

  it('StateConflictError code is STATE_CONFLICT', () => {
    const e = new StateConflictError('conflict', { expectedRevision: 0, actualRevision: 1 });
    expect(e.code).toBe('STATE_CONFLICT');
    expect(e.name).toBe('StateConflictError');
  });

  it('StateConflictError carries expectedRevision + actualRevision', () => {
    const e = new StateConflictError('conflict', { expectedRevision: 3, actualRevision: 5 });
    expect(e.expectedRevision).toBe(3);
    expect(e.actualRevision).toBe(5);
  });
});
