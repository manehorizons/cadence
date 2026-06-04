---
phase: 57-rec-promote
id: 57-01
tier: standard
status: PENDING
---

# 57-01 — recommendation promote — status + readiness CLI

## Objective

Add `cadence recommendation promote <recId>` to advance a recommendation's
`status` and/or `readiness`, making the `milestone propose` pipeline reachable
for manually-added recommendations (it needs `status=accepted` +
`readiness∈{ready-for-milestone,ready-for-cadence-spec}`).

> Note: the design contract for this phase lives in `57-01-SPEC.md` (written +
> structurally checked; its formal approve stamp was lost to a `git restore`
> mishap, so the loop proceeded straight to DRAFT — the SPEC remains the
> authoritative scope record).

## Acceptance Criteria

### AC-1: promote sets readiness
Given a `candidate` recommendation at readiness `needs-evidence`
When the operator runs `cadence recommendation promote <id> --readiness ready-for-milestone`
Then the rec's readiness becomes `ready-for-milestone`, `updatedAt` is refreshed, and the ledger is persisted (JSON + rendered `.md`).

### AC-2: promote sets status
Given a `candidate` recommendation
When the operator runs `cadence recommendation promote <id> --status accepted`
Then the rec's status becomes `accepted`.

### AC-3: promote sets both at once → milestone-eligible
Given a `candidate` / `needs-evidence` recommendation
When the operator runs `cadence recommendation promote <id> --status accepted --readiness ready-for-milestone`
Then the rec is `accepted` + `ready-for-milestone`, and a subsequent `cadence milestone propose` clusters it into a proposed candidate (no longer "None").

### AC-4: at least one field required
Given any recommendation
When the operator runs `cadence recommendation promote <id>` with neither `--status` nor `--readiness`
Then it refuses with a clear message and exits 1 (no mutation).

### AC-5: invalid values are rejected
Given any recommendation
When `--status` or `--readiness` is given a value outside the allowed enum
Then it refuses naming the allowed values and exits 1 (no mutation).

### AC-6: terminal recs cannot be promoted
Given a recommendation already in status `converted` (or `rejected`)
When the operator runs `cadence recommendation promote <id> --status accepted`
Then it refuses (a converted/rejected rec is terminal) and exits 1 (no mutation).

### AC-7: unknown id is a clean error
Given no recommendation with the given id
When `cadence recommendation promote <id> --status accepted` runs
Then it reports the id was not found and exits 1.

## Design notes

- Pure helper `applyRecommendationPromotion(ledger, id, { status?, readiness? }, now)`
  in `store/recommendations.ts`, mirroring `applyRecommendationTransition`:
  returns `{ ok, ledger } | { ok:false, error }`. Validates id exists, rec not
  terminal (`converted`/`rejected`), at least one change requested; applies
  changes + refreshes `updatedAt`; never sets `convertedToPhaseId`.
- I/O wrapper `runRecommendationPromotion(root, id, changes)`: read ledger →
  apply → `writeIntelligenceLedgers` (atomic JSON + `.md` re-render).
- CLI `recommendation promote <recId>` in `commands/recommendation.ts`:
  `--status <s>` / `--readiness <r>` parsed + validated with
  `RecommendationStatusZ` / `RecommendationReadinessZ` (status restricted to
  non-`converted` values). Empty change set → refuse (AC-4).

## Tasks

### T1: pure `applyRecommendationPromotion` + status/readiness validation
- files: `packages/core/src/intelligence/store/recommendations.ts`, `packages/core/tests/intelligence/recommendation-promote.test.ts`
- action: add the pure helper (status+readiness setters, terminal-state + not-found + empty-change guards, `convert`-only `converted`); export a `PROMOTABLE_STATUS` set excluding `converted`.
- verify: `pnpm --filter @manehorizons/cadence-core test -- recommendation-promote.test.ts` — sets readiness (AC-1), sets status (AC-2), refuses empty change (AC-4), refuses terminal rec (AC-6), unknown id error (AC-7).
- done: AC-1, AC-2, AC-4, AC-6, AC-7

### T2: I/O wrapper + `recommendation promote` CLI command
- files: `packages/core/src/intelligence/store/recommendations.ts`, `packages/core/src/cli/commands/recommendation.ts`, `packages/core/tests/cli/recommendation-promote.test.ts`
- action: add `runRecommendationPromotion`; register `recommendation promote <recId>` with `--status`/`--readiness`, enum validation (AC-5), exit codes; persist via `writeIntelligenceLedgers`.
- verify: `pnpm --filter @manehorizons/cadence-core test -- cli/recommendation-promote.test.ts` (built CLI) — invalid enum value exits 1 naming allowed values (AC-5); promote persists across a reload.
- done: AC-5

### T3: end-to-end — promoted rec becomes milestone-eligible
- files: `packages/core/tests/cli/recommendation-promote.test.ts`
- action: integration test: add a rec → `promote --status accepted --readiness ready-for-milestone` → `milestone propose` clusters it (output is no longer "None" / `--json` candidate count ≥ 1).
- verify: same suite — the milestone-propose assertion passes.
- done: AC-3

## Boundaries

- DO NOT allow `--status converted` — that transition stays owned by `recommendation convert` / `spec|draft new --from-rec` (it sets the phase FK). Promote must never write `convertedToPhaseId`.
- DO NOT hand-roll ledger writes — reuse `writeIntelligenceLedgers` (atomic JSON + `.md` re-render).
- DO NOT couple status and readiness (they are independent axes); `milestone propose` enforces the combination it needs.
- DO NOT change `applyRecommendationTransition`/`convert` behavior or any other command.
- DO NOT mutate loop state or run a gate.
