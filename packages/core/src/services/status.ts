import { loadStatus, renderStatus } from '../status.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence status` (default action) — full loop context.
 * `json: true` mirrors the `--json` flag. `data` is the status report either way.
 */
export async function statusService(
  repoRoot: string,
  args: { json?: boolean },
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const report = await loadStatus(repoRoot);
    if (args.json) {
      io.out(JSON.stringify(report) + '\n');
    } else {
      io.out(renderStatus(report));
    }
    return { exitCode: 0, data: report };
  } catch (err) {
    io.err(`status failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
