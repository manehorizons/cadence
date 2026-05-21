# CADENCE `cadence recommendation show <id>` — Deep-Dive Single-Rec View — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Slice:** 14 (follow-on to Slice 11 — Rec Link Backfill; Slice 12 — Rec MD Render Links; Slice 13 — Decision Status + Transitions)
**Predecessor slice docs:**
- [`2026-05-20-cadence-rec-link-backfill-design.md`](2026-05-20-cadence-rec-link-backfill-design.md) (Slice 11 — populated `assumptionIds[]` / `decisionIds[]`)
- [`2026-05-20-cadence-rec-md-render-links-design.md`](2026-05-20-cadence-rec-md-render-links-design.md) (Slice 12 — surfaced link arrays in `RECOMMENDATIONS.md`; § Follow-On listed `cadence recommendation show <id>` as next consumer)
- [`2026-05-20-cadence-decision-status-transitions-design.md`](2026-05-20-cadence-decision-status-transitions-design.md) (Slice 13 — decision status; this slice optionally filters on it)
- [`2026-05-20-cadence-assumption-decision-intake-design.md`](2026-05-20-cadence-assumption-decision-intake-design.md) (Slice 8 — assumption + decision intake)
- [`2026-05-17-cadence-recommend-design.md`](2026-05-17-cadence-recommend-design.md) (`cadence recommend` ranked-report renderer — separate report surface; this slice is a single-rec deep-dive, not a re-implementation)

## Summary

**Slice 14** ships `cadence recommendation show <id>` — a read-only single-recommendation deep-dive that consolidates every cross-reference Slice 11–13 built into one operator-facing terminal output. Reads `recommendations.json` + `evidence.json` + `assumptions.json` + `decisions.json`. Refuses unknown id with exit 1. Optional flags `--open-assumptions-only` and `--active-decisions-only` filter to status-narrow views. No mutation. No new top-level commands (subcommand on existing `cadence recommendation` parent — Phase-31.1 drift guard untripped).

- **`cadence recommendation show <id>`** — prints the rec's full envelope, all linked open + non-open assumptions, all linked active + non-active decisions, evidence, affected files/areas. Per-entry one-line summary per child.
- **`--open-assumptions-only`** — narrows assumptions[] to `status === 'open'`. Default: all statuses.
- **`--active-decisions-only`** — narrows decisions[] to `status === 'active'`. Default: all statuses.
- **Refuses unknown id**: exit 1, stderr `recommendation <id> not found\n`. No partial output.

It does **not** write any file, change `@cadence/types` schemas, modify `addRecommendation` / `addAssumption` / `addIntelligenceDecision`, transition any subject status, mutate `assumptionIds[]` / `decisionIds[]`, touch `state.json` / `STATE.md` / `cadence spec new` / loop transition, add a `--format json` flag (terminal text is the contract), or perform a fresh fs/git scan.

## Product Boundary

Strict read-only across the board:

- Writes nothing.
- Reads `.cadence/intelligence/{recommendations,evidence,assumptions,decisions}.json` only.
- **NEVER** calls `cadence spec new`, **NEVER** reads/writes `state.json` / `STATE.md`, **NEVER** transitions `SPEC→DRAFT→BUILD→SETTLE`.
- The subcommand changes no loop state and forces no transition.

## Scope

### In scope

- New pure function `renderRecommendationDetail(rec, evidence, assumptions, decisions, options): string` in a new file `packages/core/src/intelligence/render-recommendation-detail.ts`.
- New CLI subcommand `cadence recommendation show <id> [--open-assumptions-only] [--active-decisions-only]` registered in `cli/commands/recommendation.ts`.
- The subcommand reads all four ledgers via existing readers, validates id, calls the renderer, prints to stdout.
- Test coverage per ACs (pure-function tests for the renderer + spawn-CLI tests for the subcommand).

### Out of scope (later / parked)

- `--format json` machine-readable output. Defer until an actual consumer needs it.
- Markdown file-write variant (`cadence recommendation show <id> --to <path>`).
- A `cadence assumption show <id>` / `cadence decision show <id>` parallel surface.
- Filter combinations like `--evidence-after <ts>` or `--rec-status accepted`.
- Embedding milestone export targets if present (Slice-4b `IntelligenceMilestone.exportTargets` cross-ref — separate consumer).
- Inline supersededBy graph (Slice-13 follow-on field doesn't exist yet).
- Any `@cadence/types` schema change.
- A `state.json` / loop transition / `cadence spec new` side effect of any kind.

## Architecture

### MODIFIED files

- `packages/core/src/cli/commands/recommendation.ts`:
  - + `cmd.command('show <id>')` block reading 4 ledgers, calling renderer, printing.

### NEW files

- `packages/core/src/intelligence/render-recommendation-detail.ts` — pure renderer.
- `packages/core/tests/intelligence/render-recommendation-detail.test.ts` — AC-1..AC-7 pure-function vitest.
- `packages/core/tests/cli/recommendation-show.test.ts` — AC-8..AC-11 spawn-CLI tests.

### Untouched

- `packages/core/src/intelligence/store.ts` — readers reused; no new helpers.
- `packages/core/src/intelligence/render.ts` (the rec-ledger renderer) — separate concern.
- `packages/core/src/intelligence/render-recommend.ts` (the ranked-report renderer) — separate concern.
- `cli/register.ts` — no new top-level commands.
- `docs/reference/commands.md` `<!-- cadence:commands -->` marker block — UNCHANGED (Phase-31.1 drift guard untripped).
- `@cadence/types` — no schema change.

## Data Model

No new types. The renderer signature uses existing `Recommendation`, `Evidence`, `Assumption`, `IntelligenceDecision`.

```ts
export type RenderRecommendationDetailOptions = {
  openAssumptionsOnly?: boolean;
  activeDecisionsOnly?: boolean;
};

export function renderRecommendationDetail(
  rec: Recommendation,
  evidence: Evidence[],
  assumptions: Assumption[],
  decisions: IntelligenceDecision[],
  options?: RenderRecommendationDetailOptions,
): string;
```

The CLI is responsible for narrowing the input arrays to only those linked to the rec BEFORE calling the renderer. The renderer is dumb — it renders what it's given. Status filtering is applied INSIDE the renderer based on options (so the linked-but-filtered narrative stays accurate).

Actually — cleaner: CLI passes ALL assumptions/decisions linked to the rec; renderer applies the status filter when an option is set. This keeps the renderer's "summary counts" honest: "3 linked (1 active, 2 superseded; showing 1 active)" reads better than "3 linked but only 1 here for unstated reasons."

Settled: renderer takes the linked subset (CLI prunes), renderer optionally filters by status, and prints both "total linked" and "shown" counts in the header line for the bucket.

## Render Policy

### Output shape

```
# <rec.id> — <rec.title>

- status: <rec.status>
- ready: <rec.readiness>
- priority: <rec.priority>
- leverage: <rec.leverageScore>/10
- risk: <rec.riskScore>/10
- confidence: <round(rec.confidence * 100)>%
- decay: <rec.decayState>
- created: <rec.createdAt>
- updated: <rec.updatedAt>
- areas: <comma-joined>          (if rec.affectedAreas.length > 0)
- files: <comma-joined>          (if rec.affectedFiles.length > 0)
- next: <rec.suggestedBackendAction>  (if set)

## Summary

<rec.summary>

## Assumptions (<shown>/<total>)

### <as.id> — <as.text>
- status: <as.status>
- recorded: <as.createdAt>

(repeated; empty bucket → `_(none)_`)

## Decisions (<shown>/<total>)

### <dec.id> — <dec.title>
- status: <dec.status>
- decided: <dec.decidedAt>

<dec.rationale>

(repeated; empty bucket → `_(none)_`)

## Evidence (<count>)

- <ev.kind>: <ev.summary>          (one per evidence row; `(<ev.path>)` appended if path set; `\`<ev.command>\`` appended if command set)
- ...
```

Empty rec.summary → omit the `## Summary` block. Empty evidence array → `_(none)_`.

### Header counts

`## Assumptions (1/3)` reads "1 shown out of 3 linked." When `--open-assumptions-only` filters out 2, the header makes the filtering self-explanatory. Same for decisions.

Without filter flags: `## Assumptions (3/3)`.

### Insertion order

Within each bucket, preserve the source array order (ledger insertion order from Slice-11 derive).

### `- next: <rec.suggestedBackendAction>` placement

Same fixed-arity bullet slot as Slice-12 `- assumptions:` / `- decisions:` placement on the rec-ledger MD. Reuses existing field semantics.

## Flow

```
cadence recommendation show <id> [flags]:
  ├─ readRecommendationLedger
  ├─ if id not in ledger: stderr `recommendation <id> not found`, exit 1
  ├─ readEvidenceLedger / readAssumptionLedger / readIntelligenceDecisionLedger
  ├─ filter evidence to rec.evidenceIds
  ├─ filter assumptions to rec.assumptionIds (link arrays from Slice 11 / 13)
  ├─ filter decisions to rec.decisionIds   (link arrays from Slice 11)
  ├─ render = renderRecommendationDetail(rec, evidenceLinked, asLinked, decLinked, opts)
  └─ stdout.write(render)
```

The CLI narrows by id THEN passes to renderer. Renderer applies optional status filtering and computes shown/total counts.

## Error Handling

| Failure | Path | Behavior |
|---|---|---|
| `<id>` not in ledger | CLI hard-exit | exit 1, stderr `recommendation <id> not found\n` |
| Ledger JSON corrupt | thrown by reader | exit 1, stderr `recommendation show failed: <message>\n` |
| Ledger absent | reader returns empty → unknown-id refusal | exit 1, stderr `recommendation <id> not found\n` |
| Missing `<id>` arg | commander usage error | non-zero exit |

**Strict read-only audit:** subcommand writes nothing.

## Acceptance Criteria

| AC | Statement | Linked test surface |
|---|---|---|
| AC-1 | `renderRecommendationDetail(rec, [], [], [])` emits header (`# <id> — <title>`), all envelope bullets (status/ready/priority/leverage/risk/confidence/decay/created/updated), `## Summary` block, `## Assumptions (0/0)` with `_(none)_`, `## Decisions (0/0)` with `_(none)_`, `## Evidence (0)` with `_(none)_`. | `tests/intelligence/render-recommendation-detail.test.ts` |
| AC-2 | Conditional bullets `- areas:` / `- files:` / `- next:` emitted only when source field non-empty. | `render-recommendation-detail.test.ts` |
| AC-3 | Populated assumptions bucket: per-entry `### <as.id> — <as.text>`, `- status:`, `- recorded:`. Insertion order preserved. Header `## Assumptions (N/N)`. | `render-recommendation-detail.test.ts` |
| AC-4 | Populated decisions bucket: per-entry `### <dec.id> — <dec.title>`, `- status:`, `- decided:`, rationale on own line. Insertion order preserved. Header `## Decisions (N/N)`. | `render-recommendation-detail.test.ts` |
| AC-5 | `openAssumptionsOnly: true` filters bucket to `status === 'open'`. Header shows shown/total: `## Assumptions (1/3)`. Empty filtered bucket emits `_(none)_`. | `render-recommendation-detail.test.ts` |
| AC-6 | `activeDecisionsOnly: true` filters bucket to `status === 'active'`. Header shows shown/total. Empty filtered bucket emits `_(none)_`. | `render-recommendation-detail.test.ts` |
| AC-7 | Evidence rendered with kind prefix; `(<path>)` appended for `kind: 'file'` entries with path; `\`<command>\`` appended for `kind: 'command'` entries with command. | `render-recommendation-detail.test.ts` |
| AC-8 | CLI `cadence recommendation show <id>` on existing rec → exit 0, stdout contains `# <id> — <title>`. Reads all 4 ledgers correctly (no thrown error on missing optional ledgers). | `tests/cli/recommendation-show.test.ts` |
| AC-9 | CLI on unknown id → exit 1, stderr `recommendation <id> not found\n`, NO partial stdout. | `recommendation-show.test.ts` |
| AC-10 | CLI `--open-assumptions-only` flag passes through to renderer (verified via header `(X/Y)` substring + missing non-open assumption ids). | `recommendation-show.test.ts` |
| AC-11 | CLI `--active-decisions-only` flag passes through to renderer (verified via header + missing non-active decision ids). | `recommendation-show.test.ts` |
| AC-12 | Phase-31.1 cli-reference drift guard passes UNCHANGED. NO new top-level commands; marker block UNCHANGED. | `tests/docs/cli-reference.test.ts` |
| AC-13 | Strict read-only: no file writes occur during a `show` invocation. Asserted by capturing fs snapshot of `.cadence/intelligence/` before and after the call. | `recommendation-show.test.ts` |

## Testing (per CADENCE test idioms)

- **Pure-function vitest** for `renderRecommendationDetail` (AC-1..AC-7).
- **Spawn-CLI pattern** for the new subcommand (AC-8..AC-11, AC-13). Reuse the `run()` helper pattern from `tests/cli/assumption-transition.test.ts`.
- **Test-coverage gate (Phase 14):** every AC maps to ≥1 linked test.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (16/16). Lint included.

## Commit Convention

Mirror Slice 9–13 per-task commits. Praxis workstream.

```
docs: design + plan — cadence recommendation show (Praxis Slice 14)
feat(core): renderRecommendationDetail pure renderer (Slice 14)
feat(core): CLI cadence recommendation show (Slice 14)
docs: document cadence recommendation show + reconcile Slice-11/12/13 follow-refs (Slice 14)
```

Four commits — smaller slice (read-only consumer, no schema, no migration, no transition).

## Success Criteria

The slice succeeds if:

1. All 13 ACs pass.
2. Full turbo gate green at every task's done-bar (16/16; lint included).
3. Slice-11 / Slice-12 / Slice-13 § Follow-On entries citing `cadence recommendation show <id>` (or "single-rec deep-dive") reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. Phase-31.1 cli-reference drift guard passes UNCHANGED.
6. Branch HEAD pushes clean through pre-push; PR #9 stays draft + unmerged.

## Decision Log

1. **Subcommand on existing `cadence recommendation` parent**, not a new top-level command. Phase-31.1 drift guard untripped.
2. **Pure renderer + thin CLI**, same architecture as every recent Praxis slice. Pure function easy to test exhaustively; CLI is a 4-ledger-read shim.
3. **Renderer takes pre-filtered (by-id) arrays, applies status filter optionally.** CLI prunes to id-matched subset; renderer optionally narrows further on status. Lets the renderer compute honest "shown/total" header counts.
4. **No `--format json`.** Terminal text is the contract. JSON would be a new consumer surface; if needed, add later.
5. **No `--to <path>` markdown-file write.** Operator can `> file.md` via shell redirect. Avoids overlap with existing `RECOMMENDATIONS.md` ledger render.
6. **Filter flags off by default.** Show everything; let operator narrow. Inverse default would hide audit-trail data (superseded decisions, rejected assumptions) which is often exactly what operator wants to see.
7. **Header count format `(N/M)`** = "N shown / M total linked". Self-documenting; no need to explain the filter inline.
8. **No new readers / store helpers.** The 4 existing readers cover everything. Renderer is the only new pure function.
9. **No `cadence assumption show` / `cadence decision show` parallels in this slice.** Each subject's `list` already covers the one-line case; deep-dive view only really pays off for recommendations because they're the join-table of the intelligence layer.
10. **Empty `## Summary` omitted, not rendered with `_(none)_`.** Rec.summary is required (`z.string().min(1)`); empty case is impossible. The block is unconditional.
11. **Evidence rendered as bullets** (matches Slice-1 render style), not as sub-section. Evidence entries are typically 1-line notes; sub-sections would over-format.
12. **`--open-assumptions-only` + `--active-decisions-only` are independent flags.** Operator may combine; commonest combination would be both (operator-glance current-state view).
13. **No re-derive of link arrays at show time.** Trust Slice-11 backfill. If link arrays are stale (e.g. operator hand-edited a sibling ledger and didn't trigger the next add's self-heal), `show` will reflect the persisted link arrays — same contract as `RECOMMENDATIONS.md` render (Slice 12).

## Follow-On (not in this slice)

- **`cadence recommendation show --format json`** machine-readable output.
- **`cadence recommendation show --to <path>`** markdown file-write variant.
- **`cadence assumption show <id>` / `cadence decision show <id>`** parallel deep-dive surfaces.
- **`--filter` combinations** (`--evidence-after`, `--rec-status accepted`).
- **`supersededBy <id>`** field on decision + graph rendering in show output.
- **Status-aware variant of Slice-12 `- decisions:` bullet** (separate consumer slice; carry per-link status badge).
- **Rec↔phase linkage** display (`cadence milestone propose --to-phase` integration).
- **Auto-dispatch / subagent routing** — forever-deferred per parent design.
