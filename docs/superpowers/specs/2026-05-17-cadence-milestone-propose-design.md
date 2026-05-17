# CADENCE Milestone Propose — Milestone Shaping — Design

**Date:** 2026-05-17
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Branch:** `praxis-intelligence-ledger`
**Parent design:** `synth/docs/superpowers/specs/2026-05-17-cadence-praxis-strategic-intelligence-design.md` (authoritative architecture; §Milestone Model lines 261–292, §Milestone Pre-Mortem 294–304, §Command Flow → Milestone Propose 344–350)
**Prior slices (shipped on this branch):**

- Slice 1 — Intelligence Ledger: `@cadence/types` recommendation/evidence schemas, `packages/core/src/intelligence/{store,render}.ts`, `cadence recommendation add/list`.
- Slice 2 — Intelligence Inspection: `scan.ts`, thin read-only `backend/cadence.ts` (`PraxisBackend`), pure `inspect.ts`, `render-inspection.ts`, `cadence inspect`.
- Slice 3 — Recommend: pure `scoreRecommendation` / `partitionLedger` / `buildAdvisory` / `synthesizeRecommendation`, `render-recommend.ts`, `cadence recommend`.

## Summary

This is **Slice 4a** of the Praxis milestone-propose + SPEC-export keystone, deliberately split into two sub-slices. 4a adds milestone *shaping*: it clusters eligible recommendation-ledger entries into `IntelligenceMilestone` candidates, attaches a scaffolded, deterministically-seeded pre-mortem, and persists `.cadence/intelligence/milestones.json` + a rendered `MILESTONES.md`. It ships a small operator lifecycle surface (`propose | accept | defer | list`).

It does **not** add SPEC export, the first `PraxisBackend` write method, `exported`/`closed` status writes, LLM/heuristic pre-mortem prose, clustering beyond `suggestedMilestoneId`, or any backend/loop coupling. Those are **Slice 4b** (`cadence milestone export --to cadence`).

## Product Boundary (parent design's #1 risk: do not rebuild the loop)

`cadence milestone propose` is a **strategic shaping** step that sits strictly above the execution loop:

- **reads** the recommendation ledger read-only (`readRecommendationLedger`); never writes it;
- **never** reads or writes `state.json`, `STATE.md`, or any CADENCE loop artifact (4a is backend-free — pure over the ledger; contrast Slice 3 which read backend status for its advisory);
- **never** invokes or forces `SPEC → DRAFT → BUILD → SETTLE` transitions;
- writes only `.cadence/intelligence/milestones.json` + `.cadence/intelligence/MILESTONES.md`.

`.cadence/intelligence/MILESTONES.md` is deliberately distinct from CADENCE's own execution-layer `.cadence/MILESTONES.md` (the `backend/cadence.ts` `readArtifacts` `milestones` probe) — different directory, no collision.

## Scope

### In scope

- New `@cadence/types` schemas: `MilestoneStatusZ`, `MilestonePreMortemZ`, `IntelligenceMilestoneZ`, `MilestoneLedgerZ`, `emptyMilestoneLedger()` (+ index export).
- Pure `isEligible(rec)` — strict eligibility predicate.
- Pure `clusterMilestones(recs, existing, now)` — deterministic clustering returning the full next milestone array (refresh-proposed-preserve-rest).
- Pure `seedPreMortem(recs)` — deterministic, ledger-fact-only pre-mortem seeds.
- Pure `applyTransition(ledger, id, action, now)` — `accept` / `defer` with guarded transitions.
- Pure `renderMilestonesMd(ledger)`.
- Store IO in `store.ts`: `readMilestoneLedger` / `writeMilestoneLedger` (atomic + Zod, mirroring the recommendation-ledger contract).
- Glue `runProposeMilestones(root, now?)` / `runMilestoneTransition(root, id, action)`.
- `cadence milestone` CLI: `propose [--json]`, `accept <id>`, `defer <id>`, `list [--json]` — registered in `register.ts`.
- Docs: `docs/reference/commands.md` drift-marker block + `### cadence milestone` section (**mandatory** — `cli-reference.test.ts` drift guard); `CHANGELOG.md` Unreleased.

### Out of scope (Slice 4b / later / parked)

- `cadence milestone export --to cadence <id>`; `IntelligenceMilestone.exportTargets` is in-schema but **always `[]` in 4a** — no 4a code writes it.
- First `PraxisBackend` write method (`renderSpecDraft` / `exportMilestone`).
- `exported` / `closed` status writes (status set only by 4b/later).
- LLM- or heuristic-generated pre-mortem prose.
- Clustering beyond `suggestedMilestoneId` (no affectedAreas connected-components).
- Any backend read or CADENCE loop-state coupling.
- A CLI command to edit pre-mortem content (host fills the JSON directly — YAGNI in 4a).

## Architecture

Approach: full mirror of the shipped Slice 3 (recommend) layout — extended `@cadence/types` schema → pure synth + pure render + thin store IO + thin CLI. All new core modules under `packages/core/src/intelligence/`.

### `milestone.ts` — synthesizer + store glue

Pure functions (no IO):

- `isEligible(rec) → boolean`
- `clusterMilestones(recs, existing, now) → IntelligenceMilestone[]` — the full next milestone array.
- `seedPreMortem(recs) → MilestonePreMortem`
- `applyTransition(ledger, id, action, now) → { ok: true; ledger } | { ok: false; error }`

Glue (IO):

- `runProposeMilestones(root, now?) → MilestoneLedger` — `readRecommendationLedger` (read-only) + `readMilestoneLedger` → `clusterMilestones` → `writeMilestoneLedger`.
- `runMilestoneTransition(root, id, action) → { ok; … }` — `readMilestoneLedger` → `applyTransition` → on `ok` `writeMilestoneLedger`.

### `render-milestone.ts`

Pure `renderMilestonesMd(ledger) → string`, mirroring `renderRecommendMd` conventions (heading, generated-from note, fixed-order sections, per-section empty literal `None.`, `lines.join('\n')`). **No top-level `Generated at:` line** — milestones.json is durable state (not a regenerated report like recommend.json); a render timestamp would churn `MILESTONES.md` on every run with no ledger change, defeating the deterministic-diff goal. Per-record `createdAt`/`updatedAt` carry audit time instead.

### `@cadence/types/src/intelligence.ts` (extended) + index export

### `cli/commands/milestone.ts` + `register.ts`

`cadence milestone` parent + four subcommands. `propose`/`list` default to `renderMilestonesMd`, `--json` emits the ledger JSON (mirrors `cadence recommend --json`). `accept`/`defer` print a confirm line on success; on a guarded-transition failure or not-found id → `stderr` + `process.exitCode = 1`, **no write**. Each subcommand wrapped in the existing try/catch→stderr+`exitCode=1` idiom. `docs/reference/commands.md` drift-marker block updated + `### cadence milestone` (mandatory drift-guard contract). `CHANGELOG.md` Unreleased entry.

## Data Model (Zod, extending `@cadence/types/src/intelligence.ts`)

```ts
MilestoneStatusZ = z.enum(['proposed','accepted','exported','deferred','closed'])

MilestonePreMortemZ = {
  likelyFailureModes: string[];
  hiddenDependencies: string[];
  driftRisks:         string[];
  outOfScope:         string[];
}

IntelligenceMilestoneZ = {
  id: string;                       // min(1)
  name: string;                     // min(1)
  objective: string;                // min(1)
  status: MilestoneStatus;
  recommendationIds: string[];      // min(1) — a 0-rec milestone is never emitted
  preMortem: MilestonePreMortem;
  exportTargets: Array<{            // always [] in 4a; 4b populates
    backend: 'cadence';
    artifactPath: string;
    exportedAt: string;             // ISO8601 offset
  }>;
  createdAt: string;                // ISO8601 offset — schema extension vs parent snippet, consistent with every other ledger record
  updatedAt: string;                // ISO8601 offset
}

MilestoneLedgerZ = { schemaVersion: 1; milestones: IntelligenceMilestone[] }   // z.literal(1)
emptyMilestoneLedger() = { schemaVersion: 1, milestones: [] }
```

## Eligibility — pure `isEligible(rec)`

A recommendation may enter a candidate iff **all** hold:

- `status === 'accepted'`
- `readiness ∈ {ready-for-milestone, ready-for-cadence-spec}`
- `decayState ∉ {superseded, contradicted}`

Strictest literal reading of the parent design's "accepted and ready". Conservative by intent (parent Noisy-Analysis risk): only deliberately-accepted, decision-complete, non-rotted recs shape milestones.

## Clustering — pure `clusterMilestones(recs, existing, now)`

Returns the **complete next milestone array** (not a delta):

1. `claimed` = union of `recommendationIds` over every `existing` milestone whose `status !== 'proposed'` (accepted/exported/deferred/closed). Settled work is never re-proposed.
2. `pool` = `recs.filter(isEligible)` minus any id in `claimed`.
3. Group `pool`:
   - rec with a non-empty `suggestedMilestoneId` → bucket key `mil-grp-<sanitize(suggestedMilestoneId)>`;
   - rec without one, **or** whose `suggestedMilestoneId` sanitizes to `""` → singleton bucket `mil-rec-<recId>`.
   - `sanitize(s)` = `s.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')`.
   - `mil-grp-` vs `mil-rec-` are disjoint namespaces — a `suggestedMilestoneId` literally `"rec-…"` cannot shadow a singleton id.
4. For each bucket (buckets sorted by id; recs within sorted by `createdAt` asc then `id` asc — Slice 3 tiebreak), emit a `proposed` milestone:
   - `id` = bucket key
   - `name` = grouped → raw `suggestedMilestoneId`; singleton → rec `title`
   - `objective` = grouped → `"Deliver N recommendation(s): <first rec titles…>"`; singleton → rec `summary`
   - `recommendationIds` = bucket rec ids, sorted
   - `preMortem` = `seedPreMortem(bucketRecs)`
   - `exportTargets` = `[]`
   - `createdAt` = the same-id existing **proposed** milestone's `createdAt` if present (carry-forward, no churn), else `now`; `updatedAt` = `now`
5. Result = **(all non-`proposed` `existing` records, unchanged)** ++ **(freshly built proposed)**. Every prior `proposed` record is dropped (refresh-proposed semantics).

Determinism: same recommendation ledger + same `now` ⇒ byte-identical milestone array.

## Pre-Mortem — pure `seedPreMortem(recs)`, deterministic facts only

No prose generation (parent: "cadence … scaffolds + validates, it does not generate"). Each seed emitted **only when literally true** of the cluster's recs:

- `hiddenDependencies`: for each file in ≥2 recs' `affectedFiles` (files sorted, ids sorted) → `"Shared file <f> edited by <id>, <id> — ordering/coordination dependency."`
- `driftRisks`: if any rec has area `docs` **or** an `affectedFiles` entry matching `/(^|\/)docs\//i` or `/(DESIGN|README|CHANGELOG)/i` → single entry `"Milestone touches documentation surfaces — spec/doc drift risk."`
- `likelyFailureModes`: for each rec with `confidence < 0.5` (ids sorted) → `"Low-confidence input: <id> (confidence <x.xx>) — assumption may be wrong."` (`0.5` boundary excluded.)
- `outOfScope`: always `[]` — host fills.

Any/all arrays may be empty. The render (not the JSON) supplies placeholder prompt lines for empty sections — `milestones.json` stays honestly empty for the host to fill by JSON edit (no 4a CLI to mutate pre-mortem; YAGNI).

## Transitions — pure `applyTransition(ledger, id, action, now)`

`action ∈ {'accept','defer'}`:

- id not found → `{ ok:false, error:'milestone <id> not found' }`.
- `accept`: requires current `status === 'proposed'` → `accepted`, `updatedAt = now`.
- `defer`: requires current `status ∈ {proposed, accepted}` → `deferred`, `updatedAt = now`.
- any other current status → `{ ok:false, error:'cannot <action> milestone in status <s>' }`.
- success → `{ ok:true, ledger }` — an immutable copy; all other records untouched. `exported`/`closed` are terminal to 4a commands.

CLI maps `ok:false` → `stderr` + `process.exitCode = 1`, no write (no partial mutation).

## Flow

```
cadence milestone propose
→ readRecommendationLedger(root)              [IO, read-only]
→ readMilestoneLedger(root)                   [IO, read-only; absent → emptyMilestoneLedger]
→ clusterMilestones(recs, existing, now)      [pure: claimed → eligible pool → group → seed]
→ MilestoneLedgerZ.parse                      [in writeMilestoneLedger]
→ mkdir intelligenceDir
→ atomicWriteJSON milestones.json; atomicWriteText MILESTONES.md
→ print renderMilestonesMd(ledger)            (or, with --json, ledger JSON to stdout)
→ exit 0

cadence milestone accept <id> | defer <id>
→ readMilestoneLedger → applyTransition → (ok) writeMilestoneLedger ; (!ok) stderr + exit 1
```

## Error Handling

Existing CLI idiom (degrade gracefully; `stderr` + `process.exitCode = 1` only on genuine failure):

- Empty / absent recommendation ledger → no eligible recs → empty `proposed`, milestones.json + MILESTONES.md still written; exit 0.
- Absent milestones.json → `emptyMilestoneLedger()`; exit 0.
- Corrupt milestones.json → `MilestoneLedgerZ.parse` throws → CLI catch → `stderr` + exit 1 (no silent reset; matches the store.ts read contract).
- Guarded-transition violation / unknown id → `stderr` + exit 1, no write.
- Artifact write failure → `stderr` + exit 1.

## Testing (per CADENCE test idioms)

- `packages/types/tests/intelligence.test.ts` (extend): `IntelligenceMilestoneZ` / `MilestoneLedgerZ` accept a valid record; reject `schemaVersion ≠ 1`; reject empty `recommendationIds`.
- `packages/core/tests/intelligence/milestone.test.ts` — table-driven, zero IO:
  - `isEligible`: each pass + each excluded status/readiness/decay case (incl. `=0.5` not relevant here; the boundary case is decay/readiness enums).
  - `clusterMilestones`: group-by-key; singleton fallback; empty-sanitized id → singleton; `mil-grp` vs `mil-rec` disjointness; A2 claimed-rec exclusion; prior-`proposed` dropped while accepted/deferred/exported/closed preserved; `createdAt` carry-forward; byte-stable output for fixed `now`; empty input → `[]`.
  - `seedPreMortem`: shared-file ≥2 → dependency, <2 → none; doc hit via area / `docs/` path / DESIGN|README|CHANGELOG; `confidence<0.5` → failure mode, `=0.5` → none; all-empty path; sorted/deterministic.
  - `applyTransition`: every legal + illegal transition; not-found; immutability.
- `packages/core/tests/intelligence/render-milestone.test.ts`: each section populated + each empty→`None.`; placeholder lines only on empty pre-mortem arrays; seeded arrays render real entries; no `Generated at:` line; id-sorted; proposed/accepted detail block vs deferred/exported/closed one-liner.
- `packages/core/tests/cli/milestone.test.ts`: spawned-CLI idiom (`tempRepo({ initialized: true })`, `spawn(process.execPath, [CADENCE_CLI, 'milestone', …])`) — `propose` writes milestones.json + MILESTONES.md (exit 0); re-run byte-identical when ledger unchanged (deterministic-diff guard); `accept`/`defer` happy + illegal (exit 1, no write); `list --json` parseable; empty-ledger run exits 0. `afterEach` cleanup; core built before this file runs (rebuild-order idiom).
- `packages/core/tests/docs/cli-reference.test.ts` stays green via the commands.md drift-block update.
- **Done bar:** full `pnpm turbo run lint typecheck test build` (mirrors `.githooks/pre-push`; not a subset — durable lesson from Phases 35.1/36.1/38.1 and Slices 2–3).

## Commit Convention

Continues this branch's raw per-task commit style, plan-doc-first:

1. `docs: design — CADENCE Milestone Propose (Praxis Slice 4a)` — this spec.
2. `docs: implementation plan — CADENCE Milestone Propose (Praxis Slice 4a)` — the writing-plans output.
3. Per-task `feat`/`test`/`docs` commits.

All commits on `praxis-intelligence-ledger`. Push is user-authorized for this branch (long-lived integration branch, draft PR #9, not merged to `main`) — build first, push after the full gate is green.

## Success Criteria

- `cadence milestone propose` on a CADENCE repo clusters eligible recs into `proposed` milestones by `suggestedMilestoneId` (singleton fallback), each with a deterministically-seeded scaffolded pre-mortem; writes milestones.json + MILESTONES.md.
- Re-running `propose` with an unchanged ledger produces a byte-identical milestones.json (no churn); accepted/deferred/exported/closed records are never clobbered and their recs never re-proposed.
- `accept` / `defer` enforce guarded transitions; illegal transitions exit 1 with no write.
- Pre-mortem seeds appear only when literally true of the cluster; all other pre-mortem content is empty in JSON and prompt-only in the render.
- 4a writes nothing outside `.cadence/intelligence/` and never touches loop state.
- Degrades gracefully on empty/absent ledgers (exit 0); corrupt milestones.json exits 1.
- `--json` mirrors `cadence recommend --json`.
- Full repo gate green.

## Decision Log

| # | Decision | Alternatives rejected | Why |
|---|----------|----------------------|-----|
| 1 | Split into Slice 4a (propose) then 4b (export) | one slice; decide at plan time | smaller blast radius; mirrors Slices 2–3 cadence |
| 2 | Cluster by `suggestedMilestoneId`, singleton fallback | affectedAreas connected-components; single milestone; manual `--rec` flags | deterministic, pure, reuses the schema field already present; no new heuristic |
| 3 | Eligible = `accepted` ∧ readiness∈{ready-for-milestone, ready-for-cadence-spec} ∧ decay∉{superseded,contradicted} | looser status-only / readiness-only gates | strictest literal reading of "accepted and ready"; conservative |
| 4 | Pre-mortem = empty-scaffold + deterministic ledger-fact seeds | pure empty; heuristic/LLM prose | matches "scaffold not generate"; facts-only stays explainable & noise-free |
| 5 | 4a CLI = `propose \| accept \| defer \| list` | propose-only + manual JSON; +mutate-pre-mortem cmd | full operator surface; clean 4b handoff; YAGNI on pre-mortem editor |
| 6 | Re-propose drops/regenerates `proposed` only; human statuses immutable; their recs excluded from re-cluster | stable-id upsert with pre-mortem merge; append-only | safe repeated dogfood; fights backlog rot; no human-edit-clobber |
| 7 | id = `mil-grp-<sanitize(key)>` / `mil-rec-<recId>`, deterministic, disjoint prefixes | date-seq like rec/evidence; mint-at-accept | stable across re-propose for `accept`/`export` targeting; kills `rec-…`-key shadow edge |
| 8 | `propose` is backend-free (pure over ledger only) | also read backend status like Slice 3 | propose needs no loop context; keeps the read-narrow boundary tighter |
| 9 | No top-level `Generated at:` in MILESTONES.md | mirror recommend.ts timestamp line | milestones.json is durable state, not a regenerated report — avoid render churn |
| 10 | `createdAt`/`updatedAt` added to the milestone schema (vs parent snippet) | parent shape verbatim | every other ledger record carries them; needed for audit + stable carry-forward |

## Follow-On (Slice 4b / not in this slice)

- `cadence milestone export --to cadence <id>` — converts an `accepted` milestone into one or more CADENCE-compatible `<id>-SPEC.md` draft artifacts, records `exportTargets` metadata, sets `status: 'exported'`, **leaving approval/execution to the normal loop (never auto-transitions; never writes `state.json`)**.
- First `PraxisBackend` write method (`renderSpecDraft` / `exportMilestone`) — extends the Slice-2 read-only interface.
- Open 4b question to resolve at its own brainstorm: export cardinality (one SPEC per milestone vs one per recommendation) and the export artifact location (Praxis-owned `.cadence/intelligence/exports/…` staging vs `.cadence/phases/…`), given `spec new` is the loop-coupled, state-mutating path Praxis must not invoke.
