import {
  anyTestFilesMatched,
  scanTestCoverage,
  skippedOnlyLinkedAcs,
  uncoveredAcs,
  weaklyLinkedAcs,
} from '../verify/coverage.js';
import { isGateSealed } from './types.js';
import type { GateImpl, GateResult } from './types.js';

/**
 * Phase 239 (T3): a well-formed draft id usable as a coverage qualifier.
 * Deliberately narrow — the qualifier is spliced into a scanned token prefix
 * (`239-01/AC-3`), so anything carrying whitespace, a newline, or a `/` would
 * either never match or silently change what the scan means. Rejecting up
 * front is what keeps the empty-qualifier degeneracy ("preceded by a bare
 * `/`") and the newline divergence between the two scan branches from ever
 * reaching `tokenHasExpectedQualifier`.
 */
const QUALIFIER_RE = /^[A-Za-z0-9._-]+$/;

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
 *
 * Phase 239 (T3, AC-2/AC-3/AC-4): under `verification.coverageScheme:
 * 'phase-qualified'` an AC token is only evidence when it carries this
 * phase's own prefix (`239-01/AC-3`); bare and foreign-phase occurrences are
 * not evidence at all. Because AC ids restart at `AC-1` every phase, the bare
 * scheme lets any past phase's `AC-3` satisfy every future phase's `AC-3` —
 * that is the shipped defect this closes.
 *
 * Two implementation notes worth keeping:
 *  - The qualified path runs its OWN scan rather than consuming the shared
 *    `ctx.coverage()` thunk, because that thunk is memoized with bare options
 *    in `services/settle.ts` and cannot carry a qualifier. The bare path still
 *    consumes the memoized thunk, so historical single-scan behavior is
 *    untouched.
 *
 *    CLOSED in T6: `ctx.coverage()` is now scheme-aware (it resolves the same
 *    qualifier from the active draft id), so every other consumer — evidence
 *    derivation in `services/settle.ts`, `deep-verify.ts`, `interactive.ts` —
 *    sees the same AC↔test linkage this gate enforced. What remains is purely
 *    an efficiency wart, not a correctness one: under the qualified scheme the
 *    repo is scanned twice (once here, once by the shared thunk) because this
 *    gate's tests specify a gate-local scan. Both scans use identical options,
 *    so they cannot disagree.
 *  - Every refusal names the LITERAL expected token, so an operator reading
 *    stderr never has to infer the prefix form from docs or engine source.
 *
 * Bare-scheme behavior is byte-for-byte unchanged throughout: `expected()` is
 * the identity when no qualifier is in effect, and `schemeHint` is empty.
 */
export const runCoverageGate: GateImpl = async (ctx): Promise<GateResult> => {
  const sealed = isGateSealed(ctx, 'test-coverage');
  const coverageBypassed = ctx.opts.allowMissingCoverage === true && !sealed;
  if ((ctx.opts.allowMissingCoverage === true && !sealed) || ctx.opts.auto === false) {
    return { outcome: 'pass', flags: { coverageBypassed } };
  }
  const acIds = ctx.draft.acceptanceCriteria.map((a) => a.id);
  const required = acIds.filter((id) => !ctx.explicitIds.has(id));
  const globs = ctx.config?.verification?.testGlobs;
  const globsLabel = globs?.join(', ') ?? '(defaults)';
  const mode = ctx.config?.verification?.coverageMode ?? 'mention';
  const scheme = ctx.config?.verification?.coverageScheme ?? 'bare';

  // Phase 239: resolve the qualifier BEFORE any scanning. An unusable draft id
  // under the qualified scheme must refuse or notice loudly — never degrade to
  // a silent unqualified scan, which would hand back exactly the cross-phase
  // false pass the scheme exists to prevent (CLAUDE.md: The Quiet Fallback).
  let qualifier: string | null = null;
  if (scheme === 'phase-qualified') {
    const activeDraft = ctx.state.activeDraft;
    if (typeof activeDraft !== 'string' || !QUALIFIER_RE.test(activeDraft)) {
      const shown =
        typeof activeDraft === 'string' ? JSON.stringify(activeDraft) : '(none)';
      if (ctx.opts.force && !sealed) {
        // --force keeps its existing "settle anyway" meaning, but the fallback
        // is loud. `coverageBypassed` stays false: it tracks
        // --allow-missing-coverage only, and no coverage bypass flag was passed.
        ctx.io.err(
          `coverage: proceeding past a missing or malformed active draft id (${shown}) ` +
            `under the 'phase-qualified' scheme because --force was passed. Coverage was ` +
            `NOT scanned unqualified and NOT verified for this settle.\n`,
        );
        return { outcome: 'pass', flags: { coverageBypassed } };
      }
      const sealedNote = sealed
        ? ' This gate is sealed (gates.sealed) and cannot be bypassed with --force or ' +
          '--allow-missing-coverage.'
        : '';
      const message =
        `settle run refused: verification.coverageScheme is 'phase-qualified', but the ` +
        `active draft id is missing or malformed (${shown}), so the expected token prefix ` +
        `cannot be built. Coverage was NOT scanned unqualified. Set an active draft, or ` +
        `switch verification.coverageScheme back to 'bare' via \`cadence config edit ` +
        `coverageScheme\`.${sealedNote}`;
      ctx.io.err(`${message}\n`);
      return { outcome: 'refuse', flags: { coverageBypassed }, reason: message };
    }
    qualifier = activeDraft;
  }

  /** The literal token an operator must write. Identity under the bare scheme. */
  const expected = (id: string): string => (qualifier === null ? id : `${qualifier}/${id}`);
  const schemeHint =
    qualifier === null
      ? ''
      : ` Under verification.coverageScheme 'phase-qualified' the reference must carry this ` +
        `phase's own prefix — expected ${required.map(expected).join(', ')}.`;

  const coverage =
    qualifier === null
      ? await ctx.coverage()
      : await scanTestCoverage(ctx.cwd, {
          ...(globs ? { globs } : {}),
          mode,
          expectedQualifier: qualifier,
        });
  const absent = uncoveredAcs(required, coverage);

  if (mode === 'assertion') {
    const weak = weaklyLinkedAcs(required, coverage);
    const skippedOnly = skippedOnlyLinkedAcs(required, coverage);
    if (
      (absent.length > 0 || weak.length > 0 || skippedOnly.length > 0) &&
      (!ctx.opts.force || sealed)
    ) {
      for (const id of absent) {
        ctx.io.err(`coverage: ${expected(id)} has no linked test (searched: ${globsLabel})\n`);
      }
      for (const id of weak) {
        ctx.io.err(
          `coverage: ${expected(id)} is mentioned but not inside a recognized asserting test block ` +
            `(assertion mode) (searched: ${globsLabel})\n`,
        );
      }
      for (const id of skippedOnly) {
        ctx.io.err(
          `coverage: ${expected(id)}'s only linked test is skipped (assertion mode) (searched: ${globsLabel})\n`,
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
      const reasons: string[] = [];
      if (absent.length > 0) {
        // `absent` means zero refs anywhere in matched files — that's true
        // whether no file matched the globs at all, or files matched fine
        // but simply never mention this AC. Only the first is really a glob
        // problem; check which one actually happened before blaming globs.
        const anyMatched = await anyTestFilesMatched(
          ctx.cwd,
          ctx.config?.verification?.testGlobs,
        );
        const message = anyMatched
          ? `settle run refused (assertion mode): no test file references ` +
              `${absent.map(expected).join(', ')} (searched: ${globsLabel}). Write a test that ` +
              `references the AC id, or check verification.testGlobs if you expect a matching ` +
              `file already exists.${schemeHint} ${bypassHint}`
          : `settle run refused (assertion mode): no test files matched configured globs for ` +
              `${absent.map(expected).join(', ')} (searched: ${globsLabel}). Check ` +
              `verification.testGlobs, or move/rename the test file so it matches.` +
              `${schemeHint} ${bypassHint}`;
        ctx.io.err(`${message}\n`);
        reasons.push(message);
      }
      if (weak.length > 0) {
        const message =
          `settle run refused (assertion mode): test files matched but no assertion-shaped ` +
          `span found for ${weak.map(expected).join(', ')}. Run \`cadence verify coverage --explain ` +
          `${weak[0]}\` to see which profile scanned each file and why the span didn't ` +
          `qualify, then add an asserting test block that references the AC id — or, if this ` +
          `project's language/framework genuinely has no coverage profile (built-in: js/ts, ` +
          `python, go, rust, php; extend via verification.coverageProfiles for others), switch ` +
          `coverageMode to 'mention' via \`cadence config edit coverageMode\`.` +
          `${schemeHint} ${bypassHint}`;
        ctx.io.err(`${message}\n`);
        reasons.push(message);
      }
      if (skippedOnly.length > 0) {
        const message =
          `settle run refused (assertion mode): ${skippedOnly.map(expected).join(', ')}'s only linked test ` +
          `is skipped. Unskip the test or replace it with a running asserting it()/test() ` +
          `block.${schemeHint} ${bypassHint}`;
        ctx.io.err(`${message}\n`);
        reasons.push(message);
      }
      return { outcome: 'refuse', flags: { coverageBypassed }, reason: reasons.join('\n') };
    }
    return { outcome: 'pass', flags: { coverageBypassed } };
  }

  if (absent.length > 0 && (!ctx.opts.force || sealed)) {
    for (const id of absent) {
      ctx.io.err(`coverage: ${expected(id)} has no linked test (searched: ${globsLabel})\n`);
    }
    const reason = sealed
      ? 'settle run refused: each AC needs at least one test that references its id ' +
          `(e.g. AC-1 in a describe/it).${schemeHint} This gate is sealed (gates.sealed) and ` +
          'cannot be bypassed with --force or --allow-missing-coverage.'
      : 'settle run refused: each AC needs at least one test that references its id (e.g. AC-1 in a describe/it).' +
          `${schemeHint} Pass --allow-missing-coverage to bypass, or --force to settle anyway.`;
    ctx.io.err(`${reason}\n`);
    return { outcome: 'refuse', flags: { coverageBypassed }, reason };
  }
  return { outcome: 'pass', flags: { coverageBypassed } };
};
