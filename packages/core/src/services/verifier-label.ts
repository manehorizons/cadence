// deja:new pure display-layer formatter for verifier-rollup labels (phase 264,
// T1, Phase M). `deja_find`'s project-function index returned only a broken
// reference for this query (the candidate's source file,
// `docs/superpowers/plans/2026-07-21-ui-spec-gate.md`, does not exist in this
// repo — a stale/broken index entry, reproduced across several rephrasings of
// the same intent); `deja_check_dep` found no existing function or dependency
// composing a provider/model/gateCount label with a mock-capability clause
// and a `providerSelection` tag (its two low-confidence candidates —
// `resolveEffectiveProvider` and a test-local `diagramVerifierProviders` —
// are unrelated selection/diagram helpers, not label formatters). This is a
// genuine new formatter, distinct renderer target from
// `services/summary-render.ts`'s and `parse/summary-writer.ts`'s inline
// `${provider}${model ? ` ${model}` : ''} (${gateCount} gate(s))` literal —
// T2 (a later task) replaces those call sites with calls into this function;
// this task only adds the function itself.

import {
  MOCK_VERIFIER_CAPABILITY,
  type AssuranceRecord,
  type GateProvenance,
} from '@thomas-powers-jr/cadence-types';

/**
 * Shape of one `AssuranceRecordZ.verifierRollup` entry
 * (`packages/types/src/summary.ts`) — derived (not redeclared) from the
 * already-shipped `AssuranceRecordZ` so this stays single-sourced and, under
 * `exactOptionalPropertyTypes`, exactly matches what callers actually hold
 * (`model?: string | undefined`, not a locally-invented `model?: string`
 * that a real `verifierRollup` element would fail to satisfy).
 */
export type VerifierRollupEntry = AssuranceRecord['verifierRollup'][number];

/**
 * Render one `assurance.verifierRollup` entry as a precise, single-sourced
 * display label (phase 264 / Phase M — "rendered label precision").
 *
 * Base text matches the literal shape used today by both SUMMARY renderers
 * (`services/summary-render.ts:64`, `parse/summary-writer.ts:53`):
 * `${provider}${model ? ` ${model}` : ''} (${gateCount} gate(s))`.
 *
 * When `rollupEntry.provider === 'mock'`, appends the umbrella
 * `MOCK_VERIFIER_CAPABILITY.message` capability-fact clause — naming what
 * mock checks and does not check. This is deliberately distinct from
 * `MOCK_VERIFIER_NOTICE`'s activation-nudge wording, which is left
 * untouched.
 *
 * `matchingGates` are the `GateProvenanceZ` entries this rollup entry
 * corresponds to — the caller is responsible for joining them by
 * `(provider, model)` (T2's job, not this function's). Any gate carrying
 * `providerSelection` — for ANY provider, not only mock, since a real
 * provider that judged an empty diff is exactly the "looked like
 * verification, judged nothing" case this release targets — contributes a
 * trailing tag:
 *  - every carrying gate agrees on one value -> append `(<value>)`
 *    (`(configured)`, `(fallback)`, or `(empty-diff)`)
 *  - carrying gates disagree                 -> append an explicit
 *    `(mixed)` tag, never silently omitted — a fallback must read visibly
 *    differently from "nothing is known", the entire point of Phase L/M
 *  - no gate in `matchingGates` carries `providerSelection` at all (absent
 *    — e.g. a pre-Phase-263 historical record) -> append nothing
 *
 * Pure — no I/O, no logging, no mutation of its inputs.
 */
export function formatVerifierRollupLabel(
  rollupEntry: VerifierRollupEntry,
  matchingGates: readonly GateProvenance[],
): string {
  const base = `${rollupEntry.provider}${rollupEntry.model ? ` ${rollupEntry.model}` : ''} (${rollupEntry.gateCount} gate(s))`;
  const capability = rollupEntry.provider === 'mock' ? ` ${MOCK_VERIFIER_CAPABILITY.message}` : '';

  const carriedSelections = matchingGates
    .map((g) => g.providerSelection)
    .filter((s): s is NonNullable<GateProvenance['providerSelection']> => s !== undefined);

  let selectionTag = '';
  if (carriedSelections.length > 0) {
    const unique = new Set(carriedSelections);
    selectionTag = unique.size === 1 ? ` (${carriedSelections[0]})` : ' (mixed)';
  }

  return `${base}${capability}${selectionTag}`;
}
