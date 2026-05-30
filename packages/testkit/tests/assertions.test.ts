import { describe, it, expect } from 'vitest';
import { assertStateValid, assertConfigValid, assertDraftValid, assertSummaryValid } from '../src/assertions.js';
import { emptyState, defaultConfig } from '@manehorizons/cadence-types';

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

  it('assertSummaryValid throws on incomplete summary', () => {
    expect(() => assertSummaryValid({ draftId: '01-01' })).toThrow(/summary/i);
  });
});
