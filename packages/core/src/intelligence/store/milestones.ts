import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  MilestoneLedgerZ,
  emptyMilestoneLedger,
  type MilestoneLedger,
} from '@manehorizons/cadence-types';
import { atomicWriteJSON, atomicWriteText } from '../../state/atomic-write.js';
import { renderMilestonesMd } from '../render-milestone.js';
import { intelligenceDir, milestonesMdPath, milestonesPath } from './paths.js';

export async function readMilestoneLedger(
  root: string,
): Promise<MilestoneLedger> {
  const path = milestonesPath(root);
  if (!existsSync(path)) return emptyMilestoneLedger();
  const raw = await readFile(path, 'utf8');
  return MilestoneLedgerZ.parse(JSON.parse(raw));
}

export async function writeMilestoneLedger(
  root: string,
  ledger: MilestoneLedger,
): Promise<void> {
  await mkdir(intelligenceDir(root), { recursive: true });
  MilestoneLedgerZ.parse(ledger);
  await atomicWriteJSON(milestonesPath(root), ledger);
  await atomicWriteText(milestonesMdPath(root), renderMilestonesMd(ledger));
}
