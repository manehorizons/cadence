# Session Handoff — 2026-05-20 (Praxis Slice 10 + 11)

Continues `SESSION-2026-05-18-handoff-tooling.md`. Praxis Slices 7–9 landed in sessions between that handoff and this one and were **not** captured as `.cadence/handoff/` files — their state of record is auto-memory `project_praxis_layer.md` (read first; more detailed on Praxis than any handoff file). This session shipped **two Praxis slices**: Slice 10 (`cadence assumption reopen`, transition matrix complete) and Slice 11 (recommendation link backfill).

## TL;DR for the next session

- **Two slices PUSHED this session.** Slice 10 closed the assumption transition matrix (`open ↔ {validated, rejected}` symmetric). Slice 11 wired auto-backfill of `Recommendation.assumptionIds[]` / `decisionIds[]` via a new pure helper, closing the cross-slice forward-ref family across Slice 5/6/8/9/10 designs.
- **Branch:** `praxis-intelligence-ledger`, synced 0/0 with origin. HEAD `4756985`. Tree clean except untracked `graphify-out/` (per Slice-7 carry-forward — leave).
- **Gate GREEN** at HEAD: `pnpm turbo run lint typecheck test build` → 16/16 turbo tasks; `@cadence/core` 100 test files / 702 tests pass; ~34s wall.
- **PR #9** = 134 commits, OPEN, isDraft, untouched as a draft. NOT merged to `main`. CADENCE public release stays HELD until Praxis fully integrated.
- **Loop is IDLE** (`cadence progress` → "No active draft"). Praxis sits ABOVE the loop; no `cadence draft new` involved in Slice 10 or 11.
- **NEXT REAL WORK = OPEN.** Slice-11 § Follow-On top candidates: (1) `cadence decision` status field + transitions (schema additive; symmetric to Slice 9/10 for the now-asymmetric decision lifecycle), (2) `RECOMMENDATIONS.md` render extension (first observable consumer of Slice-11's now-populated `assumptionIds`/`decisionIds` arrays), (3) `cadence intelligence reconcile` standalone admin command, (4) rec↔phase linkage (biggest scope, needs promotion-tracking design). Memory `project_praxis_layer.md` carries full rationale.

## What landed this session

### Slice 10 — Assumption `reopen` (transition matrix complete)

Commits `26a4f88..ddb23ac` on `praxis-intelligence-ledger`:

| sha | commit |
|---|---|
| `26a4f88` | docs: design — assumption reopen transition (Praxis Slice 10) |
| `b897555` | docs: implementation plan — assumption reopen (Praxis Slice 10) |
| `7f47737` | feat(core): applyAssumptionTransition supports reopen (Slice 10) |
| `8dbc5c7` | feat(core): CLI cadence assumption reopen (Slice 10) |
| `ed2c86a` | test(core): integration — context packets respect transitioned status / re-enter (Slice 10 AC-6) |
| `ddb23ac` | docs: document assumption reopen + reconcile Slice-9 follow-ref (Slice 10) |

- New verb `cadence assumption reopen <id>`: `validated|rejected → open`. Refused from `'open'` with `cannot reopen assumption in status open`. Refused from unknown id with `assumption <id> not found`. No write side effects on refusal.
- Internal: extended `AssumptionTransitionAction` union; replaced two inline ternaries (`nextStatus` in `applyAssumptionTransition`; past-tense + description in CLI) with exhaustive `Record<AssumptionTransitionAction, ...>` maps (`ASSUMPTION_TRANSITION_ALLOWED`/`ASSUMPTION_TRANSITION_NEXT` in `store.ts`; `ASSUMPTION_TRANSITION_DESCRIPTIONS`/`ASSUMPTION_TRANSITION_PAST` in `cli/commands/assumption.ts`). Slice-9 tests stayed unchanged.
- NO `@cadence/types` schema change. NO new top-level commands. Phase-31.1 drift guard UNTRIPPED. NO render-layer change (Slice-9 buckets already always-emit all three sections — reopened entry re-renders under `## Open` for free).
- AC-6 integration test (in `tests/intelligence/context.test.ts`) asserts handoff-packet count goes 2 → 1 → 2 across validate-then-reopen via Slice-5 `status === 'open'` filter.
- Slice-9 design reconciled: § Out-of-scope + § Allowed-status note + Decision Log #2 + Follow-On all carry strike+annotate "SHIPPED Slice 10".

Design/plan: `docs/superpowers/{specs,plans}/2026-05-20-cadence-assumption-reopen{-design,}.md`.

### Slice 11 — Recommendation Link Backfill

Commits `0b1a904..4756985` on `praxis-intelligence-ledger`:

| sha | commit |
|---|---|
| `0b1a904` | docs: design — recommendation link backfill (Praxis Slice 11) |
| `ac61574` | docs: implementation plan — recommendation link backfill (Praxis Slice 11) |
| `8958f0c` | feat(core): deriveRecommendationLinks + auto-backfill in addAssumption (Slice 11) |
| `6c7f03a` | feat(core): auto-backfill in addIntelligenceDecision (Slice 11) |
| `4756985` | docs: document recommendation link backfill + reconcile Slice-5/6/8/9/10 follow-refs (Slice 11) |

- New exported pure helper `deriveRecommendationLinks(recLedger, asLedger, decLedger): RecommendationLedger` — full-ledger re-derivation; idempotent; non-target fields preserved verbatim; ledger-insertion order kept per rec.
- `addAssumption` rewritten: write asLedger first, then derive + write recLedger via existing `writeIntelligenceLedgers` (atomic JSON + MD re-render).
- `addIntelligenceDecision` symmetric for tied decisions. **Untied decisions skip the rec write entirely** — `recommendations.json` byte-equal before/after (AC-8 snapshot test).
- **Retroactive self-heal property (AC-9 keystone test)**: a manual JSON edit of `assumptions.json` (or any pre-Slice-11 entry) gets backfilled into the appropriate rec's `assumptionIds` on the NEXT `addAssumption` against ANY rec — no migration command needed.
- Two-step write order: subject ledger (as/dec) first, recLedger second. Step-2 failure leaves an orphan recoverable by next add's re-derivation (symmetric to Slice-4b residual-risk pattern).
- NO `@cadence/types` schema change (arrays existed on `RecommendationZ` since Slice 1 — just always `[]`). NO new CLI commands / subcommands. NO `RECOMMENDATIONS.md` render extension (consumer-side is future work — first candidate for next slice). NO derive call in `runAssumptionTransition` (transitions flip status only; `recommendationId` link is invariant).
- Forward-ref family reconciled across 5 prior designs (Slice 5 context-packets, Slice 6 milestone-premortem, Slice 8 assumption-decision-intake, Slice 9 assumption-transitions, Slice 10 assumption-reopen — all now strike+annotate "SHIPPED Slice 11").
- ~14 new tests across `tests/intelligence/store.test.ts` (pure helper × 6, addAssumption integration × 2, addIntelligenceDecision integration × 2, retroactive self-heal × 1, FK refusal preserved × 1). Total `@cadence/core` test count now 702 / 100 files (up from 680 / 100 at Slice 9 HEAD).

Design/plan: `docs/superpowers/{specs,plans}/2026-05-20-cadence-rec-link-backfill{-design,}.md`.

### CHANGELOG additions

Both slices added Unreleased bullets under the existing Praxis stream (already pushed in their respective docs commits).

## State on handoff

- **Branch:** `praxis-intelligence-ledger`, synced with origin (0 ahead / 0 behind).
- **HEAD:** `4756985` (Slice 11 final docs reconcile commit on top of `6c7f03a` decision wire on top of `8958f0c` assumption wire on top of Slice 10 chain `26a4f88..ddb23ac`). This handoff commit then lands on top.
- **Loop:** IDLE — `cadence progress` → "No active draft." Praxis layer doesn't drive the loop.
- **PR #9:** OPEN, `isDraft: true`, head `praxis-intelligence-ledger`, 134 commits as of `4756985`. Untouched as a draft this session.
- **Gate:** GREEN at HEAD `4756985`. `pnpm turbo run lint typecheck test build` = 16/16 turbo tasks. `@cadence/core` = 100 test files / 702 tests pass; ~34s wall. (Phase-32.1 mitigations help but one transient `milestone.test.ts` timeout flake recurred on a single full-gate run mid-session; resolved by immediate retry. See gotcha #2 below.)
- **Working tree:** clean except untracked `graphify-out/` (graphify scratch output, do not commit — carry-forward from Slice-7 handoff list).

## Carry-forward gotchas

Additive to `SESSION-2026-05-18-handoff-tooling.md` (all prior gotchas still hold: Windows machine path, `node packages/core/dist/cli/index.js <cmd>` to run the CLI, fresh checkout needs `pnpm install --config.confirmModulesPurge=false` then `pnpm turbo run build`, `core.hooksPath=.githooks` is untracked local config re-run on fresh clone, pre-push hook runs full turbo gate, `/handoff` precedence rule). New this session:

1. **Bash session cwd drift after package-scoped `pnpm` commands.** A `cd packages/core && pnpm vitest run ...` pattern shifts the Bash session's cwd for subsequent commands in the same Bash tool invocation, but the next tool call still runs from the project root unless explicitly directed. Any git operation after a package-scoped test run should use absolute paths (`git -C "C:/Users/digit/Documents/Projects/cadence" ...`) or a fresh `cd` to project root. Bit me once during Slice 10 commit; recovered by switching to absolute git path.
2. **Transient `milestone.test.ts` timeout flake under heavy turbo pool load.** Phase-32.1 root-fixed the recurring full-`turbo`-parallel pre-push flake but a residual single-test timeout on `cadence milestone > accept then illegal re-accept exits 1; defer works; list --json parses` still appears occasionally on full-gate first runs. Solo `pnpm vitest run tests/cli/milestone.test.ts` passes instantly. Retrying the full gate clears it. Not a regression; do not investigate under handoff scope.
3. **`deriveRecommendationLinks` is declared AFTER its call sites** in `store.ts` (mirrors Slice-9 `applyAssumptionTransition` template). TypeScript function declarations are hoisted; safe. Don't "fix" by reordering — the layout puts public helpers logically grouped near the transition machinery.
4. **CHANGELOG sequencing**: this session added two Unreleased bullets at the top of the existing Praxis stream (Slice 10's reopen entry above the Slice-9 entry; Slice 11's backfill entry above the Slice-10 entry). Maintain insertion-at-top discipline for future Praxis slices to keep the chronological-reverse reading order intact.
5. **PR #9 commit count climbs ~5–6 per slice.** As of `4756985` it's 134 commits. Don't try to squash or rebase — long-lived draft branch; the per-task commit trail is the audit log.

## Conventions reaffirmed / decisions

- **Praxis per-task commit convention** holds across Slice 10 + 11: design doc → plan doc → one feat/test commit per task → final docs/reconcile commit. No `cadence draft/settle` loop; Praxis sits ABOVE the loop.
- **Strike-and-annotate (not delete) for forward-ref reconciliation.** Both Slice 10 + 11 reconciled prior slice Follow-On entries with `~~original text~~ **SHIPPED Slice N**` — preserves audit history. Slice 11 did this across FIVE prior designs in a single commit (Slice 5/6/8/9/10).
- **Pure-derivation > append-on-write for cross-ledger backfill (Slice 11 decision).** Idempotent, self-healing, no migration command needed. Trade-off: O(|recs|·|as|+|recs|·|dec|) per add — bounded and small for realistic ledger sizes.
- **Strict allowed-status preserved across all three assumption transitions** (`validate` from `open`; `reject` from `open`; `reopen` from `validated|rejected`). Same-state refused. Override remains manual JSON edit (and now self-heals on next add via Slice 11).
- **Slice-11 explicitly does NOT extend `RECOMMENDATIONS.md` render.** The arrays are populated; the consumer surface is the next slice's choice. Don't bundle.
- Praxis workstream rule unchanged: accumulate all slices on `praxis-intelligence-ledger`; PR #9 stays draft; no merge to `main`; CADENCE public release held until Praxis fully integrated. Tag pushes / PR merge / PR undraft remain out of scope for `/handoff`.

## Quick resume commands

```bash
cd C:/Users/digit/Documents/Projects/cadence
git config core.hooksPath .githooks            # fresh clone only
git pull
pnpm install --config.confirmModulesPurge=false && pnpm turbo run build
git log --oneline -8
node packages/core/dist/cli/index.js progress  # expect: IDLE
# Read project state of record (more detailed than this file on Praxis):
#   memory  project_praxis_layer.md   → "NEXT SLICE" section
# NEXT REAL WORK candidates (pick one; full rationale in memory):
#   1. cadence decision status field + transitions  (symmetric to Slice 9/10; @cadence/types schema additive)
#   2. RECOMMENDATIONS.md render extension          (first consumer of Slice-11 backfilled arrays)
#   3. cadence intelligence reconcile               (admin tool; self-heal already covers next-add path)
#   4. rec↔phase linkage                            (biggest scope; needs promotion-tracking design)
#
# Pipeline: brainstorm → spec → spec-review → plan → plan-review → subagent-driven
# Slice 11 design: docs/superpowers/specs/2026-05-20-cadence-rec-link-backfill-design.md
# Slice 10 design: docs/superpowers/specs/2026-05-20-cadence-assumption-reopen-design.md
```
