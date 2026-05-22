# CADENCE `RECOMMENDATIONS.md` Render — Assumption + Decision Link Surfacing — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Slice:** 12 (follow-on to Slice 11 — Recommendation Link Backfill)
**Predecessor slice docs:**
- [`2026-05-20-cadence-rec-link-backfill-design.md`](2026-05-20-cadence-rec-link-backfill-design.md) (Slice 11 — auto-backfill of `Recommendation.assumptionIds[]` / `decisionIds[]`; § Follow-On explicitly listed this render extension as the next slice — "`RECOMMENDATIONS.md` render extension to display `assumptionIds[].length` / `decisionIds[].length` counts (or inline list) on each rec")
- [`2026-05-20-cadence-assumption-decision-intake-design.md`](2026-05-20-cadence-assumption-decision-intake-design.md) (Slice 8 — established `ASSUMPTIONS.md` + `DECISIONS.md` render contracts the recommendation surface now cross-references)

## Summary

**Slice 12** ships the first observable consumer of Slice 11's now-populated `Recommendation.assumptionIds[]` / `decisionIds[]` arrays. Extends `renderRecommendationsMd` with two conditional inline bullets per recommendation:

- `- assumptions: as-A, as-B, as-C` — only when `assumptionIds.length > 0`
- `- decisions: dec-X, dec-Y` — only when `decisionIds.length > 0`

Mirrors the existing `- areas: ...` / `- files: ...` conditional-bullet pattern in `render.ts` (consistency over invention). No status filter, no count summarisation, no nested entries, no new render file.

Closes Slice-11 § Follow-On "`RECOMMENDATIONS.md` render extension".

- **Pure writer-side change.** No CLI surface, no reader, no JSON schema mutation.
- **All linked ids rendered** regardless of assumption status (open/validated/rejected). The MD surface mirrors the persisted link arrays; status partitioning lives in `ASSUMPTIONS.md` (Slice 9 buckets). Operator who wants open-only cross-references the two files.
- **Empty arrays omit the bullet** (consistent with `areas`/`files`).

It does **not** change `@cadence/types` schemas, modify `cadence assumption|decision|recommendation` CLI surfaces, modify `ASSUMPTIONS.md` / `DECISIONS.md` render, modify `context.ts` / `render-context.ts`, change `addAssumption` / `addIntelligenceDecision` (Slice 11's backfill already populates arrays), add `--status` filter on the render bullet, summarise as counts, embed assumption/decision text, or perform a fresh fs/git scan.

## Product Boundary (parent design's #1 risk: do not rebuild / drive the loop)

Strict read-only outside the recommendation MD render:

- Writes ONLY to `.cadence/intelligence/RECOMMENDATIONS.md` (via existing `writeIntelligenceLedgers`).
- READS ONLY the `RecommendationLedger` + `EvidenceLedger` passed in (identical signature; no new ledger read).
- **NEVER** calls `cadence spec new`, **NEVER** reads/writes `state.json` / `STATE.md`, **NEVER** transitions `SPEC→DRAFT→BUILD→SETTLE`.

## Scope

### In scope

- Extend `renderRecommendationsMd(ledger, evidenceLedger)` in `packages/core/src/intelligence/render.ts` with two conditional bullet emissions, slotted between the existing `- files:` and `- evidence:` bullets.
- New pure-function test file `packages/core/tests/intelligence/render-recommendations.test.ts` (none exists today — `renderRecommendationsMd` was only smoke-tested via the store integration test at `store.test.ts:160-167`). Covers empty arrays / populated arrays / mixed populated / order preservation.
- Extend the existing store integration MD assertion at `store.test.ts:160-167` with a `- assumptions:` matcher post-Slice-11 backfill (positive consumer-side proof of backfill plumbing).
- CHANGELOG entry under `## [Unreleased]` Praxis stream.
- Reconcile Slice 11 § Follow-On "RECOMMENDATIONS.md render extension" entry: strike + annotate "SHIPPED Slice 12".

### Out of scope (later / parked)

- Inline assumption/decision **text** alongside ids (would force `renderRecommendationsMd` to take a third ledger, inflate render width, duplicate `ASSUMPTIONS.md` content).
- Inline status badge per assumption id (`as-1 (open) as-2 (validated)`) — operator can cross-reference `ASSUMPTIONS.md`; render stays compact.
- Count-only summarisation (`- assumptions: 3 (1 open, 2 validated)`) — defer until operator feedback shows ids are too noisy.
- CLI surface change (no `cadence recommendation show <id>` etc.).
- Updating `renderRecommendMd` (the `cadence recommendation list` report at `render-recommend.ts`) — separate report surface, separate slice.
- Any `@cadence/types` schema change.
- A `state.json` / loop transition / `cadence spec new` side effect of any kind.

## Architecture

### MODIFIED files

- `packages/core/src/intelligence/render.ts`:
  - Inside the existing `for (const rec of ledger.recommendations)` body at line ~32, between the `affectedFiles` bullet and the `evidence` loop, add:
    ```ts
    if (rec.assumptionIds.length > 0) lines.push(`- assumptions: ${rec.assumptionIds.join(', ')}`);
    if (rec.decisionIds.length > 0)   lines.push(`- decisions: ${rec.decisionIds.join(', ')}`);
    ```
- `packages/core/tests/intelligence/store.test.ts`:
  - Extend the existing addAssumption-after-addRecommendation flow (or add a new it-block) asserting the rendered `RECOMMENDATIONS.md` contains `- assumptions: as-...` after one `addAssumption` call against the seeded rec. Single new matcher; mirrors Slice-11 backfill integration test pattern.

### NEW files

- `packages/core/tests/intelligence/render-recommendations.test.ts` — pure-function vitest covering AC-1, AC-2, AC-3, AC-4.

### Untouched

- `@cadence/types`: `RecommendationZ.assumptionIds` / `decisionIds` already `z.array(z.string())` — no schema change.
- `packages/core/src/intelligence/store.ts`: writer call site (`renderRecommendationsMd(ledger, evidenceLedger)` at line 125) unchanged — signature unchanged.
- `packages/core/src/intelligence/render-recommend.ts` (separate report surface for `cadence recommendation list`) — untouched.
- `packages/core/src/intelligence/render-assumption.ts` / `render-decision.ts` — untouched.
- `cli/commands/*` — untouched.
- `cli/register.ts` — untouched. Phase-31.1 cli-reference drift guard UNTRIPPED.
- `docs/reference/commands.md` `<!-- cadence:commands -->` marker block: UNCHANGED.

## Data Model

No type or schema change. The render reads `Recommendation.assumptionIds: string[]` + `decisionIds: string[]` which exist on `RecommendationZ` since Slice 1 and are populated by Slice 11's `deriveRecommendationLinks`.

## Render Policy

### Bullet slot order (per rec entry, after slice)

```
## ${rec.id} — ${rec.title}

- status: ${rec.status}
- ready: ${rec.readiness}
- priority: ${rec.priority}
- leverage: ${rec.leverageScore}/10
- risk: ${rec.riskScore}/10
- confidence: ${rec.confidence * 100}%
- decay: ${rec.decayState}
- areas: ...                    (if rec.affectedAreas.length > 0)
- files: ...                    (if rec.affectedFiles.length > 0)
- assumptions: as-A, as-B       (if rec.assumptionIds.length > 0)   NEW
- decisions: dec-X, dec-Y       (if rec.decisionIds.length > 0)     NEW
- evidence: ${ev.summary}        (one per evidence row)
- next: ${rec.suggestedBackendAction}  (if set)

${rec.summary}
```

The two NEW bullets slot AFTER `files` and BEFORE `evidence`. Rationale: `evidence` already varies in arity (multiple `- evidence:` lines per rec); keeping single-line link bullets above that visual block preserves visual scanning rhythm — fixed-arity bullets first, variable-arity bullets last.

### Why ids, not counts, not text

- **Ids over counts**: the rec-MD is reference material an operator pastes into prompts or scans during planning — concrete ids are immediately greppable in the same file's sister docs (`ASSUMPTIONS.md` / `DECISIONS.md`). Counts force a second lookup ("3 assumptions — which ones?") with no payoff.
- **Ids over inline text**: would require passing `AssumptionLedger` + `IntelligenceDecisionLedger` into `renderRecommendationsMd`, breaking the existing two-ledger signature; would also duplicate text already rendered under `## Open` / `## Validated` / `## Rejected` in `ASSUMPTIONS.md`. Cross-file reference is the right abstraction.
- **All statuses rendered, no filtering**: link arrays are status-agnostic by design (Slice 11). Filtering at render time would introduce drift between `recommendations.json` (canonical) and `RECOMMENDATIONS.md` (derived) — operator sees `assumptionIds: ['as-1', 'as-2']` in JSON but only `as-1` in MD, a confusing asymmetry.

### Insertion order preserved

`assumptionIds.join(', ')` and `decisionIds.join(', ')` use the array order as persisted by Slice-11's `deriveRecommendationLinks` (full re-derivation in ledger-insertion order; idempotent). No re-sort.

### Empty arrays → omit bullet entirely

Match `affectedAreas`/`affectedFiles` precedent. Do NOT emit `- assumptions: _(none)_` etc. The recommendation MD per-entry stays terse; absence is the signal.

## Flow

`addAssumption(root, {recommendationId, text})` → Slice-11 writeAssumptionLedger → Slice-11 `deriveRecommendationLinks` → `writeIntelligenceLedgers` → `renderRecommendationsMd(recLedger, evLedger)` → MD now contains `- assumptions: <id>` on the matching rec entry.

`addIntelligenceDecision(root, {recommendationId, ...})` with a tied `recommendationId` → symmetric path, MD now contains `- decisions: <id>` on the matching rec entry.

`addIntelligenceDecision(root, {...})` WITHOUT `recommendationId` (untied) → no recLedger write per Slice-11 AC-8; no MD change. ✓

## Acceptance Criteria

| AC | Statement | Linked test surface |
|---|---|---|
| AC-1 | `renderRecommendationsMd(ledger, evidenceLedger)` on a rec with `assumptionIds: ['as-1', 'as-2']` and `decisionIds: []` emits the line `- assumptions: as-1, as-2` between the `- files:` bullet (or `- decay:` if no files) and the `- evidence:` line(s). Does NOT emit a `- decisions:` line. | `render-recommendations.test.ts` (pure) |
| AC-2 | Symmetric: `decisionIds: ['dec-1', 'dec-2']` + `assumptionIds: []` emits `- decisions: dec-1, dec-2` only; no `- assumptions:` line. | `render-recommendations.test.ts` |
| AC-3 | Both populated: both lines emitted in the documented slot order (assumptions before decisions). | `render-recommendations.test.ts` |
| AC-4 | Both empty: neither line emitted; render byte-equal to a pre-slice render of the same input (asserted via snapshot or string-match negation of `- assumptions` and `- decisions`). | `render-recommendations.test.ts` |
| AC-5 | Order within each bullet preserves the source array order (no alphabetisation, no sort) — verified by passing `['as-9', 'as-1', 'as-5']` and asserting the rendered substring is exactly `as-9, as-1, as-5`. | `render-recommendations.test.ts` |
| AC-6 | Integration: after `addRecommendation` + `addAssumption(rec.id)`, the on-disk `RECOMMENDATIONS.md` contains `- assumptions: <returned-id>` under the rec's `## ` heading. Proves Slice-11 backfill plumbs through to the render surface. | `tests/intelligence/store.test.ts` (extend existing block) |
| AC-7 | Phase-31.1 cli-reference drift guard passes UNCHANGED. NO new top-level commands. | `tests/docs/cli-reference.test.ts` |
| AC-8 | Regression: all existing Slice-1/3/5/11 tests asserting `RECOMMENDATIONS.md` content (e.g. `store.test.ts:160-167`) still pass — the added bullets do not displace or break any existing line. | full `pnpm turbo run test`. |

## Testing (per CADENCE test idioms)

- **Pure-function vitest** for `renderRecommendationsMd` (AC-1 through AC-5). New file `render-recommendations.test.ts` — `renderRecommendationsMd` had no dedicated test today; this slice closes that small coverage gap.
- **In-process `tempRepo` via `@cadence/testkit`** for AC-6 (extend existing block in `store.test.ts`).
- **Test-coverage gate (Phase 14):** every AC maps to ≥1 linked test.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (16/16). Lint included.

## Commit Convention

Mirror Slice 9/10/11 per-task commits. Praxis workstream — NO `cadence draft/settle` loop.

```
docs: design — recommendation MD link surfacing (Praxis Slice 12)
docs: implementation plan — recommendation MD link surfacing (Praxis Slice 12)
feat(core): renderRecommendationsMd surfaces assumption + decision links (Slice 12)
test(core): integration — addAssumption populates rec MD link bullet (Slice 12 AC-6)
docs: document rec MD link surfacing + reconcile Slice-11 follow-ref (Slice 12)
```

Five commits, one per task. Smaller than Slice 11 because (a) one tight render-layer change, (b) no schema change, (c) no migration / self-heal complexity.

## Success Criteria

The slice succeeds if:

1. All 8 ACs pass.
2. Full turbo gate green at every task's done-bar (16/16; lint included).
3. Slice-11 § Follow-On "`RECOMMENDATIONS.md` render extension" entry reconciled (strike + annotate "SHIPPED Slice 12").
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched (boundary audit).
5. Phase-31.1 cli-reference drift guard passes UNCHANGED.
6. Branch HEAD pushes clean through pre-push to `origin/praxis-intelligence-ledger`; PR #9 stays draft + unmerged.
7. `renderRecommendationsMd` now has dedicated pure-function tests (closes the small Slice-1-era coverage gap).

## Decision Log

1. **Ids, not counts, not text.** Operator-facing MD needs concrete cross-references, not summaries. Counts force a second lookup; embedded text would balloon the file and duplicate `ASSUMPTIONS.md`. Ids are the right primitive — greppable across files.
2. **All statuses rendered, no filtering.** Render mirrors the persisted array exactly. Filtering at render time would introduce JSON↔MD drift. Status filtering, if ever needed, belongs in a downstream consumer (e.g. a future `cadence recommendation show --open-assumptions-only`).
3. **Conditional bullet (omit on empty), not always-emit.** Matches `affectedAreas`/`affectedFiles` precedent in the same render function. Always-emit would clutter the common case (rec with zero links).
4. **Slot order: areas → files → assumptions → decisions → evidence.** Fixed-arity bullets first; variable-arity `evidence` lines last; cross-reference links (assumptions/decisions) grouped together and placed before the visually variable evidence block.
5. **Insertion order preserved within each bullet.** No sort. Mirrors Slice-11's `deriveRecommendationLinks` which preserves ledger-insertion order. A reader who wants chronological ordering of the LINK arrays gets it transitively from the underlying ledger ordering.
6. **New pure-function test file** `render-recommendations.test.ts`. `renderRecommendationsMd` had only indirect coverage via `store.test.ts:160-167`. The slice adds the dedicated test surface that should have existed since Slice 1. Small bonus payoff.
7. **No `renderRecommendMd` (the `cadence recommendation list` report) change.** Separate file (`render-recommend.ts`), separate surface, separate slice. The list report's audience and density are different (terminal one-screen scan vs reference doc); embedding link ids in the terminal report needs its own design pass.
8. **No `@cadence/types` schema change.** Reaffirmed — arrays already exist; just being read.
9. **NO new top-level CLI commands.** Pure render-layer change. Phase-31.1 drift guard untripped.
10. **Backwards-compatible MD diff.** Existing assertions in `store.test.ts:164-167` (`# CADENCE Recommendations`, `Add context packets`, `ready: raw-idea`, evidence summary) all continue to match — the new bullets slot between unrelated lines and don't displace any existing matcher.

## Follow-On (not in this slice)

- **`cadence decision` status field + transitions** (decisions still have no status field — Slice-10 Follow-On).
- ~~**`cadence intelligence reconcile`** standalone admin command (Slice-11 Follow-On).~~ **SHIPPED Slice 17**.
- **`rec↔phase` linkage.** Biggest remaining scope.
- ~~**`cadence recommendation show <id>`** CLI surface — would benefit from inline assumption+decision text, but needs its own design.~~ **SHIPPED Slice 14** — see [recommendation show design](2026-05-20-cadence-recommendation-show-design.md). Inline assumption+decision per-entry shape rendered; status filtering via `--open-assumptions-only` / `--active-decisions-only`.
- ~~**Status-aware variant of the link bullets** (e.g. `- assumptions: as-1 (open), as-2 (validated)`) — defer until operator feedback proves the bare-id form is too thin.~~ **SHIPPED Slice 15** — see [rec-md-status-bullets design](2026-05-20-cadence-rec-md-status-bullets-design.md). Transitions also propagate into the rec MD now.
- **Count summarisation** (e.g. `- assumptions: 3 (1 open / 2 validated)`) — defer; see above.
- **`renderRecommendMd` (cadence recommendation list) link surfacing** — separate report surface; separate slice.
- **Auto-dispatch / subagent routing** — forever-deferred per parent design.
