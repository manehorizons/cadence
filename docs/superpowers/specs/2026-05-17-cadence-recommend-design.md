# CADENCE Recommend — Ranked Next-Moves — Design

**Date:** 2026-05-17
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Branch:** `praxis-intelligence-ledger`
**Parent design:** `synth/docs/superpowers/specs/2026-05-17-cadence-praxis-strategic-intelligence-design.md` (authoritative architecture; §Recommend, lines 336–343)
**Prior slices (shipped on this branch):**

- Slice 1 — Intelligence Ledger: `@cadence/types` recommendation/evidence schemas, `packages/core/src/intelligence/{store,render}.ts`, `cadence recommendation add/list`.
- Slice 2 — Intelligence Inspection: `scan.ts`, thin read-only `backend/cadence.ts` (`PraxisBackend`), pure `inspect.ts` synthesizer (4 flags), `render-inspection.ts`, `cadence inspect` (`inspection.json` + `STRATEGY.md`).

## Summary

This is the third Praxis slice. It adds `cadence recommend`: a pure, deterministic ranking synthesizer over the existing recommendation ledger plus read-only CADENCE backend status. It ranks actionable recommendations by an explainable additive score, partitions the ledger into ranked / parked / needs-attention / excluded buckets, derives a single loop-aware next-action advisory, and persists `.cadence/intelligence/recommend.json` + a rendered `RECOMMEND.md`.

It does **not** add milestone proposal, SPEC export, context packets, code analysis, or any backend write method. Those are later slices.

## Product Boundary (parent design's #1 risk: do not rebuild the loop)

CADENCE already owns the execution loop and its status/next-action surface:

- `cadence status` / `cadence progress` → `loadStatus` / `nextAction(state)` — execution-layer loop context and the single recommended next loop command.

`cadence recommend` is a **strategic** question — "of the captured strategic recommendations, which matters next, and is the loop even free to take it?" — not an execution-loop command. It:

- **reads** the recommendation ledger read-only (`readRecommendationLedger`); never writes it;
- **reads** backend status read-only via the Slice-2 `cadenceBackend.detect`/`readStatus`; never writes `state.json`;
- **never** invokes or forces `SPEC → DRAFT → BUILD → SETTLE` transitions;
- surfaces already-loop-legal commands (from `backend.legalActions`, itself sourced from `nextAction`) only as **plain advisory text**, never as an executed action.

Its artifact `RECOMMEND.md` is deliberately distinct from strategic `STRATEGY.md` (Slice 2) and execution `STATE.md`.

## Scope

### In scope

- Pure scoring function `scoreRecommendation(rec)` — additive, normalized 0–100, every term explainable.
- Pure `partitionLedger(recs)` — ranked / parked / needs-attention / excluded with fixed precedence.
- Pure `buildAdvisory(topRanked | null, backend, counts)` — loop-aware single next-action.
- Pure `synthesizeRecommendation(ledger, backend, now)` assembling the above into a `RecommendationReport`.
- Glue `runRecommend(root)` — read-only ledger + backend reads → synthesize → persist `recommend.json` + `RECOMMEND.md`.
- Pure `renderRecommendMd(report)`.
- New `@cadence/types` schemas: `RecommendationRankZ`, `RecommendationAdvisoryZ`, `RecommendationReportZ` (+ index export).
- `cadence recommend` CLI (default rendered output; `--json` machine-readable, mirroring `cadence inspect --json` / `cadence status --json`).
- Persisted `.cadence/intelligence/recommend.json` + rendered `.cadence/intelligence/RECOMMEND.md`.
- Docs: `docs/reference/commands.md` drift-marker block + `### cadence recommend`; `CHANGELOG.md` Unreleased.

### Out of scope (later slices / parked)

- `cadence milestone propose` / `milestone export` (SPEC-export slice).
- Context packets, milestone pre-mortems.
- `cadence analyze code` recommendation intake.
- Any backend write method (`renderSpecDraft`, `exportMilestone`).
- Any second backend.
- Any mutation of CADENCE loop state.
- Folding live "recent project activity" / loop telemetry into the per-item scalar (see Score Model boundary note — it informs only the advisory).

## Architecture

Approach: mirror the shipped inspection slice layout. All new core modules live under `packages/core/src/intelligence/`; all schemas extend `@cadence/types/src/intelligence.ts`.

### `recommend.ts` — synthesizer + store glue

Pure functions (no IO):

- `scoreRecommendation(rec) → { raw: number; display: number; terms: ScoreTerm[] }`
- `partitionLedger(recs) → { ranked: Recommendation[]; parked: Recommendation[]; needsAttention: Recommendation[]; excludedCount: number }`
- `buildAdvisory(topRanked: Recommendation | null, backend: BackendStatus, counts) → RecommendationAdvisory`
- `synthesizeRecommendation(ledger, backend, now) → RecommendationReport` — partitions, scores + sorts the ranked bucket, builds the advisory, assembles totals, `RecommendationReportZ.parse`.

Glue (IO):

- `runRecommend(root, now?) → RecommendationReport` — `readRecommendationLedger` (read-only) + `cadenceBackend.detect` + `cadenceBackend.readStatus` (read-only; `stateError` tolerated, not thrown) → `synthesizeRecommendation` → `mkdir intelligenceDir` → `atomicWriteJSON recommend.json` → `atomicWriteText RECOMMEND.md`.

### `render-recommend.ts`

Pure `renderRecommendMd(report) → string`, mirroring `renderRecommendationsMd` / `renderStrategyMd` conventions (heading, generated-from note, ranked list with score + why-line, parked section, needs-attention callout, advisory block, empty-ledger case).

### `@cadence/types/src/intelligence.ts` (extended) + index export

### `cli/commands/recommend.ts` + `register.ts`

`cadence recommend`: `runRecommend(cwd)` → print `renderRecommendMd(report)`. `--json` writes the `recommend.json` content to stdout instead (mirrors `cadence inspect --json`). Registered in `register.ts`. `docs/reference/commands.md` drift-marker block updated + `### cadence recommend` section (**mandatory** — the Phase 31.1 `cli-reference.test.ts` drift guard set-compares `registerAllCommands` against the commands.md marker block and fails otherwise; durable lesson from Phases 35.1/36.1). `CHANGELOG.md` Unreleased entry.

## Score Model — additive, normalized 0–100

`scoreRecommendation` is a **pure function of the `Recommendation` alone**.

Numeric component (from existing `RecommendationZ` fields, all already range-bounded by the Slice-1 schema — `leverageScore` ∈ [0,10], `riskScore` ∈ [0,10], `confidence` ∈ [0,1]):

```
numeric = leverageScore * 1.0
        + (confidence * 10) * 0.6
        - riskScore * 0.5
```

Range: min `-5` (lev 0, conf 0, risk 10), max `16` (lev 10, conf 1, risk 0).

Categorical point adjustments:

| Field | Value → points |
|---|---|
| `status` | accepted **+6** · candidate **0** (deferred not ranked; rejected/converted excluded) |
| `readiness` | ready-for-cadence-spec **+10** · ready-for-milestone **+7** · needs-decision **+2** · needs-evidence **+1** · raw-idea **0** · blocked **−12** |
| `decayState` | fresh **+4** · aging **+1** · stale **−6** · needs-revalidation **−5** (superseded/contradicted never reach scoring — see Partition) |
| `priority` | critical **+8** · high **+5** · medium **+2** · low **0** |

```
raw = numeric + statusPts + readinessPts + decayPts + priorityPts
```

Fixed documented bounds over the **ranked** universe: `MIN = -23` (numeric −5, status 0, readiness blocked −12, decay −6, priority 0), `MAX = 44` (numeric 16, status +6, readiness +10, decay +4, priority +8).

```
display = clamp(round((raw - MIN) / (MAX - MIN) * 100), 0, 100)
```

`round` is JS `Math.round` (round-half-up, the language default); this is pinned because the why-line example and table tests assert exact `display` values, and a banker's-rounding reimplementation would silently break them. Divisor `MAX - MIN = 67`.

Sorting uses `raw` (not the rounded `display`, to avoid rounding ties); stable tiebreak: `createdAt` ascending, then `id` ascending.

Each invocation returns `terms: ScoreTerm[]` — one entry per contributing factor (`{ label, value }`) — rendered verbatim in the per-item why-line, e.g.:

```
lev 7 → +7.0 · conf .80 → +4.8 · risk 3 → −1.5 · status accepted +6 · ready ready-for-milestone +7 · decay fresh +4 · prio high +5 ⇒ raw 32.3 (score 83)
```

**Boundary note (deliberate, documented).** The parent design's "considers … CADENCE state, recent project activity" clause is satisfied at the **advisory layer**, not inside the scalar. Keeping the scalar a pure function of the recommendation alone makes it exhaustively table-testable and keeps ranking reproducible regardless of repo/loop state. This is an explicit scope decision, not an omission.

## Eligibility Partition — pure `partitionLedger(recs)`

Each recommendation is routed by **first matching** rule (strict top-down precedence):

1. `status ∈ {rejected, converted}` → **excluded** entirely (contributes to `excludedCount` only; never displayed).
2. else `decayState ∈ {superseded, contradicted}` → **needs-attention** callout (rot surfaced, never silently dropped — parent Backlog-Rot risk). This **overrides** a `deferred` status (a contradicted-deferred rec is a rot signal first).
3. else `status == deferred` → **parked** section (listed, unranked).
4. else (`status ∈ {candidate, accepted}` and decay ∉ {superseded, contradicted}) → **ranked**. `decayState ∈ {stale, needs-revalidation}` still rank but their negative `decayPts` sink them.

Only the **ranked** bucket is scored and sorted. Parked and needs-attention are listed without scores. The precedence (esp. needs-attention overriding deferred) is an explicit, test-pinned contract.

## Advisory — pure `buildAdvisory(topRanked | null, backend, counts)`

Loop-aware, read-only, never forces a transition (Q3 decision; parent #1 risk).

- **Loop in-flight** — `backend.present === true` && `loopPosition` neither absent nor `IDLE` && (`activeDraft` || `activeSpec`):
  - primary = "Finish in-flight CADENCE loop work first." surfacing `backend.legalActions[0]` (if any) as plain text;
  - secondary = top ranked item's resolved action (see fallback below), if a ranked item exists.
  - Note: a loop whose `loopPosition` is non-IDLE but whose corresponding active field is *missing* (e.g. `DRAFT` with no `activeDraft` — the Slice-2 `loop-state-inconsistent` condition) fails the `(activeDraft || activeSpec)` guard and is therefore treated as **not-in-flight**: an inconsistent loop should not block strategic advice. Deliberate.
- **Loop idle / no backend** — top ranked item exists:
  - primary = that item's resolved action; if its `readiness === 'ready-for-cadence-spec'`, advise `cadence spec new` instead.
- **No ranked items at all**:
  - primary = "No actionable recommendations — add one with `cadence recommendation add`."
  - if needs-attention non-empty, append: "N recommendation(s) need revalidation (`cadence inspect`)."

**Resolved action.** `suggestedBackendAction` is schema-optional on `Recommendation` (Slice-1 manual intake always sets `cadence milestone propose`, but other future intake paths may not). Wherever a branch above uses "resolved action", it is: the item's `suggestedBackendAction` if present, else the literal default `cadence milestone propose`. This guarantees `RecommendationAdvisoryZ.primary` (a required string) is never `undefined`. `secondary` is omitted entirely when there is no ranked item.

The advisory only ever names commands already legal/applicable; it is text output, never an executed transition.

## Data Model (Zod, extending `@cadence/types/src/intelligence.ts`)

```ts
ScoreTermZ = { label: string; value: number }

RecommendationRankZ = {
  id: string;
  title: string;
  raw: number;
  score: number;            // 0..100 display
  status: RecommendationStatus;
  readiness: RecommendationReadiness;
  priority: RecommendationPriority;
  decayState: RecommendationDecayState;
  terms: ScoreTerm[];
  suggestedBackendAction?: string;
}

RecommendationAdvisoryZ = {
  kind: 'finish-loop' | 'top-recommendation' | 'spec-new' | 'empty';
  primary: string;
  secondary?: string;
}

RecommendationReportZ = {
  schemaVersion: 1;                       // z.literal(1), like the other ledgers
  generatedAt: string;                    // ISO8601 offset
  ranked: RecommendationRank[];
  parked:  Array<{ id; title; status; readiness }>;
  needsAttention: Array<{ id; title; decayState }>;
  advisory: RecommendationAdvisory;
  totals: { total: number; ranked: number; parked: number;
            needsAttention: number; excluded: number };
}
```

## Flow

```
cadence recommend
→ readRecommendationLedger(root)               [IO, read-only]
→ cadenceBackend.detect(root) + readStatus(root)[IO, read-only; stateError tolerated]
→ synthesizeRecommendation(ledger, backend, now)[pure: partition → score+sort → advisory → totals]
→ RecommendationReportZ.parse
→ mkdir intelligenceDir
→ atomicWriteJSON recommend.json; atomicWriteText RECOMMEND.md
→ print renderRecommendMd(report)   (or, with --json, write recommend.json to stdout)
→ exit 0
```

## Error Handling

Follows the existing CLI idiom (degrade gracefully; `stderr` + `process.exitCode = 1` only on genuine failure):

- Empty / absent ledger → empty `ranked`, advisory `kind: 'empty'`, artifacts still written; exit 0.
- No `.cadence/` backend → `backend.present = false`; advisory uses the idle/top-recommendation path; exit 0.
- Corrupt `state.json` → Slice-2 `readStatus` surfaces `stateError` (no throw); advisory treats loop as not-in-flight; exit 0.
- Artifact write failure → `stderr` + exit 1.

## Testing (per CADENCE test idioms)

- `packages/types/tests/intelligence.test.ts` (extend): `RecommendationReportZ` accepts a valid report; rejects `schemaVersion ≠ 1`.
- `packages/core/tests/intelligence/recommend.test.ts` — table-driven, zero IO:
  - `scoreRecommendation`: max-ish, min-ish, and one case isolating each categorical term; verify `terms` content and `display` clamp/normalization.
  - `partitionLedger`: routing for each bucket; precedence — contradicted-deferred → needs-attention (overrides parked); rejected/converted → excluded count only.
  - sort: stable tiebreak by `createdAt` then `id` at equal `raw`.
  - `buildAdvisory`: loop-in-flight → finish-loop (+legalActions surfaced); idle + top item → top-recommendation; top item `ready-for-cadence-spec` → spec-new; empty ranked → empty (+needs-attention suffix).
- `packages/core/tests/intelligence/render-recommend.test.ts`: structural — heading, ranked rows with score + why-line, parked section, needs-attention callout, advisory block, empty-ledger case.
- `packages/core/tests/cli/recommend.test.ts`: spawned-CLI idiom (`tempRepo({ initialized: true })`, `spawn(process.execPath, [CADENCE_CLI, 'recommend'])`) — exit 0; `recommend.json` + `RECOMMEND.md` written; `--json` emits parseable JSON; degraded path (no `.cadence/`, empty ledger) still exits 0. `afterEach` cleanup. Core built before this file runs (rebuild-order idiom).
- `packages/core/tests/docs/cli-reference.test.ts` stays green via the commands.md drift-block update.
- **Done bar:** full `pnpm turbo run lint typecheck test build` (mirrors `.githooks/pre-push`; not a subset — durable lesson from Phases 35.1/36.1/38.1).

## Commit Convention

Continues this branch's raw-superpowers per-task commit style, plan-doc-first:

1. `docs: design — CADENCE Recommend (Praxis)` — this spec.
2. `docs: implementation plan — CADENCE Recommend (Praxis)` — the writing-plans output.
3. Per-task `feat`/`test`/`docs` commits.

All commits on `praxis-intelligence-ledger`. Push is user-authorized for this branch (long-lived integration branch, draft PR #9, not merged to `main`) — build first, push after the full gate is green.

## Success Criteria

- `cadence recommend` on a CADENCE repo emits a ranked actionable list whose every row's score is fully explained by its why-line terms.
- Partition precedence holds exactly: rejected/converted invisible (counted), superseded/contradicted in needs-attention (even when deferred), deferred parked, candidate/accepted ranked with stale/needs-revalidation sunk.
- The advisory is loop-aware and never emits or forces a loop transition; mid-flight loop yields a finish-first advisory surfacing existing legal actions as text.
- Degrades gracefully on empty ledger, no `.cadence/`, and corrupt `state.json` (exit 0).
- `--json` mirrors `cadence inspect --json`.
- Full repo gate green.

## Follow-On (not in this slice)

- `cadence milestone propose` / `milestone export --to cadence` (SPEC-export slice).
- Context packets; milestone pre-mortems.
- `cadence analyze code` evidence-backed recommendation intake.
- Folding live recent-activity/telemetry signals into ranking (only if a concrete, low-false-positive signal is identified).
