import {
  anyTestFilesMatched,
  skippedOnlyLinkedAcs,
  uncoveredAcs,
  weaklyLinkedAcs,
} from '../verify/coverage.js';
import { isGateSealed } from './types.js';
import type { GateImpl, GateResult } from './types.js';

/**
 * Test-coverage gate (Phase 14). Extracted from settle.ts verbatim. Invoked
 * when 'test-coverage' is in the effective gate set. Refuses when any
 * non-explicit AC has no linked test, unless --allow-missing-coverage / --force.
 *
 * Phase 108: in `assertion` coverage mode the gate additionally refuses an AC
 * that is *mentioned* but never inside a recognized asserting test block (a
 * "weak link"), with a distinct hint from the plain "no linked test" message.
 * The `mention`-mode path (default) is unchanged.
 *
 * Phase 167: assertion-mode span recognition is no longer JS/TS-only —
 * built-in profiles cover js/ts, python, go, rust, and php (per-file
 * dispatch, `../verify/coverage-profiles/registry.ts`), plus an
 * operator-extensible `verification.coverageProfiles` escape hatch for any
 * other language. The refusal messages below are written language-neutral
 * accordingly and point at `cadence verify coverage --explain AC-N` (T8) —
 * the diagnostic built specifically so a weak-link refusal is debuggable
 * without reading engine source.
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
    const skippedOnly = skippedOnlyLinkedAcs(required, coverage);
    if (
      (absent.length > 0 || weak.length > 0 || skippedOnly.length > 0) &&
      (!ctx.opts.force || sealed)
    ) {
      for (const id of absent) {
        ctx.io.err(`coverage: ${id} has no linked test (searched: ${globsLabel})\n`);
      }
      for (const id of weak) {
        ctx.io.err(
          `coverage: ${id} is mentioned but not inside a recognized asserting test block ` +
            `(assertion mode) (searched: ${globsLabel})\n`,
        );
      }
      for (const id of skippedOnly) {
        ctx.io.err(
          `coverage: ${id}'s only linked test is skipped (assertion mode) (searched: ${globsLabel})\n`,
        );
      }
      // Phase 166 (T3, AC-3): the trailing refusal names each distinct cause
      // separately instead of one shared blob — a glob-miss (discovery: no
      // test files matched verification.testGlobs) and a span-miss (parsing:
      // files matched but no recognized asserting test block was found for
      // the id — run `cadence verify coverage --explain <id>` (phase 167, T8)
      // to see exactly which profile scanned each file and why) call for
      // different fixes.
      const bypassHint = sealed
        ? 'This gate is sealed (gates.sealed) and cannot be bypassed with --force or ' +
            '--allow-missing-coverage.'
        : 'Pass --allow-missing-coverage to bypass, or --force to settle anyway.';
      if (absent.length > 0) {
        // `absent` means zero refs anywhere in matched files — that's true
        // whether no file matched the globs at all, or files matched fine
        // but simply never mention this AC. Only the first is really a glob
        // problem; check which one actually happened before blaming globs.
        const anyMatched = await anyTestFilesMatched(
          ctx.cwd,
          ctx.config?.verification?.testGlobs,
        );
        ctx.io.err(
          anyMatched
            ? `settle run refused (assertion mode): no test file references ` +
                `${absent.join(', ')} (searched: ${globsLabel}). Write a test that references ` +
                `the AC id, or check verification.testGlobs if you expect a matching file ` +
                `already exists. ${bypassHint}\n`
            : `settle run refused (assertion mode): no test files matched configured globs for ` +
                `${absent.join(', ')} (searched: ${globsLabel}). Check verification.testGlobs, or ` +
                `move/rename the test file so it matches. ${bypassHint}\n`,
        );
      }
      if (weak.length > 0) {
        ctx.io.err(
          `settle run refused (assertion mode): test files matched but no assertion-shaped ` +
            `span found for ${weak.join(', ')}. Run \`cadence verify coverage --explain ` +
            `${weak[0]}\` to see which profile scanned each file and why the span didn't ` +
            `qualify, then add an asserting test block that references the AC id — or, if this ` +
            `project's language/framework genuinely has no coverage profile (built-in: js/ts, ` +
            `python, go, rust, php; extend via verification.coverageProfiles for others), switch ` +
            `coverageMode to 'mention' via \`cadence config edit coverageMode\`. ${bypassHint}\n`,
        );
      }
      if (skippedOnly.length > 0) {
        ctx.io.err(
          `settle run refused (assertion mode): ${skippedOnly.join(', ')}'s only linked test ` +
            `is skipped. Unskip the test or replace it with a running asserting it()/test() ` +
            `block. ${bypassHint}\n`,
        );
      }
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
