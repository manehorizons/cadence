# Session Handoff — 2026-05-20 (Praxis Slices 14–25)

Continues `SESSION-2026-05-20-praxis-slice-10-11.md`. This session shipped **12 consecutive Praxis slices** (14 through 25) building the strategic-intelligence layer's read-only consumer surface — single-subject deep-dive (`show`), admin trifecta (`intelligence reconcile`/`stats`/`audit`), and full list ergonomics (`--format json` × `--filter-status` × `--filter-rec` × `--filter-text` × `--limit`).

## TL;DR for the next session

- **12 slices shipped + PUSHED this session.** Branch HEAD `0259119` → `9f6f3ec`. 51 commits added on top of prior handoff.
- **`intelligence` is now a registered top-level command** (Slice 17, first new top-level since Praxis layer began). Drift guard updated in lockstep.
- **Branch:** `praxis-intelligence-ledger`, synced 0/0. Tree clean except untracked `graphify-out/` (carry-forward).
- **Gate GREEN** at HEAD: `pnpm turbo run lint typecheck test build` → 16/16 turbo tasks; `@cadence/core` 117 test files / 884 tests pass; ~45s wall.
- **PR #9:** 181 commits, OPEN, isDraft, untouched as draft. NOT merged to `main`. CADENCE public release HELD until Praxis fully integrated.
- **Loop is IDLE** (`cadence progress` → "No active draft"). Praxis sits ABOVE the loop.
- **NEXT REAL WORK = OPEN.** Strong candidates: rec↔phase linkage (biggest; needs upstream design), `supersededBy <id>` decision field, `--offset` pagination, bulk transitions. Several smaller list-ergonomics knobs remain (`--reverse`, `--sort-by`, `--filter-regex`, `--filter-text-exact`).

## What landed this session

### Slice-by-slice summary

| Slice | Theme | HEAD | Commits |
|---|---|---|---|
| 14 | `cadence recommendation show <id>` deep-dive | `29b6b85` | 4 |
| 15 | `RECOMMENDATIONS.md` status-annotated link bullets + transition propagation | `a42c65c` | 3 |
| 16 | `cadence assumption show` + `cadence decision show` parallels | `0259119` | 3 |
| 17 | `cadence intelligence reconcile` (new top-level command) | `36ae71b` | 3 |
| 18 | `cadence intelligence stats [--by-rec]` | `4bdde0a` | 3 |
| 19 | `cadence intelligence audit [--quiet]` | `31b4cc4` | 3 |
| 20 | `--format json` on show/stats/audit (5 commands) | `72f3740` | 3 |
| 21 | `--format json` on list (3 commands) | `d1cdb43` | 3 |
| 22 | `--filter-status` on list (3 commands) | `0e4c860` | 3 |
| 23 | `--filter-rec` on assumption/decision list | `745b060` | 3 |
| 24 | `--limit <n>` on list (3 commands) | `63e919b` | 3 |
| 25 | `--filter-text <substr>` on list (3 commands) | `9f6f3ec` | 3 |

Every slice carries a per-design `2026-05-20-cadence-*-design.md` doc under `docs/superpowers/specs/` and reconciles its predecessors' `§ Follow-On` entries via strike+annotate.

### Architectural patterns established

- **Pure renderer + thin CLI** for every read-only surface. CLI assembles inputs, calls pure function, writes to stdout. Tests cover renderer purely + CLI via spawn.
- **`--format <terminal|json>`** uniform pattern across 8 commands (5 show/stats/audit + 3 list). Default `terminal` preserves back-compat; `json` emits pretty-printed JSON envelope. Invalid format → exit 1 + `<cmd> failed: unsupported format: <foo>`.
- **List filter precedence**: status → rec → text → limit. AND semantics. Empty-after-filter terminal message lists active filter dimensions: `No <subject> matching <dim1>, <dim2> recorded.\n`. JSON mode → `[]`.
- **Transition propagation**: Slice-15 wired `runAssumptionTransition` + `runDecisionTransition` to re-render `RECOMMENDATIONS.md` (via new `rerenderRecommendationsMdIfPresent`) so status changes immediately update the annotated `- assumptions: as-1 (open), ...` bullets on linked rec entries.
- **Schema additives stay additive**: Slice-13 `IntelligenceDecisionZ.status: z.enum(...).default('active')` lets pre-existing JSON parse cleanly with no migration. Same pattern available for future schema additions.

### Files structure today

- `packages/core/src/intelligence/` — 6 new pure renderer files this session (`render-recommendation-detail`, `render-assumption-detail`, `render-decision-detail`, `render-intelligence-stats`, `render-intelligence-audit`, plus extended `render.ts` + Slice-13-extended `render-decision.ts`).
- `packages/core/src/intelligence/store.ts` — gained `runDecisionTransition`/`applyDecisionTransition`, `runIntelligenceReconcile`, `computeIntelligenceStats`, `computeIntelligenceAudit`, `rerenderRecommendationsMdIfPresent`, plus Slice-13 `IntelligenceDecisionZ.status` enum-ordering constants.
- `packages/core/src/cli/commands/intelligence.ts` — NEW file (Slice 17), 3 subcommands (`reconcile`/`stats`/`audit`).
- `packages/core/src/cli/commands/{recommendation,assumption,decision}.ts` — each extended with `show <id>` + all list ergonomics flags.
- `docs/superpowers/specs/2026-05-20-cadence-*-design.md` — 12 new design docs (one per slice).
- `docs/reference/commands.md` — drift-guard marker block updated with `intelligence`; new `### intelligence` doc section.

## State on handoff

- **Branch:** `praxis-intelligence-ledger`, synced with origin (0 ahead / 0 behind).
- **HEAD:** `9f6f3ec` (Slice-25 docs reconcile commit, 51 commits past Slice-11 handoff sha `1bb4fa6`).
- **Loop:** IDLE — `cadence progress` → "No active draft." Praxis layer doesn't drive the loop.
- **PR #9:** OPEN, `isDraft: true`, head `praxis-intelligence-ledger`, 181 commits as of `9f6f3ec`. Untouched as a draft this session.
- **Gate:** GREEN at HEAD `9f6f3ec`. `pnpm turbo run lint typecheck test build` = 16/16 turbo tasks. `@cadence/core` = 117 test files / 884 tests pass; ~45s wall. (Slice-19 hit transient `milestone.test.ts` timeout flake once, cleared on immediate retry — same gotcha as prior handoff #2.)
- **Working tree:** clean except untracked `graphify-out/` (carry-forward from prior handoffs).

## Carry-forward gotchas

Additive to `SESSION-2026-05-20-praxis-slice-10-11.md` (all prior gotchas still hold: Windows machine path, fresh-checkout bootstrap, `core.hooksPath=.githooks`, pre-push runs full turbo gate, Bash cwd drift after `pnpm --filter`, transient `milestone.test.ts` flake under heavy turbo pool load, post-Slice-15 functional ordering in `store.ts` mirrors Slice-9 template). New this session:

1. **`--format`/`--filter-*` are CLI-layer concerns.** Store helpers + readers return full ledgers; filtering + format selection live in CLI command files. Adding a new filter dimension means touching `cli/commands/<subject>.ts` plus existing test file, NOT the store. Slice-22/23/24/25 all followed this.
2. **`exactOptionalPropertyTypes: true` gotcha** repeatedly bit `--format json` plumbing when passing optional flags from `opts.foo: boolean | undefined` into option objects with `foo?: boolean`. Fix: pre-build a typed local options object and only assign keys when truthy. Slice 20 + Slice 18 both hit this; pattern documented inline.
3. **`AssumptionZ.shape.status.safeParse(value)` works as a runtime enum validator.** Single source of truth — no separate `AssumptionStatusZ` export needed. Same trick for `IntelligenceDecisionZ.shape.status`. `RecommendationStatusZ` is a separately-exported enum (Slice 1), so import directly.
4. **Empty-after-filter terminal message unified across all 3 list commands** via `filterDims` array. Pattern: collect active filter dims into array, join with `, `, emit `No <subject> matching <joined> recorded.\n`. Slice-22 single-dim original ("with status=...") was unified to "matching status=..." in Slice 23 for cross-subject consistency.
5. **JSON envelopes per command differ**; no shared abstraction. Each command's `--format json` branch hand-writes its envelope shape because the structure is genuinely different (recommendation show wraps + filters; lists are arrays; stats is full object; audit is full report). Don't try to abstract.
6. **Per-task design doc convention now firm**. Every slice this session opened with a `docs/superpowers/specs/2026-05-20-cadence-<slug>-design.md` doc (some slices skipped the separate plan doc and embedded the plan in the design — fine for small slices). Final docs commit always reconciles ≥1 prior slice's `§ Follow-On` via strike+annotate.

## Conventions reaffirmed / decisions

- **One slice = one new design doc** under `docs/superpowers/specs/`. Plan doc optional for small slices (Slice 14/16/17/18/19/20/21/22/23/24/25 embedded plan in design).
- **Each slice ends with strike+annotate** of every prior slice's `§ Follow-On` entry it shipped. Audit-trail preserved.
- **Per-task CHANGELOG entry** at the top of the existing Praxis stream under `## [Unreleased]`. Insertion-at-top discipline holds.
- **All 12 slices land on `praxis-intelligence-ledger`**; PR #9 stays draft; no merge to `main`. CADENCE public release held.
- **`cli-reference.test.ts` drift guard untripped except Slice 17** (which added `intelligence` as new top-level command — marker block updated in same commit as `cli/register.ts`).
- **Tag pushes / PR merge / PR undraft remain out of scope** for `/handoff` and need separate explicit user approval.

## Quick resume commands

```bash
cd C:/Users/digit/Documents/Projects/cadence
git config core.hooksPath .githooks            # fresh clone only
git pull
pnpm install --config.confirmModulesPurge=false && pnpm turbo run build
git log --oneline -15
node packages/core/dist/cli/index.js progress  # expect: IDLE

# Read project state of record:
#   memory  project_praxis_layer.md   → "NEXT SLICE" section
#
# NEXT REAL WORK candidates (pick one; full rationale in design follow-ons):
#   1. Rec↔phase linkage (biggest; needs promotion-tracking upstream design first)
#   2. `supersededBy <id>` decision field + supersession-graph
#   3. Bulk transitions (`cadence assumption validate --all-rec <recId>`)
#   4. `--offset <n>` pagination companion to --limit
#   5. `--reverse` / `--sort-by` flags on list
#   6. `--filter-regex` / `--filter-text-exact` power-user flags
#   7. `--include-untied` on decision list (Slice 23 carve-out)
#   8. cadence intelligence migrate (schema-migration command; defer until needed)
#
# Pipeline: brainstorm → design doc → impl + tests → docs/CHANGELOG reconcile → push
# Recent designs (read for context):
#   - docs/superpowers/specs/2026-05-20-cadence-intelligence-audit-design.md (Slice 19)
#   - docs/superpowers/specs/2026-05-20-cadence-list-filter-text-design.md (Slice 25)
```

## Open questions for next session

- Should rec↔phase linkage start with a separate upstream design doc, or can it be folded into a single slice? (Inclination: separate; promotion-tracking touches `state.json` boundary.)
- Is the `supersededBy` decision field worth shipping without a consumer? Or pair it with a `decision graph` viewer in the same slice?
- Should `cadence intelligence migrate` exist? Slice-13 `.default()` covers schema additives so far; if a non-additive change ever lands, migrate becomes necessary.
