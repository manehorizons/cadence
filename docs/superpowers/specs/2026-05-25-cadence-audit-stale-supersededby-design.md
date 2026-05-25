# CADENCE `intelligence audit` — stale supersededBy dim — Design

**Date:** 2026-05-25
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 30 (Slice-28 + Slice-29 follow-on; integrity dim for broken `supersededBy` references)
**Predecessor slice docs:**
- [`2026-05-21-cadence-decision-supersededby-design.md`](2026-05-21-cadence-decision-supersededby-design.md) (Slice 28 — Decision Log #10 named this future audit dim; § Follow-On listed `intelligence audit` integrity check for stale supersededBy refs)
- [`2026-05-25-cadence-decision-graph-design.md`](2026-05-25-cadence-decision-graph-design.md) (Slice 29 — § Follow-On listed `intelligence audit` integrity dim; Decision Log #11 confirmed audit's job is to *enumerate* drift the graph viewer surfaces visually)

## Summary

**Slice 30** adds a new `stale-supersededby` finding kind to `IntelligenceAuditFinding`. The audit dim detects decisions whose `supersededBy` field references an id absent from the decision ledger — the same drift the Slice-29 graph viewer surfaces visually as `dec-Z (not found)` on a forward chain. Schema-additive: a new union variant + a new section in the markdown render + a new remediation hint. No CLI surface change. No store rewrites; `computeIntelligenceAudit` gains one extra loop over `decLedger.decisions`.

- **One new finding kind:** `{ kind: 'stale-supersededby'; decisionId: string; missingTargetId: string }`. Mirrors `orphan-decision`'s shape (subject id + missing referent id).
- **Detection rule:** `d.supersededBy !== undefined && !decIds.has(d.supersededBy)` ⇒ emit finding.
- **No new CLI flags.** `cadence intelligence audit` already prints all kinds; the new kind flows through automatically.
- **Render section:** new `## Stale supersededBy Refs (N)` section appended after `## Orphan Evidence` in `SECTION_ORDER`, before the `## Remediation` block.
- **Remediation hint:** new bullet — "restore the missing decision, OR run `cadence decision reactivate <id>` to clear the dangling `supersededBy` edge (Slice 28: reactivate clears the field)".
- **Exit code unchanged.** Finding present → exit 1 (unless `--quiet`). No finding → exit 0.
- **JSON envelope shape:** existing `IntelligenceAuditReport` carries the new kind through `findings[]` and `byKind` without any structural change.
- **Soft hint deliberately out of scope.** "Superseded without `--by`" is NOT a finding. Slice 28's Decision Log #1 made `--by` optional on purpose ("operators can supersede without naming a replacement"); flagging the absence as an integrity issue would contradict that design.

## Product Boundary

Read only. No writes to any artifact.

## Scope

### In scope

- `packages/core/src/intelligence/store.ts`: extend `IntelligenceAuditFinding` union with the new variant; extend `AUDIT_KINDS` array; add detection loop in `computeIntelligenceAudit`.
- `packages/core/src/intelligence/render-intelligence-audit.ts`: extend `SECTION_HEADERS` + `SECTION_ORDER` with the new kind; add a case to `renderFindingLine`; extend the remediation block.
- Unit tests on `computeIntelligenceAudit` (new dim detection + happy path of valid `supersededBy` ref ignored).
- Unit tests on `renderIntelligenceAudit` (new section rendering + remediation extension + clean audit unchanged).
- CHANGELOG entry under `### Added`.
- Predecessor reconciliation: strike Slice-28 and Slice-29 `§ Follow-On` entries for "intelligence audit dim for stale supersededBy refs".

### Out of scope

- **Soft hint for "superseded without `--by`".** Contradicts Slice 28's optional-by-design decision. If revisited later, would need its own slice + Decision Log entry weighing the contradiction.
- **Cycle detection in audit.** Slice 28 already refuses NEW cycles at write time; Slice 29 tolerates pre-existing cycles in the viewer with `(cycle)` markers. Adding an audit kind for pre-existing cycles would create three places handling the same data integrity concern. Deferred unless a real ledger surfaces one.
- **`--filter-kind` flag on audit.** Existing audit prints all kinds; if filtering becomes desirable, a separate slice.
- **Auto-remediation** (`cadence intelligence reconcile` clearing stale refs). Reconcile re-derives rec link arrays; clearing a decision field is a stronger action that warrants explicit operator intent (`reactivate` already does it).
- Any change to the loop, `state.json`, `STATE.md`, `cadence spec new`, or any CLI surface.

## Architecture

### MODIFIED files

- `packages/core/src/intelligence/store.ts` — extend `IntelligenceAuditFinding` + `AUDIT_KINDS` + `computeIntelligenceAudit`. No other store changes.
- `packages/core/src/intelligence/render-intelligence-audit.ts` — extend `SECTION_HEADERS` + `SECTION_ORDER` + `renderFindingLine` + remediation block.
- `packages/core/tests/intelligence/store.test.ts` (or a new `store-audit-supersededby.test.ts`) — add test cases. Choose the existing file if it has the audit tests; otherwise spin a new sibling file to keep grain consistent with the Slice 8/9/13/16/28 layout.
- `packages/core/tests/intelligence/render-intelligence-audit.test.ts` — add test cases for the new section + remediation extension.

### Untouched

- All Slice-28 / Slice-29 source files (store.ts changes are strictly additive — no existing function signature changes, no existing finding kind shapes touched).
- `cli/commands/intelligence.ts` — no flag changes, no handler changes. The new kind flows through the existing audit subcommand transparently.
- `cli/commands/decision.ts` — untouched.
- All other ledger schemas.
- `intelligence reconcile` — no integration with the new audit dim (reconcile re-derives link arrays; clearing decision fields is operator-explicit via `reactivate`).
- `docs/reference/commands.md` — UNCHANGED (no flag or subcommand changes).

## Implementation Pattern

### Store extension

```ts
// packages/core/src/intelligence/store.ts

export type IntelligenceAuditFinding =
  | { kind: 'broken-assumption-link'; recId: string; assumptionId: string }
  | { kind: 'broken-decision-link'; recId: string; decisionId: string }
  | { kind: 'broken-evidence-link'; recId: string; evidenceId: string }
  | { kind: 'orphan-assumption'; assumptionId: string; missingRecId: string }
  | { kind: 'orphan-decision'; decisionId: string; missingRecId: string }
  | { kind: 'orphan-evidence'; evidenceId: string; missingRecId: string }
  | { kind: 'stale-supersededby'; decisionId: string; missingTargetId: string }; // Slice 30

const AUDIT_KINDS = [
  'broken-assumption-link',
  'broken-decision-link',
  'broken-evidence-link',
  'orphan-assumption',
  'orphan-decision',
  'orphan-evidence',
  'stale-supersededby', // Slice 30
] as const;

export function computeIntelligenceAudit(/* ... */): IntelligenceAuditReport {
  // ... existing loops unchanged ...

  // Slice 30: stale supersededBy refs (decision.supersededBy points to a missing decision id).
  for (const d of decLedger.decisions) {
    if (d.supersededBy !== undefined && !decIds.has(d.supersededBy)) {
      findings.push({
        kind: 'stale-supersededby',
        decisionId: d.id,
        missingTargetId: d.supersededBy,
      });
    }
  }

  // ... existing byKind aggregation unchanged ...
}
```

### Renderer extension

```ts
// packages/core/src/intelligence/render-intelligence-audit.ts

const SECTION_HEADERS: Record<IntelligenceAuditFinding['kind'], string> = {
  // ... existing entries ...
  'stale-supersededby': 'Stale supersededBy Refs',
};

const SECTION_ORDER: IntelligenceAuditFinding['kind'][] = [
  'broken-assumption-link',
  'broken-decision-link',
  'broken-evidence-link',
  'orphan-assumption',
  'orphan-decision',
  'orphan-evidence',
  'stale-supersededby', // Slice 30 — last finding kind, before Remediation
];

function renderFindingLine(f: IntelligenceAuditFinding): string {
  switch (f.kind) {
    // ... existing cases ...
    case 'stale-supersededby':
      return `- ${f.decisionId} supersededBy missing decision: ${f.missingTargetId}`;
  }
}

// In the body of renderIntelligenceAudit, the existing for-loop over SECTION_ORDER
// already handles the new kind. Only the Remediation block needs an extra bullet:

lines.push(
  '- For stale supersededBy refs: restore the missing decision, OR run `cadence decision reactivate <id>` to clear the dangling `supersededBy` edge (reactivate clears the field per Slice 28).',
);
```

### Detection examples

| Ledger fixture | Expected finding |
|---|---|
| `[{ id: 'dec-1' }]` (no `supersededBy`) | None |
| `[{ id: 'dec-1', supersededBy: 'dec-2' }, { id: 'dec-2' }]` | None (valid ref) |
| `[{ id: 'dec-1', supersededBy: 'dec-9' }]` (no `dec-9` in ledger) | `{ kind: 'stale-supersededby', decisionId: 'dec-1', missingTargetId: 'dec-9' }` |
| `[{ id: 'dec-1', supersededBy: 'dec-2' }, { id: 'dec-2', supersededBy: 'dec-3' }]` (no `dec-3` in ledger) | One finding on `dec-2 → dec-3` (not on `dec-1 → dec-2`, which is valid) |

## Acceptance Criteria

| AC | Statement | Linked test |
|---|---|---|
| AC-1 | Clean ledger (no decisions with `supersededBy`, OR all `supersededBy` refs valid) → no `stale-supersededby` findings emitted; `byKind['stale-supersededby']` is `[]`. | store unit tests |
| AC-2 | Decision `d` with `d.supersededBy = 'dec-missing'` (id absent from ledger) → one `stale-supersededby` finding with `{ decisionId: d.id, missingTargetId: 'dec-missing' }`. | store unit tests |
| AC-3 | Multiple decisions, each with a different missing target → one finding per stale ref. | store unit tests |
| AC-4 | Mixed clean + stale refs → only the stale ones surface; valid refs unchanged. | store unit tests |
| AC-5 | `renderIntelligenceAudit` on a report containing only `stale-supersededby` findings → output starts with `# CADENCE Intelligence Audit`, contains `## Stale supersededBy Refs (N)` section with one bullet per finding (`- ${decisionId} supersededBy missing decision: ${missingTargetId}`). | render unit tests |
| AC-6 | Remediation block contains a new bullet pointing operators at `cadence decision reactivate <id>` as the clear-path. | render unit tests |
| AC-7 | Clean audit (no findings at all, including no `stale-supersededby`) → output is exactly `Audit clean: no integrity issues.\n` (Slice-8 baseline preserved). | render unit tests |
| AC-8 | Mixed-kind report (e.g., one `broken-decision-link` + one `stale-supersededby`) → both sections render in `SECTION_ORDER` order (broken links first, stale supersededBy last before Remediation). | render unit tests |
| AC-9 | `IntelligenceAuditReport.byKind['stale-supersededby']` exists as an array (empty when no findings of that kind) — `byKind` initialization includes the new kind. | store unit tests |
| AC-10 | Pre-Slice-30 audit fixtures still pass without modification (additive change). | store + render unit tests (existing) |
| AC-11 | `cadence intelligence audit` CLI surface UNCHANGED (no flags added, no behavior change when zero stale findings present). CLI-reference drift guard UNCHANGED. | existing CLI tests + drift-guard test |

## Testing

- **Store unit tests** (new test file or appended to existing `store-audit*.test.ts` if present): AC-1 through AC-4, AC-9, AC-10. In-memory ledger fixtures; no disk.
- **Renderer unit tests** (appended to existing `render-intelligence-audit.test.ts`): AC-5, AC-6, AC-7, AC-8.
- **No new CLI spawn test required** — the CLI already exercises `computeIntelligenceAudit` end-to-end; existing tests verify exit codes and the markdown shape. The new kind flows through transparently.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` green (16/16).

## Commit Convention

```
docs: design — audit stale-supersededby dim (Praxis Slice 30)
feat(core): intelligence audit stale-supersededby finding kind (Slice 30)
docs: document stale-supersededby audit + reconcile Slice-28/29 follow-refs (Slice 30)
```

Three commits, per Praxis convention.

## Success Criteria

1. All 11 ACs pass.
2. Full turbo gate green (16/16).
3. Slice-28 and Slice-29 `§ Follow-On` "intelligence audit dim for stale supersededBy refs" entries reconciled (struck + annotated as shipped Slice 30).
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. CLI-reference drift guard UNCHANGED. `docs/reference/commands.md` UNCHANGED.
6. Slice-28 and Slice-29 source surfaces UNCHANGED beyond the strictly-additive union variant in `IntelligenceAuditFinding`.
7. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **One new finding kind, not two.** Only the hard case (broken `supersededBy` ref) becomes an audit finding. The soft hint ("superseded without `--by`") would contradict Slice 28's deliberate optionality of `--by` and would require mixing severity levels in an audit that has historically been single-severity (exit 1 on findings). Deferred to a separate slice IFF a real use case surfaces.
2. **Finding shape mirrors `orphan-decision`.** Subject id + missing referent id. Keeps the union internally consistent — every finding kind has the same "subject references missing target" shape.
3. **Render section placed last in `SECTION_ORDER`.** New kinds extend the bottom of the report (before Remediation). Doesn't perturb the existing 6-section order.
4. **Remediation bullet names `reactivate` as the clear-path.** Slice 28's `reactivate` already clears `supersededBy`. The audit hint reuses an existing CLI action rather than introducing a new "clear" verb.
5. **No auto-remediation.** `intelligence reconcile` re-derives rec link arrays from current subject ledgers — a pure derivation. Clearing a decision field is a stronger semantic action that warrants explicit operator intent. The hint surfaces the option without taking it.
6. **No `cycle` finding kind.** Slice 28 refuses NEW cycles at write time; Slice 29's graph viewer renders pre-existing cycles as `(cycle)` markers. Adding an audit kind would be the third surface handling the same concern. Deferred unless a real ledger surfaces a cycle in practice (so far: zero observed).
7. **No new CLI flags.** Audit already prints all kinds. Adding `--filter-kind` would be a separate slice if/when operators ask for filtering.
8. **Test file location: extend existing `store-audit*.test.ts` IF present; else add a new sibling.** Praxis convention prefers per-concern test files (Slice 8 / 9 / 13 / 16 / 28 each got their own); the new kind fits either pattern. The orchestrator picks based on what's on disk.

## Follow-On

- **`--filter-kind <kind>`** on `intelligence audit` — surface a single dim at a time. Defer until operator asks.
- **Soft hints (e.g., superseded-without-`--by`)** — separate audit severity level; requires a Decision Log entry reconciling with Slice-28 DL #1.
- **Cycle finding kind** — only if a real ledger surfaces a pre-existing cycle.
- **Auto-remediation `cadence intelligence audit --fix-stale-supersededby`** — would call `reactivate` automatically; non-trivial blast radius (clears `supersededBy` on every decision with a stale ref). Operator-explicit path stays default; auto path deferred.
- **Rec↔phase linkage** — biggest remaining scope (handoff candidate #1).
- **Bidirectional `Decision.supersedes: dec-X[]`** derived backfill (Slice-29 follow-on).
