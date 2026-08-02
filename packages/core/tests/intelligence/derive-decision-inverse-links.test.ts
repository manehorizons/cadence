import { describe, expect, it } from 'vitest';
import type { IntelligenceDecisionLedger } from '@thomas-powers-jr/cadence-types';
import { deriveDecisionInverseLinks } from '../../src/intelligence/store/decisions.js';

function mkLedger(
  items: IntelligenceDecisionLedger['decisions'],
): IntelligenceDecisionLedger {
  return { schemaVersion: 1, decisions: items };
}

function mkDec(
  id: string,
  supersededBy?: string,
): IntelligenceDecisionLedger['decisions'][number] {
  const base = {
    id,
    title: id,
    rationale: 'r',
    status: 'active' as const,
    decidedAt: '2026-05-25T00:00:00.000Z',
    supersedes: [],
  };
  if (supersededBy !== undefined) {
    return { ...base, supersededBy };
  }
  return base;
}

describe('deriveDecisionInverseLinks (Praxis Slice 31)', () => {
  it('AC-2: empty ledger → empty ledger', () => {
    const out = deriveDecisionInverseLinks(mkLedger([]));
    expect(out).toEqual({ schemaVersion: 1, decisions: [] });
  });

  it('AC-3: linear chain D1→D2→D3 → D1.supersedes=[], D2.supersedes=[D1], D3.supersedes=[D2]', () => {
    const ledger = mkLedger([
      mkDec('dec-1', 'dec-2'),
      mkDec('dec-2', 'dec-3'),
      mkDec('dec-3'),
    ]);
    const out = deriveDecisionInverseLinks(ledger);
    expect(out.decisions[0]?.supersedes).toEqual([]);
    expect(out.decisions[1]?.supersedes).toEqual(['dec-1']);
    expect(out.decisions[2]?.supersedes).toEqual(['dec-2']);
  });

  it('AC-4: converging graph (D1→D3, D2→D3) → D3.supersedes=[D1, D2] in ledger insertion order', () => {
    const ledger = mkLedger([
      mkDec('dec-1', 'dec-3'),
      mkDec('dec-2', 'dec-3'),
      mkDec('dec-3'),
    ]);
    const out = deriveDecisionInverseLinks(ledger);
    expect(out.decisions[2]?.supersedes).toEqual(['dec-1', 'dec-2']);
  });

  it('AC-4: insertion order preserved when D1 added before D2 (and reverse)', () => {
    // Same data, different insertion order — should NOT change D3.supersedes ordering.
    const reversed = mkLedger([
      mkDec('dec-2', 'dec-3'),
      mkDec('dec-1', 'dec-3'),
      mkDec('dec-3'),
    ]);
    const out = deriveDecisionInverseLinks(reversed);
    expect(out.decisions[2]?.supersedes).toEqual(['dec-2', 'dec-1']);
  });

  it('AC-5: idempotent — running derivation twice yields the same ledger', () => {
    const ledger = mkLedger([
      mkDec('dec-1', 'dec-2'),
      mkDec('dec-2'),
    ]);
    const once = deriveDecisionInverseLinks(ledger);
    const twice = deriveDecisionInverseLinks(once);
    expect(twice).toEqual(once);
  });

  it('AC-6: stale supersededBy ref does NOT contribute to any supersedes array', () => {
    // dec-1.supersededBy = 'dec-missing' (id not in ledger). dec-1 itself
    // should NOT appear in any decision's supersedes array.
    const ledger = mkLedger([
      mkDec('dec-1', 'dec-missing'),
      mkDec('dec-2'),
    ]);
    const out = deriveDecisionInverseLinks(ledger);
    expect(out.decisions[0]?.supersedes).toEqual([]);
    expect(out.decisions[1]?.supersedes).toEqual([]);
    // Also: no synthetic decision created for dec-missing.
    expect(out.decisions).toHaveLength(2);
  });

  it('preserves all other decision fields verbatim', () => {
    const ledger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        {
          id: 'dec-1',
          recommendationId: 'rec-a',
          title: 'T1',
          rationale: 'why',
          status: 'superseded',
          decidedAt: '2026-05-25T00:00:00.000Z',
          supersededBy: 'dec-2',
          supersedes: [],
        },
        {
          id: 'dec-2',
          title: 'T2',
          rationale: 'why2',
          status: 'active',
          decidedAt: '2026-05-25T01:00:00.000Z',
          supersedes: [],
        },
      ],
    };
    const out = deriveDecisionInverseLinks(ledger);
    expect(out.decisions[0]).toMatchObject({
      id: 'dec-1',
      recommendationId: 'rec-a',
      title: 'T1',
      rationale: 'why',
      status: 'superseded',
      decidedAt: '2026-05-25T00:00:00.000Z',
      supersededBy: 'dec-2',
    });
    expect(out.decisions[1]).toMatchObject({
      id: 'dec-2',
      title: 'T2',
      rationale: 'why2',
      status: 'active',
      decidedAt: '2026-05-25T01:00:00.000Z',
    });
    expect(out.decisions[1]?.supersedes).toEqual(['dec-1']);
  });
});
