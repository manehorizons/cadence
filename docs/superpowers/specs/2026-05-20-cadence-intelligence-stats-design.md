# CADENCE `cadence intelligence stats` — Strategic-Layer Summary — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Slice:** 18 (follow-on to Slice 17 — `cadence intelligence` parent)
**Predecessor slice docs:**
- [`2026-05-20-cadence-intelligence-reconcile-design.md`](2026-05-20-cadence-intelligence-reconcile-design.md) (Slice 17 — established `cadence intelligence` parent; § Follow-On listed `stats` + `audit` as next siblings)
- [`2026-05-20-cadence-rec-link-backfill-design.md`](2026-05-20-cadence-rec-link-backfill-design.md) (Slice 11 — `deriveRecommendationLinks`; link arrays are the join-table this slice summarizes)

## Summary

**Slice 18** adds a read-only `stats` subcommand to the `cadence intelligence` parent. Aggregates counts across all 4 intelligence ledgers (recommendations + evidence + assumptions + decisions), partitions assumptions/decisions by status, surfaces broken-link counts (rec references missing subject id), and prints a compact terminal summary. Includes both `cadence intelligence` aggregate view and per-rec breakdown via `--by-rec` flag.

- **`cadence intelligence stats`** — global summary; one-screen at-a-glance counts.
- **`cadence intelligence stats --by-rec`** — per-rec breakdown: each rec on one line with linked-assumption counts (by status) + linked-decision counts (by status) + evidence count.
- **No mutation.** Pure read-only.
- **No-op on empty workspace**: prints `No intelligence ledgers present.\n` exit 0.

It does **not** modify `@cadence/types` schemas, write any file, change intake/transition surfaces, add a `--format json` flag (terminal text is the contract; defer json), touch `state.json` / `STATE.md` / loop transition, or perform fresh fs/git scan.

## Product Boundary

Strict read-only across the board:
- Writes nothing.
- Reads `.cadence/intelligence/{recommendations,evidence,assumptions,decisions}.json` only.
- **NEVER** calls `cadence spec new` / touches `state.json` / `STATE.md` / loop transition.

## Scope

### In scope

- New pure helper `computeIntelligenceStats(recLedger, evLedger, asLedger, decLedger): IntelligenceStats` in `intelligence/store.ts` (or a sibling file).
- New pure renderer `renderIntelligenceStats(stats, options): string` in a new file `intelligence/render-intelligence-stats.ts`. Two modes: aggregate (default) and per-rec (`--by-rec`).
- New `cadence intelligence stats [--by-rec]` subcommand on the existing `intelligence` parent.
- Tests per ACs.

### Out of scope

- `--format json`.
- `--filter-status <status>` for partial reports.
- `cadence intelligence audit` standalone command (broken-link enumeration; reserved for Slice 19).
- Histograms or charts (terminal text only).
- Output to file (`--to <path>`).
- Per-priority or per-readiness rec breakdown beyond a single line.
- Any `@cadence/types` schema change.

## Architecture

### MODIFIED files

- `packages/core/src/intelligence/store.ts`:
  - + `IntelligenceStats` type.
  - + `computeIntelligenceStats(recLedger, evLedger, asLedger, decLedger): IntelligenceStats` pure helper.
- `packages/core/src/cli/commands/intelligence.ts`:
  - + `cmd.command('stats')` subcommand with `--by-rec` option.

### NEW files

- `packages/core/src/intelligence/render-intelligence-stats.ts` — pure renderer.
- `packages/core/tests/intelligence/compute-intelligence-stats.test.ts` — pure-function vitest.
- `packages/core/tests/intelligence/render-intelligence-stats.test.ts` — pure-function vitest.
- `packages/core/tests/cli/intelligence-stats.test.ts` — spawn-CLI tests.

### Untouched

- All subject add/transition surfaces — untouched.
- Slice-11 `deriveRecommendationLinks` — untouched.
- Slice-17 `runIntelligenceReconcile` — untouched.
- `@cadence/types` — no schema change.
- `cli/register.ts` — `intelligence` parent already registered Slice 17; this slice only adds a sibling subcommand.
- `docs/reference/commands.md` marker block — UNCHANGED (no new top-level commands). Section text gets updated to document the new subcommand.

## Data Model

```ts
export type IntelligenceStats = {
  recommendations: {
    total: number;
    byStatus: Record<Recommendation['status'], number>;
    byReadiness: Record<Recommendation['readiness'], number>;
  };
  evidence: { total: number; byKind: Record<Evidence['kind'], number> };
  assumptions: {
    total: number;
    byStatus: Record<Assumption['status'], number>;
    untiedToRec: number;  // 0 — schema requires recommendationId, but count for symmetry / future
  };
  decisions: {
    total: number;
    byStatus: Record<IntelligenceDecision['status'], number>;
    untied: number;  // dec.recommendationId === undefined
  };
  links: {
    /** Number of rec.assumptionIds entries referencing an id not present in asLedger. */
    brokenAssumptionLinks: number;
    /** Number of rec.decisionIds entries referencing an id not present in decLedger. */
    brokenDecisionLinks: number;
    /** Number of rec.evidenceIds entries referencing an id not present in evLedger. */
    brokenEvidenceLinks: number;
  };
  perRec: Array<{
    id: string;
    title: string;
    status: Recommendation['status'];
    assumptionsByStatus: Record<Assumption['status'], number>;
    decisionsByStatus: Record<IntelligenceDecision['status'], number>;
    evidenceCount: number;
  }>;
};
```

## Render Policy

### Aggregate mode (default)

```
# CADENCE Intelligence Stats

## Recommendations (<total>)

- by status: candidate <n>, accepted <n>, deferred <n>, rejected <n>, converted <n>, superseded <n>
- by readiness: raw-idea <n>, needs-evidence <n>, needs-decision <n>, ready-for-milestone <n>, ready-for-cadence-spec <n>, blocked <n>

## Evidence (<total>)

- by kind: file <n>, command <n>, cadence-artifact <n>, note <n>

## Assumptions (<total>)

- by status: open <n>, validated <n>, rejected <n>

## Decisions (<total>)

- by status: active <n>, superseded <n>, rescinded <n>
- untied: <n>

## Links

- broken assumption links: <n>
- broken decision links: <n>
- broken evidence links: <n>
```

When a category total is 0, the bullet is still emitted (zeros are informative). Each `by *:` line lists all enum values explicitly — diff-stable.

### Per-rec mode (`--by-rec`)

```
# CADENCE Intelligence Stats — Per Rec

| Rec | Status | Open | Validated | Rejected | Active | Superseded | Rescinded | Evidence |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| rec-X — title | candidate | 2 | 1 | 0 | 3 | 0 | 0 | 2 |
| rec-Y — title | accepted | 0 | 1 | 0 | 1 | 0 | 0 | 1 |
```

Markdown table. Each rec on one line. Title truncated to 40 chars with `…` suffix if longer.

### Empty workspace

`No intelligence ledgers present.\n` — exit 0.

## Flow

```
cadence intelligence stats [--by-rec]:
  ├─ Check presence: any of 4 ledgers exist? No → exit 0 with empty message.
  ├─ Read all 4 ledgers.
  ├─ stats = computeIntelligenceStats(recLedger, evLedger, asLedger, decLedger)
  ├─ md = renderIntelligenceStats(stats, { byRec: opts.byRec })
  └─ stdout.write(md)
```

## Acceptance Criteria

| AC | Statement | Linked test surface |
|---|---|---|
| AC-1 | `computeIntelligenceStats` on empty ledgers → all counts zero, perRec empty, no broken links. | `compute-intelligence-stats.test.ts` |
| AC-2 | `computeIntelligenceStats` partitions assumptions by status (open/validated/rejected), decisions by status (active/superseded/rescinded), evidence by kind. Counts match input arrays. | `compute-intelligence-stats.test.ts` |
| AC-3 | Decision `untied` count = decisions with `recommendationId === undefined`. | `compute-intelligence-stats.test.ts` |
| AC-4 | Broken-link counts: rec references id not in target ledger → counted once per broken reference. | `compute-intelligence-stats.test.ts` |
| AC-5 | `perRec` entry counts subject ids correctly partitioned by status per rec; missing subject ids (broken links) are NOT counted in any per-rec bucket. | `compute-intelligence-stats.test.ts` |
| AC-6 | `renderIntelligenceStats(stats)` aggregate mode emits all 5 sections (Recommendations / Evidence / Assumptions / Decisions / Links) regardless of zero-counts. | `render-intelligence-stats.test.ts` |
| AC-7 | `renderIntelligenceStats(stats, { byRec: true })` emits per-rec markdown table with header + one row per rec. Title truncated to 40 chars. | `render-intelligence-stats.test.ts` |
| AC-8 | CLI `cadence intelligence stats` on populated workspace → exit 0, stdout contains all 5 aggregate sections. | `tests/cli/intelligence-stats.test.ts` |
| AC-9 | CLI `cadence intelligence stats --by-rec` → exit 0, stdout contains markdown table header + one row per rec. | `intelligence-stats.test.ts` |
| AC-10 | CLI on empty workspace → exit 0, stdout `No intelligence ledgers present.\n`. | `intelligence-stats.test.ts` |
| AC-11 | Phase-31.1 drift guard passes UNCHANGED (no new top-level commands; `intelligence` already in marker block). | `tests/docs/cli-reference.test.ts` |
| AC-12 | Strict read-only: no file writes occur during stats invocation. | `intelligence-stats.test.ts` |

## Testing

- **Pure-function vitest** for compute (AC-1..AC-5) + render (AC-6, AC-7).
- **Spawn-CLI pattern** for AC-8..AC-10, AC-12.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (16/16).

## Commit Convention

```
docs: design + plan — cadence intelligence stats (Praxis Slice 18)
feat(core): computeIntelligenceStats + renderIntelligenceStats + CLI stats (Slice 18)
docs: document cadence intelligence stats + reconcile Slice-17 follow-ref (Slice 18)
```

Three commits.

## Success Criteria

1. All 12 ACs pass.
2. Full turbo gate green (16/16; lint included).
3. Slice-17 § Follow-On `stats` entry reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. Phase-31.1 drift guard passes UNCHANGED.
6. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **Aggregate by default, per-rec via flag.** Aggregate is the at-a-glance answer; per-rec is the drill-down. Both ship in one slice — operator picks via flag.
2. **All enum values explicitly listed in `by status:` lines**, even when count = 0. Diff-stable; surface drift visible.
3. **Broken-link counting** at compute time. Surfaces JSON-edit drift before operator notices via reconcile.
4. **`perRec` always computed**, even in aggregate mode. Cheap; lets the renderer pick. Mirrors Slice-14's "renderer applies optional filter, compute gives full data" pattern.
5. **No `--format json`**. Terminal text. Add later if a consumer needs it.
6. **Per-rec mode renders Markdown table**, not aligned columns. Diffable; pasteable into docs/PRs.
7. **Title truncation at 40 chars** keeps per-rec lines from wrapping on standard 80-col terminals when combined with status + 7 count columns.
8. **No `cadence intelligence audit` in this slice.** Stats surfaces broken-link COUNTS; audit (enumerating WHICH refs are broken with paths) is a separate consumer slice.

## Follow-On

- **`cadence intelligence audit`** — enumerate broken links with full id paths + remediation hints.
- **`--format json`** on `stats`.
- **`--filter-status <status>`** for narrowed reports.
- **Histograms / sparklines** for over-time tracking (would need a snapshot mechanism).
- **`supersededBy <id>`** field + graph rendering.
- **Rec↔phase linkage** display.
- **Auto-dispatch / subagent routing** — forever-deferred.
