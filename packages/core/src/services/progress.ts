import { SimpleStateBackend } from '../state/simple.js';
import { nextAction, type NextActionHints } from '../progress.js';
import { resolveNextFreePhase } from '../phases/next-free.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence progress` — the single recommended next action (read-only).
 * Returns `data: { command, reason }` for structured consumers.
 */
export async function progressService(
  repoRoot: string,
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const backend = new SimpleStateBackend(repoRoot);
    const state = await backend.readState();
    // Only IDLE's suggestion carries a phase number to fill; skip the
    // (best-effort) occupancy read entirely at every other loop position.
    let hints: NextActionHints | undefined;
    if (state.loopPosition === 'IDLE') {
      const n = await resolveNextFreePhase(repoRoot);
      if (n !== null) hints = { nextPhaseNumber: n };
    }
    const action = nextAction(state, hints);
    io.out(`Next: ${action.command}\n`);
    io.out(`Reason: ${action.reason}\n`);
    return { exitCode: 0, data: { command: action.command, reason: action.reason } };
  } catch (err) {
    io.err(`progress failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
