import { uncoveredAcs, weaklyLinkedAcs } from '../verify/coverage.js';
import { isGateSealed } from './types.js';
import type { GateImpl, GateResult } from './types.js';

/**
 * Test-coverage gate (Phase 14). Extracted from settle.ts verbatim. Invoked
 * when 'test-coverage' is in the effective gate set. Refuses when any
 * non-explicit AC has no linked test, unless --allow-missing-coverage / --force.
 *
 * Phase 108: in `assertion` coverage mode the gate additionally refuses an AC
 * that is *mentioned* but never inside an asserting it()/test() block (a "weak
 * link"), with a distinct hint from the plain "no linked test" message. The
 * `mention`-mode path (default) is unchanged.
 *
 * Phase 141 (T5, AC-3/AC-5): when 'test-coverage' is in `config.gates.sealed`
 * (`isGateSealed`), neither the early --allow-missing-coverage short-circuit
 * nor the --force refusal escape apply — the gate always computes real
 * coverage and always refuses a genuine gap, with a distinct "sealed, cannot
 * be bypassed" message instead of the normal bypass hint. `coverageBypassed`
 * only reports `true` when a bypass actually took effect (never merely
 * because a bypass flag was passed while sealed). Unsealed behavior (AC-5) is
 * byte-for-byte unchanged.
 */
export const runCoverageGate: GateImpl = async (ctx): Promise<GateResult> => {
  const sealed = isGateSealed(ctx, 'test-coverage');
  const coverageBypassed = ctx.opts.allowMissingCoverage === true && !sealed;
  if ((ctx.opts.allowMissingCoverage === true && !sealed) || ctx.opts.auto === false) {
    return { outcome: 'pass', flags: { coverageBypassed } };
  }
  const coverage = await ctx.coverage();
  const acIds = ctx.draft.acceptanceCriteria.map((a) => a.id);
  const required = acIds.filter((id) => !ctx.explicitIds.has(id));
  const globsLabel =
    ctx.config?.verification?.testGlobs?.join(', ') ?? '(defaults)';
  const mode = ctx.config?.verification?.coverageMode ?? 'mention';
  const absent = uncoveredAcs(required, coverage);

  if (mode === 'assertion') {
    const weak = weaklyLinkedAcs(required, coverage);
    if ((absent.length > 0 || weak.length > 0) && (!ctx.opts.force || sealed)) {
      for (const id of absent) {
        ctx.io.err(`coverage: ${id} has no linked test (searched: ${globsLabel})\n`);
      }
      for (const id of weak) {
        ctx.io.err(
          `coverage: ${id} is mentioned but not inside an asserting it()/test() block ` +
            `(assertion mode) (searched: ${globsLabel})\n`,
        );
      }
      ctx.io.err(
        sealed
          ? 'settle run refused (assertion mode): each AC needs at least one asserting ' +
              'it()/test() block that references its id. ' +
              'This gate is sealed (gates.sealed) and cannot be bypassed with --force or ' +
              '--allow-missing-coverage.\n'
          : 'settle run refused (assertion mode): each AC needs at least one asserting ' +
              'it()/test() block that references its id. ' +
              'Pass --allow-missing-coverage to bypass, or --force to settle anyway.\n',
      );
      return { outcome: 'refuse', flags: { coverageBypassed } };
    }
    return { outcome: 'pass', flags: { coverageBypassed } };
  }

  if (absent.length > 0 && (!ctx.opts.force || sealed)) {
    for (const id of absent) {
      ctx.io.err(`coverage: ${id} has no linked test (searched: ${globsLabel})\n`);
    }
    ctx.io.err(
      sealed
        ? 'settle run refused: each AC needs at least one test that references its id ' +
            '(e.g. AC-1 in a describe/it). This gate is sealed (gates.sealed) and cannot be ' +
            'bypassed with --force or --allow-missing-coverage.\n'
        : 'settle run refused: each AC needs at least one test that references its id (e.g. AC-1 in a describe/it). ' +
            'Pass --allow-missing-coverage to bypass, or --force to settle anyway.\n',
    );
    return { outcome: 'refuse', flags: { coverageBypassed } };
  }
  return { outcome: 'pass', flags: { coverageBypassed } };
};
