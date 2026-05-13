import { describe, it, expect } from 'vitest';
import { assertStateValid, assertConfigValid, assertDraftValid } from '../src/assertions.js';
import { emptyState, defaultConfig } from '@keel/types';

describe('custom assertions', () => {
  it('assertStateValid passes for emptyState', () => {
    expect(() => assertStateValid(emptyState())).not.toThrow();
  });

  it('assertStateValid throws on invalid state', () => {
    expect(() => assertStateValid({ junk: true })).toThrow(/state/i);
  });

  it('assertConfigValid passes for default', () => {
    expect(() => assertConfigValid(defaultConfig)).not.toThrow();
  });

  it('assertDraftValid throws on incomplete draft', () => {
    expect(() => assertDraftValid({ id: '01-01' })).toThrow();
  });
});
