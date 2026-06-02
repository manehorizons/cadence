---
phase: 42-emit-unconverged
id: 42-01
tier: standard
status: DONE
---

# 42-01 — `emitUnconverged` notify spine

## Objective

(Architecture review candidate #4.) Three convergence emitters under `packages/core/src/notify/` (`plan-review.ts`, `spec-review.ts`, `code-review.ts` — ~48 LoC each) share an identical try / notify / stderr-degrade / ts-stamp spine; ~70% is duplication. Extract `emitUnconverged(notifier, kind, payload)`; the three sites supply only the payload. Pure bit-identical refactor — an internal swap *behind* the `ctx.emit.*Unconverged` ports (39.4/39.7 consume convergence emission through them), so the extracted gates need no re-touch and 42.1 is order-independent w.r.t. 39.x. `emitCodeReviewHigh` is a different (multi-event) shape and stays untouched.

## Acceptance Criteria

### AC-1: single home for the transport contract
Given the new `notify/emit-unconverged.ts` module
When any convergence emitter needs to dispatch
Then `emitUnconverged` is the single home for the convergence transport contract (try → `notifier.notify([event])` → catch → one `process.stderr.write` warning, never throws → `ts: new Date().toISOString()` stamp)

### AC-2: each emitter ≤ 8 LoC
Given the three emitters `plan-review.ts`, `spec-review.ts`, `code-review.ts`
When they are rewritten to delegate
Then each becomes ≤ 8 LoC — a destructure of its payload (`draftId`/`specId`, attempts, maxAttempts, findings, provider, optional model/bypassed) plus a single `emitUnconverged(...)` call, with public signatures byte-identical to callers

### AC-3: stderr-degrade identical across all three kinds
Given a notifier whose `notify` throws
When `emitUnconverged` runs for any kind
Then the stderr-degrade behavior is identical across all three kinds and is centrally tested once in `emit-unconverged.test.ts`

### AC-4: a fourth emitter costs ≤ 4 LoC
Given the `KIND_META` table mapping `kind` → `{ type, entityKey }`
When a fourth convergence emitter is added
Then it costs ≤ 4 LoC (one `KIND_META` row + a thin builder), the message template and context field order being shared

### AC-5: notifier injection seam unchanged
Given the `ctx.emit.*Unconverged` ports and the three public emitter signatures
When the spine is introduced
Then the injection seam is byte-identical to callers and the existing notify + `draft-approve-convergence` / `settle-codereview-convergence` / `spec-stage` convergence E2E suites pass unchanged

## Tasks

### T1: spine unit test (TDD red)
- files: `packages/core/tests/notify/emit-unconverged.test.ts`
- action: assert exact `type`, `message`, and `context` shape each kind produces (bit-identical proof for all three), the ts-stamp, single-event dispatch, and the stderr-degrade-on-throw path; mirror the literal-string assertions in `notifier.test.ts`
- verify: red against absent module
- done: AC-1, AC-3

### T2: add emit-unconverged spine + rewrite emitters (green)
- files: `packages/core/src/notify/emit-unconverged.ts`, `packages/core/src/notify/plan-review.ts`, `packages/core/src/notify/spec-review.ts`, `packages/core/src/notify/code-review.ts`
- action: add the spine with `UnconvergedKind` + `UnconvergedPayload` + `KIND_META`; shrink the three emitters to payload builders that delegate; leave `emitCodeReviewHigh` untouched
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run notify/emit-unconverged`
- done: AC-1, AC-2, AC-4

### T3: full gate + bit-identical regression
- files: (none — verification)
- action: run the full `pnpm turbo run lint typecheck test build` gate; confirm the notify + draft/settle/spec convergence E2E suites pass unchanged
- verify: full gate green; convergence suites unchanged
- done: AC-5

## Boundaries

- DO NOT touch `emitCodeReviewHigh` — it is a different (multi-event, per-finding, caller-gated) shape, not part of this extraction.
- DO NOT change the three public emitter signatures or the `ctx.emit.*Unconverged` ports — gates need no re-touch.
- DO NOT change `state.json`, `config`, or `gates/engine.ts`; no new flag, loop position, or anomaly type.
- DO NOT alter emitted bytes — message body, context field order (`<entityKey>, attempts, maxAttempts, findings, provider, …model?, …bypassed?`), and `severity: 'error'` are bit-identical.
- DO NOT pass `model`/`bypassed` as explicit `undefined` — conditional-spread present-or-absent (exactOptionalPropertyTypes).
