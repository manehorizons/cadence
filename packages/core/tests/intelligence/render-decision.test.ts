import { describe, expect, it } from 'vitest';
import type { IntelligenceDecisionLedger } from '@manehorizons/cadence-types';
import { renderDecisionsMd } from '../../src/intelligence/render-decision.js';

describe('renderDecisionsMd (Slice 8 + Slice 13 / AC-5 + AC-6)', () => {
  it('AC-6: empty ledger → "No decisions recorded." path preserved', () => {
    const ledger: IntelligenceDecisionLedger = { schemaVersion: 1, decisions: [] };
    const md = renderDecisionsMd(ledger);
    expect(md).toMatch(/^# CADENCE Decisions\n/);
    expect(md).toMatch(/> Generated from `\.cadence\/intelligence\/decisions\.json`\./);
    expect(md).toMatch(/No decisions recorded\./);
    expect(md).not.toMatch(/## Active/);
  });

  it('AC-5: tied active decision rendered under `## Active` with H3 heading + recommendation bullet', () => {
    const ledger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        {
          id: 'dec-20260520-001',
          recommendationId: 'rec-1',
          title: 'use postgres',
          rationale: 'concurrency',
          status: 'active',
          decidedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
    };
    const md = renderDecisionsMd(ledger);
    expect(md).toMatch(/## Active[\s\S]*?### dec-20260520-001 — use postgres/);
    expect(md).toMatch(/- recommendation: rec-1/);
    expect(md).toMatch(/- decided: 2026-05-20T00:00:00\.000Z/);
    expect(md).toMatch(/^concurrency$/m);
    expect(md).toMatch(/## Superseded[\s\S]*?_\(none\)_/);
    expect(md).toMatch(/## Rescinded[\s\S]*?_\(none\)_/);
  });

  it('untied active decision OMITS `- recommendation:` bullet', () => {
    const ledger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        {
          id: 'dec-20260520-001',
          title: 'top-level decision',
          rationale: 'no rec',
          status: 'active',
          decidedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
    };
    const md = renderDecisionsMd(ledger);
    expect(md).toMatch(/### dec-20260520-001 — top-level decision/);
    expect(md).not.toMatch(/- recommendation:/);
    expect(md).toMatch(/- decided: 2026-05-20T00:00:00\.000Z/);
  });

  it('AC-5: superseded decision rendered under `## Superseded`', () => {
    const ledger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        {
          id: 'dec-1',
          title: 'old',
          rationale: 'r',
          status: 'superseded',
          decidedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
    };
    const md = renderDecisionsMd(ledger);
    expect(md).toMatch(/## Superseded[\s\S]*?### dec-1 — old/);
    expect(md).toMatch(/## Active[\s\S]*?_\(none\)_/);
    expect(md).toMatch(/## Rescinded[\s\S]*?_\(none\)_/);
  });

  it('AC-5: rescinded decision rendered under `## Rescinded`', () => {
    const ledger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        {
          id: 'dec-1',
          title: 'withdrawn',
          rationale: 'r',
          status: 'rescinded',
          decidedAt: '2026-05-20T00:00:00.000Z',
        },
      ],
    };
    const md = renderDecisionsMd(ledger);
    expect(md).toMatch(/## Rescinded[\s\S]*?### dec-1 — withdrawn/);
    expect(md).toMatch(/## Active[\s\S]*?_\(none\)_/);
    expect(md).toMatch(/## Superseded[\s\S]*?_\(none\)_/);
  });

  it('AC-5: section order is Active → Superseded → Rescinded (fixed)', () => {
    const ledger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'd-a', title: 'a', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
        { id: 'd-s', title: 's', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z' },
        { id: 'd-r', title: 'r', rationale: 'r', status: 'rescinded', decidedAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const md = renderDecisionsMd(ledger);
    const activeIdx = md.indexOf('## Active');
    const supIdx = md.indexOf('## Superseded');
    const resIdx = md.indexOf('## Rescinded');
    expect(activeIdx).toBeGreaterThan(-1);
    expect(supIdx).toBeGreaterThan(activeIdx);
    expect(resIdx).toBeGreaterThan(supIdx);
  });

  it('AC-5: insertion order preserved within each bucket', () => {
    const ledger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'd-2', title: 'second', rationale: 'r', status: 'active', decidedAt: '2026-05-20T01:00:00.000Z' },
        { id: 'd-1', title: 'first', rationale: 'r', status: 'active', decidedAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const md = renderDecisionsMd(ledger);
    const d2Idx = md.indexOf('### d-2');
    const d1Idx = md.indexOf('### d-1');
    expect(d2Idx).toBeGreaterThan(-1);
    expect(d1Idx).toBeGreaterThan(d2Idx);
  });

  it('Slice 28 AC-8: superseded entry with supersededBy renders - superseded-by bullet', () => {
    const ledger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'dec-1', title: 'old', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z', supersededBy: 'dec-2' },
        { id: 'dec-2', title: 'new', rationale: 'r', status: 'active', decidedAt: '2026-05-20T01:00:00.000Z' },
      ],
    };
    const md = renderDecisionsMd(ledger);
    expect(md).toMatch(/- superseded-by: dec-2$/m);
  });

  it('Slice 28 AC-11: supersededBy unknown id renders (not found) fallback', () => {
    const ledger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'dec-1', title: 'old', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z', supersededBy: 'dec-bogus' },
      ],
    };
    const md = renderDecisionsMd(ledger);
    expect(md).toMatch(/- superseded-by: dec-bogus \(not found\)/);
  });

  it('Slice 28: superseded entry without supersededBy renders without the bullet', () => {
    const ledger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'dec-1', title: 'old', rationale: 'r', status: 'superseded', decidedAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const md = renderDecisionsMd(ledger);
    expect(md).not.toMatch(/- superseded-by:/);
  });
});
