import { RecommendationReadinessZ, RecommendationStatusZ } from '@thomas-powers-jr/cadence-types';
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
  // Phase 221: freeform provenance for the `shipped` terminal status — MCP
  // parity with the CLI's `--ref`. Threaded straight into `changes.shippedRef`;
  // `runRecommendationPromotion` (via `applyRecommendationPromotion`) is the
  // single place that rejects it when the target status isn't `shipped`, so
  // there is exactly one refusal-message literal shared by both call sites.
  ref?: string;
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
    if (args.ref !== undefined) changes.shippedRef = args.ref;
    const res = await runRecommendationPromotion(repoRoot, args.id, changes);
    if (!res.ok) {
      io.err(`${res.error}\n`);
      return { exitCode: 1 };
    }
    // Phase 221: a promotion to a terminal status (e.g. `shipped`) can trigger
    // the same-write auto-archive in `runRecommendationPromotion` (default
    // `recommendations.autoArchive: true`) — the rec is then in `archived`,
    // not `recommendations`. Without checking both, `--status=shipped --ref`
    // (the primary real-world use of `ref`) would return `data: null` even on
    // a fully successful promotion.
    const updated =
      res.ledger.recommendations.find((r) => r.id === args.id) ??
      res.ledger.archived.find((r) => r.id === args.id) ??
      null;
    io.out(`Promoted ${args.id}\n`);
    return { exitCode: 0, data: updated };
  } catch (err) {
    io.err(`recommendation promote failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
