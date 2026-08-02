import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  Assumption,
  HandoffCandidate,
  IntelligenceMilestone,
  MilestoneLedger,
  MilestonePreMortem,
  Recommendation,
  RecommendationDecayState,
  RecommendationReadiness,
  RecommendationStatus,
} from '@thomas-powers-jr/cadence-types';
import {
  readAssumptionLedger,
  readRecommendationLedger,
} from './store/io.js';
import {
  readMilestoneLedger,
  writeMilestoneLedger,
} from './store/milestones.js';
import { atomicWriteText } from '../state/atomic-write.js';
import { cadenceBackend } from './backend/cadence.js';
import { gatherHandoffCandidates } from '../handoff/candidates.js';

const ELIGIBLE_READINESS = new Set<RecommendationReadiness>([
  'ready-for-milestone',
  'ready-for-cadence-spec',
]);

export function isEligible(rec: Recommendation): boolean {
  return (
    rec.status === 'accepted' &&
    ELIGIBLE_READINESS.has(rec.readiness) &&
    rec.decayState !== 'superseded' &&
    rec.decayState !== 'contradicted'
  );
}

const DOC_PATH_RE = /(^|\/)docs\//i;
const DOC_NAME_RE = /(DESIGN|README|CHANGELOG)/i;

function sharedFileDeps(recs: ReadonlyArray<Recommendation>): string[] {
  const byFile = new Map<string, string[]>();
  for (const r of recs) {
    for (const f of r.affectedFiles) {
      const ids = byFile.get(f);
      if (ids) ids.push(r.id);
      else byFile.set(f, [r.id]);
    }
  }
  const out: string[] = [];
  for (const f of [...byFile.keys()].sort()) {
    const ids = byFile.get(f)!;
    if (ids.length >= 2) {
      out.push(
        `Shared file ${f} edited by ${[...ids].sort().join(', ')} — ordering/coordination dependency.`,
      );
    }
  }
  return out;
}

function docDriftRisk(recs: ReadonlyArray<Recommendation>): string[] {
  const docHit = recs.some(
    (r) =>
      r.affectedAreas.includes('docs') ||
      r.affectedFiles.some((f) => DOC_PATH_RE.test(f) || DOC_NAME_RE.test(f)),
  );
  return docHit
    ? ['Milestone touches documentation surfaces — spec/doc drift risk.']
    : [];
}

export function seedPreMortem(recs: Recommendation[]): MilestonePreMortem {
  const likelyFailureModes: string[] = [];
  for (const r of recs
    .filter((r) => r.confidence < 0.5)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    // Raw r.id (NOT oneLine) is intentional — seedPreMortem is the byte-frozen 4a
    // propose-time contract; do NOT route this through oneLine/a shared helper.
    likelyFailureModes.push(
      `Low-confidence input: ${r.id} (confidence ${r.confidence.toFixed(2)}) — assumption may be wrong.`,
    );
  }
  return {
    likelyFailureModes,
    hiddenDependencies: sharedFileDeps(recs),
    driftRisks: docDriftRisk(recs),
    outOfScope: [],
  };
}

const LEV_LOW = 3;
const RISK_HIGH = 7;

// Phase 201: operator-authored `likelyFailureModes`/`hiddenDependencies` entries are
// marked with this prefix so `deepenPreMortem` can pass them through verbatim on every
// subsequent refresh, the same way `outOfScope` already survives untouched today.
const OPERATOR_ENTRY_PREFIX = '[operator] ';

export function markOperatorEntry(text: string): string {
  return `${OPERATOR_ENTRY_PREFIX}${text}`;
}

function operatorEntries(entries: readonly string[]): string[] {
  return entries.filter((e) => e.startsWith(OPERATOR_ENTRY_PREFIX));
}

function dedupAppend(base: readonly string[], additions: readonly string[]): string[] {
  const out = [...base];
  for (const a of additions) {
    if (!out.includes(a)) out.push(a);
  }
  return out;
}

const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, ' ').trim();
const byIdAsc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const DECAYED_STATES = new Set<RecommendationDecayState>([
  'superseded',
  'contradicted',
  'stale',
  'needs-revalidation',
]);
const ERODED_STATUS = new Set<RecommendationStatus>(['rejected', 'deferred']);
const ERODED_READINESS = new Set<RecommendationReadiness>([
  'blocked',
  'needs-evidence',
  'needs-decision',
]);

export function deepenPreMortem(
  milestone: IntelligenceMilestone,
  recs: ReadonlyArray<Recommendation>,
  assumptions: ReadonlyArray<Assumption>,
  _now: Date = new Date(),
): MilestonePreMortem {
  const byId = new Map(recs.map((r) => [r.id, r]));
  const members: Recommendation[] = [];
  const missingIds: string[] = [];
  for (const rid of milestone.recommendationIds) {
    const r = byId.get(rid);
    if (r) members.push(r);
    else missingIds.push(rid);
  }
  const sorted = [...members].sort((a, b) => byIdAsc(a.id, b.id));

  const openByRec = new Map<string, number>();
  for (const a of assumptions) {
    if (a.status === 'open') {
      openByRec.set(a.recommendationId, (openByRec.get(a.recommendationId) ?? 0) + 1);
    }
  }

  const lowConf = sorted
    .filter((r) => r.confidence < 0.5)
    .map(
      (r) =>
        `Low-confidence input: ${oneLine(r.id)} (confidence ${r.confidence.toFixed(2)}) — assumption may be wrong.`,
    );
  const decayed = sorted
    .filter((r) => DECAYED_STATES.has(r.decayState))
    .map(
      (r) =>
        `Decayed input: ${oneLine(r.id)} (${r.decayState}) — milestone rests on a recommendation that has drifted since propose.`,
    );
  const eroded = sorted
    .filter((r) => ERODED_STATUS.has(r.status) || ERODED_READINESS.has(r.readiness))
    .map(
      (r) =>
        `Eroded input: ${oneLine(r.id)} (status ${r.status}, readiness ${r.readiness}) — no longer cleanly milestone-ready.`,
    );
  const unvalidated = sorted
    .filter((r) => (openByRec.get(r.id) ?? 0) > 0)
    .map(
      (r) =>
        `Unvalidated assumptions: ${oneLine(r.id)} rests on ${openByRec.get(r.id) ?? 0} open assumption(s).`,
    );
  const overestimated = sorted
    .filter(
      (r) =>
        (r.leverageScore <= LEV_LOW && r.riskScore >= RISK_HIGH) ||
        r.evidenceIds.length === 0,
    )
    .map(
      (r) =>
        `Overestimated value: ${oneLine(r.id)} (leverage ${String(r.leverageScore)}, risk ${String(r.riskScore)}, evidence ${String(r.evidenceIds.length)}) — claimed value may be overstated.`,
    );
  const missing = [...missingIds]
    .sort(byIdAsc)
    .map(
      (rid) =>
        `Missing input: ${oneLine(rid)} — member recommendation no longer in ledger (scope erosion).`,
    );

  return {
    likelyFailureModes: [
      ...lowConf,
      ...decayed,
      ...eroded,
      ...unvalidated,
      ...overestimated,
      ...missing,
      ...operatorEntries(milestone.preMortem.likelyFailureModes),
    ],
    hiddenDependencies: [
      ...sharedFileDeps(members),
      ...operatorEntries(milestone.preMortem.hiddenDependencies),
    ],
    driftRisks: docDriftRisk(members),
    outOfScope: milestone.preMortem.outOfScope,
  };
}

const MAX_OBJECTIVE_TITLES = 3;

function sanitize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function bySortedId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Deterministic for a fixed `now` ONLY when `existing` is the unmodified prior output
 * (the survivor block preserves `existing` order). `rawName` for a grouped bucket is the
 * first-seen `suggestedMilestoneId` among recs sanitizing to the same slug; callers should
 * normalize labels upstream if canonical casing matters.
 */
export function clusterMilestones(
  recs: Recommendation[],
  existing: IntelligenceMilestone[],
  now: Date = new Date(),
): IntelligenceMilestone[] {
  const ts = now.toISOString();

  const survivors = existing.filter((m) => m.status !== 'proposed');
  const survivorIds = new Set(survivors.map((m) => m.id));
  const claimed = new Set<string>();
  for (const m of survivors) {
    for (const id of m.recommendationIds) claimed.add(id);
  }
  const priorProposedCreatedAt = new Map<string, string>();
  for (const m of existing) {
    if (m.status === 'proposed') priorProposedCreatedAt.set(m.id, m.createdAt);
  }

  const pool = recs.filter((r) => isEligible(r) && !claimed.has(r.id));

  // bucket key -> { key, raw suggestedMilestoneId | null, recs }
  type Bucket = { id: string; rawName: string | null; recs: Recommendation[] };
  const buckets = new Map<string, Bucket>();
  for (const r of pool) {
    const sug = r.suggestedMilestoneId ?? '';
    const slug = sanitize(sug);
    const id = slug ? `mil-grp-${slug}` : `mil-rec-${r.id}`;
    const rawName = slug ? sug : null;
    const b = buckets.get(id);
    if (b) b.recs.push(r);
    else buckets.set(id, { id, rawName, recs: [r] });
  }

  const fresh: IntelligenceMilestone[] = [];
  for (const id of [...buckets.keys()].sort()) {
    if (survivorIds.has(id)) continue;
    const b = buckets.get(id)!;
    const sorted = [...b.recs].sort((x, y) =>
      x.createdAt !== y.createdAt
        ? x.createdAt < y.createdAt
          ? -1
          : 1
        : bySortedId(x, y),
    );
    // Each bucket is constructed with >=1 rec, so head is always defined;
    // the non-null assertion is required under `noUncheckedIndexedAccess`
    // (the mirrored recommend.ts guards `[0]` access the same way).
    const head = sorted[0]!;
    const grouped = b.rawName !== null;
    const name = grouped ? b.rawName! : head.title;
    const objective = grouped
      ? `Deliver ${sorted.length} recommendation(s): ${sorted
          .slice(0, MAX_OBJECTIVE_TITLES)
          .map((r) => r.title)
          .join('; ')}`
      : head.summary;
    fresh.push({
      id,
      name,
      objective,
      status: 'proposed',
      recommendationIds: sorted.map((r) => r.id).sort(),
      preMortem: seedPreMortem(sorted),
      exportTargets: [],
      createdAt: priorProposedCreatedAt.get(id) ?? ts,
      updatedAt: ts,
    });
  }

  return [...survivors, ...fresh];
}

export type TransitionAction = 'accept' | 'defer' | 'close' | 'reopen';
export type TransitionResult =
  | { ok: true; ledger: MilestoneLedger; warning?: string }
  | { ok: false; error: string };

/**
 * Phase 149: best-effort advisory for `close` — names any of the milestone's
 * `recommendationIds` whose *current* status (checked across both the live
 * `recommendations` and soft-archived `archived` arrays, since a shipped rec is
 * typically auto-archived with its true status preserved) is not `shipped`.
 * Never throws: a missing/unreadable/corrupt recommendation ledger degrades to
 * `undefined` (no warning), mirroring `runAdvanceConvertedToSettlePendingForPhase`'s
 * defensive style. This is advisory-only — it never blocks the close.
 */
async function buildCloseAdvisory(
  root: string,
  recommendationIds: readonly string[],
): Promise<string | undefined> {
  try {
    const ledger = await readRecommendationLedger(root);
    const byId = new Map<string, string>();
    for (const r of ledger.recommendations) byId.set(r.id, r.status);
    for (const r of ledger.archived) byId.set(r.id, r.status);
    const unshipped = recommendationIds.filter((rid) => byId.get(rid) !== 'shipped');
    if (unshipped.length === 0) return undefined;
    return `warning: milestone closed with unshipped recommendation(s): ${unshipped.join(', ')}`;
  } catch {
    return undefined;
  }
}

export function applyTransition(
  ledger: MilestoneLedger,
  id: string,
  action: TransitionAction,
  now: Date = new Date(),
  ref?: string,
): TransitionResult {
  const target = ledger.milestones.find((m) => m.id === id);
  if (!target) return { ok: false, error: `milestone ${id} not found` };

  // Phase 149: `ref` (→ closedRef) is only meaningful for the `close` action —
  // mirrors applyRecommendationPromotion's "only valid for this specific
  // transition" guard style.
  if (ref !== undefined && action !== 'close') {
    return { ok: false, error: 'ref is only valid for the close action' };
  }

  const allowed: Record<TransitionAction, IntelligenceMilestone['status'][]> = {
    accept: ['proposed'],
    defer: ['proposed', 'accepted'],
    close: ['exported'],
    reopen: ['deferred'],
  };
  if (!allowed[action].includes(target.status)) {
    return {
      ok: false,
      error: `cannot ${action} milestone in status ${target.status}`,
    };
  }

  // Phase 203: a reopened milestone re-enters the `proposed` pool and its
  // recommendationIds become eligible for re-clustering again — but only if no
  // *other, still-live* milestone (any status other than deferred/proposed) has
  // already claimed one of those recs in the meantime. Refuse rather than create
  // a second claim on the same recommendation.
  if (action === 'reopen') {
    for (const m of ledger.milestones) {
      if (m.id === id) continue;
      if (m.status === 'deferred' || m.status === 'proposed') continue;
      for (const rid of target.recommendationIds) {
        if (m.recommendationIds.includes(rid)) {
          return {
            ok: false,
            error: `cannot reopen milestone ${id}: recommendation ${rid} is already claimed by milestone ${m.id} (status ${m.status})`,
          };
        }
      }
    }
  }

  const nextStatus: IntelligenceMilestone['status'] =
    action === 'accept'
      ? 'accepted'
      : action === 'defer'
        ? 'deferred'
        : action === 'reopen'
          ? 'proposed'
          : 'closed';
  const ts = now.toISOString();
  const ledgerOut: MilestoneLedger = {
    schemaVersion: 1,
    milestones: ledger.milestones.map((m) =>
      m.id === id
        ? {
            ...m,
            status: nextStatus,
            updatedAt: ts,
            ...(action === 'close' && ref !== undefined ? { closedRef: ref } : {}),
          }
        : m,
    ),
  };
  return { ok: true, ledger: ledgerOut };
}

export async function runProposeMilestones(
  root: string,
  now: Date = new Date(),
): Promise<MilestoneLedger> {
  const recs = (await readRecommendationLedger(root)).recommendations;
  const existing = await readMilestoneLedger(root);
  const next: MilestoneLedger = {
    schemaVersion: 1,
    milestones: clusterMilestones(recs, existing.milestones, now),
  };
  await writeMilestoneLedger(root, next);
  return next;
}

export async function runMilestoneTransition(
  root: string,
  id: string,
  action: TransitionAction,
  ref?: string,
): Promise<TransitionResult> {
  const ledger = await readMilestoneLedger(root);
  const res = applyTransition(ledger, id, action, new Date(), ref);
  if (!res.ok) return res;
  await writeMilestoneLedger(root, res.ledger);
  if (action === 'close') {
    const target = res.ledger.milestones.find((m) => m.id === id);
    const warning = await buildCloseAdvisory(root, target?.recommendationIds ?? []);
    if (warning !== undefined) return { ok: true, ledger: res.ledger, warning };
  }
  return res;
}

export type ExportResult =
  | { ok: true; ledger: MilestoneLedger; artifactPath: string }
  | { ok: false; error: string };

export async function runMilestoneExport(
  root: string,
  id: string,
  now: Date = new Date(),
): Promise<ExportResult> {
  const ledger = await readMilestoneLedger(root);
  const target = ledger.milestones.find((m) => m.id === id);
  if (!target) return { ok: false, error: `milestone ${id} not found` };
  if (target.status !== 'accepted') {
    return {
      ok: false,
      error: `cannot export milestone in status ${target.status}`,
    };
  }

  const allRecs = (await readRecommendationLedger(root)).recommendations;
  const byId = new Map(allRecs.map((r) => [r.id, r]));
  const recs = target.recommendationIds.map((rid) => {
    const r = byId.get(rid);
    return r ? { id: r.id, title: r.title } : { id: rid, title: rid };
  });

  const spec = cadenceBackend.renderSpecDraft(target, recs);

  const relPath = `.cadence/intelligence/exports/${target.id}/SPEC.md`;
  const absPath = join(root, relPath);
  await mkdir(dirname(absPath), { recursive: true });
  await atomicWriteText(absPath, spec);

  const ts = now.toISOString();
  const next: MilestoneLedger = {
    schemaVersion: 1,
    milestones: ledger.milestones.map((m) =>
      m.id === id
        ? {
            ...m,
            status: 'exported',
            // Single-element: schema allows multiple backends but only 'cadence'
            // exists today and re-export is refused, so overwrite is safe for now.
            exportTargets: [
              { backend: 'cadence', artifactPath: relPath, exportedAt: ts },
            ],
            updatedAt: ts,
          }
        : m,
    ),
  };
  await writeMilestoneLedger(root, next);
  return { ok: true, ledger: next, artifactPath: relPath };
}

export type PreMortemResult =
  | { ok: true; ledger: MilestoneLedger }
  | { ok: false; error: string };

export type PreMortemAdditions = {
  outOfScope?: string[];
  likelyFailureModes?: string[];
  hiddenDependencies?: string[];
};

/**
 * Phase 201: merges newly operator-supplied text into `target.preMortem` before it is
 * handed to `deepenPreMortem`. Every addition is passed through `oneLine` — same as
 * every deterministically-derived entry elsewhere in this file — so a value containing
 * embedded newlines can't corrupt the one-entry-per-bullet Markdown rendering.
 * `outOfScope` is already 100% operator-owned, so its (normalized) additions are
 * appended as-is; `likelyFailureModes`/`hiddenDependencies` additions are additionally
 * marked via `markOperatorEntry` so they survive future refreshes the same way.
 * Exact-string repeats are deduped so re-adding identical text is a no-op.
 */
function mergeAdditions(
  target: IntelligenceMilestone,
  additions: PreMortemAdditions,
): IntelligenceMilestone {
  return {
    ...target,
    preMortem: {
      ...target.preMortem,
      outOfScope: additions.outOfScope
        ? dedupAppend(target.preMortem.outOfScope, additions.outOfScope.map(oneLine))
        : target.preMortem.outOfScope,
      likelyFailureModes: additions.likelyFailureModes
        ? dedupAppend(
            target.preMortem.likelyFailureModes,
            additions.likelyFailureModes.map((a) => markOperatorEntry(oneLine(a))),
          )
        : target.preMortem.likelyFailureModes,
      hiddenDependencies: additions.hiddenDependencies
        ? dedupAppend(
            target.preMortem.hiddenDependencies,
            additions.hiddenDependencies.map((a) => markOperatorEntry(oneLine(a))),
          )
        : target.preMortem.hiddenDependencies,
    },
  };
}

export async function runMilestonePreMortem(
  root: string,
  id: string,
  now: Date = new Date(),
  additions?: PreMortemAdditions,
): Promise<PreMortemResult> {
  const ledger = await readMilestoneLedger(root);
  const target = ledger.milestones.find((m) => m.id === id);
  if (!target) return { ok: false, error: `milestone ${id} not found` };
  if (target.status !== 'proposed' && target.status !== 'accepted') {
    return {
      ok: false,
      error: `cannot pre-mortem milestone in status ${target.status}`,
    };
  }

  const recs = (await readRecommendationLedger(root)).recommendations;
  const assumptions = (await readAssumptionLedger(root)).assumptions;
  const mergedTarget = additions ? mergeAdditions(target, additions) : target;
  const preMortem = deepenPreMortem(mergedTarget, recs, assumptions, now);

  const ts = now.toISOString();
  const next: MilestoneLedger = {
    schemaVersion: 1,
    milestones: ledger.milestones.map((m) =>
      m.id === id ? { ...m, preMortem, updatedAt: ts } : m,
    ),
  };
  await writeMilestoneLedger(root, next);
  return { ok: true, ledger: next };
}

/**
 * Phase 179: per-recommendation reconciliation entry for `runMilestoneStatus`.
 * A discriminated union on `status` — `not-yet-converted` means the
 * recommendation has no `convertedToPhaseId` yet (or wasn't found in the
 * ledger at all); `no-worktree-found` means it converted to a phase but no
 * local/sibling worktree currently advertises that phase as its active one;
 * `resolved` carries the live worktree facts from the matched
 * `HandoffCandidate`.
 */
export type MilestoneStatusPhaseEntry =
  | { recommendationId: string; status: 'not-yet-converted' }
  | { recommendationId: string; phaseId: string; status: 'no-worktree-found' }
  | {
      recommendationId: string;
      phaseId: string;
      status: 'resolved';
      source: HandoffCandidate['source'];
      worktreePath: string;
      worktreeBranch: string | null;
      liveLoopPosition: string | null;
      settled: boolean;
    };

export type MilestoneStatusResult =
  | { ok: true; milestoneId: string; phases: MilestoneStatusPhaseEntry[] }
  | { ok: false; error: string };

/**
 * Phase 179: read-only fan-in reconciliation. Maps a milestone's
 * `recommendationIds` to the phases they converted into, resolves each
 * phase's owning worktree (local or sibling) via phase 142's
 * `gatherHandoffCandidates`, and reports that worktree's live loop position —
 * replacing N manual `cadence status` round-trips with one. Never mutates
 * any ledger.
 */
export async function runMilestoneStatus(
  repoRoot: string,
  id: string,
): Promise<MilestoneStatusResult> {
  const ledger = await readMilestoneLedger(repoRoot);
  const target = ledger.milestones.find((m) => m.id === id);
  if (!target) return { ok: false, error: `milestone ${id} not found` };

  const recLedger = await readRecommendationLedger(repoRoot);
  const recById = new Map<string, Recommendation>();
  for (const r of recLedger.recommendations) recById.set(r.id, r);
  for (const r of recLedger.archived) recById.set(r.id, r);

  // First-seen-wins per activePhase: candidates arrive newest-first by
  // generatedAt, so the first candidate for a given phase is the freshest.
  const candidates = await gatherHandoffCandidates(repoRoot);
  const byActivePhase = new Map<string, HandoffCandidate>();
  for (const c of candidates) {
    if (c.activePhase === null) continue;
    if (!byActivePhase.has(c.activePhase)) byActivePhase.set(c.activePhase, c);
  }

  const phases: MilestoneStatusPhaseEntry[] = target.recommendationIds.map(
    (recommendationId): MilestoneStatusPhaseEntry => {
      const rec = recById.get(recommendationId);
      const phaseId = rec?.convertedToPhaseId;
      if (phaseId === undefined) {
        return { recommendationId, status: 'not-yet-converted' };
      }
      const candidate = byActivePhase.get(phaseId);
      if (!candidate) {
        return { recommendationId, phaseId, status: 'no-worktree-found' };
      }
      return {
        recommendationId,
        phaseId,
        status: 'resolved',
        source: candidate.source,
        worktreePath: candidate.worktreePath,
        worktreeBranch: candidate.worktreeBranch,
        liveLoopPosition: candidate.liveLoopPosition,
        settled: candidate.liveLoopPosition === 'IDLE',
      };
    },
  );

  return { ok: true, milestoneId: id, phases };
}
