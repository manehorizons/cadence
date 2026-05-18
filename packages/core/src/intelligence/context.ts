import type {
  Assumption,
  BackendStatus,
  ContextPacket,
  ContextRec,
  ContextScope,
  Evidence,
  IntelligenceDecision,
  Recommendation,
} from '@cadence/types';
import { ContextPacketZ } from '@cadence/types';
import { partitionLedger, scoreRecommendation } from './recommend.js';

const TOP_N_PHASE = 7;
const TOP_N_HANDOFF = 5;

/** Collapse CR/LF runs to a single space so ledger free text cannot break the
 *  Markdown packet structure. Module-private by design: the Slice-4b oneLine is
 *  not exported; mirror the per-module-private convention. */
function oneLine(s: string): string {
  return s.replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

export type ContextSources = {
  recommendations: Recommendation[];
  evidence: Evidence[];
  assumptions: Assumption[];
  decisions: IntelligenceDecision[];
  backend: BackendStatus;
};

export function synthesizeContextPacket(
  scope: ContextScope,
  sources: ContextSources,
  now: Date = new Date(),
): ContextPacket {
  const { ranked } = partitionLedger(sources.recommendations);

  const scored = ranked
    .map((rec) => ({ rec, ...scoreRecommendation(rec) }))
    .sort((a, b) => {
      if (b.raw !== a.raw) return b.raw - a.raw;
      if (a.rec.createdAt !== b.rec.createdAt) {
        return a.rec.createdAt < b.rec.createdAt ? -1 : 1;
      }
      return a.rec.id < b.rec.id ? -1 : a.rec.id > b.rec.id ? 1 : 0;
    });

  const n = scope === 'phase' ? TOP_N_PHASE : TOP_N_HANDOFF;
  const selected = scored.slice(0, n);
  const recommendationsOmitted = Math.max(0, scored.length - n);

  const recommendations: ContextRec[] = selected.map((s) => {
    const rec: ContextRec = {
      id: s.rec.id,
      title: oneLine(s.rec.title),
      score: s.score,
      status: s.rec.status,
      readiness: s.rec.readiness,
      priority: s.rec.priority,
    };
    if (s.rec.suggestedBackendAction) {
      rec.suggestedBackendAction = oneLine(s.rec.suggestedBackendAction);
    }
    return rec;
  });

  const selectedIds = new Set(selected.map((s) => s.rec.id));
  const inScope = (recommendationId: string): boolean =>
    scope === 'handoff' || selectedIds.has(recommendationId);

  const assumptions = sources.assumptions
    .filter((a) => a.status === 'open' && inScope(a.recommendationId))
    .map((a) => ({
      id: a.id,
      recommendationId: a.recommendationId,
      text: oneLine(a.text),
      status: 'open' as const,
    }));

  // Untied decisions (no recommendationId) have no rec linkage, so they cannot use inScope;
  // phase keeps only decisions tied to a selected rec, handoff keeps all.
  const decisions = sources.decisions
    .filter((d) =>
      scope === 'handoff'
        ? true
        : d.recommendationId !== undefined && selectedIds.has(d.recommendationId),
    )
    .map((d) => {
      const out: ContextPacket['decisions'][number] = {
        id: d.id,
        title: oneLine(d.title),
        rationale: oneLine(d.rationale),
      };
      if (d.recommendationId !== undefined) out.recommendationId = d.recommendationId;
      return out;
    });

  const fileRecs = scope === 'handoff' ? scored.map((s) => s.rec) : selected.map((s) => s.rec);
  const fileRecIds = new Set(fileRecs.map((r) => r.id));
  const filesByPath = new Map<string, string>();
  const addFile = (path: string, why: string): void => {
    if (path && !filesByPath.has(path)) filesByPath.set(path, oneLine(why));
  };
  for (const r of fileRecs) {
    for (const f of r.affectedFiles) addFile(f, `affected by ${r.id} ${r.title}`);
  }
  for (const ev of sources.evidence) {
    if (ev.path !== undefined && fileRecIds.has(ev.recommendationId)) {
      addFile(ev.path, `evidence ${ev.id}`);
    }
  }
  const files = [...filesByPath.entries()].map(([path, why]) => ({ path, why }));

  const b = sources.backend;
  const loop: ContextPacket['loop'] = { present: b.present };
  if (b.loopPosition !== undefined) loop.loopPosition = b.loopPosition;
  if (b.activePhase !== undefined) loop.activePhase = b.activePhase;
  if (b.activeDraft !== undefined) loop.activeDraft = b.activeDraft;
  if (b.activeSpec !== undefined) loop.activeSpec = b.activeSpec;
  if (b.tier !== undefined) loop.tier = b.tier;
  const firstAction = b.legalActions[0];
  if (firstAction !== undefined) loop.nextAction = firstAction;
  if (b.stateError !== undefined) loop.stateError = b.stateError;

  return ContextPacketZ.parse({
    schemaVersion: 1,
    scope,
    generatedAt: now.toISOString(),
    loop,
    recommendations,
    assumptions,
    decisions,
    files,
    totals: {
      recommendations: recommendations.length,
      assumptions: assumptions.length,
      decisions: decisions.length,
      files: files.length,
      recommendationsOmitted,
    },
  });
}
