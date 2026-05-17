# Design — code-review convergence at settle (`#4`)

**Date:** 2026-05-16
**Status:** Approved (brainstorming) — pending spec review + implementation plan
**Context:** CADENCE v1.2 feature-expansion, item **#4** (final) of the survey
(`docs/superpowers/2026-05-16-cadence-expansion-survey.md`). The survey's
insight #1: "**#2 and #4 are the same engine** — #4 is mostly a second
attach-point." #2 (Phase 35.1) wrapped `plan-review`@`draft approve` in a
bounded `nextConvergence` loop; #1 (Phase 36.1) reused it at `spec
approve`. #4 reuses the **same primitive verbatim** at a third site: the
**code-review gate at `settle run`** (Phase 24.3). Smallest of the four —
almost pure pattern-clone.

## Problem

The Phase 24.3 code-review gate (fires at `cadence settle run` when
`'code-review' ∈ gateSet.gates` — strict×standard, strict×complex,
standard×complex) is **stateless one-shot**: it runs `selectCodeReviewVerifier`,
collects per-file findings, and on any HIGH finding **refuses settle** (exit
1) unless `--allow-code-review-failure`, emitting a `code-review-high`
anomaly. Re-running `settle` after fixing the code re-reviews fresh —
cadence tracks **nothing across attempts**: no counter, no "attempt N", no
hard "stop, a human must decide" escalation. This is the exact friction the
review-convergence work removes, applied to the settle side (the survey
explicitly cited the 32.2/33.1 "refuse-and-stop" pain).

cadence-core is host-agnostic / review-only — **no in-core auto-fixer** (the
parked #3/#5 / #1-generator territory). So #4, like #2/#1, is bounded
convergence with an **external** fix: the agent/human fixes the flagged code
between `settle` re-runs; cadence owns the loop bookkeeping + escalation.

## Goals

- Wrap code-review@settle in the Phase 35.1 `nextConvergence` primitive
  **verbatim** (no re-implementation, no re-test of the primitive).
- Per-phase attempt tracking + history in a `<id>-CODE-REVIEW.json` sidecar,
  same shape as `<id>-PLAN-REVIEW.json` / `<id>-SPEC-REVIEW.json`.
- Hard escalation at `config.convergence.maxAttempts` (reuse #2's config —
  no new knob) with a new unconditional `code-review-unconverged` anomaly.
- **Preserve the Phase 24.3 contract** for `--allow-code-review-failure`:
  it bypasses ANY failing code-review (reloop OR escalate) → settle
  proceeds, recording `SUMMARY.codeReview` + the `code-review-high` anomaly
  (`bypassed:true`) exactly as today. The convergence loop is the
  **non-bypass** path. (This is the Phase 35.1 flag-semantics lesson applied
  from the start — the existing `settle-code-review.test.ts` AC-4/5/6 are
  the contract and must stay green.)
- Additive / backward-compatible; no `gates/engine.ts` matrix change.

## Non-Goals (YAGNI)

Convergence on security-audit@settle or deep-verify (future, not this phase
— survey scoped #4 as "small, one attach-point"); an in-core auto-fixer
(host-agnostic-anchor violation; external fix only, identical to #2/#1); a
new convergence-bound config (reuse `config.convergence.maxAttempts`); any
generic "all settle gates convergent" wrapper.

## Architecture

This is a near-verbatim port of the shipped Phase 35.1 plan-review
convergent block (`draft.ts`) to the code-review gate site in `settle.ts`,
Plan→CodeReview. Low novelty by design.

### Convergence boolean

code-review "pass" for convergence purposes := **no HIGH-severity finding**
(precisely the gate's existing refuse condition; MEDIUM/LOW never refuse —
unchanged). `pass = highFindings.length === 0`.

### Sidecar — `<id>-CODE-REVIEW.json` (new, plan-review shape)

```jsonc
{
  "draftId": "37-01",
  "converged": false,
  "attempts": 2,
  "maxAttempts": 3,
  "history": [
    { "at": "…", "pass": false, "findingsCount": <#HIGH>, "provider": "mock",
      "verdict": "reloop", "bypassed"?: true }
  ],
  // legacy-style top-level fields for parity with the other sidecars:
  "pass": false, "provider": "mock", "model"?: "…", "findings": <#HIGH>, "at": "…"
}
```

**Conscious count semantics:** `findingsCount` / top-level `findings` record
the **HIGH count** (`highs.length`), NOT total findings of all severities —
deliberately, because the convergence boolean is HIGH-only (the 35.1 source
records total `res.findings.length`; this is an intentional, self-consistent
divergence). The new test asserts HIGH-count; pick this once and keep it.

Read at the code-review gate: prior `attempts` (number) → `attemptsSoFar`;
absent/corrupt/legacy-without-`attempts` → `attemptsSoFar = 0` (identical
back-compat rule to plan-review). `history` append-only. Path:
`.cadence/phases/<phase>/<id>-CODE-REVIEW.json` (the active draft's id —
code-review runs in BUILD→SETTLE on the active draft).

### Wiring — the existing code-review block in `settle.ts`

Replace the one-shot HIGH-refuse logic with the convergent block (a Plan→
CodeReview port of the shipped `draft.ts` Phase 35.1 block). When
`'code-review' ∈ gateSet.gates`:
1. run `selectCodeReviewVerifier(cadenceConfig)` → `result.findings` (existing
   call, unchanged); `highs = findings with severity high`;
   `pass = highs.length === 0`.
2. read prior sidecar `attemptsSoFar`/`history`.
3. `maxAttempts = cadenceConfig?.convergence?.maxAttempts ?? 3`;
   `nv = nextConvergence(pass, attemptsSoFar, maxAttempts)`;
   `bypassed = !pass && (opts.allowCodeReviewFailure === true || opts.force === true)`.
   **Explicit decision (preserve the Phase 24.3 contract — do NOT narrow it):**
   today's code-review block bypasses HIGH on `--force` **OR**
   `--allow-code-review-failure` (settle.ts ~`bypassed = opts.force === true
   || opts.allowCodeReviewFailure === true`), and the proceed-line text
   branches on which flag. The convergence port **keeps both** as bypass
   triggers and **keeps the existing branching proceed-line verbatim**
   (`code-review: --force set; proceeding past N HIGH finding(s).` vs
   `code-review: --allow-code-review-failure set; proceeding past N HIGH
   finding(s).`) — no dead branch, no silent `--force` narrowing (a narrowing
   would be an undocumented behavior change and risks the very
   contract-regression this spec exists to prevent). The Phase 35.1 source
   has no `--force` notion only because plan-review@approve has no `--force`;
   settle does, so the port must retain it.
4. persist `<id>-CODE-REVIEW.json` (shape above; `converged = pass`,
   `attempts = nv.verdict==='pass' ? attemptsSoFar : nv.attempt`).
5. branch (identical control flow to the shipped plan-review block):
   - **pass** → continue settle (existing behavior; `SUMMARY.codeReview`
     still recorded from `result.findings` as today).
   - **`!pass` + bypass (`--force` OR `--allow-code-review-failure`)** →
     print findings (existing format); emit `code-review-high` (existing
     `emitCodeReviewHigh`, `bypassed:true`); if `nv.verdict==='escalate'`
     also emit the new `code-review-unconverged` (`bypassed:true`); print
     the **existing Phase 24.3 branching proceed-line verbatim** —
     `code-review: --force set; proceeding past N HIGH finding(s).` when
     `opts.force`, else `code-review: --allow-code-review-failure set;
     proceeding past N HIGH finding(s).` (keep both arms exactly so the
     existing AC-5 regex `/--allow-code-review-failure set; proceeding past
     1 HIGH/` still matches); record `SUMMARY.codeReview`; **continue
     settle**. (Preserves the Phase 24.3 contract incl. `--force`.)
   - **`!pass`, no flag, `reloop`** → emit `code-review-high` (existing);
     print each finding (existing format) + `code-review: attempt
     N/MAX did not pass — fix the flagged code and re-run \`cadence settle
     run\`, or pass --allow-code-review-failure to proceed anyway.`;
     `process.exitCode = 1; return;` (refuse — no SUMMARY, as today).
   - **`!pass`, no flag, `escalate`** → emit `code-review-high` (existing)
     + the new unconditional `code-review-unconverged`; print
     `settle run refused: code-review did NOT converge after MAX attempts —
     a human decision is required. Fix the flagged code, or pass
     --allow-code-review-failure to proceed anyway.`; `exitCode=1; return;`.

The `code-review-high` anomaly continues to be emitted via the existing
`emitCodeReviewHigh` path with its existing `'anomaly-notify'`-gate guard
(unchanged — that is the Phase 24.3 behavior; do not touch it). Only the new
`code-review-unconverged` is unconditional (see below).

### New anomaly — `code-review-unconverged`

`packages/types/src/anomaly.ts`: `AnomalyTypeZ += 'code-review-unconverged'`
(additive bump — 23.2/23.3/34.1/35.1/36.1 precedent; CHANGELOG-documented).
Add `emitCodeReviewUnconverged(notifier, ctx)` to
`packages/core/src/notify/code-review.ts` (alongside the existing
`emitCodeReviewHigh`), modelled on `emitPlanReviewUnconverged` /
`emitSpecReviewUnconverged`: **unconditional** (NOT `anomaly-notify`-gated —
same rationale as 34.1/35.1/36.1; an escalation is a hard human-decision
event and code-review's matrix cells include `strict×*` which lack
`anomaly-notify`), best-effort / no-throw, refusal computed independently.
Context: `{ draftId, attempts, maxAttempts, findings: highs.length,
provider, model?, bypassed? }`. Emitted only on the `escalate` verdict
(bypassed or not).

### Config

None new. Reuse `config.convergence.maxAttempts` (Phase 35.1, default 3) —
shared across plan-review / spec-review / code-review convergence.

## Error semantics / risk

- Zero behavior change for the happy path (no HIGH) and for any cell where
  code-review doesn't fire.
- reloop is exactly today's refuse plus an attempt line + sidecar
  increment — no new failure mode.
- escalate is the only new hard behavior; bounded (≤ maxAttempts), always
  overridable by the **existing** `--allow-code-review-failure`, and leaves
  an audit trail (sidecar + the unconditional anomaly).
- **Highest-risk spot (Phase 35.1 lesson, applied preemptively):** the
  existing `settle-code-review.test.ts` (Phase 24.3) asserts the contract —
  AC-4: HIGH + no flag → refuse exit 1; AC-5: `--allow-code-review-failure`
  → settles + `SUMMARY.codeReview` + the "proceeding past N HIGH" line;
  AC-6: `code-review-high` anomaly under standard×complex. The convergent
  wiring MUST keep these green: first-fail-no-flag still exits 1 (now via
  `reloop` — the message gains an `attempt 1/N` clause but the existing
  test's regexes (`code-review: …`, refusal, no SUMMARY) still match; verify
  exact strings during planning), and the flag path still settles with the
  identical "proceeding past N HIGH finding(s)" line + `SUMMARY.codeReview`
  + bypassed anomaly. The **full** `pnpm turbo run lint typecheck test
  build` is the safety net (re-run it; do not trust new tests alone — this
  is exactly the 35.1 / 36.1 caught-by-the-gate pattern).
- Additive schema only; no `state.json` / `gates/engine.ts` change.

## Testing

Vitest, in-package; no re-test of `nextConvergence` (Phase 35.1 owns it).

- New `tests/cli/settle-codereview-convergence.test.ts` (spawned-CLI idiom,
  mirror `settle-code-review.test.ts`'s strict×standard fixture — a
  `console.log` in a `src/` file makes `MockCodeReviewVerifier` emit a HIGH;
  file notify transport): (a) clean diff → settle proceeds (pass); (b) HIGH,
  no flag → reloop exit 1, `attempt 1/3`, `<id>-CODE-REVIEW.json`
  `attempts:1`/`converged:false`, no SUMMARY; (c) HIGH ×maxAttempts →
  escalate exit 1, `did NOT converge after 3 attempts`, anomaly log has
  `code-review-unconverged` (fires under strict×standard, no `anomaly-notify`
  — unconditional lock); (d) escalate + `--allow-code-review-failure` →
  settles, `SUMMARY.codeReview` present, history last `bypassed:true`, both
  `code-review-high` + `code-review-unconverged` recorded; (e) absent/legacy
  sidecar → attemptsSoFar 0 (first HIGH = attempt 1/3).
- **Regression guard:** the existing `settle-code-review.test.ts` must pass
  unchanged (the Phase 24.3 contract). Run the full gate.

## Acceptance criteria (for the DRAFT)

1. code-review@settle wrapped in `nextConvergence`; `pass := no HIGH`;
   `<id>-CODE-REVIEW.json` carries `converged`/`attempts`/`maxAttempts`/
   append-only `history` (plan-review shape); legacy/absent → attemptsSoFar 0.
2. reloop (HIGH, below max, no flag): incremented sidecar + `code-review-high`
   anomaly (existing) + findings + `attempt N/MAX` line + exit 1, settle
   refused, no SUMMARY.
3. escalate at `config.convergence.maxAttempts`: distinct human-decision
   message + new **unconditional** `code-review-unconverged` anomaly +
   hard-refuse unless `--allow-code-review-failure`.
4. Bypass (`--force` OR `--allow-code-review-failure`) past ANY fail (reloop
   OR escalate) → settle proceeds, `SUMMARY.codeReview` recorded,
   `code-review-high` (`bypassed:true`) emitted, `bypassed:true` in sidecar
   history, the existing **branching** "—{force|allow} set; proceeding past
   N HIGH finding(s)" line printed verbatim — **existing
   `settle-code-review.test.ts` AC-4/5/6 stay green; `--force` keeps
   bypassing code-review (Phase 24.3 contract NOT narrowed)**.
5. `AnomalyTypeZ` additive `code-review-unconverged` (+ `emitCodeReviewUnconverged`
   unconditional/no-throw in `notify/code-review.ts`); no new config (reuse
   `config.convergence.maxAttempts`); no `gates/engine.ts` / `state.json`
   change.
6. DESIGN (§10 item 38 + §4.1 note that code-review@settle is now
   bounded-convergent), CHANGELOG (Added + AnomalyType bump), ROADMAP (#4 ✓
   delivered Phase 37.1; v1.2 feature-expansion sequence `#6✓→#2✓→#1✓→#4✓`,
   only #1b/#3/#5 parked remain).

## Affected files

- `packages/types/src/anomaly.ts` — `AnomalyTypeZ += 'code-review-unconverged'`.
- `packages/core/src/notify/code-review.ts` — add `emitCodeReviewUnconverged`
  (alongside `emitCodeReviewHigh`; unconditional/no-throw, clone
  `emitPlanReviewUnconverged`).
- `packages/core/src/cli/commands/settle.ts` — replace the one-shot
  code-review HIGH-refuse with the convergent block (sidecar read →
  `nextConvergence` → persist → reloop/escalate/pass/bypass). Imports:
  `nextConvergence` (`../../verify/converge.js`), `emitCodeReviewUnconverged`.
- `packages/core/tests/cli/settle-codereview-convergence.test.ts` — **new**
  (5 paths a–e).
- `packages/types/tests/anomaly.test.ts` — extend (accept the new type).
- `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md` — docs + #4 ✓ /
  sequence.

## Build sequence (for the plan)

1. `packages/types`: `AnomalyTypeZ += 'code-review-unconverged'`; extend
   anomaly test; build types.
2. `notify/code-review.ts`: add `emitCodeReviewUnconverged` (clone
   `emitPlanReviewUnconverged`).
3. `settle.ts`: replace the code-review one-shot HIGH-refuse with the
   convergent block (Plan→CodeReview port of the shipped 35.1 block; reuse
   `config.convergence`); preserve the exact `--allow-code-review-failure`
   "proceeding past N HIGH finding(s)" line + `SUMMARY.codeReview` recording.
4. New `settle-codereview-convergence.test.ts` (5 paths); **re-run the
   existing `settle-code-review.test.ts` — must stay green**.
5. Docs: DESIGN §10 item 38 + §4.1 note, CHANGELOG, ROADMAP (#4 ✓,
   sequence updated, v1.2 feature-expansion complete bar parked items).
6. Full `pnpm turbo run lint typecheck test build` green (the whole hook —
   32.2/35.1/36.1 lesson; the existing code-review contract + any drift
   guards are invisible to spec/plan-review). Dogfood as CADENCE phase
   `37-codereview-convergence`/`37-01`, tier `standard`, two-commit
   convention. Built via the normal draft→build→settle loop; `auto×standard`
   (code-review is NOT in any `auto` cell per `gates/engine.ts` → it never
   fires on this phase's own settle; no bootstrap). Adds `packages/**`
   tests → settle does **not** use `--allow-missing-coverage`. Push
   user-gated; commits land under the pseudonymous git identity (session
   context).
