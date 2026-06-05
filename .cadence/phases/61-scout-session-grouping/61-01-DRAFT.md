---
phase: 61-scout-session-grouping
id: 61-01
tier: standard
status: PENDING
---

# 61-01 — First-class scout-session grouping (scoutId)

## Objective

Add an optional `scoutId` to recommendations so the N recs landed by one
`/cadence-scout` session are groupable and queryable as a set — end to end
(schema → `--scout-id` flag → `/cadence-scout` auto-population → inline render +
`--scout-id` filter in `cadence recommend`).

## Acceptance Criteria

### AC-1: scoutId is an optional, loosely-validated field on the recommendation schema
Given a recommendation record
When it is parsed by `RecommendationZ` (and ranked by `RecommendationRankZ`)
Then `scoutId` is accepted as an optional non-empty string, the key is absent
when not supplied, and an empty-string `scoutId` is rejected.

### AC-2: `recommendation add --scout-id <id>` persists the scoutId
Given `cadence recommendation add` invoked with `--scout-id scout-20260605-1430`
When the recommendation is written to the ledger
Then the stored rec has `scoutId: "scout-20260605-1430"`; when the flag is
omitted the `scoutId` key is absent from the stored rec.

### AC-3: `cadence recommend` carries and renders scoutId
Given a ranked recommendation that has a `scoutId`
When `cadence recommend` builds and renders the report
Then the ranked report item carries `scoutId` and the rendered output shows a
`- scout: <id>` line under that rec (and no such line for recs without one).

### AC-4: `cadence recommend --scout-id <id>` narrows the report to one cluster
Given a ledger containing recs from two different scout sessions
When `cadence recommend --scout-id scout-A` runs
Then only recs with `scoutId === "scout-A"` appear in the report and the totals
reflect the scoped set.

### AC-5: `/cadence-scout` mints and passes a scout id end to end
Given the installed `cadence-scout` slash command
When its managed body is generated
Then it instructs minting one `scout-YYYYMMDD-HHMM` id per session and appending
`--scout-id <id>` to every `cadence recommendation add` it runs (alongside the
existing `--evidence` note).

## Tasks

### T1: Add optional `scoutId` to the schema layer
- files: `packages/types/src/intelligence.ts`
- action: Add `scoutId: z.string().min(1).optional()` to `RecommendationZ`
  (beside `convertedToPhaseId`) and to `RecommendationRankZ`.
- verify: `pnpm --filter @manehorizons/cadence-types test`
- done: AC-1

### T2: Persist scoutId via the add path
- files: `packages/core/src/intelligence/store/recommendations.ts`,
  `packages/core/src/cli/commands/recommendation.ts`
- action: Add `scoutId?: string` to `AddRecommendationInput`; set `rec.scoutId`
  only when present (exactOptionalPropertyTypes). Add `--scout-id <id>` option to
  the `add` command and plumb it conditionally into the input.
- verify: `pnpm --filter @manehorizons/cadence-core test -- recommendation`
- done: AC-2

### T3: Carry scoutId into the report + add the `--scout-id` filter
- files: `packages/core/src/intelligence/recommend.ts`,
  `packages/core/src/services/recommend.ts`,
  `packages/core/src/cli/commands/recommend.ts`
- action: `synthesizeRecommendation`/`runRecommend` accept an optional `scoutId`
  filter — when set, narrow the rec list to that cluster before partition (totals
  reflect the scoped set). Carry `scoutId` into each `rankedOut` item when present.
  Thread `--scout-id <id>` through the command + service.
- verify: `pnpm --filter @manehorizons/cadence-core test -- recommend`
- done: AC-3, AC-4

### T4: Render the inline `- scout:` line
- files: `packages/core/src/intelligence/render-recommend.ts`
- action: Emit `- scout: <id>` under a ranked rec when it has a `scoutId`.
- verify: `pnpm --filter @manehorizons/cadence-core test -- render-recommend`
- done: AC-3

### T5: Wire `/cadence-scout` to mint + pass `--scout-id`
- files: `packages/host-claude-code/src/install-commands.ts`,
  `packages/host-claude-code/tests/install-commands.test.ts`
- action: Update the `cadence-scout` body to mint one `scout-YYYYMMDD-HHMM` id at
  session start and append `--scout-id <id>` to each `recommendation add` (keep
  the `--evidence` note).
- verify: `pnpm --filter @manehorizons/cadence-host-claude-code test`
- done: AC-5

### T6: Document the flags
- files: `docs/reference/commands.md`
- action: Document `--scout-id` on `recommendation add` and the `--scout-id`
  filter on `recommend`, plus the `scout-YYYYMMDD-HHMM` convention.
- verify: manual read; `pnpm lint`
- done: AC-2, AC-4

## Boundaries

- DO NOT change scoring, decay, or ranking behavior for recs without a `scoutId` —
  this is purely additive; existing reports must be byte-identical when no rec has
  a scoutId.
- DO NOT enforce the `scout-YYYYMMDD-HHMM` format in the Zod schema (loose
  validation by design; convention lives in docs + the scout prompt).
- DO NOT bump package versions or touch `CLAUDE.md` in this phase — release is a
  separate step; the doc-sync gate must stay dormant.
- DO NOT remove or replace the existing `--evidence` provenance note in
  `/cadence-scout`; scoutId is additive to it.
