import { describe, it, expect } from 'vitest';
import { derivePhaseTaskId } from '../../src/phases/id.js';

describe('derivePhaseTaskId (rec-20260610-001)', () => {
  it('preserves existing 2-digit ids unchanged', () => {
    expect(derivePhaseTaskId('99-cache', '3')).toBe('99-03');
    expect(derivePhaseTaskId('00-demo', '01')).toBe('00-01');
  });
  it('builds a 3-digit phase id without truncating', () => {
    expect(derivePhaseTaskId('100-foo', '1')).toBe('100-01');
    expect(derivePhaseTaskId('100-foo', '100')).toBe('100-100');
  });
  it('pads a single-digit phase half to a minimum of 2', () => {
    expect(derivePhaseTaskId('9-x', '1')).toBe('09-01');
  });
  it('throws when the phase arg has no leading number', () => {
    expect(() => derivePhaseTaskId('nope', '1')).toThrow();
  });
});
