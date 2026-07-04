import { runRecommendationTransition } from '../intelligence/store/recommendations.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence recommendation convert` as a service seam (phase 153) — MCP adapter
 * over the shared `runRecommendationTransition('convert')` core. `data` is the
 * updated `Recommendation` (status `converted`, `convertedToPhaseId` set); an
 * unknown id, an illegal transition, or a missing target phase directory
 * returns exit code 1.
 */
export interface RecommendationConvertArgs {
  recId: string;
  toPhase: string;
}

export async function recommendationConvertService(
  repoRoot: string,
  args: RecommendationConvertArgs,
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const res = await runRecommendationTransition(repoRoot, args.recId, 'convert', args.toPhase);
    if (!res.ok) {
      io.err(`recommendation convert refused: ${res.error}\n`);
      return { exitCode: 1 };
    }
    const updated = res.ledger.recommendations.find((r) => r.id === args.recId) ?? null;
    io.out(`recommendation ${args.recId} → converted (to ${args.toPhase})\n`);
    return { exitCode: 0, data: updated };
  } catch (err) {
    io.err(`recommendation convert failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
