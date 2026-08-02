import {
  MilestoneLedgerZ,
  emptyMilestoneLedger,
  type IntelligenceMilestone,
  type MilestoneLedger,
} from '@thomas-powers-jr/cadence-types';
import { atomicWriteText } from '../../state/atomic-write.js';
import { renderMilestonesMd } from '../render-milestone.js';
import { milestonesMdPath, milestonesPath } from './paths.js';
import { readLedger, writeLedger, type SubjectLedgerSpec } from './ledger.js';

/**
 * Milestone ids are cluster-derived (`mil-grp-<slug>` / `mil-rec-<recId>`,
 * see intelligence/milestone.ts) — never sequence-minted. `idPrefix`/`idOf`
 * below exist only to satisfy SubjectLedgerSpec's shape; `mintId` is
 * deliberately never called for this subject (DRAFT boundary, phase 220 T3).
 *
 * The on-disk schema (packages/types/src/intelligence.ts) has no `archived`
 * array for milestones, unlike the other four subjects — `records()` maps it
 * to `[]` unconditionally on read, and `withRecords` refuses (rather than
 * silently drops) any archived records a caller might construct in memory.
 */
const milestoneLedgerSpec: SubjectLedgerSpec<IntelligenceMilestone, MilestoneLedger> = {
  parse: (data) => MilestoneLedgerZ.parse(data),
  empty: emptyMilestoneLedger,
  idPrefix: 'mil',
  idOf: (m) => m.id,
  records: (ledger) => ({ live: ledger.milestones, archived: [] }),
  withRecords: (ledger, records) => {
    if (records.archived.length !== 0) {
      throw new Error(
        `milestoneLedgerSpec.withRecords: refusing to discard ${records.archived.length} archived record(s) — milestones have no archived array`,
      );
    }
    return { ...ledger, milestones: records.live };
  },
};

export async function readMilestoneLedger(
  root: string,
): Promise<MilestoneLedger> {
  return readLedger(milestoneLedgerSpec, milestonesPath(root));
}

export async function writeMilestoneLedger(
  root: string,
  ledger: MilestoneLedger,
): Promise<void> {
  await writeLedger(milestoneLedgerSpec, milestonesPath(root), ledger, { mode: 0o600 });
  await atomicWriteText(milestonesMdPath(root), renderMilestonesMd(ledger));
}
