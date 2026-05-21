import { describe, expect, it } from 'vitest';
import type { IntelligenceDecisionLedger } from '@cadence/types';
import { renderDecisionsMd } from '../../src/intelligence/render-decision.js';

describe('renderDecisionsMd (Slice 8)', () => {
  it('always emits header + blockquote envelope; empty → "No decisions recorded."', () => {
    const ledger: IntelligenceDecisionLedger = { schemaVersion: 1, decisions: [] };
    const md = renderDecisionsMd(ledger);
    expect(md).toMatch(/^# CADENCE Decisions\n/);
    expect(md).toMatch(/> Generated from `\.cadence\/intelligence\/decisions\.json`\./);
    expect(md).toMatch(/No decisions recorded\./);
  });

  it('tied decision: emits `- recommendation:` bullet', () => {
    const ledger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'dec-20260520-001', recommendationId: 'rec-1',
          title: 'use postgres', rationale: 'concurrency',
          decidedAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const md = renderDecisionsMd(ledger);
    expect(md).toMatch(/## dec-20260520-001 — use postgres/);
    expect(md).toMatch(/- recommendation: rec-1/);
    expect(md).toMatch(/- decided: 2026-05-20T00:00:00\.000Z/);
    expect(md).toMatch(/^concurrency$/m);
  });

  it('untied decision: OMITS `- recommendation:` bullet', () => {
    const ledger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'dec-20260520-001', title: 'top-level decision', rationale: 'no rec',
          decidedAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const md = renderDecisionsMd(ledger);
    expect(md).toMatch(/## dec-20260520-001 — top-level decision/);
    expect(md).not.toMatch(/- recommendation:/);
    expect(md).toMatch(/- decided: 2026-05-20T00:00:00\.000Z/);
  });
});
