# CADENCE Milestone Export — SPEC Draft Staging — Design

**Date:** 2026-05-17
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Branch:** `praxis-intelligence-ledger`
**Parent design:** `synth/docs/superpowers/specs/2026-05-17-cadence-praxis-strategic-intelligence-design.md` (§"Command Flow → Milestone Export")
**Sibling (must preserve its invariants):** `docs/superpowers/specs/2026-05-17-cadence-milestone-propose-design.md` (Slice 4a — esp. Decision-Log item 6, the id-collision guard)
**Prior slices (shipped on this branch):** Slice 1 Ledger · Slice 2 Inspection · Slice 3 Recommend · Slice 4a Milestone Propose.

## Summary

**Slice 4b** completes the milestone keystone: `cadence milestone export --to cadence <id>` takes an `accepted` `IntelligenceMilestone`, renders a deterministic CADENCE-shaped SPEC scaffold from the milestone's own facts, writes it to a **Praxis-owned staging path**, records `exportTargets` metadata, and flips the milestone `accepted → exported`. It adds the **first write-capability method** to the Slice-2 `PraxisBackend` interface (`renderSpecDraft`).

It does **not** auto-promote into the loop, invoke `cadence spec new`, read or write `state.json`, allocate a real loop phase/id, fan out per-recommendation SPECs, support re-export/un-export, synthesise prose, or add a second backend.

## Product Boundary (parent design's #1 risk: do not rebuild / drive the loop)

`cadence spec new <phase> <num>` is the ONLY thing allowed to allocate a real loop id and it mutates `state.json` (IDLE→SPEC). Praxis must do neither. 4b therefore:

- reads the milestone ledger + recommendation ledger **read-only**;
- writes **only** under `.cadence/intelligence/` (the staged SPEC + the milestone ledger/MILESTONES.md);
- **never** calls `cadence spec new`, **never** reads/writes `state.json`/`STATE.md`, **never** transitions `SPEC→DRAFT→BUILD→SETTLE`;
- uses `cadenceBackend` solely for the pure `renderSpecDraft` (no `readStatus`/loop touch);
- produces a *staged artifact a human promotes manually* — the success message reinforces this.

The staged SPEC lives at `.cadence/intelligence/exports/<milestone-id>/SPEC.md` — a Praxis-owned namespace, structurally disjoint from `.cadence/phases/<dir>/<id>-SPEC.md` (where `spec new` writes).

## Scope

### In scope

- Extend `PraxisBackend` interface (`backend/cadence.ts`) with `renderSpecDraft(milestone, recs): string` (pure; CADENCE impl emits CADENCE SPEC.md). First write method on the interface.
- `cadenceBackend.renderSpecDraft` — deterministic SPEC.md scaffold (see §SPEC Scaffold).
- `runMilestoneExport(root, id, now?)` glue in `intelligence/milestone.ts` (read ledgers → validate `accepted` → render → write staged SPEC → update milestone ledger).
- `cadence milestone export <id> --to <backend>` subcommand (extends the Slice-4a `registerMilestoneCommand`; no `register.ts` change).
- Docs: `docs/reference/commands.md` `### milestone` Subcommands table + behavior sentence; `CHANGELOG.md` Unreleased.

### Out of scope (later / parked)

- Auto-promotion into the loop; any `cadence spec new` invocation; any `state.json` write.
- Per-recommendation SPEC fan-out (one SPEC per milestone only).
- Re-export / un-export (export terminal from `accepted`).
- LLM/heuristic prose synthesis in the SPEC body.
- `exportMilestone` (IO) on the backend interface — IO stays in glue.
- A second backend; `--json` on export.
- Pre-flight `cadence spec check` validation inside export (operator validates separately).

## Architecture

Approach A — full mirror of the shipped slices: extend interface → pure render (on the backend, because the *format* is backend-specific — the design's explicit rationale for the first write method being on the interface) → thin IO glue → thin CLI.

### `backend/cadence.ts` — interface + first write method

```ts
export interface PraxisBackend {
  id: string;
  detect(root): Promise<BackendDetection>;
  readStatus(root): Promise<BackendStatus>;
  readArtifacts(root): Promise<BackendArtifacts>;
  listLegalActions(root): Promise<string[]>;
  renderSpecDraft(
    milestone: IntelligenceMilestone,
    recs: ReadonlyArray<Pick<Recommendation, 'id' | 'title'>>,
  ): string;   // NEW — pure, no IO
}
```

`recs` is an id+title projection (not the full `Recommendation`) — the scaffold only needs those two fields; the glue builds the projection so the backend is decoupled from the rec schema and from unresolved-id handling. Recs arrive in milestone `recommendationIds` order. Pure: same `(milestone, recs)` → byte-identical text; no clock, IO, or randomness (the `exportedAt` timestamp is glue-side, never in the SPEC body).

### `intelligence/milestone.ts` — `runMilestoneExport` glue

Read milestone ledger → find `id` (not found → `{ok:false}`) → assert `status==='accepted'` (else `{ok:false}`) → read recommendation ledger, project `recommendationIds` via `byId.get(rid) ?? {id:rid,title:rid}` → `cadenceBackend.renderSpecDraft` → `mkdir` + `atomicWriteText` staged SPEC → `writeMilestoneLedger` (status `exported`, append one exportTarget, bump `updatedAt`). Returns `{ok:true, ledger, artifactPath}` | `{ok:false, error}`.

### `cli/commands/milestone.ts` — `export` subcommand

Added to the existing 4a parent; `--to` is a `requiredOption` validated `=== 'cadence'`; `refused:`/`failed:` idiom; success prints status + staged path + promote hint; no `--json`.

## Data Model

No `@cadence/types` schema change. `IntelligenceMilestoneZ` (4a) already carries `status` (incl. `'exported'`) and `exportTargets: Array<{ backend:'cadence'; artifactPath:string; exportedAt:ISO8601 }>` (always `[]` in 4a; 4b appends exactly one). `applyTransition` (4a) is **unchanged** — export is its own glue (it has an artifact side-effect + metadata, not a pure flip).

```ts
export type ExportResult =
  | { ok: true; ledger: MilestoneLedger; artifactPath: string }
  | { ok: false; error: string };
```

## SPEC Scaffold (exact text `cadenceBackend.renderSpecDraft` emits)

```
---
phase: <milestone.id>
id: 00-00
status: PENDING
---

# 00-00 — <milestone.name>

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `<milestone.id>`. To promote: run `cadence spec new <phase> <num>` (allocates
> the real NN-NN id + moves the loop IDLE→SPEC), then replace the scaffold body
> with this content and re-id the frontmatter to the allocated id.

## Objective

<milestone.objective>

## Acceptance Criteria

### AC-1: <recs[0].title | recs[0].id if unresolved>
Given _(precondition)_
When _(action)_
Then _(outcome)_

### AC-2: <recs[1].title>
…  one AC per rec, milestone order, contiguous AC-1..AC-n  …

## Constraints

- <driftRisks…> then <outOfScope…>
- _(constraint)_        ← ONLY when BOTH arrays empty

## Open Questions

- <hiddenDependencies…> then <likelyFailureModes…>
- _(question)_          ← ONLY when BOTH arrays empty
```

Parser-verified (`packages/core/src/parse/spec-parser.ts`):
- `FRONTMATTER_RE = /^---\n…\n---\n/` requires frontmatter at **byte 0** — the operator note CANNOT precede it; it sits between the H1 and `## Objective`.
- `extractSection` only reads `## ` sections — the H1 + blockquote are outside any section, so `parseSpecMd` and `cadence spec check` ignore them while a human still sees them.
- Objective parse takes only line 0 — `milestone.objective` is single-line (4a builds it so); a singleton's `summary` with embedded newlines keeps full text in the file but the parser reads line 0 (documented minor).
- `SpecZ.id` `^\d{2}-\d{2}$` ← `00-00` passes; `phase` is `z.string()` ← milestone-id passes.
- ≥1 AC guaranteed (`recommendationIds` is `min(1)`); objective non-empty (`objective` is `min(1)`) → `cadence spec check` (needs objective + ≥1 AC) passes on the staged file.

`lines.join('\n')`, trailing newline (render-milestone idiom).

## Flow

```
cadence milestone export <id> --to cadence
→ opts.to !== 'cadence' → stderr refused + exit 1
→ runMilestoneExport(cwd, id):
  → readMilestoneLedger              [IO read]
  → not found → {ok:false}           ; status!=='accepted' → {ok:false}
  → readRecommendationLedger         [IO read]; project ids→{id,title}
  → cadenceBackend.renderSpecDraft   [pure]
  → mkdir .cadence/intelligence/exports/<id>/ ; atomicWriteText SPEC.md
  → writeMilestoneLedger (status exported + exportTarget; Zod + atomic + MILESTONES.md re-render)
→ ok → stdout: "milestone <id> → exported / staged SPEC: <path> / promote with: cadence spec new …"
→ {ok:false} → stderr "milestone export refused: <error>" + exit 1
→ throw → stderr "milestone export failed: <msg>" + exit 1
```

## Error Handling

- Unknown `--to` → `refused:` exit 1, no write.
- Milestone id not found → `refused: milestone <id> not found`, exit 1, no write.
- Status not `accepted` (proposed/deferred/exported/closed) → `refused: cannot export milestone in status <s>`, exit 1, no write (re-export of `exported` is thus refused — terminal).
- Staged-SPEC write throws → ledger NOT mutated, propagate `failed:` exit 1 (no partial state).
- Ledger write throws AFTER SPEC written → staged file orphaned, but the milestone is **still `accepted`** (the very write that would flip it to `exported` is the one that failed). Re-export is therefore still *allowed*, and a re-run **self-heals**: it atomically overwrites the orphan (`mkdir {recursive}` + `atomicWriteText`) and completes the ledger flip. **Residual risk is mild and auto-recoverable** (same derived-artifact tolerance class as 4a's json/md window); error surfaced, no manual cleanup required. (Verified against the implemented ordering during the Slice-4b holistic review.)
- Absent recommendation ledger / unresolved rec ids → ACs still emitted (name = bare id); no throw.

## Testing (per CADENCE test idioms)

- `backend-cadence.test.ts` (extend): pure `renderSpecDraft` — frontmatter/blockquote placement, Objective verbatim, one AC per rec (order, unresolved→id), Constraints/Open-Questions seed concat + both-empty placeholders, determinism.
- **Round-trip guard**: `parseSpecMd(renderSpecDraft(...))` → `SpecZ` parses; `id==='00-00'`; `objective===milestone.objective`; `acceptanceCriteria.length===recs.length`; blockquote/H1 do not leak into any parsed section. Pins the "stays spec-check-parseable" contract against the real parser.
- `milestone.test.ts` (extend): `runMilestoneExport` via `tempRepo` — accepted→exported + staged file + exportTarget (injected `now`) + MILESTONES.md re-render; not-found / non-accepted → `{ok:false}`, disk unchanged; unresolved rec id tolerated.
- `cli/milestone.test.ts` (extend): `export --to cadence <id>` happy (exit 0, stdout path + promote hint, file exists); `--to bogus` → exit 1; export a `proposed` id → exit 1 `cannot export milestone in status proposed`; missing `--to` → commander exit 1.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (full, not a subset — lint included; the durable 4a lesson).

## Commit Convention

Plan-doc-first (design + plan committed before feat commits), then per-task `feat`/`test`/`docs`/`refactor` commits on `praxis-intelligence-ledger`. Push user-authorised for this branch after the full gate is green; PR #9 stays DRAFT, not merged to main.

## Success Criteria

- `cadence milestone export --to cadence <accepted-id>` writes `.cadence/intelligence/exports/<id>/SPEC.md`, flips the milestone to `exported` with one exportTarget, re-renders MILESTONES.md, and prints the staged path + promote hint.
- The staged SPEC passes `cadence spec check` (objective + ≥1 AC) and `parseSpecMd`/`SpecZ` round-trip; the operator note is human-visible but parser-invisible.
- Export is refused (exit 1, zero writes) for unknown backend, unknown id, or non-`accepted` status; re-export of an `exported` milestone is refused.
- No `state.json`/loop interaction anywhere; writes confined to `.cadence/intelligence/`.
- Deterministic SPEC text (clock only in `exportedAt`, glue-side).
- Full repo gate green.

## Decision Log

| # | Decision | Alternatives rejected | Why |
|---|----------|----------------------|-----|
| 1 | One SPEC per milestone | per-rec; operator-choice flag | milestone IS the unit; per-rec undoes 4a clustering |
| 2 | Staging dir `.cadence/intelligence/exports/<id>/SPEC.md` | into `.cadence/phases/`; stdout-only | zero loop coupling; no id alloc; durable metadata target |
| 3 | Deterministic scaffold from milestone facts | minimal skeleton; LLM-generate | carries 4a facts forward; obeys scaffold-not-generate |
| 4 | `id: 00-00`, `phase: <milestone-id>` + operator re-id blockquote | derive id from milestone-id; no frontmatter | stays `cadence spec check`/`SpecZ` parseable as a pre-flight |
| 5 | Export legal only from `accepted`; re-export refused; dedicated `runMilestoneExport` glue | accepted‖exported overwrite/append | terminal posture (4a); no 4a producer for re-gen; artifact+metadata ≠ pure flip |
| 6 | `renderSpecDraft` on `PraxisBackend`; IO glue in milestone.ts | both on backend; standalone module | backend owns format, glue owns where/boundary; matches approved parent design |
| 7 | `renderSpecDraft` takes `Pick<Recommendation,'id'|'title'>[]` | full `Recommendation[]` | decouples backend from rec schema + unresolved-id handling (§3 refinement) |
| 8 | `applyTransition` unchanged; export separate | add `export` action to applyTransition | export has artifact side-effect + metadata, not a pure status flip |

## Follow-On (not in this slice)

- Context packets (`cadence context <scope>`); milestone pre-mortems as a first-class command.
- A promotion helper that scripts `spec new` + paste (still operator-initiated; explicitly NOT auto-transition).
- Multi-backend `renderSpecDraft` once a second backend exists.
