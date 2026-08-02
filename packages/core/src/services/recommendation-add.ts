import { RecommendationPriorityZ, RecommendationReadinessZ } from '@thomas-powers-jr/cadence-types';
import {
  addRecommendation,
  type AddRecommendationInput,
} from '../intelligence/store/recommendations.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence recommendation add` as a service seam (phase 76) — MCP adapter over
 * the shared `addRecommendation` core. `priority`/`readiness` are Zod-validated
 * (defaults `medium` / `raw-idea`); `data` is the created `Recommendation`.
 */
export interface RecommendationAddArgs {
  title: string;
  summary?: string;
  priority?: string;
  readiness?: string;
  areas?: string[];
  files?: string[];
  evidence?: string;
  scoutId?: string;
}

export async function recommendationAddService(
  repoRoot: string,
  args: RecommendationAddArgs,
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const input: AddRecommendationInput = {
      title: args.title,
      // summary is schema-required (>=1 char); fall back to the title when omitted.
      summary: args.summary && args.summary.length > 0 ? args.summary : args.title,
      priority: RecommendationPriorityZ.parse(args.priority ?? 'medium'),
      readiness: RecommendationReadinessZ.parse(args.readiness ?? 'raw-idea'),
      affectedAreas: args.areas ?? [],
      affectedFiles: args.files ?? [],
    };
    if (args.evidence !== undefined) input.evidenceSummary = args.evidence;
    if (args.scoutId !== undefined) input.scoutId = args.scoutId;
    const rec = await addRecommendation(repoRoot, input);
    io.out(`Added ${rec.id}: ${rec.title}\n`);
    return { exitCode: 0, data: rec };
  } catch (err) {
    io.err(`recommendation add failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
