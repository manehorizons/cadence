import { SimpleStateBackend } from '../state/simple.js';
import { nextAction } from '../progress.js';
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
    const action = nextAction(state);
    io.out(`Next: ${action.command}\n`);
    io.out(`Reason: ${action.reason}\n`);
    return { exitCode: 0, data: { command: action.command, reason: action.reason } };
  } catch (err) {
    io.err(`progress failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
