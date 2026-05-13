import { describe, it, expect } from 'vitest';
import { KeelError, StateCorruptError, ConfigInvalidError, LoopViolationError } from '../src/errors.js';

describe('errors', () => {
  it('KeelError carries a code', () => {
    const e = new KeelError('boom', 'GENERIC');
    expect(e.code).toBe('GENERIC');
    expect(e instanceof Error).toBe(true);
  });

  it('StateCorruptError code is STATE_CORRUPT', () => {
    const e = new StateCorruptError('bad');
    expect(e.code).toBe('STATE_CORRUPT');
  });

  it('ConfigInvalidError code is CONFIG_INVALID', () => {
    expect(new ConfigInvalidError('bad').code).toBe('CONFIG_INVALID');
  });

  it('LoopViolationError code is LOOP_VIOLATION', () => {
    expect(new LoopViolationError('bad').code).toBe('LOOP_VIOLATION');
  });
});
