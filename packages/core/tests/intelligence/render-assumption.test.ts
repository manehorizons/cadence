import { describe, expect, it } from 'vitest';
import type { AssumptionLedger } from '@cadence/types';
import { renderAssumptionsMd } from '../../src/intelligence/render-assumption.js';

describe('renderAssumptionsMd (Slice 8)', () => {
  it('always emits header + blockquote envelope; empty ledger → "No assumptions recorded."', () => {
    const ledger: AssumptionLedger = { schemaVersion: 1, assumptions: [] };
    const md = renderAssumptionsMd(ledger);
    expect(md).toMatch(/^# CADENCE Assumptions\n/);
    expect(md).toMatch(/> Generated from `\.cadence\/intelligence\/assumptions\.json`\./);
    expect(md).toMatch(/No assumptions recorded\./);
  });

  it('non-empty: per-entry block in insertion order with bullets', () => {
    const ledger: AssumptionLedger = {
      schemaVersion: 1,
      assumptions: [
        { id: 'as-20260520-001', recommendationId: 'rec-1', text: 'db reachable',
          status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'as-20260520-002', recommendationId: 'rec-2', text: 'auth flow correct',
          status: 'open', createdAt: '2026-05-20T01:00:00.000Z' },
      ],
    };
    const md = renderAssumptionsMd(ledger);
    expect(md).toMatch(/^# CADENCE Assumptions/);
    expect(md).toMatch(/## as-20260520-001 — db reachable/);
    expect(md).toMatch(/- recommendation: rec-1/);
    expect(md).toMatch(/- status: open/);
    expect(md).toMatch(/- recorded: 2026-05-20T00:00:00\.000Z/);
    expect(md).toMatch(/## as-20260520-002 — auth flow correct/);
    expect(md.indexOf('as-20260520-001')).toBeLessThan(md.indexOf('as-20260520-002'));
  });
});
