# CADENCE `cadence intelligence reconcile` — Admin Force-Rebuild — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Slice:** 17 (follow-on to Slice 11 — Rec Link Backfill; Slice 13 — Decision Status; Slice 15 — Status-Aware Bullets)
**Predecessor slice docs:**
- [`2026-05-20-cadence-rec-link-backfill-design.md`](2026-05-20-cadence-rec-link-backfill-design.md) (Slice 11 — `deriveRecommendationLinks` self-healing model; § Follow-On listed `cadence intelligence reconcile` as deferred admin tool)
- [`2026-05-20-cadence-decision-status-transitions-design.md`](2026-05-20-cadence-decision-status-transitions-design.md) (Slice 13 — § Follow-On reaffirmed `cadence intelligence reconcile`)
- [`2026-05-20-cadence-rec-md-status-bullets-design.md`](2026-05-20-cadence-rec-md-status-bullets-design.md) (Slice 15 — transition propagation through `rerenderRecommendationsMdIfPresent`)

## Summary

**Slice 17** ships a new top-level `cadence intelligence` command with one subcommand `reconcile`. Operator-initiated force re-derive of `Recommendation.assumptionIds[]` / `decisionIds[]` plus re-render of all three intelligence MDs (`RECOMMENDATIONS.md`, `ASSUMPTIONS.md`, `DECISIONS.md`). Wraps existing `deriveRecommendationLinks` + writer helpers; no new derivation logic. Useful when operator hand-edits the JSON ledgers and wants a fresh render without doing a throwaway `add`.

- **`cadence intelligence reconcile`** — reads all 4 ledgers, re-derives rec links, atomically writes recommendations.json + RECOMMENDATIONS.md (with status annotations per Slice 15), re-renders ASSUMPTIONS.md + DECISIONS.md from current bucket state.
- **Stdout summary**: `Reconciled N recommendations, M assumptions, K decisions.\n` + per-file action lines.
- **Idempotent**: running twice in a row → second pass byte-equal (Slice-11 derive is idempotent; renders are pure).
- **No-op when ledgers absent**: empty workspace → `No intelligence ledgers present.\n` exit 0.
- **Phase-31.1 drift guard**: marker block in `docs/reference/commands.md` extended with `intelligence`. New `### intelligence` doc section added.

It does **not** modify `@cadence/types` schemas, change Slice-11 derivation semantics, mutate `assumptions.json` / `decisions.json` content (only re-derive recs from current subject ledgers), add new intake/transition surfaces, perform a fresh fs/git scan, or touch `state.json` / `STATE.md` / `cadence spec new` / loop transition.

## Product Boundary

- Writes to `.cadence/intelligence/{recommendations.json, RECOMMENDATIONS.md, ASSUMPTIONS.md, DECISIONS.md}`. Note: `assumptions.json` + `decisions.json` are NOT rewritten (operator-edited source of truth; reconcile reads them but does not normalize).
- Reads `.cadence/intelligence/{recommendations,evidence,assumptions,decisions}.json` only.
- **NEVER** calls `cadence spec new`, **NEVER** touches `state.json` / `STATE.md` / loop transition.

## Scope

### In scope

- New CLI top-level command `cadence intelligence` with one subcommand `reconcile`.
- New helper `runIntelligenceReconcile(root): Promise<IntelligenceReconcileResult>` in `intelligence/store.ts`.
- Result type: `{ recommendations: number, assumptions: number, decisions: number, present: boolean }`.
- Update `cli/register.ts` to register the new top-level command.
- Update `docs/reference/commands.md` `<!-- cadence:commands -->` marker block: add `intelligence` line.
- Add new `### intelligence` section to `docs/reference/commands.md` documenting the subcommand.
- Tests per ACs.

### Out of scope

- Status / schema normalization of `assumptions.json` / `decisions.json` content (e.g. running Zod `.default('active')` to inject missing status fields and re-writing). Reconcile is read-only on those subject ledgers; the next `addX` or transition will normalize.
- `--dry-run` flag (defer; reconcile is cheap + idempotent, dry-run adds complexity for little gain).
- `--json` output flag.
- Multiple subcommands on `cadence intelligence` (stats, audit, etc.) — defer until concrete need.
- `cadence intelligence migrate` (schema-migration command) — none needed today; Slice-11/13 self-heal via `.default()` + derive.
- Touching milestone ledger (separate strategic layer).
- Any `@cadence/types` schema change.

## Architecture

### MODIFIED files

- `packages/core/src/intelligence/store.ts`:
  - + `IntelligenceReconcileResult` type.
  - + `runIntelligenceReconcile(root): Promise<IntelligenceReconcileResult>` async function.
- `packages/core/src/cli/register.ts`:
  - + `import { registerIntelligenceCommand }` + `registerIntelligenceCommand(program)` call.
- `docs/reference/commands.md`:
  - Marker block: add `intelligence` line.
  - New `### intelligence` doc section.

### NEW files

- `packages/core/src/cli/commands/intelligence.ts` — top-level `intelligence` command + `reconcile` subcommand.
- `packages/core/tests/intelligence/store-reconcile.test.ts` — pure/IO tests for `runIntelligenceReconcile`.
- `packages/core/tests/cli/intelligence-reconcile.test.ts` — spawn-CLI tests.

### Untouched

- `@cadence/types` — no schema change.
- All subject add/transition surfaces — untouched.
- Slice-11 `deriveRecommendationLinks` — reused as-is.
- Slice-15 `rerenderRecommendationsMdIfPresent` — symmetric helper exists; reconcile uses the same primitives but writes all three MDs.
- `intelligence/context.ts` / context packet shape — untouched.

## Data Model

```ts
export type IntelligenceReconcileResult = {
  /** True when any of the 4 intelligence ledgers existed before the call. */
  present: boolean;
  /** Number of recommendations re-derived (0 if no recommendation ledger). */
  recommendations: number;
  /** Number of assumptions scanned for link backfill. */
  assumptions: number;
  /** Number of decisions scanned for link backfill. */
  decisions: number;
};

export async function runIntelligenceReconcile(
  root: string,
): Promise<IntelligenceReconcileResult>;
```

## Algorithm

```ts
runIntelligenceReconcile(root):
  ├─ Detect presence: any of recommendations.json / evidence.json / assumptions.json / decisions.json exists?
  │   ├─ No → return { present: false, recommendations: 0, assumptions: 0, decisions: 0 }
  ├─ Read all 4 ledgers (readers default to empty on absent file).
  ├─ derivedRec = deriveRecommendationLinks(recLedger, asLedger, decLedger)
  ├─ writeIntelligenceLedgers(root, derivedRec, evLedger)
  │   ├─ atomic JSON for recommendations + evidence
  │   ├─ atomic RECOMMENDATIONS.md render with asLedger + decLedger (Slice-15 annotated form)
  ├─ Re-render ASSUMPTIONS.md from asLedger (no JSON write — read-only of source of truth).
  ├─ Re-render DECISIONS.md from decLedger.
  └─ return { present: true, recommendations: derivedRec.recommendations.length, assumptions: asLedger.assumptions.length, decisions: decLedger.decisions.length }
```

`writeAssumptionLedger` and `writeIntelligenceDecisionLedger` are private + bundle JSON + MD writes. For MD-only re-render, factor a public `rerenderAssumptionsMdIfPresent(root)` / `rerenderDecisionsMdIfPresent(root)` helper, or expose direct path: `atomicWriteText(assumptionsMdPath, renderAssumptionsMd(asLedger))`. Easier path: inline the atomic-write in `runIntelligenceReconcile` since the operation is one-off admin.

## CLI

```ts
// cli/commands/intelligence.ts
import type { Command } from 'commander';
import { runIntelligenceReconcile } from '../../intelligence/store.js';

export function registerIntelligenceCommand(program: Command): void {
  const cmd = program
    .command('intelligence')
    .description('CADENCE strategic-intelligence admin utilities');

  cmd
    .command('reconcile')
    .description(
      'Re-derive recommendation link arrays and re-render all intelligence MD files',
    )
    .action(async () => {
      try {
        const res = await runIntelligenceReconcile(process.cwd());
        if (!res.present) {
          process.stdout.write('No intelligence ledgers present.\n');
          return;
        }
        process.stdout.write(
          `Reconciled ${res.recommendations} recommendations, ${res.assumptions} assumptions, ${res.decisions} decisions.\n`,
        );
        process.stdout.write(
          'Updated: recommendations.json, RECOMMENDATIONS.md, ASSUMPTIONS.md, DECISIONS.md.\n',
        );
      } catch (err) {
        process.stderr.write(
          `intelligence reconcile failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
```

## Acceptance Criteria

| AC | Statement | Linked test surface |
|---|---|---|
| AC-1 | `runIntelligenceReconcile(root)` on empty workspace (no `.cadence/intelligence/`) → returns `{ present: false, recommendations: 0, assumptions: 0, decisions: 0 }`. No files created. | `tests/intelligence/store-reconcile.test.ts` |
| AC-2 | `runIntelligenceReconcile(root)` on populated workspace → re-derives link arrays via `deriveRecommendationLinks` and writes recommendations.json + 3 MD files. Result counts match ledger sizes. | `store-reconcile.test.ts` |
| AC-3 | Idempotency: two consecutive `runIntelligenceReconcile(root)` calls → second pass leaves all 4 written files byte-equal to first pass. | `store-reconcile.test.ts` |
| AC-4 | Drift correction: operator manually edits `assumptions.json` to add an assumption tied to an existing rec (without going through `addAssumption`); `runIntelligenceReconcile(root)` picks it up — rec's `assumptionIds[]` now includes the new id. | `store-reconcile.test.ts` |
| AC-5 | MD re-render reflects current status: pre-call `RECOMMENDATIONS.md` has `as-1 (open)`; operator manually flips JSON to `status: 'validated'`; reconcile → MD shows `as-1 (validated)`. | `store-reconcile.test.ts` |
| AC-6 | `assumptions.json` + `decisions.json` content UNCHANGED by reconcile (source of truth read-only). Only `recommendations.json` may change (re-derived links). | `store-reconcile.test.ts` |
| AC-7 | CLI `cadence intelligence reconcile` on populated → exit 0, stdout `Reconciled N recommendations, M assumptions, K decisions.\nUpdated: ...\n`. | `tests/cli/intelligence-reconcile.test.ts` |
| AC-8 | CLI on empty workspace → exit 0, stdout `No intelligence ledgers present.\n`. | `intelligence-reconcile.test.ts` |
| AC-9 | Phase-31.1 drift guard: `docs/reference/commands.md` marker block + CLI top-level set BOTH include `intelligence`. Test passes. | `tests/docs/cli-reference.test.ts` |

## Testing

- **In-process `tempRepo` via `@cadence/testkit`** for AC-1..AC-6.
- **Spawn-CLI pattern** for AC-7, AC-8.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (16/16).

## Commit Convention

```
docs: design + plan — cadence intelligence reconcile (Praxis Slice 17)
feat(core): runIntelligenceReconcile + CLI cadence intelligence reconcile (Slice 17)
docs: document cadence intelligence reconcile + cli-reference + reconcile Slice-11/13 follow-refs (Slice 17)
```

Three commits.

## Success Criteria

1. All 9 ACs pass.
2. Full turbo gate green (16/16; lint included).
3. Slice-11 § Follow-On + Slice-13 § Follow-On `cadence intelligence reconcile` entries reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. Phase-31.1 drift guard passes (marker block + CLI extended in sync).
6. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **New top-level command, not subcommand-on-existing.** `intelligence` is the natural parent for cross-ledger admin tools; future siblings (`stats`, `audit`, etc.) fit naturally. Mounting on `recommendation` would lie about the scope.
2. **Read-only on `assumptions.json` + `decisions.json`.** Those are operator source of truth. Reconcile fixes derived state (rec link arrays + all MD renders); it does not normalize source. Slice-13 `.default('active')` already handles schema upgrades at parse time.
3. **No `--dry-run` flag.** Reconcile is cheap (read 4 small JSON, write 4 small files) and idempotent. Operator can `git diff` after to see what changed.
4. **No `--json` output.** Plaintext suffices. Add later if a consumer materializes.
5. **MD-only re-render path inlined**, not factored into separate exported helpers. Single-call site; factoring would be premature.
6. **No-op exit 0 on empty workspace.** Operator scripting safety — `cadence intelligence reconcile` should never error on a clean repo.
7. **Counts in stdout** reflect what was scanned, not what changed. "Reconciled 5 recommendations" means 5 recs touched (even if all link arrays were already correct).
8. **Drift guard update bundled with feature commit.** Both `cli/register.ts` and `docs/reference/commands.md` must update in lockstep; doing it in one commit prevents transient red gate.

## Follow-On

- **`cadence intelligence stats`** — counts + status breakdown per ledger.
- **`cadence intelligence audit`** — surface broken links (rec references missing assumption/decision id).
- **`--dry-run`** on reconcile.
- **`--json`** output.
- **`supersededBy <id>`** field on decision (separate slice).
- **Rec↔phase linkage** — biggest remaining scope.
- **Auto-dispatch / subagent routing** — forever-deferred.
