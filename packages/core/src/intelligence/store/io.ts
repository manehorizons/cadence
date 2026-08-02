import { existsSync } from 'node:fs';
import {
  EvidenceLedgerZ,
  emptyEvidenceLedger,
  type Evidence,
  type EvidenceLedger,
  type RecommendationLedger,
} from '@thomas-powers-jr/cadence-types';
import { atomicWriteText } from '../../state/atomic-write.js';
import { renderRecommendationsMd } from '../render.js';
import { readLedger, writeLedger, type SubjectLedgerSpec } from './ledger.js';
import { evidencePath, recommendationsMdPath, recommendationsPath } from './paths.js';
import { recommendationLedgerSpec, readRecommendationLedger } from './recommendations.js';
import { readAssumptionLedger, writeAssumptionLedger } from './assumptions.js';
import {
  readIntelligenceDecisionLedger,
  writeIntelligenceDecisionLedger,
} from './decisions.js';

// Retired (phase 220 T4): `readAssumptionLedger`/`writeAssumptionLedger` and
// `readIntelligenceDecisionLedger`/`writeIntelligenceDecisionLedger` used to
// be hand-rolled here too. `assumptions.ts`/`decisions.ts` now own the
// canonical implementations (on top of `ledger.ts`'s shared primitives); this
// module re-exports them so the ~7 external callers that already import these
// names from `io.js` keep working unchanged.
export { readAssumptionLedger, writeAssumptionLedger };
export { readIntelligenceDecisionLedger, writeIntelligenceDecisionLedger };
export { readRecommendationLedger };

// Evidence has no dedicated subject file (unlike assumptions/decisions/
// milestones/recommendations) — its spec and canonical read function live
// here, next to `writeIntelligenceLedgers`, the only writer this subject has.
export const evidenceLedgerSpec: SubjectLedgerSpec<Evidence, EvidenceLedger> = {
  parse: (data) => EvidenceLedgerZ.parse(data),
  empty: emptyEvidenceLedger,
  idPrefix: 'ev',
  idOf: (ev) => ev.id,
  records: (ledger) => ({ live: ledger.evidence, archived: [] }),
  withRecords: (ledger, records) => {
    if (records.archived.length !== 0) {
      throw new Error('evidence ledger has no archived array; refusing to drop non-empty archived records');
    }
    return { schemaVersion: 1, evidence: records.live };
  },
};

export async function readEvidenceLedger(root: string): Promise<EvidenceLedger> {
  return readLedger(evidenceLedgerSpec, evidencePath(root));
}

export async function writeIntelligenceLedgers(
  root: string,
  ledger: RecommendationLedger,
  evidenceLedger: EvidenceLedger,
): Promise<void> {
  await writeLedger(recommendationLedgerSpec, recommendationsPath(root), ledger, { mode: 0o600 });
  await writeLedger(evidenceLedgerSpec, evidencePath(root), evidenceLedger, { mode: 0o600 });
  // Read sibling ledgers so the rec MD renders status-annotated link bullets (Slice 15).
  const asLedger = await readAssumptionLedger(root);
  const decLedger = await readIntelligenceDecisionLedger(root);
  await atomicWriteText(
    recommendationsMdPath(root),
    renderRecommendationsMd(ledger, evidenceLedger, asLedger, decLedger),
  );
}

export async function rerenderRecommendationsMdIfPresent(root: string): Promise<void> {
  if (!existsSync(recommendationsPath(root))) return;
  const recLedger = await readRecommendationLedger(root);
  const evLedger = await readEvidenceLedger(root);
  const asLedger = await readAssumptionLedger(root);
  const decLedger = await readIntelligenceDecisionLedger(root);
  await atomicWriteText(
    recommendationsMdPath(root),
    renderRecommendationsMd(recLedger, evLedger, asLedger, decLedger),
  );
}
