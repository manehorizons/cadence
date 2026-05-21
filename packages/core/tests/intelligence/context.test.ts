import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Assumption,
  BackendStatus,
  Evidence,
  IntelligenceDecision,
  Recommendation,
} from '@cadence/types';
import { ContextPacketZ } from '@cadence/types';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { synthesizeContextPacket, runContext } from '../../src/intelligence/context.js';
import {
  addAssumption,
  addIntelligenceDecision,
  addRecommendation,
  runAssumptionTransition,
} from '../../src/intelligence/store.js';

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
        mkRec({ id: `rec-${i}`, status: 'candidate', leverageScore: i, createdAt: `2026-05-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
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
      { id: 'dec-1', recommendationId: 'rec-a', title: 'tied', rationale: 'r', status: 'active', decidedAt: NOW.toISOString() },
      { id: 'dec-2', title: 'untied', rationale: 'r', status: 'active', decidedAt: NOW.toISOString() },
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

describe('synthesizeContextPacket — review scope (Slice 7)', () => {
  function mkAs(p: Partial<Assumption> = {}): Assumption {
    return {
      id: 'as-x',
      recommendationId: 'rec-x',
      text: 't',
      status: 'open',
      createdAt: '2026-05-18T00:00:00.000Z',
      ...p,
    };
  }
  function mkDec(p: Partial<IntelligenceDecision> = {}): IntelligenceDecision {
    return {
      id: 'dec-x',
      title: 't',
      rationale: 'r',
      status: 'active',
      decidedAt: '2026-05-18T00:00:00.000Z',
      ...p,
    };
  }

  it('selects TOP_N_REVIEW=5 ranked recs (sorted score desc, createdAt asc, id asc)', () => {
    // 8 ranked candidates with deterministic scores via leverageScore (the only
    // free input to scoreRecommendation that varies here). Status=candidate, the
    // other contributors are fixed in mkRec defaults so `raw` = leverageScore.
    const recs: Recommendation[] = [
      mkRec({ id: 'r1', leverageScore: 9, createdAt: '2026-05-02T00:00:00.000Z' }),
      mkRec({ id: 'r2', leverageScore: 7, createdAt: '2026-05-03T00:00:00.000Z' }),
      mkRec({ id: 'r3', leverageScore: 9, createdAt: '2026-05-01T00:00:00.000Z' }),
      mkRec({ id: 'r4', leverageScore: 5, createdAt: '2026-05-04T00:00:00.000Z' }),
      mkRec({ id: 'r5', leverageScore: 8, createdAt: '2026-05-05T00:00:00.000Z' }),
      mkRec({ id: 'r6', leverageScore: 3, createdAt: '2026-05-06T00:00:00.000Z' }),
      mkRec({ id: 'r7', leverageScore: 2, createdAt: '2026-05-07T00:00:00.000Z' }),
      mkRec({ id: 'r8', leverageScore: 1, createdAt: '2026-05-08T00:00:00.000Z' }),
    ];
    const packet = synthesizeContextPacket(
      'review',
      { recommendations: recs, evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(packet.recommendations).toHaveLength(5);
    // r3 (9, 05-01) > r1 (9, 05-02) > r5 (8) > r2 (7) > r4 (5); r6/r7/r8 omitted.
    expect(packet.recommendations.map((r) => r.id)).toEqual(['r3', 'r1', 'r5', 'r2', 'r4']);
    expect(packet.totals.recommendationsOmitted).toBe(3);
  });

  it('emits needsAttention bucket (rescored + sorted; no TOP_N cap)', () => {
    // 3 ranked + 7 needsAttention (superseded/contradicted).
    const ranked: Recommendation[] = [
      mkRec({ id: 'r1', leverageScore: 5 }),
      mkRec({ id: 'r2', leverageScore: 4 }),
      mkRec({ id: 'r3', leverageScore: 3 }),
    ];
    const attn: Recommendation[] = [
      mkRec({ id: 'a1', leverageScore: 9, decayState: 'superseded', createdAt: '2026-05-02T00:00:00.000Z' }),
      mkRec({ id: 'a2', leverageScore: 9, decayState: 'contradicted', createdAt: '2026-05-01T00:00:00.000Z' }),
      mkRec({ id: 'a3', leverageScore: 7, decayState: 'superseded' }),
      mkRec({ id: 'a4', leverageScore: 6, decayState: 'contradicted' }),
      mkRec({ id: 'a5', leverageScore: 5, decayState: 'superseded' }),
      mkRec({ id: 'a6', leverageScore: 4, decayState: 'contradicted' }),
      mkRec({ id: 'a7', leverageScore: 3, decayState: 'superseded' }),
    ];
    const packet = synthesizeContextPacket(
      'review',
      {
        recommendations: [...ranked, ...attn],
        evidence: [],
        assumptions: [],
        decisions: [],
        backend: noBackend,
      },
      NOW,
    );
    expect(packet.needsAttention).toBeDefined();
    expect(packet.needsAttention).toHaveLength(7);
    // First two tie on raw=9; createdAt asc breaks the tie → a2 then a1.
    expect(packet.needsAttention!.map((r) => r.id)).toEqual([
      'a2', 'a1', 'a3', 'a4', 'a5', 'a6', 'a7',
    ]);
    // Verify scores are sorted descending.
    const scores = packet.needsAttention!.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('emits needsAttention: [] (always present for review, even when empty)', () => {
    const recs: Recommendation[] = [
      mkRec({ id: 'r1', leverageScore: 5 }),
    ];
    const packet = synthesizeContextPacket(
      'review',
      { recommendations: recs, evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(packet.needsAttention).toBeDefined();
    expect(packet.needsAttention).toEqual([]);
  });

  it('does NOT emit needsAttention for phase or handoff scopes', () => {
    const recs: Recommendation[] = [
      mkRec({ id: 'r1', leverageScore: 5 }),
      mkRec({ id: 'a1', leverageScore: 9, decayState: 'superseded' }),
    ];
    const phase = synthesizeContextPacket(
      'phase',
      { recommendations: recs, evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(phase.needsAttention).toBeUndefined();
    const handoff = synthesizeContextPacket(
      'handoff',
      { recommendations: recs, evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(handoff.needsAttention).toBeUndefined();
  });

  it('includes ALL open assumptions (broad — reviewer audits all)', () => {
    const recs: Recommendation[] = [
      mkRec({ id: 'r1', leverageScore: 5 }),
    ];
    const assumptions: Assumption[] = [
      mkAs({ id: 'a1', recommendationId: 'r1', text: 'open tied to selected' }),
      mkAs({ id: 'a2', recommendationId: 'r-unselected', text: 'open tied to UNselected' }),
      mkAs({ id: 'a3', recommendationId: 'r-attn', text: 'open tied to attn' }),
      mkAs({ id: 'a4', recommendationId: 'r1', text: 'closed', status: 'validated' }),
    ];
    const packet = synthesizeContextPacket(
      'review',
      { recommendations: recs, evidence: [], assumptions, decisions: [], backend: noBackend },
      NOW,
    );
    // All OPEN assumptions, regardless of which rec they tie to.
    expect(packet.assumptions.map((a) => a.id).sort()).toEqual(['a1', 'a2', 'a3']);
  });

  it('includes ALL decisions (tied + untied) — reviewer audits rationale', () => {
    const recs: Recommendation[] = [
      mkRec({ id: 'r1', leverageScore: 5 }),
    ];
    const decisions: IntelligenceDecision[] = [
      mkDec({ id: 'd1', recommendationId: 'r1', title: 'tied selected' }),
      mkDec({ id: 'd2', recommendationId: 'r-other', title: 'tied unselected' }),
      mkDec({ id: 'd3', title: 'untied' }),
    ];
    const packet = synthesizeContextPacket(
      'review',
      { recommendations: recs, evidence: [], assumptions: [], decisions, backend: noBackend },
      NOW,
    );
    expect(packet.decisions.map((d) => d.id).sort()).toEqual(['d1', 'd2', 'd3']);
  });

  it('files = dedup affectedFiles ∪ evidence paths from (selected ∪ needsAttention)', () => {
    const recs: Recommendation[] = [
      mkRec({
        id: 'r-sel',
        leverageScore: 5,
        affectedFiles: ['src/sel.ts', 'src/shared.ts'],
      }),
      mkRec({
        id: 'r-attn',
        leverageScore: 9,
        decayState: 'superseded',
        affectedFiles: ['src/attn.ts', 'src/shared.ts'],
      }),
      mkRec({
        id: 'r-other-attn',
        leverageScore: 8,
        decayState: 'contradicted',
        affectedFiles: ['src/other.ts'],
      }),
    ];
    const evidence: Evidence[] = [
      { id: 'ev-sel', recommendationId: 'r-sel', kind: 'file', summary: 's', path: 'src/ev-sel.ts', createdAt: NOW.toISOString() },
      { id: 'ev-attn', recommendationId: 'r-attn', kind: 'file', summary: 's', path: 'src/ev-attn.ts', createdAt: NOW.toISOString() },
      { id: 'ev-unrelated', recommendationId: 'r-not-in-packet', kind: 'file', summary: 's', path: 'src/ev-skip.ts', createdAt: NOW.toISOString() },
    ];
    const packet = synthesizeContextPacket(
      'review',
      { recommendations: recs, evidence, assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    const paths = packet.files.map((f) => f.path);
    // Both selected-rec affectedFiles AND attn-rec affectedFiles present, deduped.
    expect(paths).toContain('src/sel.ts');
    expect(paths).toContain('src/shared.ts');
    expect(paths).toContain('src/attn.ts');
    expect(paths).toContain('src/other.ts');
    expect(paths).toContain('src/ev-sel.ts');
    expect(paths).toContain('src/ev-attn.ts');
    // shared.ts appears once (dedup).
    expect(paths.filter((p) => p === 'src/shared.ts')).toHaveLength(1);
    // Evidence whose rec is not in packet must be excluded.
    expect(paths).not.toContain('src/ev-skip.ts');
    // Every why is oneLine'd (no newlines).
    for (const f of packet.files) {
      expect(f.why).not.toMatch(/[\r\n]/);
    }
  });
});

// Slice-7 fixture-neutralization audit (Slice-6 meta-lesson applied):
//   the `agent` filter keys off rec.status + rec.readiness. Every fixture in this
//   block sets BOTH explicitly — never relying on mkRec defaults
//   (status='candidate', readiness='raw-idea' at the time of writing, which
//   happen to EXCLUDE-by-default; a future bump could silently flip that). The
//   boundary test below pins both halves of the filter so exact-array toEqual
//   goldens stay deterministic regardless of default churn.
describe('synthesizeContextPacket — agent scope (Slice 7)', () => {
  function mkAs(p: Partial<Assumption> = {}): Assumption {
    return {
      id: 'as-x',
      recommendationId: 'rec-x',
      text: 't',
      status: 'open',
      createdAt: '2026-05-18T00:00:00.000Z',
      ...p,
    };
  }
  function mkDec(p: Partial<IntelligenceDecision> = {}): IntelligenceDecision {
    return {
      id: 'dec-x',
      title: 't',
      rationale: 'r',
      status: 'active',
      decidedAt: '2026-05-18T00:00:00.000Z',
      ...p,
    };
  }
  function mkEv(p: Partial<Evidence> = {}): Evidence {
    return {
      id: 'ev-x',
      recommendationId: 'rec-x',
      kind: 'note',
      summary: 's',
      createdAt: '2026-05-18T00:00:00.000Z',
      ...p,
    };
  }

  it('selects TOP_N_AGENT=3 from ranked ∩ accepted ∩ ready-*', () => {
    // Scoring: raw = leverageScore + STATUS_PTS[status] + READINESS_PTS[readiness] + DECAY_PTS[fresh=4]
    //   STATUS_PTS: accepted=6, candidate=0; READINESS_PTS: ready-for-milestone=7,
    //   ready-for-cadence-spec=10, needs-evidence=1, raw-idea=0.
    // r1: 10+6+7+4=27 (1st); r2: 6+6+10+4=26 (2nd); r3: 8+6+7+4=25 (3rd);
    // r4: 7+6+7+4=24 (4th — filtered IN by isAgentReady but TOP_N=3 caps it out);
    // r5: 10+6+1+4=21 (filtered OUT — needs-evidence not ready);
    // r6: 10+0+7+4=21 (filtered OUT — candidate not accepted).
    const recs: Recommendation[] = [
      mkRec({ id: 'r1', status: 'accepted',  readiness: 'ready-for-milestone',     leverageScore: 10 }),
      mkRec({ id: 'r2', status: 'accepted',  readiness: 'ready-for-cadence-spec',  leverageScore: 6  }),
      mkRec({ id: 'r3', status: 'accepted',  readiness: 'ready-for-milestone',     leverageScore: 8  }),
      mkRec({ id: 'r4', status: 'accepted',  readiness: 'ready-for-milestone',     leverageScore: 7  }),
      mkRec({ id: 'r5', status: 'accepted',  readiness: 'needs-evidence',          leverageScore: 10 }),
      mkRec({ id: 'r6', status: 'candidate', readiness: 'ready-for-milestone',     leverageScore: 10 }),
    ];
    const packet = synthesizeContextPacket(
      'agent',
      { recommendations: recs, evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(packet.recommendations.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(packet.totals.recommendationsOmitted).toBe(1); // r4 ready-but-uncapped
  });

  it('boundary: includes ready-for-milestone AND ready-for-cadence-spec; excludes others', () => {
    // Pin both halves of the filter: same status, varying readiness.
    const recs: Recommendation[] = [
      mkRec({ id: 'inc-mil',  status: 'accepted', readiness: 'ready-for-milestone',    leverageScore: 5 }),
      mkRec({ id: 'inc-spec', status: 'accepted', readiness: 'ready-for-cadence-spec', leverageScore: 5 }),
      mkRec({ id: 'ex-need',  status: 'accepted', readiness: 'needs-evidence',         leverageScore: 5 }),
      mkRec({ id: 'ex-blkd',  status: 'accepted', readiness: 'blocked',                leverageScore: 5 }),
      mkRec({ id: 'ex-raw',   status: 'accepted', readiness: 'raw-idea',               leverageScore: 5 }),
      mkRec({ id: 'ex-dec',   status: 'accepted', readiness: 'needs-decision',         leverageScore: 5 }),
    ];
    const packet = synthesizeContextPacket(
      'agent',
      { recommendations: recs, evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(packet.recommendations.map((r) => r.id).sort()).toEqual(['inc-mil', 'inc-spec']);
  });

  it('assumptions = open ∧ tied to selected (top-3) recs', () => {
    // 4 ready-accepted recs (r1..r4); TOP_N_AGENT=3 → r4 is filtered out by cap.
    // Equal leverageScore + same readiness → tie broken by createdAt asc.
    const recs: Recommendation[] = [
      mkRec({ id: 'r1', status: 'accepted', readiness: 'ready-for-milestone', leverageScore: 5, createdAt: '2026-05-01T00:00:00.000Z' }),
      mkRec({ id: 'r2', status: 'accepted', readiness: 'ready-for-milestone', leverageScore: 5, createdAt: '2026-05-02T00:00:00.000Z' }),
      mkRec({ id: 'r3', status: 'accepted', readiness: 'ready-for-milestone', leverageScore: 5, createdAt: '2026-05-03T00:00:00.000Z' }),
      mkRec({ id: 'r4', status: 'accepted', readiness: 'ready-for-milestone', leverageScore: 5, createdAt: '2026-05-04T00:00:00.000Z' }),
    ];
    const assumptions: Assumption[] = [
      mkAs({ id: 'as-tied-1', recommendationId: 'r1', text: 'open tied to selected' }),
      mkAs({ id: 'as-tied-2', recommendationId: 'r3', text: 'open tied to selected' }),
      mkAs({ id: 'as-untied-r4', recommendationId: 'r4', text: 'open tied to UNselected (capped out)' }),
      mkAs({ id: 'as-foreign',   recommendationId: 'r-foreign', text: 'open tied to non-existent' }),
      mkAs({ id: 'as-closed',    recommendationId: 'r1', text: 'closed', status: 'validated' }),
    ];
    const packet = synthesizeContextPacket(
      'agent',
      { recommendations: recs, evidence: [], assumptions, decisions: [], backend: noBackend },
      NOW,
    );
    expect(packet.assumptions.map((a) => a.id).sort()).toEqual(['as-tied-1', 'as-tied-2']);
  });

  it('decisions = tied to selected (top-3) recs only', () => {
    const recs: Recommendation[] = [
      mkRec({ id: 'r1', status: 'accepted', readiness: 'ready-for-milestone', leverageScore: 5, createdAt: '2026-05-01T00:00:00.000Z' }),
      mkRec({ id: 'r2', status: 'accepted', readiness: 'ready-for-milestone', leverageScore: 5, createdAt: '2026-05-02T00:00:00.000Z' }),
      mkRec({ id: 'r3', status: 'accepted', readiness: 'ready-for-milestone', leverageScore: 5, createdAt: '2026-05-03T00:00:00.000Z' }),
      mkRec({ id: 'r4', status: 'accepted', readiness: 'ready-for-milestone', leverageScore: 5, createdAt: '2026-05-04T00:00:00.000Z' }),
    ];
    const decisions: IntelligenceDecision[] = [
      mkDec({ id: 'd-tied-r1', recommendationId: 'r1', title: 'tied selected' }),
      mkDec({ id: 'd-tied-r4', recommendationId: 'r4', title: 'tied capped-out' }),
      mkDec({ id: 'd-untied',  title: 'untied' }),
    ];
    const packet = synthesizeContextPacket(
      'agent',
      { recommendations: recs, evidence: [], assumptions: [], decisions, backend: noBackend },
      NOW,
    );
    expect(packet.decisions.map((d) => d.id)).toEqual(['d-tied-r1']);
  });

  it('files = from selected (top-3) recs only (no needsAttention contribution)', () => {
    // 3 selected ready-accepted recs + 1 needsAttention rec (superseded).
    // needsAttention is NOT a contributing source for agent files (unlike review).
    const recs: Recommendation[] = [
      mkRec({ id: 'r1', status: 'accepted', readiness: 'ready-for-milestone', leverageScore: 5,
        affectedFiles: ['src/r1.ts', 'src/shared.ts'],
        createdAt: '2026-05-01T00:00:00.000Z' }),
      mkRec({ id: 'r2', status: 'accepted', readiness: 'ready-for-milestone', leverageScore: 5,
        affectedFiles: ['src/r2.ts', 'src/shared.ts'],
        createdAt: '2026-05-02T00:00:00.000Z' }),
      mkRec({ id: 'r3', status: 'accepted', readiness: 'ready-for-milestone', leverageScore: 5,
        affectedFiles: ['src/r3.ts'],
        createdAt: '2026-05-03T00:00:00.000Z' }),
      mkRec({ id: 'r-attn', status: 'accepted', readiness: 'ready-for-milestone', leverageScore: 9,
        decayState: 'superseded',
        affectedFiles: ['src/attn.ts'],
        createdAt: '2026-05-04T00:00:00.000Z' }),
    ];
    const evidence: Evidence[] = [
      mkEv({ id: 'ev-r1',   recommendationId: 'r1',     kind: 'file', path: 'src/ev-r1.ts' }),
      mkEv({ id: 'ev-attn', recommendationId: 'r-attn', kind: 'file', path: 'src/ev-attn.ts' }),
    ];
    const packet = synthesizeContextPacket(
      'agent',
      { recommendations: recs, evidence, assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    const paths = packet.files.map((f) => f.path);
    // Only selected (top-3 ranked) rec files + their evidence paths.
    expect(paths).toContain('src/r1.ts');
    expect(paths).toContain('src/r2.ts');
    expect(paths).toContain('src/r3.ts');
    expect(paths).toContain('src/shared.ts');
    expect(paths).toContain('src/ev-r1.ts');
    // shared.ts deduped.
    expect(paths.filter((p) => p === 'src/shared.ts')).toHaveLength(1);
    // needsAttention rec's files MUST be excluded (agent ≠ review).
    expect(paths).not.toContain('src/attn.ts');
    expect(paths).not.toContain('src/ev-attn.ts');
  });

  it('emits empty packet honestly when no recs match (no throw)', () => {
    const recs: Recommendation[] = [
      mkRec({ id: 'a', status: 'accepted',  readiness: 'needs-evidence',      leverageScore: 5 }),
      mkRec({ id: 'b', status: 'candidate', readiness: 'ready-for-milestone', leverageScore: 5 }),
    ];
    const packet = synthesizeContextPacket(
      'agent',
      { recommendations: recs, evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect(packet.recommendations).toEqual([]);
    expect(packet.totals.recommendations).toBe(0);
    expect(packet.needsAttention).toBeUndefined();
  });

  it('never emits needsAttention field for agent scope', () => {
    const recs: Recommendation[] = [
      // Ranked + agent-ready.
      mkRec({ id: 'r1', status: 'accepted', readiness: 'ready-for-milestone', leverageScore: 5 }),
      // partition→needsAttention (superseded). Filtered out of ranked by partitionLedger.
      mkRec({ id: 'a1', status: 'accepted', readiness: 'ready-for-milestone', leverageScore: 9, decayState: 'superseded' }),
    ];
    const packet = synthesizeContextPacket(
      'agent',
      { recommendations: recs, evidence: [], assumptions: [], decisions: [], backend: noBackend },
      NOW,
    );
    expect('needsAttention' in packet).toBe(false);
  });
});

// AC-5 (Slice 7 design doc): byte-stability regression guard for the frozen
// phase + handoff scopes. Intentionally redundant with the per-scope
// needsAttention-absence assertions in the review (Slice 7) and agent (Slice 7)
// describe blocks — belt-and-suspenders per Decision-Log #7. Lives in a
// dedicated block so a future maintainer grep'ing for "AC-5" lands here.
describe('byte-stability regression — phase + handoff frozen (Slice 7 / AC-5)', () => {
  // Deterministic fixture: 3 ranked recs (scores 48 / 45 / 42 — see score
  // table in recommend.ts), 1 evidence, 1 open assumption, 1 decision, 2
  // affectedFile contributions, plus one superseded rec to confirm the frozen
  // scopes never expose needsAttention.
  const fixedNow = new Date('2026-05-18T00:00:00.000Z');
  const isoNow = '2026-05-18T00:00:00.000Z';
  const sources = {
    recommendations: [
      mkRec({ id: 'rec-a', leverageScore: 5, affectedFiles: ['src/a.ts'] }),
      mkRec({ id: 'rec-b', leverageScore: 3 }),
      mkRec({ id: 'rec-c', leverageScore: 1 }),
      // partition → needsAttention (superseded); MUST NOT leak into phase/handoff.
      mkRec({ id: 'rec-attn', leverageScore: 9, decayState: 'superseded' as const }),
    ],
    evidence: [
      { id: 'ev-1', recommendationId: 'rec-a', kind: 'file' as const, summary: 'e', path: 'src/b.ts', createdAt: isoNow },
    ],
    assumptions: [
      { id: 'as-1', recommendationId: 'rec-a', text: 'open one', status: 'open' as const, createdAt: isoNow },
    ],
    decisions: [
      { id: 'dec-1', recommendationId: 'rec-a', title: 'tied', rationale: 'r', status: 'active', decidedAt: isoNow },
    ],
    backend: noBackend,
  };

  it('phase JSON has no needsAttention key (regression: Slice 7 must not pollute frozen scopes)', () => {
    const packet = synthesizeContextPacket('phase', sources, fixedNow);
    expect('needsAttention' in packet).toBe(false);
  });

  it('handoff JSON has no needsAttention key', () => {
    const packet = synthesizeContextPacket('handoff', sources, fixedNow);
    expect('needsAttention' in packet).toBe(false);
  });

  it('agent JSON has no needsAttention key', () => {
    const packet = synthesizeContextPacket('agent', sources, fixedNow);
    expect('needsAttention' in packet).toBe(false);
  });

  it('phase packet matches frozen golden (full byte-equality)', () => {
    const packet = synthesizeContextPacket('phase', sources, fixedNow);
    expect(packet).toEqual({
      schemaVersion: 1,
      scope: 'phase',
      generatedAt: isoNow,
      loop: { present: false },
      recommendations: [
        { id: 'rec-a', title: 't', score: 48, status: 'candidate', readiness: 'raw-idea', priority: 'low' },
        { id: 'rec-b', title: 't', score: 45, status: 'candidate', readiness: 'raw-idea', priority: 'low' },
        { id: 'rec-c', title: 't', score: 42, status: 'candidate', readiness: 'raw-idea', priority: 'low' },
      ],
      assumptions: [
        { id: 'as-1', recommendationId: 'rec-a', text: 'open one', status: 'open' },
      ],
      decisions: [
        { id: 'dec-1', recommendationId: 'rec-a', title: 'tied', rationale: 'r', status: 'active' },
      ],
      files: [
        { path: 'src/a.ts', why: 'affected by rec-a t' },
        { path: 'src/b.ts', why: 'evidence ev-1' },
      ],
      totals: {
        recommendations: 3,
        assumptions: 1,
        decisions: 1,
        files: 2,
        recommendationsOmitted: 0,
      },
    });
  });

  it('handoff packet matches frozen golden (full byte-equality)', () => {
    const packet = synthesizeContextPacket('handoff', sources, fixedNow);
    expect(packet).toEqual({
      schemaVersion: 1,
      scope: 'handoff',
      generatedAt: isoNow,
      loop: { present: false },
      recommendations: [
        { id: 'rec-a', title: 't', score: 48, status: 'candidate', readiness: 'raw-idea', priority: 'low' },
        { id: 'rec-b', title: 't', score: 45, status: 'candidate', readiness: 'raw-idea', priority: 'low' },
        { id: 'rec-c', title: 't', score: 42, status: 'candidate', readiness: 'raw-idea', priority: 'low' },
      ],
      assumptions: [
        { id: 'as-1', recommendationId: 'rec-a', text: 'open one', status: 'open' },
      ],
      decisions: [
        { id: 'dec-1', recommendationId: 'rec-a', title: 'tied', rationale: 'r', status: 'active' },
      ],
      files: [
        { path: 'src/a.ts', why: 'affected by rec-a t' },
        { path: 'src/b.ts', why: 'evidence ev-1' },
      ],
      totals: {
        recommendations: 3,
        assumptions: 1,
        decisions: 1,
        files: 2,
        recommendationsOmitted: 0,
      },
    });
  });
});

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('runContext', () => {
  it('writes context/<scope>.{json,md} and returns the packet', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ctx' });
    const packet = await runContext(active.root, 'phase', new Date('2026-05-18T00:00:00.000Z'));
    expect(packet.scope).toBe('phase');

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'phase.json'),
      'utf8',
    );
    expect(() => ContextPacketZ.parse(JSON.parse(jsonRaw))).not.toThrow();

    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'phase.md'),
      'utf8',
    );
    expect(md).toMatch(/# CADENCE Context Packet — phase/);
  });

  it('degrades cleanly with no .cadence backend', async () => {
    active = await tempRepo({ initialized: false });
    const packet = await runContext(active.root, 'handoff');
    expect(packet.loop.present).toBe(false);
    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'handoff.json'),
      'utf8',
    );
    expect(() => ContextPacketZ.parse(JSON.parse(jsonRaw))).not.toThrow();
    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'handoff.md'),
      'utf8',
    );
    expect(md).toMatch(/# CADENCE Context Packet — handoff/);
  });
});

describe('Slice-5/7 packets densify on intake (Slice 8 AC-11)', () => {
  it('handoff scope: 2 assumptions + 1 decision appear after intake; no context.ts/render-context.ts change needed', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const rec = await addRecommendation(active.root, {
      title: 'seed', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    // Pre-intake: handoff packet has zero assumptions + zero decisions
    const before = synthesizeContextPacket(
      'handoff',
      {
        recommendations: [rec],
        evidence: [],
        assumptions: [],
        decisions: [],
        backend: { present: false, kind: null, legalActions: [] },
      },
      new Date('2026-05-20T00:00:00.000Z'),
    );
    expect(before.assumptions).toHaveLength(0);
    expect(before.decisions).toHaveLength(0);
    // Run intake writers
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A1' });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A2' });
    await addIntelligenceDecision(active.root, {
      recommendationId: rec.id, title: 'D1', rationale: 'r',
    });
    // runContext reads the ledgers we just populated
    const after = await runContext(active.root, 'handoff', new Date('2026-05-20T00:00:00.000Z'));
    expect(after.assumptions).toHaveLength(2);
    expect(after.decisions).toHaveLength(1);
  });

  it('Slice 9 AC-11: validated assumption disappears from handoff packet assumptions[]', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const rec = await addRecommendation(active.root, {
      title: 'seed', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const a1 = await addAssumption(active.root, { recommendationId: rec.id, text: 'A1' });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A2' });
    // Pre-transition: handoff packet has 2 assumptions
    const before = await runContext(
      active.root,
      'handoff',
      new Date('2026-05-20T00:00:00.000Z'),
    );
    expect(before.assumptions).toHaveLength(2);
    // Validate one
    const res = await runAssumptionTransition(active.root, a1.id, 'validate');
    expect(res.ok).toBe(true);
    // Post-transition: handoff packet has 1 (validated one is gone via Slice-5 status==='open' filter)
    const after = await runContext(
      active.root,
      'handoff',
      new Date('2026-05-20T00:00:00.000Z'),
    );
    expect(after.assumptions).toHaveLength(1);
    expect(after.assumptions[0]!.text).toBe('A2');
  });

  it('Slice 10 AC-6: reopened assumption re-enters handoff packet assumptions[]', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice10' });
    const rec = await addRecommendation(active.root, {
      title: 'seed', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const a1 = await addAssumption(active.root, { recommendationId: rec.id, text: 'A1' });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A2' });
    // Pre: 2 open assumptions
    const before = await runContext(
      active.root,
      'handoff',
      new Date('2026-05-20T00:00:00.000Z'),
    );
    expect(before.assumptions).toHaveLength(2);
    // Validate a1 → drops to 1
    const v = await runAssumptionTransition(active.root, a1.id, 'validate');
    expect(v.ok).toBe(true);
    const mid = await runContext(
      active.root,
      'handoff',
      new Date('2026-05-20T00:00:00.000Z'),
    );
    expect(mid.assumptions).toHaveLength(1);
    expect(mid.assumptions[0]!.text).toBe('A2');
    // Reopen a1 → rises back to 2 (Slice-5 status==='open' filter re-admits it)
    const r = await runAssumptionTransition(active.root, a1.id, 'reopen');
    expect(r.ok).toBe(true);
    const after = await runContext(
      active.root,
      'handoff',
      new Date('2026-05-20T00:00:00.000Z'),
    );
    expect(after.assumptions).toHaveLength(2);
    expect(after.assumptions.map((a) => a.text).sort()).toEqual(['A1', 'A2']);
  });
});
