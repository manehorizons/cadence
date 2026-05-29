import { uncoveredAcs } from '../verify/coverage.js';
import type { GateImpl, GateResult } from './types.js';

/**
 * Test-coverage gate (Phase 14). Extracted from settle.ts verbatim. Invoked
 * when 'test-coverage' is in the effective gate set. Refuses when any
 * non-explicit AC has no linked test, unless --allow-missing-coverage / --force.
 */
export const runCoverageGate: GateImpl = async (ctx): Promise<GateResult> => {
  const coverageBypassed = ctx.opts.allowMissingCoverage === true;
  if (ctx.opts.allowMissingCoverage || ctx.opts.auto === false) {
    return { outcome: 'pass', flags: { coverageBypassed } };
  }
  const coverage = await ctx.coverage();
  const acIds = ctx.draft.acceptanceCriteria.map((a) => a.id);
  const unmet = uncoveredAcs(
    acIds.filter((id) => !ctx.explicitIds.has(id)),
    coverage,
  );
  if (unmet.length > 0 && !ctx.opts.force) {
    const globsLabel =
      ctx.config?.verification?.testGlobs?.join(', ') ?? '(defaults)';
    for (const id of unmet) {
      ctx.io.err(`coverage: ${id} has no linked test (searched: ${globsLabel})\n`);
    }
    ctx.io.err(
      'settle run refused: each AC needs at least one test that references its id (e.g. AC-1 in a describe/it). ' +
        'Pass --allow-missing-coverage to bypass, or --force to settle anyway.\n',
    );
    return { outcome: 'refuse', flags: { coverageBypassed } };
  }
  return { outcome: 'pass', flags: { coverageBypassed } };
};
