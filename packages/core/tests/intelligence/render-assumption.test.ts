import { describe, expect, it } from 'vitest';
import type { AssumptionLedger } from '@manehorizons/cadence-types';
import { renderAssumptionsMd } from '../../src/intelligence/render-assumption.js';

describe('renderAssumptionsMd (Slice 8)', () => {
  it('always emits header + blockquote envelope; empty ledger → "No assumptions recorded."', () => {
    const ledger: AssumptionLedger = { schemaVersion: 1, assumptions: [] };
    const md = renderAssumptionsMd(ledger);
    expect(md).toMatch(/^# CADENCE Assumptions\n/);
    expect(md).toMatch(/> Generated from `\.cadence\/intelligence\/assumptions\.json`\./);
    expect(md).toMatch(/No assumptions recorded\./);
  });

  it('non-empty: 3 always-emit bucket sections with entries under correct headings', () => {
    const ledger: AssumptionLedger = {
      schemaVersion: 1,
      assumptions: [
        { id: 'as-20260520-001', recommendationId: 'rec-1', text: 'db reachable',
          status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'as-20260520-002', recommendationId: 'rec-2', text: 'auth flow correct',
          status: 'validated', createdAt: '2026-05-20T01:00:00.000Z' },
      ],
    };
    const md = renderAssumptionsMd(ledger);
    // Three always-emit sections in fixed order
    expect(md).toMatch(/^## Open$/m);
    expect(md).toMatch(/^## Validated$/m);
    expect(md).toMatch(/^## Rejected$/m);
    // Open entry uses H3 heading (demoted)
    expect(md).toMatch(/^### as-20260520-001 — db reachable$/m);
    // Validated entry under its section
    expect(md).toMatch(/^### as-20260520-002 — auth flow correct$/m);
    // Per-entry bullets — recommendation + recorded only; NO status bullet
    expect(md).toMatch(/- recommendation: rec-1/);
    expect(md).toMatch(/- recorded: 2026-05-20T00:00:00\.000Z/);
    expect(md).not.toMatch(/- status: /);
    // Empty Rejected bucket renders `_(none)_`
    expect(md).toMatch(/^## Rejected$\n+_\(none\)_/m);
    // Section ordering: Open before Validated before Rejected
    expect(md.indexOf('## Open')).toBeLessThan(md.indexOf('## Validated'));
    expect(md.indexOf('## Validated')).toBeLessThan(md.indexOf('## Rejected'));
  });

  it('always emits 3 section headers even when buckets are empty (except all-empty ledger)', () => {
    const ledger: AssumptionLedger = {
      schemaVersion: 1,
      assumptions: [
        { id: 'as-1', recommendationId: 'r-1', text: 't1', status: 'open',
          createdAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const md = renderAssumptionsMd(ledger);
    expect(md).toMatch(/## Open\n+### as-1/);
    expect(md).toMatch(/## Validated\n+_\(none\)_/);
    expect(md).toMatch(/## Rejected\n+_\(none\)_/);
  });
});
