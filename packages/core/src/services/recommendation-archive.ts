import { runRecommendationArchive } from '../intelligence/store/recommendations.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence recommendation archive` as a service seam (phase 153) — MCP adapter
 * over the shared `runRecommendationArchive(..., 'manual')` core. `data` is the
 * archived `Recommendation` (found in the returned ledger's `archived` array,
 * with `archivedAt`/`archiveReason` stamped); an unknown id or a rec that is
 * already archived returns exit code 1.
 */
export interface RecommendationArchiveArgs {
  recId: string;
}

export async function recommendationArchiveService(
  repoRoot: string,
  args: RecommendationArchiveArgs,
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const res = await runRecommendationArchive(repoRoot, args.recId, 'manual');
    if (!res.ok) {
      io.err(`recommendation archive refused: ${res.error}\n`);
      return { exitCode: 1 };
    }
    const archived = res.ledger.archived.find((r) => r.id === args.recId) ?? null;
    io.out(`recommendation ${args.recId} archived\n`);
    return { exitCode: 0, data: archived };
  } catch (err) {
    io.err(`recommendation archive failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
