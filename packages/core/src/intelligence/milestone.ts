import type {
  IntelligenceMilestone,
  MilestonePreMortem,
  Recommendation,
  RecommendationReadiness,
} from '@cadence/types';

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

export function seedPreMortem(recs: Recommendation[]): MilestonePreMortem {
  const hiddenDependencies: string[] = [];
  const driftRisks: string[] = [];
  const likelyFailureModes: string[] = [];

  // shared file across >=2 recs -> coordination dependency
  const byFile = new Map<string, string[]>();
  for (const r of recs) {
    for (const f of r.affectedFiles) {
      const ids = byFile.get(f);
      if (ids) ids.push(r.id);
      else byFile.set(f, [r.id]);
    }
  }
  for (const f of [...byFile.keys()].sort()) {
    const ids = byFile.get(f)!;
    if (ids.length >= 2) {
      hiddenDependencies.push(
        `Shared file ${f} edited by ${[...ids].sort().join(', ')} — ordering/coordination dependency.`,
      );
    }
  }

  // doc surface touched -> drift risk (single entry)
  const docHit = recs.some(
    (r) =>
      r.affectedAreas.includes('docs') ||
      r.affectedFiles.some((f) => DOC_PATH_RE.test(f) || DOC_NAME_RE.test(f)),
  );
  if (docHit) {
    driftRisks.push(
      'Milestone touches documentation surfaces — spec/doc drift risk.',
    );
  }

  // low-confidence input
  for (const r of recs
    .filter((r) => r.confidence < 0.5)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    likelyFailureModes.push(
      `Low-confidence input: ${r.id} (confidence ${r.confidence.toFixed(2)}) — assumption may be wrong.`,
    );
  }

  return { likelyFailureModes, hiddenDependencies, driftRisks, outOfScope: [] };
}

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

export function clusterMilestones(
  recs: Recommendation[],
  existing: IntelligenceMilestone[],
  now: Date = new Date(),
): IntelligenceMilestone[] {
  const ts = now.toISOString();

  const survivors = existing.filter((m) => m.status !== 'proposed');
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
          .slice(0, 3)
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
