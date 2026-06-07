import { RecommendationReadinessZ, RecommendationStatusZ } from '@manehorizons/cadence-types';
import {
  runRecommendationPromotion,
  type RecommendationPromotionChanges,
} from '../intelligence/store/recommendations.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence recommendation promote` as a service seam (phase 76) — MCP adapter
 * over the shared `runRecommendationPromotion` core. `data` is the updated
 * `Recommendation`; an unknown id / illegal transition returns exit code 1.
 */
export interface RecommendationPromoteArgs {
  id: string;
  status?: string;
  readiness?: string;
}

export async function recommendationPromoteService(
  repoRoot: string,
  args: RecommendationPromoteArgs,
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const changes: RecommendationPromotionChanges = {};
    if (args.status !== undefined) changes.status = RecommendationStatusZ.parse(args.status);
    if (args.readiness !== undefined) changes.readiness = RecommendationReadinessZ.parse(args.readiness);
    const res = await runRecommendationPromotion(repoRoot, args.id, changes);
    if (!res.ok) {
      io.err(`${res.error}\n`);
      return { exitCode: 1 };
    }
    const updated = res.ledger.recommendations.find((r) => r.id === args.id) ?? null;
    io.out(`Promoted ${args.id}\n`);
    return { exitCode: 0, data: updated };
  } catch (err) {
    io.err(`recommendation promote failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
