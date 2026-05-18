import { describe, expect, it } from 'vitest';
import type {
  Assumption,
  BackendStatus,
  Evidence,
  IntelligenceDecision,
  Recommendation,
} from '@cadence/types';
import { ContextPacketZ } from '@cadence/types';
import { synthesizeContextPacket } from '../../src/intelligence/context.js';

function mkRec(p: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-x',
    title: 't',
    summary: 's',
    source: 'manual',
    status: 'candidate',
    readiness: 'raw-idea',
    priority: 'low',
    leverageScore: 0,
    riskScore: 0,
    confidence: 0,
    decayState: 'fresh',
    affectedAreas: [],
    affectedFiles: [],
    evidenceIds: [],
    assumptionIds: [],
    decisionIds: [],
    createdAt: '2026-05-18T00:00:00.000Z',
    updatedAt: '2026-05-18T00:00:00.000Z',
    ...p,
  };
}
const NOW = new Date('2026-05-18T12:00:00.000Z');
const noBackend: BackendStatus = { present: false, kind: null, legalActions: [] };

describe('synthesizeContextPacket', () => {
  it('parses to ContextPacketZ and stamps generatedAt from now', () => {
    const p = synthesizeContextPacket(
      'phase',
      { recommendations: [], evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(() => ContextPacketZ.parse(p)).not.toThrow();
    expect(p.generatedAt).toBe('2026-05-18T12:00:00.000Z');
    expect(p.scope).toBe('phase');
    expect(p.loop.present).toBe(false);
    expect(p.recommendations).toEqual([]);
  });

  it('includes only ranked recs (parked/excluded never leak) and caps at TOP_N', () => {
    const recs: Recommendation[] = [];
    for (let i = 0; i < 9; i++) {
      recs.push(
        mkRec({ id: `rec-${i}`, status: 'candidate', leverageScore: i, createdAt: `2026-05-1${i}T00:00:00.000Z` }),
      );
    }
    recs.push(mkRec({ id: 'rec-rej', status: 'rejected', leverageScore: 99 }));
    recs.push(mkRec({ id: 'rec-def', status: 'deferred', leverageScore: 99 }));
    const phase = synthesizeContextPacket(
      'phase',
      { recommendations: recs, evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(phase.recommendations).toHaveLength(7);
    expect(phase.totals.recommendationsOmitted).toBe(2);
    expect(phase.recommendations.map((r) => r.id)).not.toContain('rec-rej');
    expect(phase.recommendations.map((r) => r.id)).not.toContain('rec-def');
    expect(phase.recommendations[0]!.id).toBe('rec-8');

    const handoff = synthesizeContextPacket(
      'handoff',
      { recommendations: recs, evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(handoff.recommendations).toHaveLength(5);
    expect(handoff.totals.recommendationsOmitted).toBe(4);
  });

  it('carries only open assumptions; phase scopes them to selected recs, handoff carries all', () => {
    const recs = [mkRec({ id: 'rec-a', status: 'candidate', leverageScore: 5 })];
    const assumptions: Assumption[] = [
      { id: 'as-1', recommendationId: 'rec-a', text: 'open one', status: 'open', createdAt: NOW.toISOString() },
      { id: 'as-2', recommendationId: 'rec-a', text: 'closed', status: 'validated', createdAt: NOW.toISOString() },
      { id: 'as-3', recommendationId: 'rec-other', text: 'foreign open', status: 'open', createdAt: NOW.toISOString() },
    ];
    const phase = synthesizeContextPacket(
      'phase',
      { recommendations: recs, evidence: [], assumptions, decisions: [], backend: noBackend },
      NOW,
    );
    expect(phase.assumptions.map((a) => a.id)).toEqual(['as-1']);
    const handoff = synthesizeContextPacket(
      'handoff',
      { recommendations: recs, evidence: [], assumptions, decisions: [], backend: noBackend },
      NOW,
    );
    expect(handoff.assumptions.map((a) => a.id).sort()).toEqual(['as-1', 'as-3']);
  });

  it('builds the files union from affectedFiles + evidence path, skips undefined paths, dedups', () => {
    // NOTE: the synth resolves evidence by scanning `sources.evidence` filtered
    // on `recommendationId` — it never reads `rec.evidenceIds` (deliberate per
    // spec §Error Handling). The fixture below carries no evidenceIds on purpose.
    const recs = [
      mkRec({ id: 'rec-a', status: 'candidate', leverageScore: 5, affectedFiles: ['src/a.ts', 'src/a.ts'] }),
    ];
    const evidence: Evidence[] = [
      { id: 'ev-1', recommendationId: 'rec-a', kind: 'file', summary: 's', path: 'src/b.ts', createdAt: NOW.toISOString() },
      { id: 'ev-2', recommendationId: 'rec-a', kind: 'note', summary: 's', createdAt: NOW.toISOString() },
    ];
    const p = synthesizeContextPacket(
      'phase',
      { recommendations: recs, evidence, assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(p.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('phase decisions tie to selected recs; handoff carries all decisions', () => {
    const recs = [mkRec({ id: 'rec-a', status: 'candidate', leverageScore: 5 })];
    const decisions: IntelligenceDecision[] = [
      { id: 'dec-1', recommendationId: 'rec-a', title: 'tied', rationale: 'r', decidedAt: NOW.toISOString() },
      { id: 'dec-2', title: 'untied', rationale: 'r', decidedAt: NOW.toISOString() },
    ];
    const phase = synthesizeContextPacket(
      'phase',
      { recommendations: recs, evidence: [], assumptions: [], decisions, backend: noBackend },
      NOW,
    );
    expect(phase.decisions.map((d) => d.id)).toEqual(['dec-1']);
    const handoff = synthesizeContextPacket(
      'handoff',
      { recommendations: recs, evidence: [], assumptions: [], decisions, backend: noBackend },
      NOW,
    );
    expect(handoff.decisions.map((d) => d.id).sort()).toEqual(['dec-1', 'dec-2']);
  });

  it('collapses newlines in interpolated free text', () => {
    const recs = [mkRec({ id: 'rec-a', status: 'candidate', leverageScore: 5, title: 'line1\nline2' })];
    const p = synthesizeContextPacket(
      'phase',
      { recommendations: recs, evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(p.recommendations[0]!.title).toBe('line1 line2');
  });

  it('populates the loop block from a present backend', () => {
    const backend: BackendStatus = {
      present: true,
      kind: 'cadence',
      loopPosition: 'BUILD',
      activePhase: '40-foo',
      activeDraft: '40-01',
      activeSpec: null,
      tier: 'standard',
      legalActions: ['cadence done T1'],
    };
    const p = synthesizeContextPacket(
      'handoff',
      { recommendations: [], evidence: [], assumptions: [], decisions: [], backend },
      NOW,
    );
    expect(p.loop).toMatchObject({
      present: true,
      loopPosition: 'BUILD',
      activePhase: '40-foo',
      activeDraft: '40-01',
      nextAction: 'cadence done T1',
    });
  });

  it('surfaces backend stateError without throwing', () => {
    const backend: BackendStatus = {
      present: true,
      kind: 'cadence',
      legalActions: [],
      stateError: 'corrupt state.json',
    };
    const p = synthesizeContextPacket(
      'phase',
      { recommendations: [], evidence: [], assumptions: [], decisions: [], backend },
      NOW,
    );
    expect(p.loop.present).toBe(true);
    expect(p.loop.stateError).toBe('corrupt state.json');
    expect(p.loop.nextAction).toBeUndefined();
  });
});
