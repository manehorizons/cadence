import type {
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
