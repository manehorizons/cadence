# Design — Review-convergence loop primitive (`#2`)

**Date:** 2026-05-16
**Status:** Approved (brainstorming) — pending spec review + implementation plan
**Context:** CADENCE v1.2 feature-expansion, item **#2** of the survey
(`docs/superpowers/2026-05-16-cadence-expansion-survey.md`). Sequenced second
(after #6, shipped Phase 34.1). It is the core thing superpowers has that
cadence lacks: **iteration** (bounded review→fix→re-review→escalate) rather
than a one-shot pass/refuse gate. v1 wraps the existing `plan-review` gate at
`cadence draft approve`; the primitive is built once so #4 (auto-remediation,
a later survey item) reuses it at a different attach-point without rework.

## Problem

`plan-review` (Phase 25.1, fires `strict×complex` at `draft approve`) is
**stateless one-shot**: `verifier.verify({draft})` → `{pass,findings[]}`; on
`!pass` it prints findings and refuses (exit 1) unless
`--allow-plan-review-failure`. A `<id>-PLAN-REVIEW.json` sidecar is written
(Phase 29.7 G3): `{draftId,pass,provider,model?,findings:count,at}`. The
human/agent edits the DRAFT and re-runs `draft approve`; the review runs
fresh. **cadence tracks nothing across attempts** — no counter, no
"attempt N", no hard escalation when the plan keeps failing. There is no
bounded loop and no "stop looping, a human must decide" stop — the exact
discipline superpowers provides (`review→fix→re-review until pass; max N then
surface to human`).

cadence-core is a **host-agnostic engine** with review-only verifiers and no
DRAFT author/generator. So the "fix" between attempts is necessarily
external (the host's agent or the human edits the DRAFT). The decided model
(user-approved): build a reusable bounded-converge primitive whose default
remediation is *surface-and-reloop* (external fix); an auto-fix strategy is
explicitly out of scope and is #4's sanctioned later attach-point.

## Goals

- A reusable, pure convergence primitive usable by any gate (plan-review
  now; #4's settle-gate later) — "build the engine once".
- Per-DRAFT attempt tracking + history, persisted without a `state.json`
  schema change (extend the existing 29.7 sidecar).
- A hard, bounded escalation at `maxAttempts` (default 3) that stops the
  loop and forces a human decision (distinct message + a new anomaly +
  refuse unless the existing override flag).
- Backward-compatible with pre-existing 29.7-shape sidecars and configs
  lacking the new block.
- Zero gate-matrix change: plan-review still fires exactly where it did;
  convergence changes *how it fails*, not *whether it fires*.

## Non-Goals (YAGNI)

In-core auto-fixer / DRAFT generator (host-agnostic-anchor violation; this
is #4's later attach-point + the parked #3/#5 territory); a per-invocation
`--max-convergence` flag (config default + `--allow-plan-review-failure`
suffice); convergence on any gate other than plan-review (that is #4);
mtime/diff heuristics to "reset" attempts (every re-run is a legitimate
attempt — counting no-op re-runs toward escalation is correct and prevents
infinite looping); a generic strategy-pattern framework (only the `external`
behavior ships; the seam for #4 is a documented boundary, not built code).

## Architecture

### The primitive — `packages/core/src/verify/converge.ts` (new, pure)

```
export type ConvergeVerdict = 'pass' | 'reloop' | 'escalate';

export function nextConvergence(
  pass: boolean,
  attemptsSoFar: number,   // failing attempts already recorded (>= 0)
  maxAttempts: number,     // > 0
): { verdict: ConvergeVerdict; attempt: number }
```

Semantics (pure, no I/O):
- `pass === true` → `{ verdict: 'pass', attempt: attemptsSoFar }`.
- `pass === false`, `attemptsSoFar + 1 < maxAttempts` →
  `{ verdict: 'reloop', attempt: attemptsSoFar + 1 }`.
- `pass === false`, `attemptsSoFar + 1 >= maxAttempts` →
  `{ verdict: 'escalate', attempt: attemptsSoFar + 1 }`.

So with `maxAttempts: 3`: 1st fail → reloop(1), 2nd → reloop(2), 3rd →
escalate(3). Gate-agnostic — takes a boolean + counters only; plan-review
supplies the boolean, #4 will too.

### Attempt state — extend the 29.7 sidecar (no `state.json` change)

`<id>-PLAN-REVIEW.json` becomes:

```jsonc
{
  "draftId": "35-01",
  "converged": false,            // true once a review passes
  "attempts": 2,                 // count of recorded FAILING reviews
  "maxAttempts": 3,
  "history": [                   // append-only, one entry per review run
    { "at": "…", "pass": false, "findingsCount": 3, "provider": "mock" }
  ],
  // legacy 29.7 fields kept for compatibility:
  "pass": false, "provider": "mock", "model": "…", "findings": 3, "at": "…"
}
```

Read at `draft approve`: if the file exists and has `attempts` → use it;
if it exists in the **legacy 29.7 shape** (no `attempts`) → treat
`attemptsSoFar = 0` (back-compat — a legacy sidecar means "reviewed once,
pre-convergence"; starting the counter at 0 is the safe, non-escalating
choice). Absent file → `attemptsSoFar = 0`. The block always rewrites the
full new-shape object (preserving the legacy top-level fields for any reader
that still wants them).

### Wiring — `draft approve` plan-review block (`draft.ts` ~254–300)

Replace the one-shot block. When `'plan-review' ∈ gateSet.gates`:
1. Read prior sidecar → `attemptsSoFar`.
2. `res = await verifier.verify({ draft })` (unchanged verifier/factory).
3. `nv = nextConvergence(res.pass, attemptsSoFar, cfg.convergence.maxAttempts)`.
4. Append a `history` entry; set `attempts` (= `nv.attempt` when not pass,
   else unchanged), `converged = res.pass`; atomic-write the sidecar
   (reuse the existing `atomicWriteText` call site).
5. Branch on `nv.verdict`:
   - **pass** → proceed to the existing BUILD transition (happy path
     unchanged; `converged:true` recorded).
   - **reloop** → print each finding (existing format) + a line
     `plan-review: attempt ${nv.attempt}/${maxAttempts} did not pass — fix
     the DRAFT and re-run \`cadence draft approve\`.`; `process.exitCode = 1;
     return;` (no BUILD transition — same as today's refuse, but now
     attempt-aware).
   - **escalate** → print findings + a distinct
     `plan-review did NOT converge after ${maxAttempts} attempts — a human
     decision is required. Re-scope the plan, or pass
     --allow-plan-review-failure to proceed anyway.`; emit a
     `plan-review-unconverged` anomaly (see below); then **hard-refuse**
     (`exitCode 1; return`) **unless `opts.allowPlanReviewFailure`**, in
     which case print the existing `--allow-plan-review-failure set;
     proceeding…` line and continue to BUILD. (`--allow-plan-review-failure`
     already exists and already means "proceed past failing plan-review" —
     reuse it as the unconverged override; no new flag, consistent with the
     codebase's `--allow-*` family.)

### New anomaly — `plan-review-unconverged`

`packages/types/src/anomaly.ts`: `AnomalyTypeZ += 'plan-review-unconverged'`
(additive enum bump — same established precedent as 23.2/23.3/34.1; document
in CHANGELOG; legacy anomaly-log entries are operational, not durable).
Emitted **only on escalate**, severity `error`, context
`{draftId, attempts, maxAttempts, findings: res.findings.length, provider}`.

**Unconditional emission** (deliberate, mirrors Phase 34.1 `skill-audit-miss`
exactly): plan-review fires only in `strict×complex`, and **strict cells
carry no `anomaly-notify` gate** (`gates/engine.ts` DELTAS). The existing
approve-time `coherence-warn` emission *is* `anomaly-notify`-gated and would
therefore be silently suppressed under strict — unacceptable for a hard
human-escalation event. So `plan-review-unconverged` is emitted through the
notifier transport **without** the `anomaly-notify` gate guard, best-effort
/ no-throw, exactly like `notify/skill-audit.ts::emitSkillAuditMiss`. Add
`packages/core/src/notify/plan-review.ts` `emitPlanReviewUnconverged(notifier,
ctx)` modeled on `notify/skill-audit.ts` (refusal/exit is independent of
whether the anomaly write succeeds).

### Config — `packages/types/src/config.ts`

Add (adjacent to the `skillAudit` block added in 34.1, same `.default()`
back-compat idiom):

```ts
convergence: z
  .object({ maxAttempts: z.number().int().positive().default(3) })
  .default({ maxAttempts: 3 }),
```

`defaultConfig` + presets get `convergence: { maxAttempts: 3 }` (presets
spread `defaultConfig`, so they inherit it; the schema `.default()` covers an
old `config.json` lacking the block). `3` matches superpowers' "max 3 then
surface to human".

## Error semantics / risk

- Zero behavior change for the happy path (review passes first try) and for
  every non-`strict×complex` cell (plan-review doesn't fire there).
- Reloop is exactly today's refuse, plus an attempt line + sidecar
  increment — no new failure mode.
- Escalate is the only new hard behavior; it is bounded (≤ maxAttempts),
  always overridable by the **existing** `--allow-plan-review-failure`, and
  records an audit trail (sidecar history + the unconditional anomaly).
- No `state.json` schema change; sidecar + config are additive and
  back-compat (legacy sidecar → attempts 0; missing config block → default).
- No `gates/engine.ts` change → no risk to the profile×tier matrix or other
  gates.
- Counting no-op re-runs (re-approve without editing the DRAFT) toward
  escalation is intentional: it prevents an infinite stateless loop and
  forces the human-decision stop the feature exists to provide.

## Testing

Vitest, in-package (`packages/**`) so `test-coverage` links each AC:

- **`converge` pure unit** (`tests/verify/converge.test.ts`): `pass` → pass;
  fail at `attemptsSoFar=0` w/ max 3 → reloop(1); at `attemptsSoFar=1` →
  reloop(2); at `attemptsSoFar=2` → escalate(3); `maxAttempts=1` first fail
  → escalate(1); pass short-circuits regardless of attempts.
- **config schema** (`packages/types/tests/config.test.ts`, extend):
  `convergence.maxAttempts` default 3 when block absent (back-compat);
  accepts override; rejects non-positive / non-int.
- **anomaly schema** (extend): `AnomalyTypeZ` accepts
  `plan-review-unconverged`.
- **draft-approve integration** (`tests/cli/draft-approve-convergence.test.ts`,
  spawned-CLI idiom, **mock** plan-review provider — deterministic: an
  empty-AC / blank-GWT DRAFT fails, a well-formed one passes; force
  `strict×complex` via DRAFT frontmatter `profile: strict` + `tier: complex`
  with ≥6 tasks, mirroring `settle-code-review.test.ts`'s complex-tier
  fixture): (a) valid plan → pass → BUILD, sidecar `converged:true`;
  (b) bad plan → reloop, exit 1, sidecar `attempts:1`, stderr `attempt 1/3`;
  (c) bad plan re-approved to MAX → escalate, exit 1, distinct
  "did NOT converge after 3 attempts" message, `plan-review-unconverged` in
  the anomaly log (assert it fires **even though strict lacks
  anomaly-notify** — the unconditional-emission lock); (d) escalate +
  `--allow-plan-review-failure` → proceeds to BUILD, anomaly still recorded;
  (e) back-compat: pre-seed a legacy 29.7-shape sidecar (no `attempts`) →
  next failing approve treats it as attempt 1 (not escalation).

## Acceptance criteria (for the DRAFT)

1. Pure `nextConvergence(pass, attemptsSoFar, maxAttempts)` returns
   pass/reloop/escalate per the boundary rules; unit-tested at
   attempts 0 / max-1 / max and `maxAttempts:1`.
2. `<id>-PLAN-REVIEW.json` carries `converged`, `attempts`, `maxAttempts`,
   append-only `history`; legacy 29.7-shape sidecar (no `attempts`) reads as
   `attemptsSoFar = 0`; legacy top-level fields preserved.
3. Reloop: sidecar incremented + findings printed + `attempt N/MAX` line +
   exit 1, no BUILD transition.
4. Escalate at MAX: distinct human-decision message + unconditional
   `plan-review-unconverged` anomaly (fires under strict, where
   `anomaly-notify` is absent) + hard-refuse unless the existing
   `--allow-plan-review-failure` (which then proceeds + records bypass in
   history).
5. `config.convergence.maxAttempts` default 3, back-compat; `AnomalyTypeZ`
   additive `plan-review-unconverged`; no `gates/engine.ts` change;
   happy-path + non-strict×complex behavior unchanged.
6. DESIGN (§10 item 36 + §4.1 note that plan-review is now bounded-convergent
   not one-shot), CHANGELOG (Added + AnomalyType bump), ROADMAP v1.2
   feature-expansion (#2 ✓ delivered, #1 next).

## Affected files

- `packages/core/src/verify/converge.ts` — **new**, pure primitive.
- `packages/core/src/notify/plan-review.ts` — **new**,
  `emitPlanReviewUnconverged` (modeled on `notify/skill-audit.ts`,
  unconditional/no-throw).
- `packages/types/src/anomaly.ts` — `AnomalyTypeZ += 'plan-review-unconverged'`.
- `packages/types/src/config.ts` — `convergence` block + default/presets.
- `packages/core/src/cli/commands/draft.ts` — replace the one-shot
  plan-review block with the converge-wired block (read sidecar, classify,
  persist, branch reloop/escalate/pass).
- `packages/core/tests/verify/converge.test.ts` — **new** pure unit.
- `packages/core/tests/cli/draft-approve-convergence.test.ts` — **new**
  integration (5 paths a–e).
- `packages/types/tests/{config,anomaly}.test.ts` — extend (schema).
- `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md` — docs + #2 ✓ / #1 next.

## Build sequence (for the plan)

1. `packages/types`: `AnomalyTypeZ` bump + `config.convergence` + default;
   extend type tests; `pnpm -C packages/types build`.
2. `verify/converge.ts` + pure unit (TDD red-green).
3. `notify/plan-review.ts` (`emitPlanReviewUnconverged`, mirror skill-audit).
4. `draft.ts`: rewire plan-review block (sidecar read → verify →
   `nextConvergence` → persist new-shape sidecar → reloop/escalate/pass);
   integration tests (5 paths) with the mock provider.
5. Docs: DESIGN §10 item 36 + §4.1 note, CHANGELOG, ROADMAP (#2 ✓, #1 next).
6. Full `pnpm turbo run lint typecheck test build` green; dogfood as CADENCE
   phase `35-review-convergence`/`35-01`, tier `standard`, two-commit
   convention; this phase **adds `packages/**` tests** so settle does **not**
   use `--allow-missing-coverage`. The `35-01` DRAFT is `auto×standard`
   (default) so plan-review does not fire on its own settle — no
   bootstrapping risk. Push user-gated; commits land under the pseudonymous
   git identity (session context, unrelated).
