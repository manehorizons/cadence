import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Assumption,
  BackendStatus,
  ContextPacket,
  ContextRec,
  ContextScope,
  Evidence,
  IntelligenceDecision,
  Recommendation,
} from '@manehorizons/cadence-types';
import { ContextPacketZ } from '@manehorizons/cadence-types';
import { atomicWriteJSON, atomicWriteText } from '../state/atomic-write.js';
import { partitionLedger, scoreRecommendation } from './recommend.js';
import { intelligenceDir } from './store/paths.js';
import {
  readAssumptionLedger,
  readEvidenceLedger,
  readIntelligenceDecisionLedger,
  readRecommendationLedger,
} from './store/io.js';
import { cadenceBackend } from './backend/cadence.js';
import { renderContextMd } from './render-context.js';

const TOP_N_PHASE = 7;
const TOP_N_HANDOFF = 5;
const TOP_N_REVIEW = 5; // Slice 7 — review scope ranked rec cap
const TOP_N_AGENT = 3; // Slice 7 — agent scope cap over filtered ready-accepted bucket

/** Agent scope rec gate: ledger-ranked rec must be reviewer-accepted AND
 *  signed-off as ready for execution (milestone proposal or spec authoring).
 *  Module-private; mirrors the per-module-private convention used by oneLine
 *  and compareScored. */
function isAgentReady(rec: Recommendation): boolean {
  return (
    rec.status === 'accepted' &&
    (rec.readiness === 'ready-for-milestone' ||
      rec.readiness === 'ready-for-cadence-spec')
  );
}

/** Collapse CR/LF runs to a single space so ledger free text cannot break the
 *  Markdown packet structure. Module-private by design: the Slice-4b oneLine is
 *  not exported; mirror the per-module-private convention. */
function oneLine(s: string): string {
  return s.replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

/** Shared comparator for scored recommendations: score desc, then createdAt asc,
 *  then id asc. Module-private; recommend.ts has its own analogous comparator
 *  (out of scope for this extraction). */
function compareScored<T extends { rec: Recommendation; raw: number }>(a: T, b: T): number {
  if (b.raw !== a.raw) return b.raw - a.raw;
  if (a.rec.createdAt !== b.rec.createdAt) {
    return a.rec.createdAt < b.rec.createdAt ? -1 : 1;
  }
  return a.rec.id < b.rec.id ? -1 : a.rec.id > b.rec.id ? 1 : 0;
}

/** Project a scored Recommendation into the ContextPacket's ContextRec shape.
 *  Module-private; mirrors the oneLine convention. */
function toContextRec(rec: Recommendation, score: number): ContextRec {
  const out: ContextRec = {
    id: rec.id,
    title: oneLine(rec.title),
    score,
    status: rec.status,
    readiness: rec.readiness,
    priority: rec.priority,
  };
  if (rec.suggestedBackendAction) {
    out.suggestedBackendAction = oneLine(rec.suggestedBackendAction);
  }
  return out;
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
  const { ranked, needsAttention: attnBucket } = partitionLedger(sources.recommendations);

  const scored = ranked
    .map((rec) => ({ rec, ...scoreRecommendation(rec) }))
    .sort(compareScored);

  let selected: typeof scored;
  let recommendationsOmitted: number;

  if (scope === 'agent') {
    // Agent scope filters first (status+readiness gate), then caps.
    const ready = scored.filter((s) => isAgentReady(s.rec));
    selected = ready.slice(0, TOP_N_AGENT);
    recommendationsOmitted = Math.max(0, ready.length - TOP_N_AGENT);
  } else {
    const n =
      scope === 'phase' ? TOP_N_PHASE :
      scope === 'review' ? TOP_N_REVIEW :
      /* handoff */ TOP_N_HANDOFF;
    selected = scored.slice(0, n);
    recommendationsOmitted = Math.max(0, scored.length - n);
  }

  const recommendations: ContextRec[] = selected.map((s) => toContextRec(s.rec, s.score));

  // needsAttention bucket — review scope only. Rescored + sorted (score desc,
  // createdAt asc, id asc); no TOP_N cap. Always present (possibly []) for
  // review; absent for other scopes (Decision-Log #7).
  const needsAttention: ContextRec[] | undefined =
    scope === 'review'
      ? attnBucket
          .map((rec) => ({ rec, ...scoreRecommendation(rec) }))
          .sort(compareScored)
          .map((s) => toContextRec(s.rec, s.score))
      : undefined;

  const selectedIds = new Set(selected.map((s) => s.rec.id));
  const inScope = (recommendationId: string): boolean =>
    scope === 'handoff' || scope === 'review' || selectedIds.has(recommendationId);

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
    .filter(
      (d) =>
        d.status === 'active' &&
        ((scope === 'handoff' || scope === 'review')
          ? true
          : d.recommendationId !== undefined && selectedIds.has(d.recommendationId)),
    )
    .map((d) => {
      const out: ContextPacket['decisions'][number] = {
        id: d.id,
        title: oneLine(d.title),
        rationale: oneLine(d.rationale),
        status: 'active' as const,
      };
      if (d.recommendationId !== undefined) out.recommendationId = d.recommendationId;
      return out;
    });

  let fileRecs: Recommendation[];
  if (scope === 'handoff') {
    fileRecs = scored.map((s) => s.rec);
  } else if (scope === 'review') {
    // selected ranked recs + every needsAttention rec
    fileRecs = [...selected.map((s) => s.rec), ...attnBucket];
  } else {
    fileRecs = selected.map((s) => s.rec);
  }
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
    ...(needsAttention !== undefined ? { needsAttention } : {}),
    totals: {
      recommendations: recommendations.length,
      assumptions: assumptions.length,
      decisions: decisions.length,
      files: files.length,
      recommendationsOmitted,
    },
  });
}

export async function runContext(
  root: string,
  scope: ContextScope,
  now: Date = new Date(),
): Promise<ContextPacket> {
  const [recLedger, evLedger, asLedger, decLedger, backend] = await Promise.all([
    readRecommendationLedger(root),
    readEvidenceLedger(root),
    readAssumptionLedger(root),
    readIntelligenceDecisionLedger(root),
    cadenceBackend.readStatus(root),
  ]);

  const packet = synthesizeContextPacket(
    scope,
    {
      recommendations: recLedger.recommendations,
      evidence: evLedger.evidence,
      assumptions: asLedger.assumptions,
      decisions: decLedger.decisions,
      backend,
    },
    now,
  );

  const dir = join(intelligenceDir(root), 'context');
  await mkdir(dir, { recursive: true });
  await atomicWriteJSON(join(dir, `${scope}.json`), packet);
  await atomicWriteText(join(dir, `${scope}.md`), renderContextMd(packet));
  return packet;
}
