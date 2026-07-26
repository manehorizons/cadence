---
phase: mil-rec-rec-20260725-008
id: 00-00
status: PENDING
---

# 00-00 — Deepen the convergent-review protocol

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260725-008`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

nextConvergence() is a shallow 6-line classifier; the real weight -- ConvergenceSidecar read/write, the history-entry shape, and the pass/reload/escalate branch -- is copy-pasted at all 4 call sites (plan-review, code-review, spec-approve x2). Evidence of drift: all four independently write an identically-redundant ternary. A runConvergentReview({label, sidecar, verify, bypassFlag, idField}) would absorb the clone.

## Acceptance Criteria

### AC-1: Deepen the convergent-review protocol
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- Changing the convergence policy itself (attempt/reloop/escalate thresholds, nextConvergence's logic) — this is a dedup/shape refactor only, not a behavior change
- Unifying the four distinct *Unconverged emit/notify functions into one payload shape
- code-review's HIGH-only finding-severity filtering (collectHighFindings) — stays local to code-review, not part of the shared convergence runner

## Open Questions

- [operator] plan-review and code-review reach the sidecar via ctx-injected ports (ctx.planReviewSidecar, ctx.codeReviewSidecar); spec-approve is a plain service function using existsSync/readFile/atomicWriteText directly with no ctx — the shared runner must work across both calling conventions
- [operator] Return-type differs per caller: gates return GateResult({outcome, summaryPatch, reason}), spec-approve returns exitCode — the shared runner cannot return one shape; the caller must still own the outcome-to-return-value mapping
- [operator] Each site emits a different *Unconverged notify function (ctx.emit.planReviewUnconverged, ctx.emit.codeReviewUnconverged, emitSpecReviewUnconverged, emitUiSpecReviewUnconverged) with different payload shapes — must stay pluggable per call site, not unified
- [operator] Normalizing the four sidecar JSON shapes (draftId vs specId key, legacy 29.7 top-level fields) risks silently changing on-disk sidecar format that existing fixtures/tests assert on byte-for-byte
- [operator] code-review's bypass condition is (force === true || allowCodeReviewFailure === true) while the other 3 sites use a single flag; a generic bypassFlag callback must model the OR without special-casing code-review
- [operator] code-review wraps verify() in try/catch with its own throw-path bypass semantics; the other 3 call sites do not catch — folding into one runner risks adding/dropping try/catch behavior at a site that never had (or needs) it
