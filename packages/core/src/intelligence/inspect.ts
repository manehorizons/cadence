import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  InspectionZ,
  type BackendStatus,
  type Inspection,
  type InspectionFlag,
  type RepoScan,
} from '@thomas-powers-jr/cadence-types';
import { atomicWriteJSON, atomicWriteText } from '../state/atomic-write.js';
import { intelligenceDir } from './store/paths.js';
import {
  readEvidenceLedger,
  readRecommendationLedger,
} from './store/io.js';
import { scanRepo } from './scan.js';
import { cadenceBackend } from './backend/cadence.js';
import { renderStrategyMd } from './render-inspection.js';

const DECAY_AT_RISK = new Set(['stale', 'needs-revalidation', 'contradicted']);

export type LedgerSummary = {
  recommendations: number;
  byDecay: Record<string, number>;
  evidence: number;
};

export function synthesizeInspection(
  repo: RepoScan,
  backend: BackendStatus,
  ledger: LedgerSummary,
  now: Date = new Date(),
): Inspection {
  const flags: InspectionFlag[] = [];

  if (
    repo.git.available &&
    (repo.git.dirty === true || (repo.git.ahead ?? 0) > 0 || (repo.git.behind ?? 0) > 0)
  ) {
    flags.push({
      code: 'git-dirty-or-diverged',
      severity: 'warn',
      message: 'Git working tree is dirty or diverged from origin/main.',
      evidence: `dirty=${repo.git.dirty ? 'yes' : 'no'}, ahead=${repo.git.ahead ?? 0}, behind=${repo.git.behind ?? 0}`,
    });
  }

  const draftInconsistent =
    backend.present === true &&
    (backend.loopPosition === 'DRAFT' || backend.loopPosition === 'BUILD') &&
    !backend.activeDraft;
  const specInconsistent =
    backend.present === true &&
    backend.loopPosition === 'SPEC' &&
    !backend.activeSpec;
  const loopInconsistent =
    backend.stateError !== undefined || draftInconsistent || specInconsistent;
  if (loopInconsistent) {
    const evidence =
      backend.stateError ??
      `loopPosition=${backend.loopPosition ?? '(none)'} but no active ${
        specInconsistent ? 'spec' : 'draft'
      }`;
    flags.push({
      code: 'loop-state-inconsistent',
      severity: 'warn',
      message: 'CADENCE loop state is inconsistent or unreadable.',
      evidence,
    });
  }

  const atRisk = Object.entries(ledger.byDecay).filter(
    ([k, n]) => DECAY_AT_RISK.has(k) && n > 0,
  );
  if (atRisk.length > 0) {
    flags.push({
      code: 'ledger-decay',
      severity: 'warn',
      message: 'Recommendations need revalidation or are stale/contradicted.',
      evidence: atRisk.map(([k, n]) => `${k}=${n}`).join(', '),
    });
  }

  const missingDocs = (['readme', 'design', 'roadmap', 'changelog'] as const).filter(
    (k) => !repo.docs[k],
  );
  if (missingDocs.length > 0) {
    const names = missingDocs.map((k) =>
      k === 'readme'
        ? 'README.md'
        : k === 'design'
          ? 'DESIGN.md'
          : k === 'roadmap'
            ? '.cadence/ROADMAP.md'
            : 'CHANGELOG.md',
    );
    flags.push({
      code: 'docs-missing',
      severity: 'info',
      message: `Missing: ${names.join(', ')}`,
      evidence: names.join(', '),
    });
  }

  return InspectionZ.parse({
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    repo,
    backend,
    ledger,
    flags,
  });
}

export async function runInspect(root: string, now: Date = new Date()): Promise<Inspection> {
  const repo = await scanRepo(root);
  const backend = await cadenceBackend.readStatus(root);
  const recLedger = await readRecommendationLedger(root);
  const evLedger = await readEvidenceLedger(root);

  const byDecay: Record<string, number> = {};
  for (const rec of recLedger.recommendations) {
    byDecay[rec.decayState] = (byDecay[rec.decayState] ?? 0) + 1;
  }
  const ledger: LedgerSummary = {
    recommendations: recLedger.recommendations.length,
    byDecay,
    evidence: evLedger.evidence.length,
  };

  const inspection = synthesizeInspection(repo, backend, ledger, now);

  const dir = intelligenceDir(root);
  await mkdir(dir, { recursive: true });
  await atomicWriteJSON(join(dir, 'inspection.json'), inspection);
  await atomicWriteText(join(dir, 'STRATEGY.md'), renderStrategyMd(inspection));

  return inspection;
}
