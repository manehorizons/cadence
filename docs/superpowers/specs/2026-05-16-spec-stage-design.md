# Design — brainstorm→spec stage (`#1`)

**Date:** 2026-05-16
**Status:** Approved (brainstorming) — pending spec review + implementation plan
**Context:** CADENCE v1.2 feature-expansion, item **#1** of the survey
(`docs/superpowers/2026-05-16-cadence-expansion-survey.md`). Sequenced after #6
(34.1) and #2 (35.1) deliberately: the survey's rationale is "spec-review
**reuses #2's convergence**". This is the heaviest survey item; the design is
scoped to a **minimal v1** (the stage + a convergent spec-review gate),
deferring the SPEC→DRAFT content auto-seed.

## Problem

CADENCE ships the back half: `DRAFT → BUILD → SETTLE`. The front half — turn a
vague objective into a coherent, reviewed spec — happens entirely outside the
tool (this whole session runs it manually via superpowers
brainstorming→spec→spec-review). cadence has no pre-DRAFT stage, no SPEC
artifact, and no spec-review. A DRAFT is hand-authored with no enforced
"is this the right thing to build, and is it coherent?" gate before task
breakdown.

cadence-core is a **host-agnostic engine** with review-only verifiers and no
generator (the locked anchor that parked survey #3/#5 and bounded #4). So #1
is **not** an in-core spec generator. The user-approved shape: cadence
**scaffolds + validates** the SPEC; the host agent/human authors it externally
(via superpowers brainstorming — exactly the meta-loop this project already
runs). The spec-review gate **reuses Phase 35.1's `nextConvergence`** — the
explicit payoff of sequencing #1 after #2.

## Goals

- A real, enforced pre-DRAFT `SPEC` loop position: `IDLE → spec new → SPEC →
  spec approve → IDLE` (+ approved-spec sidecar), with `draft new` refusing
  while `loopPosition==='SPEC'`.
- A `<id>-SPEC.md` artifact + minimal `SpecZ` schema + parser, parallel to
  `DraftZ`/`draft-parser.ts`.
- A **convergent** spec-review gate at `cadence spec approve` that **reuses
  `nextConvergence`** (Phase 35.1) and its sidecar/history shape verbatim.
- Apply the Phase 35.1 flag-semantics lesson from the start:
  `--allow-spec-review-failure` bypasses ANY failing review → proceed
  (`bypassed:true`); the convergence loop is the non-bypass path.
- Opt-in by use (no `gates/engine.ts` matrix change); fully additive /
  backward-compatible.

## Non-Goals (YAGNI / deferred — recorded in ROADMAP)

In-core spec generator (host-agnostic-anchor violation — parked #3/#5
territory); **SPEC→DRAFT content auto-seed** (`draft new` reading the approved
SPEC to pre-fill objective/ACs — manual carry-over in v1; this is the deferred
"#1b"); spec-review profile×tier matrix placement (opt-in by running
`cadence spec new` at all); anthropic/local SpecReview prompt tuning beyond a
basic system prompt; a new convergence-bound config (reuse
`config.convergence.maxAttempts` from #2).

## Architecture

Everything here mirrors an existing, shipped pattern — the design is
deliberately low-novelty (parallels `draft new/check/approve` + the Phase 35.1
plan-review convergence verbatim).

### Loop position — `packages/types/src/state.ts`

`LoopPositionZ = z.enum(['SPEC','DRAFT','BUILD','SETTLE','IDLE'])` (add
`'SPEC'`). Backward-compat: old `state.json` never carries `'SPEC'`.

New state field **`activeSpec`** — follow the existing `activeDraft` idiom
exactly (NOT an optional property): `activeSpec: z.string().nullable()` in
`CadenceStateZ` with `emptyState` → `activeSpec: null` (and, for old
`state.json` lacking the key, `.default(null)` mirroring `draftReadAt`).
`spec new` sets `state.activeSpec = id`; **`spec approve` on pass clears it
(`state.activeSpec = null`)** alongside `loopPosition='IDLE'` — exactly how
`settle` resets `activeDraft` to `null` on the BUILD→IDLE close — so a
subsequent `draft new` never sees a stale active spec. On reloop/escalate
`activeSpec` is left intact (still in the SPEC stage).

Flow:
- `cadence spec new <phase> <num>` — refuses unless `loopPosition==='IDLE'`
  (mirrors `draft new`'s IDLE guard). Scaffolds
  `.cadence/phases/<phase>/<id>-SPEC.md`, sets `loopPosition='SPEC'`,
  `state.activePhase/activeSpec`.
- `cadence spec check <path>` — coherence-ish read-only check (mirrors
  `draft check <path>`: structural sanity, no state mutation).
- `cadence spec approve <phase> <num>` — runs the convergent spec-review gate
  (below). On **pass/converged**: SPEC.md `status: APPROVED`, write the
  approved-spec sidecar, `loopPosition='IDLE'` (so the existing IDLE-gated
  `draft new` proceeds unchanged — zero `draft new` churn). On
  reloop/escalate: stays `SPEC`, exits 1 (see gate).
- `draft new` gains one guard: if `loopPosition==='SPEC'`, refuse with
  "approve or discard the active spec first (`cadence spec approve …`)" —
  the only change to existing `draft` code.

**MANDATORY compile-gate fix (not cosmetic):** `packages/core/src/progress.ts`
`nextAction` is a `switch (state.loopPosition)` with arms for
`IDLE/DRAFT/BUILD/SETTLE`, **no `default`**, non-optional `NextAction` return.
Under the repo's strict tsconfig, adding `'SPEC'` to `LoopPositionZ` makes
this switch non-exhaustive → `nextAction` **fails `typecheck`** (not all paths
return). So a `case 'SPEC':` arm in `packages/core/src/progress.ts` is a
**required same-change edit** (the full pre-push gate runs `typecheck`), not a
later nicety. The `SPEC` arm returns the spec-stage next hint
(`cadence spec approve …` / `cadence spec check …`). NOTE: the renderer
`packages/core/src/render/state-md.ts` interpolates `loopPosition` as plain
text and needs **no** SPEC arm — `progress.ts` is the only render-side file
that must change.

### SPEC artifact + schema

`<phase>/<id>-SPEC.md` frontmatter `phase`,`id` (`/^\d{2}-\d{2}$/`),
`status: PENDING|APPROVED`; sections: `## Objective`, `## Acceptance
Criteria` (AC-N Given/When/Then, same shape as DRAFT), `## Constraints`,
`## Open Questions`.

`packages/types/src/spec.ts` — `SpecZ` (parallels `DraftZ`, minimal):
`{ schemaVersion: z.literal(1), id, phase, objective, acceptanceCriteria:
AcceptanceCriterion[] (reuse the existing AcceptanceCriterionZ from plan.ts),
constraints: string[], openQuestions: string[], status }`.
`packages/core/src/parse/spec-parser.ts` — `parseSpecMd(raw): Spec`, a
near-clone of `draft-parser.ts` (frontmatter + section extraction + the same
AC parser; reuse helpers where exported, otherwise mirror).

### Convergent spec-review gate — reuses Phase 35.1 verbatim

`packages/core/src/verify/spec-review.ts` — `SpecReviewVerifier` interface +
`Mock`/`Anthropic`/`Local` impls, **structurally a clone of
`verify/plan-review.ts`** (review-only; result `{pass, findings[], provider,
model?}`; `PlanReviewFinding`-shaped findings). Mock floor: `pass` iff
objective non-empty trimmed AND ≥1 AC AND every AC has non-empty G/W/T AND
≥1 constraint; one HIGH finding per defect (deterministic offline floor —
same philosophy as `MockPlanReviewVerifier`).

`packages/core/src/verify/spec-review-factory.ts` — `selectSpecReviewVerifier(cfg)`
parallel to `selectPlanReviewVerifier` (provider from `config.specReview`,
env-driven for local, anthropic-key fallback to mock with warn — identical
factory pattern).

`cadence spec approve` wiring is a **direct port of the Phase 35.1
plan-review block** in `draft.ts` (the just-shipped convergent block):
1. `sidecarPath = <phase>/<id>-SPEC-REVIEW.json`. Read prior `attempts`
   (legacy/absent → 0), `history` (append-only). **Same sidecar shape and
   `nextConvergence` call as plan-review.**
2. `res = verifier.verify({ spec })`; `maxAttempts =
   cfg?.convergence?.maxAttempts ?? 3` (**reuse #2's config — no new knob**);
   `nv = nextConvergence(res.pass, attemptsSoFar, maxAttempts)`;
   `bypassed = !res.pass && opts.allowSpecReviewFailure === true` (the Phase
   35.1-corrected flag semantics, applied from the start).
3. Persist sidecar `{specId, converged, attempts, maxAttempts, history[
   {at,pass,findingsCount,provider,model?,verdict,bypassed?} ], …legacy
   top-level }` (identical structure to `<id>-PLAN-REVIEW.json`).
4. Branch (identical control flow to the shipped plan-review block):
   - `res.pass` → SPEC.md `status: APPROVED`, `loopPosition='IDLE'`,
     proceed.
   - `!res.pass` + `--allow-spec-review-failure` → print findings; if
     `nv.verdict==='escalate'` emit the anomaly (`bypassed:true`); print
     `spec-review: --allow-spec-review-failure set; proceeding past N
     finding(s).`; approve anyway (SPEC→IDLE, APPROVED).
   - `!res.pass`, no flag, `reloop` → print findings + `spec-review: attempt
     N/MAX did not pass — fix the SPEC and re-run \`cadence spec approve\`,
     or pass --allow-spec-review-failure to proceed anyway.`; exit 1; stays
     `SPEC`.
   - `!res.pass`, no flag, `escalate` → emit anomaly (no bypass); print
     `spec approve refused: spec-review did NOT converge after MAX
     attempts — a human decision is required. Re-scope the spec, or pass
     --allow-spec-review-failure to proceed anyway.`; exit 1; stays `SPEC`.

`--allow-spec-review-failure` is a new `.option(...)` on `spec approve`
(+ `allowSpecReviewFailure?: boolean` in its action `opts` type — the Phase
34.1 lesson: extend the inline opts type literal or typecheck fails).

### Anomaly + emission

`packages/types/src/anomaly.ts`: `AnomalyTypeZ += 'spec-review-unconverged'`
(additive bump — 23.2/23.3/34.1/35.1 precedent; CHANGELOG-documented).
`packages/core/src/notify/spec-review.ts` —
`emitSpecReviewUnconverged(notifier, ctx)`, a near-clone of
`notify/plan-review.ts::emitPlanReviewUnconverged`: **unconditional** (NOT
`anomaly-notify`-gated — same rationale as 34.1/35.1; spec-review isn't even
a matrix cell so there's no gate to key off, and a hard human-escalation must
leave an audit trail), no-throw, refusal independent of emission.

### Config

`packages/types/src/config.ts`: add (adjacent to `skillAudit`/`convergence`,
same `.default()` back-compat idiom):

```ts
specReview: z
  .object({
    provider: z.enum(['mock', 'anthropic', 'local']).default('mock'),
    model: z.string().optional(),
  })
  .default({ provider: 'mock' }),
```

`defaultConfig` + presets get `specReview: { provider: 'mock' }`. Reuses
the existing `config.convergence.maxAttempts` for the loop bound.

## Error semantics / risk

- 100% inert for any project that never runs `cadence spec new` (no new
  matrix cell; `draft new`'s only new behavior is a guard that triggers
  solely when `loopPosition==='SPEC'`, a state only `spec new` can set).
- The convergence path is a **proven primitive** (#2 shipped + gate-verified
  this milestone, incl. the flag-semantics correction) — reused verbatim, so
  low novel risk; the bulk of #1 is parallel-structure cloning of
  `draft.ts`/`plan-review.ts`/`notify/plan-review.ts`.
- Additive schema only (`LoopPositionZ`, `AnomalyTypeZ`, `config.specReview`,
  new `SpecZ`); old state/config/draft load unchanged; no `state.json`
  breaking change; no `gates/engine.ts` change.
- New stage cannot strand the loop: `spec new` only from IDLE; `spec
  approve` either advances to IDLE (approved) or stays SPEC (refuse). Escape
  is always available via `--allow-spec-review-failure`. **No `spec discard`
  command is in v1 scope** (the codebase has no `draft discard` either —
  discard is manual); discarding an active spec = hand-edit `.cadence/state.json`
  (`loopPosition`→`IDLE`, `activeSpec`→`null`) + delete the `<id>-SPEC.md`.
  Document this manual escape in the SPEC-stage user docs / the `spec`
  command help text; do not infer a `spec discard` command.

## Testing

Vitest, in-package (`packages/**`) so `test-coverage` links each AC. No
re-test of `nextConvergence` (Phase 35.1 owns it).

- `spec-parser` pure unit: frontmatter + sections + AC parse; absent
  optional sections → `[]`.
- config/anomaly schema (extend existing): `specReview` default mock +
  back-compat; `LoopPositionZ` accepts `'SPEC'`; `AnomalyTypeZ` accepts
  `spec-review-unconverged`.
- `spec` integration (spawned-CLI idiom, mirror
  `draft-approve-convergence.test.ts`, **mock** SpecReview provider): (a)
  `spec new` from IDLE → SPEC.md scaffolded, `loopPosition==='SPEC'`;
  (b) `draft new` while SPEC → refused; (c) good SPEC (the "good" fixture
  **must include ≥1 Constraint** — MockSpecReview's floor requires it, which
  is intentionally stricter than MockPlanReview; a constraint-less SPEC would
  (correctly) fail the mock) → `spec approve` → pass, `status:APPROVED`,
  `loopPosition==='IDLE'`, `activeSpec` cleared to `null`,
  `<id>-SPEC-REVIEW.json converged:true`; then `draft new` works;
  (d) bad SPEC → reloop, exit 1, `attempt 1/3`, sidecar `attempts:1`,
  stays SPEC; (e) bad SPEC ×maxAttempts → escalate, exit 1,
  `spec-review-unconverged` anomaly present (unconditional); (f) escalate +
  `--allow-spec-review-failure` → approved, IDLE, history `bypassed:true`,
  anomaly present; (g) legacy/absent sidecar → attemptsSoFar 0.

## Acceptance criteria (for the DRAFT)

1. `LoopPositionZ += 'SPEC'`; `state.activeSpec: z.string().nullable()`
   (`activeDraft` idiom, `emptyState` `null`, `.default(null)`);
   `packages/core/src/progress.ts` `nextAction` gains a `case 'SPEC':` arm
   (mandatory — the exhaustive no-`default` switch fails `typecheck`
   otherwise); `cadence spec new <phase> <num>` (IDLE-gated) scaffolds
   `<id>-SPEC.md` + `loopPosition='SPEC'` + `activeSpec=id`; `cadence draft
   new` refuses while `loopPosition==='SPEC'`.
2. `SpecZ` + `spec-parser` (objective/ACs/constraints/openQuestions; reuses
   `AcceptanceCriterionZ`; additive/back-compat); `cadence spec check`
   read-only structural check.
3. `cadence spec approve` runs `SpecReviewVerifier` (mock/anthropic/local,
   `selectSpecReviewVerifier`) through `nextConvergence` with
   `<id>-SPEC-REVIEW.json` attempts/history (same shape as plan-review's);
   pass → SPEC.md APPROVED + `loopPosition='IDLE'` + `activeSpec=null`.
4. reloop: incremented sidecar + findings + `attempt N/MAX` line + exit 1,
   stays SPEC, no APPROVED.
5. escalate at `config.convergence.maxAttempts`: distinct message +
   unconditional `spec-review-unconverged` anomaly + hard-refuse unless
   `--allow-spec-review-failure`; the flag bypasses ANY fail (reloop OR
   escalate) → APPROVED+IDLE + `bypassed:true` history (Phase 35.1 semantics
   from the start).
6. `config.specReview` default mock (back-compat); `AnomalyTypeZ` additive
   `spec-review-unconverged`; no `gates/engine.ts` change; DESIGN (§10 item
   37 + §4.1 note), CHANGELOG (Added + AnomalyType bump), ROADMAP (#1 ✓
   delivered Phase 36.1, deferred #1b SPEC→DRAFT auto-seed noted, sequence
   updated, #4 next).

## Affected files

- `packages/types/src/state.ts` — `LoopPositionZ += 'SPEC'`; `activeSpec:
  z.string().nullable()` (+ `emptyState` `null`, `.default(null)` for
  back-compat) — `activeDraft` idiom, NOT optional.
- `packages/types/src/spec.ts` — **new** `SpecZ` (+ reuse `AcceptanceCriterionZ`).
- `packages/types/src/anomaly.ts` — `AnomalyTypeZ += 'spec-review-unconverged'`.
- `packages/types/src/config.ts` — `specReview` block + default/presets.
- `packages/core/src/parse/spec-parser.ts` — **new**, mirrors draft-parser.
- `packages/core/src/verify/spec-review.ts` — **new**, mirrors plan-review.
- `packages/core/src/verify/spec-review-factory.ts` — **new**, mirrors
  plan-review-factory.
- `packages/core/src/notify/spec-review.ts` — **new**, mirrors
  notify/plan-review.
- `packages/core/src/cli/commands/spec.ts` — **new** command
  (`new`/`check`/`approve`), mirrors `draft.ts` structure incl. the Phase
  35.1 convergent-approve block.
- `packages/core/src/cli/commands/draft.ts` — one `loopPosition==='SPEC'`
  refusal guard in `draft new`.
- `packages/core/src/cli/index.ts` (or the registrar) — register `spec`.
- `packages/core/src/progress.ts` — **mandatory** `case 'SPEC':` arm in
  `nextAction` (the exhaustive no-`default` switch fails `typecheck` without
  it once `LoopPositionZ` gains `'SPEC'`). `render/state-md.ts` needs **no**
  change (interpolates `loopPosition` as text).
- `packages/core/tests/**` — spec-parser unit; spec integration (7 paths);
  config/anomaly/state schema extensions.
- `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md` — docs + #1 ✓ /
  deferred #1b / sequence.

## Build sequence (for the plan)

1. `packages/types`: `LoopPositionZ`+`SPEC`, `state.activeSpec`
   (`.nullable().default(null)`, `emptyState` `null`), `SpecZ` (spec.ts),
   `AnomalyTypeZ` bump, `config.specReview`; extend type tests; build types.
2. `spec-parser.ts` + pure unit (mirror draft-parser; TDD).
3. `spec-review.ts` + `spec-review-factory.ts` (clone plan-review +
   factory); `notify/spec-review.ts` (clone notify/plan-review).
4. `spec.ts` command (new/check/approve — port the Phase 35.1 convergent
   block; clear `activeSpec` on pass); `draft.ts` SPEC guard; register
   command; **`progress.ts` `case 'SPEC':` arm (mandatory — typecheck
   fails without it; `render/state-md.ts` needs no change)**.
   Integration tests (7 paths).
5. Docs: DESIGN §10 item 37 + §4.1 note, CHANGELOG, ROADMAP (#1 ✓,
   deferred #1b, `#4 next`, sequence).
6. Full `pnpm turbo run lint typecheck test build` green (the whole
   pre-push hook — Phase 32.2/35.1 lesson; rewiring/adding a command MUST
   be validated by the full gate, not just new tests); dogfood as CADENCE
   phase `36-spec-stage`/`36-01`, tier `standard`, two-commit convention.
   Phase built via the normal `draft→build→settle` loop (NOT `cadence spec
   new` — no bootstrapping the new stage on itself); `auto×standard` so
   plan/spec-review don't fire on its own settle; adds `packages/**` tests
   so settle does NOT use `--allow-missing-coverage`. Push user-gated;
   commits land under the pseudonymous git identity (session context).
