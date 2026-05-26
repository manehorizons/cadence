# Session Handoff — 2026-05-21 (Praxis Slices 26–28)

Continues `SESSION-2026-05-20-praxis-slice-14-25.md`. This session shipped **3 consecutive Praxis slices** (26 → 27 → 28) completing the list-pagination trio (`--limit` + `--offset` + `--reverse`) and adding the first Praxis schema-additive change since Slice 13 (`supersededBy?: string` decision field + `--by <newId>` flag on `decision supersede` with FK/self-ref/cycle checks + reactivate-clears + render surfacing).

## TL;DR for the next session

- **3 slices shipped + PUSHED this session.** Branch HEAD `9f6f3ec` → `a9e771c`. 10 commits added on top of prior handoff (3 commits × 3 slices + 1 prior-handoff carry).
- **Slice 28 is the first non-CLI-only slice since Slice 13** — schema additive on `IntelligenceDecisionZ` + new store-layer validation (cycle detection). Back-compat preserved (`.optional()` + exact-optional persistence + supersede-without-`--by` byte-equal to Slice 13).
- **Branch:** `praxis-intelligence-ledger`, synced 0/0 with origin. Tree clean.
- **Gate GREEN** at HEAD `a9e771c`: `pnpm turbo run lint typecheck test build` → 16/16 turbo tasks; `@cadence/core` 117 test files / 927 tests pass (up 43 from prior handoff's 884); `@cadence/types` 8/121, `@cadence/testkit` 3/11, `@cadence/host-claude-code` 8/63.
- **PR #9:** OPEN, `isDraft: true`, head `praxis-intelligence-ledger`, 190 commits as of `a9e771c`. Untouched as a draft this session. NOT merged to `main`. CADENCE public release HELD until Praxis fully integrated.
- **Loop is IDLE** (`cadence progress` → "No active draft"). Praxis sits ABOVE the loop.
- **NEXT REAL WORK = OPEN.** Strong candidates: rec↔phase linkage (biggest; needs upstream design); `cadence decision graph <id>` viewer (Slice-28 follow-on; ASCII chain traversal); `intelligence audit` dimension for stale `supersededBy` refs + superseded-without-link soft hint; bulk transitions; `--sort-by <field>` stable-sort.

## What landed this session

### Slice-by-slice summary

| Slice | Theme | HEAD | Commits |
|---|---|---|---|
| 26 | `--offset <n>` pagination on 3 `list` commands (non-negative int; applied between filters and `--limit`) | `0274ed3` | 3 |
| 27 | `--reverse` boolean on 3 `list` commands (completes pagination trio `--limit`+`--offset`+`--reverse`) | `94d8c5a` | 3 |
| 28 | `supersededBy?: string` schema-additive on `IntelligenceDecisionZ` + `--by <newId>` on `decision supersede` + reactivate-clears + render surfacing | `a9e771c` | 3 |

Per-design doc → impl → docs-reconcile three-commit convention preserved on every slice. Each docs commit strikes+annotates the predecessor slice's `§ Follow-On` entry.

### Architectural patterns established

- **List pagination order finalized**: `status → rec → text → reverse → offset → limit`. Reverse changes order, not membership — does NOT extend `filterDims`. Offset/limit operate on the (possibly reversed) filtered set; `.slice().reverse()` defensive-copies.
- **`--offset 0` is a valid no-op** (operator-friendly for templated pagination loops) vs `--limit 0` which is refused (Slice 24). Non-negative integer validation for offset; positive integer for limit. Differing predicates documented in Slice-26 design Decision Log #1.
- **Schema-additive pattern reaffirmed (Slice 28)**: new optional field via `z.string().optional()` parses pre-existing JSON cleanly with no migration; exact-optional persistence (`if (v !== undefined) out.x = v`) keeps the field omitted from the serialized entity when unset. Mirrors `recommendationId` pattern from Slice 8.
- **Cycle detection convention**: `walkSupersededByChain(ledger, startId, forbid)` walks forward from `startId`; tolerates pre-existing cycles via `seen` set safety belt (refuses ONLY cycles WE'd introduce). Reusable shape for future graph-walk validations.
- **Missing-id render fallback** `(not found)` — self-documenting drift signal. Used by Slice 15 (`RECOMMENDATIONS.md` annotated bullets) + Slice 16 (`decision show` recommendation fallback) + Slice 28 (`supersededBy` annotation in both `DECISIONS.md` superseded bucket + `decision show` terminal mode).
- **`reactivate` clears link fields**: precedent set by Slice 28's `reactivate` clearing `supersededBy`. Future link-bearing transitions can follow the same shape.

### Files structure today

- `packages/types/src/intelligence.ts` — `IntelligenceDecisionZ` extended with `supersededBy: z.string().optional()` (Slice 28).
- `packages/core/src/intelligence/store.ts` — `applyDecisionTransition` signature extended with `by?: string` (4th param, before `_now?`); new module-private `walkSupersededByChain` helper; `runDecisionTransition` passes `by` through. `reactivate` `delete updated.supersededBy`.
- `packages/core/src/cli/commands/{recommendation,assumption,decision}.ts` — each `list` action gained `--offset <n>` (Slice 26) + `--reverse` (Slice 27).
- `packages/core/src/cli/commands/decision.ts` — `supersede` subcommand extracted from the for-loop factory; carries the new `--by <newId>` option (the loop still owns `rescind` + `reactivate`). `show` action now passes `decLedger` as 3rd arg to `renderDecisionDetail`.
- `packages/core/src/intelligence/render-decision.ts` — superseded bucket entries gain `- superseded-by: <id>` bullet (with `(not found)` fallback) when the field is set.
- `packages/core/src/intelligence/render-decision-detail.ts` — signature gained optional `decLedger?` param; terminal `show` emits `- superseded-by: <id>` between `- decided:` and the rationale.
- `docs/superpowers/specs/2026-05-21-cadence-list-offset-design.md` — Slice 26.
- `docs/superpowers/specs/2026-05-21-cadence-list-reverse-design.md` — Slice 27.
- `docs/superpowers/specs/2026-05-21-cadence-decision-supersededby-design.md` — Slice 28.

## State on handoff

- **Branch:** `praxis-intelligence-ledger`, synced with origin (0 ahead / 0 behind).
- **HEAD:** `a9e771c` (Slice-28 docs reconcile commit). 10 commits past Slice-14-25 handoff sha `2d03188` (this includes the prior handoff commit itself).
- **Loop:** IDLE — `cadence progress` → "No active draft." Praxis layer doesn't drive the loop.
- **PR #9:** OPEN, `isDraft: true`, `mergeable: MERGEABLE`, head `praxis-intelligence-ledger`, 190 commits as of `a9e771c`. Untouched as a draft this session.
- **Gate:** GREEN at HEAD `a9e771c`. `pnpm turbo run lint typecheck test build` = 16/16 turbo tasks (cached except where invalidated by source changes). Test counts: `@cadence/types` 8/121, `@cadence/testkit` 3/11, `@cadence/host-claude-code` 8/63, `@cadence/core` 117/927 (up 43 net this session: 13 Slice-26 + 10 Slice-27 + 20 Slice-28).
- **Working tree:** clean. No untracked files (the earlier handoff's `graphify-out/` is no longer present in working tree; either gitignored or cleaned — not a regression).

## Carry-forward gotchas

Additive to `SESSION-2026-05-20-praxis-slice-14-25.md` (all prior gotchas still hold: Windows machine path, fresh-checkout bootstrap, `core.hooksPath=.githooks`, pre-push runs full turbo gate, Bash cwd drift after `pnpm --filter`, transient `milestone.test.ts` flake under heavy turbo pool load, CLI-layer pattern for filters, exact-optional pattern for nullable fields, JSON envelopes per command differ — no abstraction). New this session:

1. **Spawn-CLI tests hit the BUILT CLI, not source.** Targeted vitest after a source edit will fail with `error: unknown option '--xxx'` unless you run `pnpm build` first (`tsc -p tsconfig.json`). Bit Slice 26 on first run. Make the targeted-test step always: build → test.
2. **`applyDecisionTransition` signature ordering matters.** Old: `(ledger, id, action, _now?)`. New (Slice 28): `(ledger, id, action, by?, _now?)`. Internal `runDecisionTransition` had to be updated to pass `by` 4th and `new Date()` 5th. Existing tests passing 3 args continue to work (`by`/`_now` default to undefined). When extending a 4-arg signature whose 4th is a hidden plumbing param, INSERT the new param BEFORE the existing one rather than appending — keeps the test surface back-compat.
3. **Function declarations can sit before their use sites in store.ts; `walkSupersededByChain` placed above `applyDecisionTransition` for read-order.** Same precedent as Slice 9/11. TS hoisting makes after-use placement legal but read-order matters.
4. **`exactOptionalPropertyTypes: true` again.** Slice 28's `delete updated.supersededBy` (on reactivate) is the supported clear-pattern; assigning `undefined` would fail strict. Documented inline in design.
5. **Render-decision-detail signature widened optionally.** `renderDecisionDetail(dec, rec?, decLedger?)` — third param defaults to `undefined`; the missing-id check `decLedger?.decisions.some(...) ?? true` means callers without ledger access get NO `(not found)` fallback (it assumes existence). Slice-16 callers in `context.ts` are unaffected because they don't render decisions through this path; verified by 16/16 gate.
6. **Cycle-detection error message includes the chain.** Format: `cannot supersede: would create cycle (dec-A → dec-B → ... → dec-target)` where the target id is appended after the walked prefix. Operator sees the exact loop they would have introduced.

## Conventions reaffirmed / decisions

- **Per-slice design doc + three-commit convention** (design → impl → docs-reconcile) holds for Slice 26/27/28 unchanged. No plan doc needed when the slice is single-pattern and the design embeds the impl shape.
- **Schema additivity via `.optional()` + `.default()` is the established migration-free path.** Slice 28 reaffirms it; pre-Slice-28 `decisions.json` files parse cleanly with the new schema.
- **Render extensions piggyback on existing atomic write paths.** `writeIntelligenceDecisionLedger` re-renders `DECISIONS.md` on every transition; adding a new bullet to the renderer flows through with zero CLI changes. `intelligence reconcile` picks it up automatically.
- **Cycle-detection walks from `<newId>`, refuses only if it hits `<oldId>`.** Pre-existing cycles in persisted data (manual JSON edits) are tolerated — a future `intelligence audit` dimension can flag them as integrity findings.
- **`reactivate` clears link fields it set during the inverse transition.** Slice 28's `reactivate` clears `supersededBy`. Future paired transitions should follow.
- **`rescind` ≠ `supersede`.** Rescind has no replacement; do NOT add `--by` to rescind. Documented in Slice 28 Decision Log #4.
- **All slices land on `praxis-intelligence-ledger`**; PR #9 stays draft; no merge to `main`. CADENCE public release held.
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
#   2. `cadence decision graph <id>` viewer (Slice-28 follow-on; ASCII forward+backward chain)
#   3. `intelligence audit` integrity dim for supersededBy
#        - stale supersededBy reference (referent deleted)
#        - superseded-without-supersededBy soft hint
#   4. Bidirectional `Decision.supersedes: dec-X[]` derived reverse-link backfill
#      (mirror Slice 11 assumptionIds/decisionIds pattern)
#   5. Bulk transitions (`cadence assumption validate --all-rec <recId>`)
#   6. `--sort-by <field>` stable sort with multi-key support
#   7. `--filter-regex <pattern>` / `--filter-text-exact`
#   8. `--include-untied` on decision list
#
# Pipeline: brainstorm → design doc → impl + tests → docs/CHANGELOG reconcile → push
# Recent designs (read for context):
#   - docs/superpowers/specs/2026-05-21-cadence-list-offset-design.md (Slice 26)
#   - docs/superpowers/specs/2026-05-21-cadence-list-reverse-design.md (Slice 27)
#   - docs/superpowers/specs/2026-05-21-cadence-decision-supersededby-design.md (Slice 28)
```

## Open questions for next session

- Should `cadence decision graph <id>` come before or after the `intelligence audit` integrity dim? (Graph is more visible / operator-pleasing; audit is more correctness-oriented. Audit reuses the `walkSupersededByChain` helper Slice 28 introduced.)
- Should the rec↔phase linkage start with a SEPARATE upstream promotion-tracking design (Slice-14-25 handoff inclination: separate), or can it be folded into a single slice if `IntelligenceMilestone.exportTargets` is rich enough to source the rec→phase edge?
- Should bidirectional reverse-link backfill on `Decision` (the `supersedes: dec-X[]` array) be derived (Slice-11-pattern) or user-input? Derived = no operator burden; user-input = explicit dual-direction edge. Slice 11 chose derived for `assumptionIds`/`decisionIds`.
