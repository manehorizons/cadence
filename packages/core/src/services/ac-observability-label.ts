// deja:new pure display-layer formatter for the deep-verify `unobservable`
// marker (phase 274, T6). `deja_find`/`deja_check_dep` returned the same
// broken index reference documented in this package's precedent
// (`services/verifier-label.ts`'s own header comment: a stale pointer at a
// nonexistent `docs/superpowers/plans/2026-07-21-ui-spec-gate.md`) across
// every rephrasing tried — no usable candidate, confirming there is no
// existing formatter for this shape. This module follows that same file's
// precedent: one pure function, shared by both Markdown SUMMARY renderers
// (`parse/summary-writer.ts`'s on-disk `<id>-SUMMARY.md` sidecar,
// `services/summary-render.ts`'s `cadence summary render` stdout output) so
// the rendering rule lives in exactly one place instead of two near-identical
// copies.

import type { DeepVerdict } from '@thomas-powers-jr/cadence-types';

/**
 * Phase 274 (T6): render a distinct sub-line for an AC that
 * `gates/deep-verify.ts`'s `classifyAcObservability` classifier (T1, T3)
 * marked structurally unobservable (`DeepVerdictZ.unobservable`) — so a human
 * reading either Markdown SUMMARY renderer can tell "this wasn't checked
 * because it structurally can't be" from "this was checked and failed" at a
 * glance, without opening the raw `SUMMARY.json`.
 *
 * Deliberately its own line, not a suffix folded into the existing PASS/FAIL
 * badge on the same AC: `acResults[].pass` is a *different*, structural
 * signal (derived from task-terminal-status in `status.ts`'s
 * `deriveAcResults`) that is independent of deep-verify's per-AC judgement —
 * the two axes can disagree (e.g. a `--force`-settled AC can read
 * structurally PASS while `deepVerify[id].pass` is `false`). Folding the
 * classifier's verdict into that badge would misrepresent one axis as the
 * other; a clearly-labeled sibling line keeps them visually separate. The
 * word `UNOBSERVABLE` never appears next to `PASS`/`FAIL` on the same badge —
 * it is the entire distinguishing signal, so it must be unmistakable at a
 * glance, not a same-line suffix a skimming reader could miss.
 *
 * Scope note: this only renders the `unobservable` case. A real (non-mock)
 * deep-verify PASS/FAIL verdict is not rendered here or anywhere else in
 * either Markdown renderer today — that is a pre-existing gap, out of this
 * phase's scope (274-01-DRAFT.md's Boundaries), not something this function
 * introduces or papers over.
 *
 * Returns `undefined` when there is nothing to say: no `deepVerify` entry for
 * this AC at all, or one that exists but isn't marked `unobservable` (a real
 * deep-verify pass/fail).
 */
export function formatUnobservableNote(verdict: DeepVerdict | undefined): string | undefined {
  if (verdict?.unobservable !== true) return undefined;
  return `  UNOBSERVABLE (deep-verify): ${verdict.reason}`;
}
