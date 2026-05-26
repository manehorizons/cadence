# CADENCE recommendation↔phase linkage — Design

**Date:** 2026-05-25
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 34 (upstream design slice — names follow-on impl slices 34.1, 34.2, 34.3, 34.4)
**Predecessor slice docs:**
- [`2026-05-17-cadence-recommend-design.md`](2026-05-17-cadence-recommend-design.md) (`cadence/backend.ts` "To promote: run `cadence spec new <phase> <num>`" hint — the conversion vocabulary exists but no transition wires it up)
- [`2026-05-20-cadence-decision-status-transitions-design.md`](2026-05-20-cadence-decision-status-transitions-design.md) (Slice 13 — pure-helper + I/O-wrapper transition pattern this slice family reuses)
- [`2026-05-20-cadence-rec-md-status-bullets-design.md`](2026-05-20-cadence-rec-md-status-bullets-design.md) (Slice 15 — `RECOMMENDATIONS.md` status-annotated bucket render and the `rerenderRecommendationsMdIfPresent` hook reused on every recommendation mutation)
- [`2026-05-21-cadence-decision-supersededby-design.md`](2026-05-21-cadence-decision-supersededby-design.md) (Slice 28 — FK-validation pattern + exact-optional field pattern reused for `convertedToPhaseId`)
- [`2026-05-25-cadence-audit-stale-supersededby-design.md`](2026-05-25-cadence-audit-stale-supersededby-design.md) (Slice 30 — audit-dim pattern Slice 34.2 mirrors for stale `convertedToPhaseId` refs)

## Summary

**Slice 34 is a design slice.** It ships no code. The deliverable is this document — the architecture spec that Slices 34.1, 34.2, 34.3, and 34.4 implement. Slice 34 exists because the rec↔phase linkage is the biggest remaining Praxis-v1 scope (per handoff at `b34daae`'s "candidate #1") and is large enough that splitting the design from the impl keeps each follow-on slice tight and reviewable.

The linkage records the historical fact that a Praxis `Recommendation` was implemented as a CADENCE phase — converting the existing `cadence/backend.ts` hint into a concrete operator action. Cardinality is 1:1. Promotion is an explicit transition command (`cadence recommendation convert <recId> --to-phase <phaseId>`) that mirrors Slice 13's vocabulary. FK validation is strict — the phase directory must exist at convert time. Conversion is terminal — no `unconvert`. Layering is loose-coupling (Approach A): Praxis records the conversion event; the CADENCE engine stays Praxis-unaware.

- **Slice 34 ships one file:** this design doc. No schema change, no store change, no CLI change, no render change. Single commit.
- **Slice 34.1 ships the core transition** (~150–200 LoC including tests): additive `Recommendation.convertedToPhaseId?: string` field, `applyRecommendationTransition` pure helper, `runRecommendationTransition` I/O wrapper with `phaseDirectoryExists` FK check, `cadence recommendation convert` CLI subcommand, `render-recommendation-detail.ts` extension. Three-commit Praxis convention.
- **Slice 34.2 ships the audit dim** (~80 LoC): new `stale-converted-phase` finding kind, audit detection, render section, remediation hint. Three-commit Praxis convention.
- **Slice 34.3 (deferred)** adds `--from-rec <recId>` to `cadence spec new` / `cadence draft new` for one-shot promotion.
- **Slice 34.4 (deferred)** adds `--filter-converted-to <phaseId>` to `cadence recommendation list` as a reverse-lookup filter.

## Product Boundary

**Slice 34:** Read only. No artifact writes other than this design doc.

**Linkage as a whole (after 34.1 + 34.2):**
- Writes to `RECOMMENDATIONS.md` (via the existing Slice-15 `rerenderRecommendationsMdIfPresent` hook) when a rec is converted.
- Writes to `.cadence/intelligence/recommendations.json` (the rec ledger).
- Reads from `.cadence/phases/<phaseId>/` (existence check only; no phase-side writes).
- No writes to `state.json`, `STATE.md`, any phase artifact, or the loop transition.

## Scope

### In scope (Slice 34)

- This file at `docs/superpowers/specs/2026-05-25-cadence-rec-phase-linkage-design.md`.
- The 1:1 + explicit-transition + strict-FK + terminal + Approach-A foundational decisions captured in Decision Log §1–§5.
- Slice decomposition naming 34.1 + 34.2 + 34.3 + 34.4 with bounded scope per sub-slice.
- Acceptance criteria for Slice 34 itself (doc-only ACs).
- Single commit: `docs: design — rec↔phase linkage upstream (Praxis Slice 34)`.

### Out of scope (Slice 34)

- **Any source change.** Schema, store, CLI, render, audit — all stay frozen in this slice.
- **Predecessor reconciliation.** Each impl slice handles its own predecessor strikethroughs (34.1 reconciles the `cadence/backend.ts` hint context; 34.2 reconciles Slice-30's parallel pattern reference). Slice 34 is the upstream — nothing predecessors need to strike yet.
- **Slice 34.1 schema change.** Captured here as locked design; written in Slice 34.1.
- **Slice 34.2 audit dim.** Captured here as locked design; written in Slice 34.2.
- **Slice 34.3 / 34.4 ergonomic flags.** Captured here as deferred follow-on with bounded scope; NOT promised for Praxis v1.

### Out of scope (linkage feature as a whole)

- **Bidirectional metadata** (e.g., `.cadence/phases/<id>/SOURCE.json` recording the inverse rec id). Rejected — see Decision Log §5 (Approach B).
- **Phase-side derived link in `state.json` / `STATE.md`.** Rejected — keeps CADENCE engine Praxis-unaware.
- **Auto-flip on phase settle.** Rejected — conversion is operator-explicit, not derived. A settle that finishes a phase does not retroactively mark a rec as converted; the operator runs `recommendation convert` explicitly (or `spec new --from-rec` in 34.3).
- **`unconvert` transition.** Rejected — see Decision Log §4. Conversion is a historical fact; mistakes are caught by Slice 34.2's audit dim (`stale-converted-phase`) or by manual ledger edit + reconcile.
- **`withdrawn-conversion` status enum value.** Rejected for the same reason.
- **1:many or many:many cardinality.** Rejected — see Decision Log §1.
- **Phase-side metadata file.** Rejected as a consequence of Approach A.

## Architecture

### Slice 34 — files

- **Add:** `docs/superpowers/specs/2026-05-25-cadence-rec-phase-linkage-design.md` (this file).
- **Modify:** none.
- **Delete:** none.

### Slice 34.1 — files (for reference; not touched in Slice 34)

- **Modify** `packages/types/src/intelligence.ts` — add `convertedToPhaseId: z.string().optional()` to `RecommendationZ`. Exact-optional (matches Slice 28's `supersededBy`; does NOT use `.default([])` like Slice 11's array fields).
- **Modify** `packages/core/src/intelligence/store.ts` — add `applyRecommendationTransition` pure helper alongside the existing `applyDecisionTransition` (Slice 13/28 sibling). Add `runRecommendationTransition` I/O wrapper that delegates to `phaseDirectoryExists` before the pure call. Call `rerenderRecommendationsMdIfPresent` on success (Slice 15 hook). Wire `RecommendationTransitionResult` shape mirroring `DecisionTransitionResult`.
- **Add** a `phaseDirectoryExists(root, phaseId)` helper. Lives wherever fits — likely a small new file `packages/core/src/intelligence/phase-existence.ts` or appended to `store.ts` next to its sole caller. Returns `Promise<boolean>` from a `stat()` on `.cadence/phases/<phaseId>` checking `isDirectory()`. Slice 34.1 picks the location.
- **Modify** `packages/core/src/cli/commands/recommendation.ts` — add `convert <recId>` subcommand with required `--to-phase <phaseId>` option. Output on success: `recommendation <recId> → converted (to <phaseId>)\n`. Output on FK miss: `cannot convert: phase <phaseId> not found\n` (exit 1). Output on invalid-from-status: `cannot convert recommendation in status <status>\n` (exit 1).
- **Modify** `packages/core/src/intelligence/render-recommendation-detail.ts` — emit `- converted-to-phase: <phaseId>` bullet between `- status:` and the existing inverse-link arrays (decisions/assumptions/evidence). Omit the bullet when the field is undefined. No disk reads in render — drift is the audit dim's job.
- **Tests:**
  - `packages/types/tests/intelligence.test.ts` (or sibling) — schema-additive test (new optional field round-trips).
  - `packages/core/tests/intelligence/store-recommendation-transition.test.ts` (new sibling to `store-decision-transition.test.ts`) — pure-helper unit tests for the convert transition matrix + state propagation.
  - `packages/core/tests/cli/recommendation.test.ts` (or sibling) — CLI spawn tests covering happy path + FK-miss refusal + invalid-from-status refusal + idempotency (re-convert refused because status is already `'converted'`).
  - `packages/core/tests/intelligence/render-recommendation-detail.test.ts` — new bullet present when field set, absent when unset.

### Slice 34.2 — files (for reference; not touched in Slice 34)

- **Modify** `packages/core/src/intelligence/store.ts` — add `'stale-converted-phase'` variant to `IntelligenceAuditFinding` union; extend `AUDIT_KINDS`; extend `computeIntelligenceAudit` signature with `existingPhaseIds: Set<string>` parameter; add detection loop.
- **Modify** `packages/core/src/cli/commands/intelligence.ts` — pre-compute `existingPhaseIds` once via `readdir(.cadence/phases)` and pass into `computeIntelligenceAudit`. Keeps `computeIntelligenceAudit` pure-sync.
- **Modify** `packages/core/src/intelligence/render-intelligence-audit.ts` — extend `SECTION_HEADERS` + `SECTION_ORDER` + `renderFindingLine` + remediation block.
- **Tests:**
  - `packages/core/tests/intelligence/store.test.ts` (or sibling `store-audit-converted-phase.test.ts`) — detection happy-path + finding-on-missing-phase + mixed-kind compatibility + `byKind` initialization.
  - `packages/core/tests/intelligence/render-intelligence-audit.test.ts` — new section rendering + remediation bullet + clean audit unchanged.

### Untouched (linkage feature as a whole)

- **CADENCE engine surfaces:** `state.json`, `STATE.md`, `cadence spec new`, `cadence draft new`, `cadence build`, `cadence settle`, `cadence status`, all loop-state transitions.
- **Phase directory:** no new file under `.cadence/phases/<id>/`. No `SOURCE.json`, no `RECOMMENDATION.md`, no manifest mutation.
- **Other ledgers:** decisions, assumptions, evidence ledgers UNTOUCHED.
- **`intelligence reconcile`:** UNTOUCHED. Reconcile re-derives inverse rec-link arrays from current subject ledgers; clearing a `convertedToPhaseId` field is operator-explicit, not derived. Mirrors Slice 30's reconcile decision.
- **`intelligence stats`:** UNTOUCHED in 34.1/34.2. If converted-count becomes useful to surface, it's a tiny follow-on slice — but the Slice-15 status enum already lets operators count `(converted)` bullets in `RECOMMENDATIONS.md`.
- **`recommendation list` bucket render (`RECOMMENDATIONS.md`):** UNTOUCHED. Slice 15 already shows `(converted)` via the status enum; adding inline `<phaseId>` would be visual noise — same precedent as Slice 31's decision bucket-render restraint.

## Implementation Pattern

This section captures the locked patterns for the impl slices. Slice 34 ships none of this code; the snippets exist so 34.1 and 34.2 can be implemented mechanically from this doc.

### Schema additive (Slice 34.1)

```ts
// packages/types/src/intelligence.ts

export const RecommendationZ = z.object({
  id: z.string().min(1),
  // ... existing fields unchanged ...
  decisionIds: z.array(z.string()),
  convertedToPhaseId: z.string().optional(), // Slice 34.1 — exact-optional (Slice 28 pattern)
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
```

### Pure transition helper (Slice 34.1)

```ts
// packages/core/src/intelligence/store.ts

const RECOMMENDATION_TRANSITION_MATRIX: Record<
  RecommendationTransitionAction,
  ReadonlyArray<RecommendationStatus>
> = {
  convert: ['candidate', 'accepted'],
};

export interface RecommendationTransitionInput {
  ledger: RecommendationLedger;
  id: string;
  action: 'convert';
  toPhase: string; // required for convert
  now: string; // ISO timestamp
}

export type RecommendationTransitionResult =
  | { ok: true; ledger: RecommendationLedger; rec: Recommendation }
  | { ok: false; reason: 'not-found' | 'invalid-from-status'; status?: RecommendationStatus };

export function applyRecommendationTransition(
  input: RecommendationTransitionInput,
): RecommendationTransitionResult {
  const idx = input.ledger.recommendations.findIndex((r) => r.id === input.id);
  if (idx < 0) return { ok: false, reason: 'not-found' };
  const rec = input.ledger.recommendations[idx]!;
  const allowed = RECOMMENDATION_TRANSITION_MATRIX[input.action];
  if (!allowed.includes(rec.status)) {
    return { ok: false, reason: 'invalid-from-status', status: rec.status };
  }
  const updated: Recommendation = {
    ...rec,
    status: 'converted',
    convertedToPhaseId: input.toPhase,
    updatedAt: input.now,
  };
  const recs = [...input.ledger.recommendations];
  recs[idx] = updated;
  return { ok: true, ledger: { ...input.ledger, recommendations: recs }, rec: updated };
}
```

### I/O wrapper (Slice 34.1)

```ts
// packages/core/src/intelligence/store.ts

export async function runRecommendationTransition(
  root: string,
  id: string,
  action: 'convert',
  toPhase: string,
): Promise<RecommendationTransitionResult | { ok: false; reason: 'phase-not-found' }> {
  // FK check FIRST — fs read deliberately lives in the I/O wrapper, not the pure helper.
  if (!(await phaseDirectoryExists(root, toPhase))) {
    return { ok: false, reason: 'phase-not-found' };
  }
  const ledger = await readRecommendationLedger(root);
  const result = applyRecommendationTransition({
    ledger,
    id,
    action,
    toPhase,
    now: new Date().toISOString(),
  });
  if (!result.ok) return result;
  await writeRecommendationLedger(root, result.ledger);
  await rerenderRecommendationsMdIfPresent(root); // Slice 15 hook — status propagates to RECOMMENDATIONS.md
  return result;
}

async function phaseDirectoryExists(root: string, phaseId: string): Promise<boolean> {
  try {
    const s = await stat(join(root, '.cadence/phases', phaseId));
    return s.isDirectory();
  } catch {
    return false;
  }
}
```

### CLI surface (Slice 34.1)

```ts
// packages/core/src/cli/commands/recommendation.ts

recCmd
  .command('convert <recId>')
  .requiredOption('--to-phase <phaseId>', 'phase id (must exist under .cadence/phases/)')
  .description('Convert a recommendation into a CADENCE phase (Praxis Slice 34.1)')
  .action(async (recId: string, opts: { toPhase: string }) => {
    const root = process.cwd();
    const result = await runRecommendationTransition(root, recId, 'convert', opts.toPhase);
    if (!result.ok) {
      if (result.reason === 'phase-not-found') {
        process.stderr.write(`cannot convert: phase ${opts.toPhase} not found\n`);
      } else if (result.reason === 'not-found') {
        process.stderr.write(`cannot convert: recommendation ${recId} not found\n`);
      } else if (result.reason === 'invalid-from-status') {
        process.stderr.write(`cannot convert recommendation in status ${result.status}\n`);
      }
      process.exit(1);
    }
    process.stdout.write(`recommendation ${recId} → converted (to ${opts.toPhase})\n`);
  });
```

### Detail render extension (Slice 34.1)

```ts
// packages/core/src/intelligence/render-recommendation-detail.ts

// Inside renderRecommendationDetail, after the `- status:` bullet, before the existing
// `- decisions:` / `- assumptions:` / `- evidence:` inverse-link arrays:
if (rec.convertedToPhaseId !== undefined) {
  lines.push(`- converted-to-phase: ${rec.convertedToPhaseId}`);
}
// No `(not found)` fallback at render — render stays pure (no disk reads).
// Drift surfaces via Slice 34.2's audit dim, not in the detail view.
```

### Audit dim (Slice 34.2)

```ts
// packages/core/src/intelligence/store.ts

export type IntelligenceAuditFinding =
  | { kind: 'broken-assumption-link'; recId: string; assumptionId: string }
  | { kind: 'broken-decision-link'; recId: string; decisionId: string }
  | { kind: 'broken-evidence-link'; recId: string; evidenceId: string }
  | { kind: 'orphan-assumption'; assumptionId: string; missingRecId: string }
  | { kind: 'orphan-decision'; decisionId: string; missingRecId: string }
  | { kind: 'orphan-evidence'; evidenceId: string; missingRecId: string }
  | { kind: 'stale-supersededby'; decisionId: string; missingTargetId: string } // Slice 30
  | { kind: 'stale-converted-phase'; recommendationId: string; missingPhaseId: string }; // Slice 34.2

const AUDIT_KINDS = [
  /* ... existing ... */
  'stale-supersededby',
  'stale-converted-phase', // Slice 34.2
] as const;

export function computeIntelligenceAudit(
  /* existing params */,
  existingPhaseIds: Set<string>, // Slice 34.2 — new required param
): IntelligenceAuditReport {
  // ... existing loops unchanged ...

  // Slice 34.2: stale convertedToPhaseId refs.
  for (const r of recLedger.recommendations) {
    if (r.convertedToPhaseId !== undefined && !existingPhaseIds.has(r.convertedToPhaseId)) {
      findings.push({
        kind: 'stale-converted-phase',
        recommendationId: r.id,
        missingPhaseId: r.convertedToPhaseId,
      });
    }
  }
}
```

```ts
// packages/core/src/cli/commands/intelligence.ts

// Inside the `audit` action, BEFORE calling computeIntelligenceAudit:
const phasesDir = join(root, '.cadence/phases');
let existingPhaseIds: Set<string>;
try {
  const entries = await readdir(phasesDir, { withFileTypes: true });
  existingPhaseIds = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
} catch {
  existingPhaseIds = new Set(); // .cadence/phases doesn't exist → no phases → all converted refs are stale
}
const report = computeIntelligenceAudit(/* existing args */, existingPhaseIds);
```

```ts
// packages/core/src/intelligence/render-intelligence-audit.ts

const SECTION_HEADERS: Record<IntelligenceAuditFinding['kind'], string> = {
  /* ... existing ... */
  'stale-converted-phase': 'Stale converted-to-phase Refs',
};

const SECTION_ORDER: IntelligenceAuditFinding['kind'][] = [
  /* ... existing ... */
  'stale-supersededby',
  'stale-converted-phase', // Slice 34.2 — last, before Remediation
];

function renderFindingLine(f: IntelligenceAuditFinding): string {
  switch (f.kind) {
    /* ... existing cases ... */
    case 'stale-converted-phase':
      return `- ${f.recommendationId} convertedToPhaseId missing phase: ${f.missingPhaseId}`;
  }
}

// Remediation block — new bullet:
lines.push(
  '- For stale converted-to-phase refs: verify the phase id is correct (typo?), OR hand-edit the rec to clear `convertedToPhaseId` then run `cadence intelligence reconcile`.',
);
```

### Detection examples (Slice 34.1 + 34.2)

| Ledger fixture | Phase dir | Convert call | Expected outcome |
|---|---|---|---|
| rec `r-1` status `candidate` | `.cadence/phases/12-foo/` exists | `convert r-1 --to-phase 12-foo` | Success. `r-1.status='converted'`, `r-1.convertedToPhaseId='12-foo'`, `RECOMMENDATIONS.md` re-rendered. |
| rec `r-1` status `accepted` | `.cadence/phases/12-foo/` exists | `convert r-1 --to-phase 12-foo` | Success. |
| rec `r-1` status `deferred` | `.cadence/phases/12-foo/` exists | `convert r-1 --to-phase 12-foo` | Refuse: `cannot convert recommendation in status deferred`. Exit 1. |
| rec `r-1` status `rejected` | `.cadence/phases/12-foo/` exists | `convert r-1 --to-phase 12-foo` | Refuse: `cannot convert recommendation in status rejected`. Exit 1. |
| rec `r-1` status `converted` | `.cadence/phases/12-foo/` exists | `convert r-1 --to-phase 99-bar` | Refuse: `cannot convert recommendation in status converted` (idempotency-by-refusal). Exit 1. |
| rec `r-1` status `candidate` | `.cadence/phases/12-foo/` does NOT exist | `convert r-1 --to-phase 12-foo` | Refuse: `cannot convert: phase 12-foo not found`. Exit 1. No ledger mutation. |
| rec `r-1` missing from ledger | (any) | `convert r-1 --to-phase 12-foo` | Refuse: `cannot convert: recommendation r-1 not found`. Exit 1. |
| Audit: rec `r-1.convertedToPhaseId='12-foo'`, phase dir exists | — | `intelligence audit` | No `stale-converted-phase` finding for `r-1`. |
| Audit: rec `r-1.convertedToPhaseId='12-foo'`, phase dir deleted | — | `intelligence audit` | One finding: `{ kind: 'stale-converted-phase', recommendationId: 'r-1', missingPhaseId: '12-foo' }`. Exit 1. |

## Acceptance Criteria

ACs for **Slice 34** (this design slice) are doc-only. Impl slices 34.1 and 34.2 carry their own ACs derived from the patterns above; this section does NOT pre-promise them.

| AC | Statement | Verification |
|---|---|---|
| AC-1 | This file exists at `docs/superpowers/specs/2026-05-25-cadence-rec-phase-linkage-design.md`. | `ls docs/superpowers/specs/2026-05-25-cadence-rec-phase-linkage-design.md` |
| AC-2 | The doc mirrors the Praxis design-doc section structure: `Summary`, `Product Boundary`, `Scope`, `Architecture`, `Implementation Pattern`, `Acceptance Criteria`, `Testing`, `Commit Convention`, `Success Criteria`, `Decision Log`, `Follow-On` — all present as H2 sections. | `grep -E "^## " docs/superpowers/specs/2026-05-25-cadence-rec-phase-linkage-design.md` |
| AC-3 | The doc captures the five foundational decisions (cardinality, promotion mechanic, FK validation, reversibility, layering) with rejected alternatives recorded in the Decision Log. | manual review of `## Decision Log §1–§5` |
| AC-4 | The doc names follow-on impl slices 34.1, 34.2, 34.3, 34.4 with bounded per-slice scope (in scope / out of scope) and a per-slice LoC estimate where the scope is small enough to estimate. | manual review of `## Follow-On` |
| AC-5 | The doc lists predecessor slice docs as backlinks (Slice 13, 15, 17, 28, 30 minimum) so the design's lineage is navigable. | manual review of `Predecessor slice docs:` header block |
| AC-6 | The doc records each rejected alternative for the five foundational decisions (1:many cardinality, `--from-rec` on `spec new` as the promotion mechanic, lax FK, `unconvert`, Approach B / Approach C layering). | manual review of `## Decision Log §1–§5` |
| AC-7 | Full turbo gate green (trivially — no source changes, so lint + typecheck + test + build all unchanged from `b34daae` baseline). | `pnpm turbo run lint typecheck test build` → 16/16 |
| AC-8 | Single commit: `docs: design — rec↔phase linkage upstream (Praxis Slice 34)`. No `feat(core):` or follow-up doc commit in this slice (the three-commit Praxis convention is collapsed because there is no impl). | `git log -1 --oneline` matches expected title |
| AC-9 | No source files touched in this slice — verified by diff. | `git diff --name-only b34daae..HEAD` shows only the new design doc. |

## Testing

No source changes. The turbo gate runs trivially:

- `pnpm turbo run lint typecheck test build` — 16/16 green.
- `@cadence/core` test count unchanged at 994.
- `@cadence/types` test count unchanged at 122.

Slice 34.1 and 34.2 each ship their own tests per the file lists under `Architecture › Slice 34.1 — files` and `Architecture › Slice 34.2 — files`. The done-bar for each is the same: full turbo green + the per-slice ACs that those impl slices declare in their own design docs (or in the implementation commits' DRAFT/PROGRESS artifacts, since 34.1/34.2 do not require their own upstream design docs — the design is captured here).

## Commit Convention

Single commit. The standard three-commit Praxis convention is intentionally collapsed because Slice 34 ships no impl.

```
docs: design — rec↔phase linkage upstream (Praxis Slice 34)
```

Follow-on slices use the standard three-commit convention:

```
# Slice 34.1
feat(core): recommendation convert transition + convertedToPhaseId (Slice 34.1)
docs: document cadence recommendation convert (Slice 34.1)
# (no third "design" commit — design lives upstream in Slice 34)

# Slice 34.2
feat(core): intelligence audit stale-converted-phase finding kind (Slice 34.2)
docs: document stale-converted-phase audit + reconcile Slice-30 follow-ref (Slice 34.2)
# (no third "design" commit — design lives upstream in Slice 34)
```

Each impl slice strikes its own predecessor follow-on entries: 34.1 reconciles the `cadence/backend.ts` "To promote" hint context (no formal strike — that hint becomes accurate, not obsolete); 34.2 strikes Slice-30's parallel pattern reference if Slice-30's Follow-On named "rec↔phase audit dim" (it did not — 34.2 is a peer pattern, not a follow-on of 30).

## Success Criteria

1. All 9 ACs pass.
2. Full turbo gate green (16/16).
3. No source files touched. `git diff --name-only b34daae..HEAD` shows exactly one added file: this design doc.
4. Branch HEAD pushes clean to origin. PR #9 stays draft.
5. The doc is structurally complete enough that Slice 34.1 can be implemented mechanically without re-asking foundational design questions. Open implementation choices in 34.1 are limited to: file location of `phaseDirectoryExists`, exact test file naming, error-message wording polish.
6. The doc is structurally complete enough that Slice 34.2 can be implemented mechanically without re-asking foundational design questions. Open implementation choices in 34.2 are limited to: test file naming (extend existing `store-audit*` vs. new sibling).

## Decision Log

1. **Cardinality: 1:1.** One recommendation converts to exactly one phase. Schema: `convertedToPhaseId?: string` (singular, exact-optional). Rejected alternatives:
   - **1:many** (`convertedToPhaseIds: string[]`) — would invite implicit rec-splitting via array growth, but Praxis already supports explicit rec-splitting before promotion (operator-curated). 1:many adds surface without solving a real problem. If a rec is too big for one phase, the operator splits the rec first, then promotes each child.
   - **many:many** — would require phase-side metadata (since reverse lookup couldn't be a single-field scan). Couples the CADENCE engine to Praxis. Contradicts Approach A (Decision §5).
2. **Promotion mechanic: explicit transition command** (`cadence recommendation convert <recId> --to-phase <phaseId>`). Mirrors Slice 13's transition vocabulary across all subject ledgers (decisions, assumptions, now recommendations) — a Praxis architectural pattern this slice reaffirms. Rejected alternatives:
   - **`--from-rec <recId>` flag on `cadence spec new`** — works for the happy path (creating a fresh phase from a rec) but breaks down for backfill (linking an already-existing phase to its source rec) and for `cadence draft new` (the draft sibling of spec). Belongs in Slice 34.3 as an *additional* ergonomic surface, not as the *only* promotion mechanic. Slice 34.1 must ship the explicit transition first; 34.3 layers on top.
   - **Both-at-once (transition command + `--from-rec` flag in 34.1)** — too much surface for one slice. Each one is a separate operator-facing affordance with its own test surface. Splitting them keeps each slice review-sized.
3. **FK validation: strict.** The phase directory `.cadence/phases/<phaseId>/` must exist at convert time. Refuses with `cannot convert: phase <phaseId> not found` on miss. Mirrors Slice 28's `--by` FK pattern (`decision supersede --by <decId>` refuses if `<decId>` is missing from the decision ledger). Rejected alternatives:
   - **Lax (allow dangling pointer; audit flags later)** — would let typos persist in the ledger until the next `intelligence audit` run. Slice 34.2's audit dim exists for *post-hoc* drift (phase deleted after a valid conversion), not for *typo prevention* at write time. Two failure modes deserve two surfaces.
   - **Strict-with-force-bypass** (`--force` flag bypassing the FK check) — adds a footgun for marginal benefit. If the operator wants to record a future-conversion they can edit the ledger by hand.
4. **Reversibility: terminal.** No `unconvert` transition. Once a rec is `'converted'`, it stays converted. Mistakes (wrong phase id; phase later deleted) surface in Slice 34.2's audit dim. Rejected alternatives:
   - **`unconvert` symmetric to `reactivate`** (Slice 28's reactivate clears `supersededBy`) — conceptually appealing but semantically wrong. Slice 28's `reactivate` is *correcting a decision-history fact* ("the decision wasn't actually superseded"); a hypothetical `unconvert` would be *erasing a phase-history fact* ("this phase didn't actually originate from this rec"), which is rewriting history rather than correcting it. If a rec was converted to the wrong phase, the right path is: hand-edit `convertedToPhaseId` (audit catches the drift) OR delete the resulting phase and re-convert.
   - **`withdrawn-conversion` status enum value** — adds a status that flows through every list/show/render surface for an edge case the audit dim already covers. Disproportionate.
5. **Layering: Approach A (loose coupling — Praxis-only).** Praxis records the conversion event in `recommendations.json`; the CADENCE engine (`state.json`, `STATE.md`, phase directory contents) stays Praxis-unaware. Reverse lookup is a Praxis CLI query (`recommendation list --filter-converted-to <phaseId>` in Slice 34.4), not a derived field. Rejected alternatives:
   - **Approach B (bidirectional metadata)** — would add a `.cadence/phases/<id>/SOURCE.json` recording the inverse rec id. Couples the CADENCE engine's phase-directory shape to Praxis. Means future CADENCE engine changes (rename SOURCE.json, change phase-dir layout, etc.) need Praxis migration. Contradicts the "Praxis sits ABOVE the loop" architectural principle.
   - **Approach C (engine-integrated promotion)** — would have `cadence spec new` *write the recommendation back* on its way through, treating phase creation as the canonical promotion event. Means the engine has to know about the Praxis schema (which `recommendations.json` to update, how to round-trip the ledger). Contradicts the layering principle and creates a bidirectional dependency.
6. **Slice 34 ships no code.** Three-commit Praxis convention (design + impl + docs-reconcile) is intentionally collapsed to one commit because there is no impl. The impl slices (34.1, 34.2) each follow the standard three-commit convention but skip the design commit (their design lives upstream here). This collapse is acceptable because:
   - The doc is the deliverable. The full turbo gate runs trivially.
   - Splitting into multiple impl slices (34.1, 34.2, optionally 34.3, 34.4) keeps each follow-on slice review-sized.
   - The alternative — packing all of 34.1's ~150-200 LoC + 34.2's ~80 LoC + the design into one slice — would have produced a ~250-300 LoC slice with broad blast radius across schema + store + CLI + render + audit. Splitting trades one fat slice for three lean slices, which Praxis convention generally prefers.
7. **`render-recommendation-detail.ts` stays pure** (no `(not found)` fallback when the phase dir is missing). Slice 28 set the precedent: detail render uses ledger state only; drift detection is the audit dim's job. Slice 34.1 reaffirms this — adding a `(not found)` annotation in detail render would mean every detail-view caller pays a disk-stat cost, and the annotation would race with `intelligence audit`'s authoritative finding.
8. **`RECOMMENDATIONS.md` bucket render is NOT extended.** Slice 15's status-annotated bullets already show `(converted)` via the status enum. Adding inline `<phaseId>` would be visual noise — same precedent as Slice 31 (decision bucket-render restraint). Operators wanting the rec→phase mapping use `cadence recommendation show <recId>` (full detail with the new `- converted-to-phase:` bullet) or `cadence recommendation list --filter-converted-to <phaseId>` (Slice 34.4 reverse-lookup).
9. **Idempotency on re-convert is refused, not silent.** A second `convert` call on an already-converted rec refuses with `cannot convert recommendation in status converted` (because `'converted'` is not in the `convert` transition's ALLOWED list). Falls out of the matrix naturally without special-casing. Operators wanting to re-target a conversion must hand-edit the ledger (or wait for a future `--retarget` flag if real demand surfaces).
10. **`computeIntelligenceAudit` extension takes `existingPhaseIds: Set<string>` as a new parameter** (Slice 34.2). Pre-computed by the CLI command before calling. Keeps `computeIntelligenceAudit` pure-sync. Rejected alternatives:
    - **Make `computeIntelligenceAudit` async + read the phases dir inside** — pollutes the audit's purity boundary; would force every other caller (tests, future programmatic callers) to provide a real disk. The CLI is the only caller that needs disk access; pre-computing the set there is cheaper than threading async through the audit core.
    - **Add a separate `computePhaseLinkageAudit` function** — splits the audit surface and means operators run two commands to get the full integrity picture. Audit-of-audits is worse than one extended audit.
11. **Reconcile interaction: none.** `intelligence reconcile` re-derives the *inverse rec-link arrays* (`Decision.recId → Recommendation.decisionIds`, etc.) from current subject ledgers. Clearing a `convertedToPhaseId` field is a stronger semantic action than re-deriving arrays — it erases an operator-recorded historical fact. Reconcile staying out of the convert/un-convert business mirrors Slice 30's decision (reconcile does not clear stale `supersededBy` refs either; that's `reactivate`'s job, or hand-edit + reconcile).

## Follow-On

### Slice 34.1 — core convert transition (next slice)

**In scope:**
- Schema additive: `Recommendation.convertedToPhaseId?: string`.
- Pure helper `applyRecommendationTransition` + I/O wrapper `runRecommendationTransition` + `phaseDirectoryExists` helper.
- CLI: `cadence recommendation convert <recId> --to-phase <phaseId>`.
- Detail render: new `- converted-to-phase:` bullet.
- Tests: schema round-trip, transition matrix, FK refusal, invalid-from-status refusal, idempotency-by-refusal, detail-render bullet present/absent.

**Out of scope:**
- Audit dim (Slice 34.2).
- `--from-rec` flag (Slice 34.3).
- `--filter-converted-to` reverse-lookup (Slice 34.4).
- Any change to `RECOMMENDATIONS.md` bucket render or `intelligence reconcile`.

**LoC estimate:** ~150–200 including tests (in line with Slice 31).

**Three-commit convention:**
```
feat(core): recommendation convert transition + convertedToPhaseId (Slice 34.1)
docs: document cadence recommendation convert (Slice 34.1)
```
(No third design commit — design lives upstream in Slice 34.)

### Slice 34.2 — audit dim (next slice after 34.1)

**In scope:**
- New `IntelligenceAuditFinding` variant: `stale-converted-phase`.
- `computeIntelligenceAudit` signature extension: new `existingPhaseIds: Set<string>` parameter.
- CLI pre-compute of `existingPhaseIds` from `readdir(.cadence/phases)`.
- Render extension: new `## Stale converted-to-phase Refs` section + remediation bullet.
- Tests: clean ledger no findings; rec with valid converted phase no finding; rec with missing converted phase one finding; mixed-kind report renders all sections in order; clean audit unchanged; `byKind` initialization includes new kind; pre-Slice-34.2 fixtures still pass.

**Out of scope:**
- Auto-remediation (`--fix-stale-converted-phase` flag).
- `--filter-kind` flag (same precedent as Slice 30).
- Any change to `intelligence reconcile`.

**LoC estimate:** ~80 (tighter than Slice 30 because the pattern is proven).

**Three-commit convention:**
```
feat(core): intelligence audit stale-converted-phase finding kind (Slice 34.2)
docs: document stale-converted-phase audit (Slice 34.2)
```

### Slice 34.3 — `--from-rec` ergonomic flag (deferred)

**In scope:**
- `cadence spec new <phase> <num> --from-rec <recId>` and `cadence draft new <phase> <num> --from-rec <recId>` (whichever is the canonical phase-scaffold command at the time the slice ships).
- Happy-path auto-link: scaffold the phase AND run the convert transition in one operator action.
- Failure modes inherit Slice 34.1's FK + transition matrix (rec must be `candidate` or `accepted`; phase scaffold must succeed before the convert runs).

**Out of scope:**
- Bulk-promotion (multiple recs into one phase). Cardinality is 1:1.
- Reverse-direction (`spec new --to-rec` — nonsensical; the rec is the cause, the phase is the effect).

**LoC estimate:** ~60 (a flag + a chained call + tests).

**Status:** Deferred until 34.1 + 34.2 ship and an operator reports the explicit two-step flow (`spec new <phase> <num>` then `recommendation convert <recId> --to-phase <phaseId>`) is friction worth removing.

### Slice 34.4 — `--filter-converted-to` reverse-lookup (deferred)

**In scope:**
- `cadence recommendation list --filter-converted-to <phaseId>` filter.
- Joins the existing list-filter pipeline (Slices 23/25/32/33 precedent): status → rec → text-or-regex → converted-to → reverse → offset → limit.
- Empty-result dim: `converted-to="<phaseId>"`.

**Out of scope:**
- Reverse on `assumption list` / `decision list` (assumptions and decisions don't have a `convertedToPhaseId` field).
- Combined filter with `--filter-status converted` (the new filter implies `status='converted'`; combining is allowed but redundant).
- `--filter-converted-to-any` (boolean: rec has any conversion target) — would just be `--filter-status converted`.

**LoC estimate:** ~40 (tiny — extends the list-filter pipeline, mirrors Slice 25's per-command application).

**Status:** Deferred until an operator reports needing to find "which rec produced phase X" (the reverse-lookup direction). The forward direction (`recommendation show <recId>` shows `- converted-to-phase:`) is shipped in 34.1.

### Slice 34.5+ — speculative

- **`recommendation retarget <recId> --to-phase <newPhaseId>`** — only if real operator workflows surface where the wrong phase id was recorded AND the right correction is "edit-in-place" rather than "delete the wrong phase + re-convert". Adds a new transition action with its own ALLOWED matrix.
- **`intelligence stats --converted-count`** — count of converted recs (and breakdown by phase) for the stats dashboard. Tiny but speculative; only ship if an operator asks.
- **Phase-side reverse marker** (`.cadence/phases/<id>/.praxis-source`) — would be Approach B at last, but only if a real CADENCE-engine-side workflow needs to ask "what rec is this phase from" without going through the Praxis CLI. Currently no such workflow exists. Hard re-litigation of Decision Log §5; would require its own upstream design slice.

### Architectural patterns this slice reaffirms

- **Slice 13 transition vocabulary** applies cleanly across subject ledgers (decisions, assumptions, now recommendations). Pure-helper + I/O-wrapper split is the right shape for any ledger transition.
- **Slice 28's FK-validation pattern** generalizes to non-ledger entities (phases on disk) — but the fs read lives in the I/O wrapper, not the pure helper. The pure helper stays disk-free for testability.
- **"Praxis sits ABOVE the loop"** — preserved by Approach A. Every future Praxis ↔ CADENCE-engine interface should be evaluated against this principle.
- **`rerenderRecommendationsMdIfPresent` (Slice 15)** keeps getting reused for status propagation. Solid abstraction; do not factor it away.
- **Slice 30's audit-dim shape** (subject id + missing referent id) generalizes to drift across surfaces — disk drift (34.2) uses the same shape as ledger drift (30). Future drift kinds should follow the same shape.
- **Detail-render purity** (no disk reads at render time; drift is the audit's job — Slice 28's precedent reaffirmed by 34.1).
- **Bucket-render restraint** (Slice 15's status-annotated bullets are the right vocabulary; resist adding inline metadata that detail-render or list-filter already covers — Slice 31's precedent reaffirmed by 34.1).
