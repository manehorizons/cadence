import { runProposeMilestones } from '../intelligence/milestone.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence milestone propose` as a service seam (phase 153) — MCP adapter over
 * the shared `runProposeMilestones` core. Takes no arguments: it re-reads the
 * recommendation + milestone ledgers, clusters newly eligible recommendations
 * (status `accepted`, readiness `ready-for-milestone`/`ready-for-cadence-spec`)
 * into proposed milestones, and writes the updated milestone ledger. Already
 * proposed/accepted/deferred/exported milestones are preserved untouched, so
 * this is safe to call repeatedly. `data` is the updated `MilestoneLedger`,
 * matching `cadence milestone propose --json`'s output shape.
 */
export type MilestoneProposeArgs = Record<string, never>;

export async function milestoneProposeService(
  repoRoot: string,
  _args: MilestoneProposeArgs,
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const ledger = await runProposeMilestones(repoRoot);
    io.out(`Proposed milestones: ${ledger.milestones.length}\n`);
    return { exitCode: 0, data: ledger };
  } catch (err) {
    io.err(`milestone propose failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
