# CADENCE `supersededBy` decision field — Design

**Date:** 2026-05-21
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 28 (first non-CLI-only slice since Slice 13 — schema additive on `IntelligenceDecisionZ`)
**Predecessor slice docs:**
- [`2026-05-21-cadence-list-reverse-design.md`](2026-05-21-cadence-list-reverse-design.md) (Slice 27 — § Follow-On listed `supersededBy <id>`)
- [`2026-05-21-cadence-list-offset-design.md`](2026-05-21-cadence-list-offset-design.md) (Slice 26 — § Follow-On listed `supersededBy <id>`)

## Summary

**Slice 28** adds an optional `supersededBy?: string` field to `IntelligenceDecisionZ` (schema-additive, no migration) and an optional `--by <newId>` flag on `cadence decision supersede <oldId>` to record WHICH decision replaced the superseded one. Adds FK validation, self-ref refusal, and cycle detection. `reactivate` clears the field. `DECISIONS.md` superseded bucket entries surface the link inline. `decision show` surfaces it in both terminal and JSON envelopes. Closes Slice-26/27 § Follow-On `supersededBy <id>` entries.

- **Optional flag.** `supersede <id>` without `--by` works exactly as today (Slice 13 behavior preserved).
- **FK validated.** `--by <newId>` must reference an existing decision id; refused with `cannot supersede: decision <newId> not found` on miss.
- **Self-ref refused.** `--by <oldId>` (oldId == newId) refused with `cannot supersede: decision cannot supersede itself`.
- **Cycle detection.** Walks the `supersededBy` chain starting at `<newId>`; if it ever reaches `<oldId>`, refused with `cannot supersede: would create cycle (dec-X → ... → <oldId>)`.
- **`reactivate` clears `supersededBy`.** Reactivating undoes the supersession edge.
- **`rescind` does NOT take `--by`.** Rescind = "we're not doing this anymore" — no replacement.
- **Schema additivity.** `z.string().optional()` parses pre-Slice-28 JSON cleanly; first post-Slice-28 write of a superseded decision (without `--by`) keeps the field omitted entirely (exact-optional pattern, matching `recommendationId`).

## Product Boundary

Read+write (writes to `decisions.json` + `DECISIONS.md`).

## Scope

### In scope

- `@cadence/types`: extend `IntelligenceDecisionZ` with `supersededBy: z.string().optional()`.
- `store.ts`: extend `applyDecisionTransition` signature with optional `by?: string` (only consulted when `action === 'supersede'`); add validation (FK + self-ref + cycle); clear `supersededBy` on `reactivate`.
- `runDecisionTransition` passes `by` through.
- `cli/commands/decision.ts`: `--by <newId>` option ONLY on the `supersede` subcommand. Other transition verbs unchanged.
- `render-decision.ts`: superseded bucket entries gain `- superseded-by: dec-Y` bullet when present.
- `render-decision-detail.ts`: terminal `decision show` emits `- superseded-by: <id>` bullet when present; missing-id fallback `- superseded-by: <id> (not found)` (self-documenting drift signal, matches recommendation fallback).
- `decision show --format json`: envelope unchanged in shape — `decision` carries full entity including `supersededBy` field.
- Tests per ACs.

### Out of scope

- `--by` on `rescind` (rescind has no replacement).
- Auto-populate `supersededBy` from a decision-graph viewer or backfill command.
- `cadence decision graph` viewer (would visualize chains; defer).
- Bidirectional `supersedes: dec-X[]` reverse-link backfill (one-direction edge sufficient for v1).
- `intelligence audit` integrity check for stale `supersededBy` references (separate audit-dimension slice).

## Architecture

### MODIFIED files

- `packages/types/src/intelligence.ts` — additive schema field.
- `packages/core/src/intelligence/store.ts` — `applyDecisionTransition` + `runDecisionTransition` signature extension; cycle-detection helper.
- `packages/core/src/cli/commands/decision.ts` — `--by` flag on supersede subcommand only.
- `packages/core/src/intelligence/render-decision.ts` — superseded bucket annotation.
- `packages/core/src/intelligence/render-decision-detail.ts` — `decision show` field surfacing.
- Existing test files for all of the above.

### Untouched

- `recommendationId` link semantics (independent dimension).
- All other ledger schemas.
- `RECOMMENDATIONS.md` rendering (Slice 15 status-annotated bullets continue to surface `dec-X (superseded)` — operator cross-refs `DECISIONS.md` for the chain detail).
- `cadence intelligence reconcile` — no behavior change needed; existing re-render picks up new annotation automatically.
- CLI-reference drift guard (no new top-level command).

## Implementation Pattern

### Schema (additive)

```ts
export const IntelligenceDecisionZ = z.object({
  id: z.string().min(1),
  recommendationId: z.string().optional(),
  title: z.string().min(1),
  rationale: z.string().min(1),
  status: z.enum(['active', 'superseded', 'rescinded']).default('active'),
  decidedAt: z.string().datetime({ offset: true }),
  supersededBy: z.string().optional(), // Slice 28
});
```

### Store: cycle detection + transition extension

```ts
// Walk supersededBy chain from start; return ordered chain or null if cycle hit before reaching forbid id.
function walkSupersededByChain(
  ledger: IntelligenceDecisionLedger,
  startId: string,
  forbid: string,
): { ok: true; chain: string[] } | { ok: false; chain: string[] } {
  const chain: string[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = startId;
  while (cursor) {
    if (cursor === forbid) return { ok: false, chain };
    if (seen.has(cursor)) return { ok: true, chain }; // pre-existing cycle in data — not OUR problem to introduce
    seen.add(cursor);
    chain.push(cursor);
    const node = ledger.decisions.find((d) => d.id === cursor);
    cursor = node?.supersededBy;
  }
  return { ok: true, chain };
}

export function applyDecisionTransition(
  ledger: IntelligenceDecisionLedger,
  id: string,
  action: DecisionTransitionAction,
  by?: string,                          // NEW (optional)
  _now?: Date,
): DecisionTransitionResult {
  const target = ledger.decisions.find((d) => d.id === id);
  if (!target) return { ok: false, error: `decision ${id} not found` };
  if (!DECISION_TRANSITION_ALLOWED[action].includes(target.status)) {
    return { ok: false, error: `cannot ${action} decision in status ${target.status}` };
  }

  // Slice 28: --by validation, only on supersede
  if (action === 'supersede' && by !== undefined) {
    if (by === id) return { ok: false, error: 'cannot supersede: decision cannot supersede itself' };
    const replacement = ledger.decisions.find((d) => d.id === by);
    if (!replacement) return { ok: false, error: `cannot supersede: decision ${by} not found` };
    const walk = walkSupersededByChain(ledger, by, id);
    if (!walk.ok) {
      return { ok: false, error: `cannot supersede: would create cycle (${[...walk.chain, id].join(' → ')})` };
    }
  }

  const nextStatus = DECISION_TRANSITION_NEXT[action];
  const ledgerOut: IntelligenceDecisionLedger = {
    schemaVersion: 1,
    decisions: ledger.decisions.map((d) => {
      if (d.id !== id) return d;
      const updated: IntelligenceDecision = { ...d, status: nextStatus };
      if (action === 'supersede') {
        if (by !== undefined) updated.supersededBy = by;
      } else if (action === 'reactivate') {
        delete updated.supersededBy; // reactivate clears
      }
      return updated;
    }),
  };
  return { ok: true, ledger: ledgerOut };
}

export async function runDecisionTransition(
  root: string,
  id: string,
  action: DecisionTransitionAction,
  by?: string,                          // NEW (optional)
): Promise<DecisionTransitionResult> {
  const ledger = await readIntelligenceDecisionLedger(root);
  const res = applyDecisionTransition(ledger, id, action, by, new Date());
  if (!res.ok) return res;
  await writeIntelligenceDecisionLedger(root, res.ledger);
  await rerenderRecommendationsMdIfPresent(root);
  return res;
}
```

### CLI

```ts
// supersede subcommand ONLY gets --by; rescind/reactivate use existing factory loop.
cmd
  .command('supersede <id>')
  .description(DECISION_TRANSITION_DESCRIPTIONS.supersede)
  .option('--by <newId>', 'Decision that supersedes this one (optional FK)')
  .action(async (id: string, opts: { by?: string }) => {
    try {
      const res = await runDecisionTransition(process.cwd(), id, 'supersede', opts.by);
      if (!res.ok) { process.stderr.write(`decision supersede refused: ${res.error}\n`); process.exitCode = 1; return; }
      process.stdout.write(`decision ${id} → superseded${opts.by ? ` (by ${opts.by})` : ''}\n`);
    } catch (err) { /* existing */ }
  });

// rescind + reactivate stay in the existing for-loop factory.
```

### Render

`render-decision.ts` superseded bucket entry:
```
### dec-X — title
- recommendation: rec-Y
- decided: <iso>
- superseded-by: dec-Z                    # NEW, only when supersededBy set

rationale
```

`render-decision-detail.ts`:
```
# dec-X — title

- status: superseded
- recommendation: rec-Y — title
- decided: <iso>
- superseded-by: dec-Z                    # NEW, only when supersededBy set

rationale
```

When `supersededBy` references a missing id (manually edited JSON), render `- superseded-by: dec-Z (not found)` (mirrors Slice 16 recommendation-fallback convention).

## Acceptance Criteria

| AC | Statement | Linked test |
|---|---|---|
| AC-1 | `decision supersede <id>` (no `--by`) → behaves exactly as Slice 13 (status → superseded, no `supersededBy` field on persisted entity). | store + CLI tests |
| AC-2 | `decision supersede <id> --by <newId>` on valid newId → status flipped + `supersededBy: newId` persisted; stdout reports `decision <id> → superseded (by <newId>)`. | CLI tests |
| AC-3 | `--by <id>` (self-ref) → exit 1 + `decision supersede refused: cannot supersede: decision cannot supersede itself`. No side effects (file unchanged). | CLI tests |
| AC-4 | `--by <unknownId>` → exit 1 + `decision supersede refused: cannot supersede: decision <unknownId> not found`. No side effects. | CLI tests |
| AC-5 | Cycle: D1 supersededBy D2; `decision supersede D2 --by D1` → exit 1 + `decision supersede refused: cannot supersede: would create cycle (D1 → D2)`. No side effects. | store + CLI tests |
| AC-6 | Longer chain: D1→D2, D2→D3; `decision supersede D3 --by D1` → exit 1 + cycle error showing full chain. | store tests |
| AC-7 | `decision reactivate <id>` on a previously-superseded decision with `supersededBy` set → status → active AND `supersededBy` removed from persisted entity. | store + CLI tests |
| AC-8 | `DECISIONS.md` superseded bucket entry with `supersededBy: dec-Z` → `- superseded-by: dec-Z` bullet appears between `- decided:` and the rationale. | render tests |
| AC-9 | `decision show <id> --format json` envelope contains `supersededBy` field on the decision when set; absent when unset. | CLI tests |
| AC-10 | Pre-Slice-28 `decisions.json` (no `supersededBy` field on any decision) parses cleanly via `IntelligenceDecisionLedgerZ.parse`. | store tests |
| AC-11 | `supersededBy: <unknownId>` (manually injected) renders as `- superseded-by: <id> (not found)` in both bucket render and `show` detail. | render tests |
| AC-12 | `intelligence reconcile` after `--by` supersession re-renders DECISIONS.md with the new bullet (no special-case code needed — existing rerender picks it up). | reconcile/render integration test |
| AC-13 | Phase-31.1 drift guard UNCHANGED. | `tests/docs/cli-reference.test.ts` |

## Testing

- Pure store unit tests for `applyDecisionTransition` (cycle / self-ref / FK / clear-on-reactivate).
- CLI spawn tests for `--by` happy path + refusals + reactivate-clears.
- Render unit tests for new bullet on both `render-decision.ts` (bucket) and `render-decision-detail.ts` (show).
- JSON envelope shape test.
- Pre-Slice-28 parse test (back-compat).
- Done-bar: full `pnpm turbo run lint typecheck test build` (16/16).

## Commit Convention

```
docs: design — supersededBy on decision (Praxis Slice 28)
feat(core): supersededBy decision field + --by flag on supersede (Slice 28)
docs: document supersededBy + reconcile Slice-26/27 follow-ref (Slice 28)
```

Three commits.

## Success Criteria

1. All 13 ACs pass.
2. Full turbo gate green (16/16).
3. Slice-26 + Slice-27 § Follow-On `supersededBy` entries reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. Phase-31.1 drift guard UNCHANGED.
6. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **`--by` is OPTIONAL, not required.** Preserves Slice-13 `supersede` behavior verbatim — no existing test breaks; operators can supersede without naming a replacement when the replacement doesn't exist yet ("we're scrapping this; replacement TBD"). The audit-dimension slice can later flag superseded-without-link as a soft signal.
2. **Cycle detection walks from `<newId>`, refuses if it hits `<oldId>`.** Pre-existing cycles in the persisted data (created by manual JSON edits) are tolerated by the walk — we refuse only NEW cycles we'd introduce. Pre-existing cycles surface in a future `audit` dimension.
3. **`reactivate` clears `supersededBy`.** Reactivating means "this decision is back in force"; the supersession edge becomes meaningless. Symmetric: pre-Slice-28 behavior is unchanged (reactivate already clears the implicit edge by flipping status).
4. **`rescind` does NOT take `--by`.** Rescind = "no longer in force, no replacement". Conflating with supersede would erode the semantic distinction.
5. **Self-ref refused.** No legitimate use case; only operator typo. Symmetric to FK-not-found.
6. **Chain walk uses `seen` set as a safety belt against pre-existing cycles** — without it, a pre-existing cycle would infinite-loop. The walk treats a pre-existing cycle as "ok, just not OUR cycle to fix."
7. **Exact-optional persistence.** When `--by` is omitted, the `supersededBy` field is OMITTED from the persisted entity (not `undefined`). Mirrors `recommendationId` pattern. Parses cleanly via `.optional()`.
8. **Missing-id render fallback `(not found)`.** Self-documenting drift signal. Mirrors Slice-15 `RECOMMENDATIONS.md` annotation fallback + Slice-16 `decision show` recommendation fallback.
9. **No `RECOMMENDATIONS.md` annotation extension this slice.** Slice 15 already surfaces `dec-X (superseded)` on rec entries; adding chain depth would be visual noise. Operator cross-refs `DECISIONS.md` for the full chain.
10. **No `audit` integrity check this slice.** A future `intelligence audit` dimension can flag stale `supersededBy` references (referent deleted) and superseded-without-supersededBy (soft hint). Keeps slice scoped.

## Follow-On

- ~~**`supersededBy <id>`** decision field.~~ **SHIPPED Slice 28** (this slice).
- ~~**`cadence decision graph <id>`** viewer (forward + backward chain traversal; ASCII tree).~~ **SHIPPED Slice 29** (two-section ASCII; `## Supersedes` transitive bullets + `## Superseded by` arrow chain; `--format json` envelope; cycle and missing-id markers).
- ~~**`intelligence audit` dimension for stale supersededBy refs** and superseded-without-link soft hints.~~ **PARTIALLY SHIPPED Slice 30** (stale-supersededby finding kind + Remediation hint pointing at `cadence decision reactivate <id>` as the clear-path). The superseded-without-link soft hint remains deferred — would contradict Slice-28 DL #1's optional-by-design `--by`.
- ~~**Bidirectional reverse-link backfill** (`Decision.supersedes: dec-X[]` array on the replacement — derived, not user-input; like Slice 11 `assumptionIds`/`decisionIds` backfill pattern).~~ **SHIPPED Slice 31** (`supersedes: string[]` always-present derived field; `deriveDecisionInverseLinks` helper wired into add/transition/reconcile; `decision show` surfaces the bullet; mirrors Slice 11 pattern exactly).
- **`--sort-by <field>`** stable sort with multi-key (Slice 27 follow-on).
- **Bulk transitions** (`cadence assumption validate --all-rec <recId>`).
- **Rec↔phase linkage** — biggest remaining scope.
- **Auto-dispatch / subagent routing** — forever-deferred.
