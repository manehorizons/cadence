import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  Assumption,
  IntelligenceMilestone,
  MilestoneLedger,
  MilestonePreMortem,
  Recommendation,
  RecommendationDecayState,
  RecommendationReadiness,
  RecommendationStatus,
} from '@cadence/types';
import {
  readMilestoneLedger,
  readRecommendationLedger,
  writeMilestoneLedger,
} from './store.js';
import { atomicWriteText } from '../state/atomic-write.js';
import { cadenceBackend } from './backend/cadence.js';

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
    ],
    hiddenDependencies: sharedFileDeps(members),
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

export type TransitionAction = 'accept' | 'defer';
export type TransitionResult =
  | { ok: true; ledger: MilestoneLedger }
  | { ok: false; error: string };

export function applyTransition(
  ledger: MilestoneLedger,
  id: string,
  action: TransitionAction,
  now: Date = new Date(),
): TransitionResult {
  const target = ledger.milestones.find((m) => m.id === id);
  if (!target) return { ok: false, error: `milestone ${id} not found` };

  const allowed: Record<TransitionAction, IntelligenceMilestone['status'][]> = {
    accept: ['proposed'],
    defer: ['proposed', 'accepted'],
  };
  if (!allowed[action].includes(target.status)) {
    return {
      ok: false,
      error: `cannot ${action} milestone in status ${target.status}`,
    };
  }

  const nextStatus: IntelligenceMilestone['status'] =
    action === 'accept' ? 'accepted' : 'deferred';
  const ledgerOut: MilestoneLedger = {
    schemaVersion: 1,
    milestones: ledger.milestones.map((m) =>
      m.id === id
        ? { ...m, status: nextStatus, updatedAt: now.toISOString() }
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
): Promise<TransitionResult> {
  const ledger = await readMilestoneLedger(root);
  const res = applyTransition(ledger, id, action, new Date());
  if (!res.ok) return res;
  await writeMilestoneLedger(root, res.ledger);
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
