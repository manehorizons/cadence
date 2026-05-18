# CADENCE Context Packets — Design

**Date:** 2026-05-17
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Branch:** `praxis-intelligence-ledger`
**Parent design:** `synth/docs/superpowers/specs/2026-05-17-cadence-praxis-strategic-intelligence-design.md` (§"Command Flow → Context")
**Prior slices (shipped on this branch):** Slice 1 Ledger · Slice 2 Inspection · Slice 3 Recommend · Slice 4a Milestone Propose · Slice 4b Milestone Export.

## Summary

**Slice 5** adds `cadence context <scope>` — compact, curated context packets that travel into a downstream CADENCE phase (`phase`) or across a session/agent handoff (`handoff`). The command reads the recommendation, evidence, assumption, and decision ledgers plus read-only CADENCE backend state, applies a scope-specific selection policy, and emits a bounded `ContextPacket` as JSON + Markdown under `.cadence/intelligence/context/`, also printing the rendered Markdown packet to stdout so it is directly pasteable / pipeable.

It does **not** read or write `state.json`/`STATE.md`, transition the loop, invoke `cadence spec new`, read file *contents*, perform a fresh filesystem/git scan, synthesise prose, enforce a character/token budget, support the `review`/`agent` scopes (deferred follow-on), or add a second backend.

## Product Boundary (parent design's #1 risk: do not rebuild / drive the loop)

Praxis reads broadly, writes narrowly. Slice 5 therefore:

- reads the four intelligence ledgers **read-only**, and CADENCE state **read-only** via `cadenceBackend.readStatus` (the same posture as Slice 3 Recommend);
- writes **only** under `.cadence/intelligence/context/` (the packet `<scope>.json` + `<scope>.md`);
- **never** calls `cadence spec new`, **never** reads/writes `state.json`/`STATE.md`, **never** transitions `SPEC→DRAFT→BUILD→SETTLE`;
- produces an informational artifact a human/agent consumes — it changes no loop state and forces no transition.

The packet lives at `.cadence/intelligence/context/<scope>.{json,md}` — a Praxis-owned namespace, structurally disjoint from `.cadence/phases/` and `.cadence/state.json`.

## Scope

### In scope

- `@cadence/types`: `ContextScopeZ = z.enum(['phase','handoff'])`, `ContextPacketZ` (+ inferred types), re-exported from the types index.
- `intelligence/store.ts`: add `readAssumptionLedger` and `readIntelligenceDecisionLedger` (empty-if-absent, mirroring the existing `readRecommendationLedger`/`readEvidenceLedger`/`readMilestoneLedger`).
- `intelligence/context.ts` (**new**): pure `synthesizeContextPacket(scope, sources, now)` + IO glue `runContext(root, scope, now?)`.
- `intelligence/render-context.ts` (**new**): pure `renderContextMd(packet): string`.
- `cli/register.ts`: register the new top-level `cadence context <scope>` command.
- Docs: `docs/reference/commands.md` marker block + `### context` section (**Phase-31 `cli-reference.test.ts` drift-guard is a hard requirement** — any new top-level command must update this in the same slice); `CHANGELOG.md` Unreleased.

### Out of scope (later / parked)

- `review` and `agent` scopes (the enum + policy switch are extensible; not built in this slice).
- Reading file *contents* or embedding snippets; any fresh filesystem / git scan (no Slice-2 scanner coupling).
- A character / token size budget or truncation algorithm (compactness is bounded-by-construction).
- Any `state.json` / loop / `cadence spec new` interaction.
- Prose synthesis (LLM or heuristic) — packets carry recorded facts only.
- A second backend; per-target (`<phase-id>`) packet arguments — `phase` is always the active phase.
- An assumption/decision intake command (those standalone ledgers have no producer yet — see §Error Handling "honest-empty").

## Architecture

Approach A — full mirror of the shipped slices: extended `@cadence/types` → thin store readers → one pure synth + one pure render → thin IO glue → thin CLI. A single parameterised `synthesizeContextPacket(scope, …)` with a small scope selection policy (chosen over per-scope synth/render pairs and over a render-time-only view): smallest code, fully unit-testable per scope, and extending to `review`/`agent` later is a new policy branch, not new files.

### `intelligence/store.ts` — two new readers

```ts
export async function readAssumptionLedger(root: string): Promise<AssumptionLedger>;
export async function readIntelligenceDecisionLedger(root: string): Promise<IntelligenceDecisionLedger>;
```

Each mirrors the existing readers exactly: `existsSync(path) ? Zod.parse(JSON.parse(readFile)) : empty*Ledger()`. Files: `.cadence/intelligence/assumptions.json`, `.cadence/intelligence/decisions.json`.

### `intelligence/context.ts` — pure synth + IO glue

```ts
export type ContextSources = {
  recommendations: Recommendation[];
  evidence: Evidence[];
  assumptions: Assumption[];
  decisions: IntelligenceDecision[];
  backend: BackendStatus;
};

export function synthesizeContextPacket(
  scope: ContextScope,
  sources: ContextSources,
  now?: Date,
): ContextPacket;                       // pure; ContextPacketZ.parse'd

export async function runContext(
  root: string,
  scope: ContextScope,
  now?: Date,
): Promise<ContextPacket>;              // IO glue
```

`synthesizeContextPacket` reuses `partitionLedger` and `scoreRecommendation` from `recommend.ts` (no duplication). Pure: same `(scope, sources, now)` → same packet; clock only via injected `now` → `generatedAt`.

`runContext`: read the four ledgers (all empty-if-absent) + `cadenceBackend.readStatus(root)` → `synthesizeContextPacket` → `ContextPacketZ.parse` → `mkdir .cadence/intelligence/context` → `atomicWriteJSON context/<scope>.json` + `atomicWriteText context/<scope>.md` (`renderContextMd`) → return packet.

### `cli/register.ts` — new top-level command

`cadence context <scope>` — `<scope>` is a Commander positional validated **manually** via `ContextScopeZ.safeParse(scope)` (this codebase deliberately does not use Commander `.choices()`; manual validation gives the exit-2 + clean single-line stderr contract). Invalid scope → one stderr line + `process.exitCode = 2`, no writes. Default: print `renderContextMd(packet)` to stdout. `--json`: print `JSON.stringify(packet)` to stdout instead. `failed:` idiom on throw (exit 1). The packet files are always written regardless of `--json`.

## Data Model (`@cadence/types`, additive)

```ts
export const ContextScopeZ = z.enum(['phase', 'handoff']);
export type ContextScope = z.infer<typeof ContextScopeZ>;

export const ContextRecZ = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  score: z.number().int(),                       // Slice-3 scoreRecommendation().score (0–100)
  status: RecommendationStatusZ,
  readiness: RecommendationReadinessZ,
  priority: RecommendationPriorityZ,
  suggestedBackendAction: z.string().optional(),
});

export const ContextPacketZ = z.object({
  schemaVersion: z.literal(1),
  scope: ContextScopeZ,
  generatedAt: z.string().datetime({ offset: true }),
  loop: z.object({
    present: z.boolean(),
    loopPosition: z.string().optional(),
    activePhase: z.string().nullable().optional(),
    activeDraft: z.string().nullable().optional(),
    activeSpec: z.string().nullable().optional(),
    tier: z.string().nullable().optional(),
    nextAction: z.string().optional(),           // backend.legalActions[0]
    stateError: z.string().optional(),
  }),
  recommendations: z.array(ContextRecZ),
  assumptions: z.array(z.object({
    id: z.string().min(1),
    recommendationId: z.string().min(1),
    text: z.string().min(1),
    status: z.literal('open'),                    // only open assumptions are carried
  })),
  decisions: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    rationale: z.string().min(1),
    recommendationId: z.string().optional(),
  })),
  files: z.array(z.object({
    path: z.string().min(1),
    why: z.string().min(1),                       // one-line provenance, oneLine()'d
  })),
  totals: z.object({
    recommendations: z.number().int(),
    assumptions: z.number().int(),
    decisions: z.number().int(),
    files: z.number().int(),
    recommendationsOmitted: z.number().int(),     // ranked.length − N (≥ 0)
  }),
});
export type ContextPacket = z.infer<typeof ContextPacketZ>;
export type ContextRec = z.infer<typeof ContextRecZ>;
```

`ContextPacketZ` is the synth's parse contract (mirrors `RecommendationReportZ`). The types index re-exports every new symbol.

## Scope Selection Policy (compactness = bounded-by-construction)

Module constants (documented): `TOP_N_PHASE = 7`, `TOP_N_HANDOFF = 5`.

Shared pipeline: `partitionLedger(recommendations)` → take **`ranked` only** (parked / excluded / needs-attention never leak into a packet) → `scoreRecommendation` each → sort by `raw` desc, tie-break `createdAt` asc then `id` asc (identical ordering to Slice 3) → take top `N` (`N` = `TOP_N_PHASE` for `phase`, `TOP_N_HANDOFF` for `handoff`) → map to `ContextRec`. `totals.recommendationsOmitted = max(0, ranked.length − N)`.

| Aspect | `phase` | `handoff` |
|---|---|---|
| Intent | Context a downstream CADENCE phase carries | State to resume across a session / agent handoff |
| `recommendations` | top `TOP_N_PHASE` ranked | top `TOP_N_HANDOFF` ranked |
| `loop` block | full active phase/draft/spec/tier + `nextAction` | identical (handoff relies on it for "where we are") |
| `assumptions` | `status:'open'` whose `recommendationId` ∈ selected rec ids | **all** `status:'open'` assumptions (broader resume picture) |
| `decisions` | decisions whose `recommendationId` ∈ selected rec ids (or untied decisions excluded) | **all** recorded decisions (full decision trail) |
| `files` | dedup union of selected recs' `affectedFiles` + their evidence `path` | dedup union over **all** ranked recs' `affectedFiles` + evidence `path` |

`Evidence.path` is `z.string().optional()` — evidence entries with no `path` contribute nothing to the files union (skipped, not an empty-string entry). `files[].why` is a one-line provenance string (e.g. `` `affected by rec-… <title>` `` or `` `evidence ev-…` ``), newline-collapsed (see §Error Handling on `oneLine`). Dedup by `path`, first provenance wins, stable order (first appearance).

Compactness is **structural**, not a budget: ranked-only, `open`-only assumptions, capped `N`, file *references* not contents. No char/token cap, no truncation algorithm. Empty sources → empty arrays; the renderer prints `_(none)_`, never fabricated content.

## Flow

```
cadence context <scope> [--json]
→ ContextScopeZ.safeParse(scope) fails → one stderr line + exit 2, no writes
→ runContext(cwd, scope):
  → readRecommendationLedger / readEvidenceLedger /
    readAssumptionLedger / readIntelligenceDecisionLedger   [IO read, empty-if-absent]
  → cadenceBackend.readStatus(cwd)                           [IO read, never throws]
  → synthesizeContextPacket(scope, sources, now)             [pure] → ContextPacketZ.parse
  → mkdir .cadence/intelligence/context/
  → atomicWriteJSON context/<scope>.json
  → atomicWriteText context/<scope>.md  (renderContextMd)
→ default → stdout: renderContextMd(packet)
→ --json  → stdout: JSON.stringify(packet)
→ throw   → stderr "context failed: <msg>" + exit 1
```

## Error Handling

- **Read-only:** never writes `state.json`/`STATE.md`, never transitions the loop, never `spec new`. Writes confined to `.cadence/intelligence/context/`.
- **Graceful degrade:** no backend (`.cadence/state.json` absent) → `cadenceBackend.readStatus` returns `{present:false}`; packet still emits from ledgers with `loop.present=false`. A `stateError` (corrupt state) is surfaced into `loop.stateError`, never thrown (mirrors `cadenceBackend.readStatus`'s catch).
- **Absent ledgers** → empty arrays via the `existsSync→empty*Ledger()` idiom (existing two readers + the two new ones).
- **Free-text safety:** every ledger-derived string interpolated into the Markdown packet (rec titles, assumption text, decision title/rationale, `files[].why`) is newline-collapsed via a `oneLine(s) = s.replace(/\s*[\r\n]+\s*/g,' ').trim()` so a newline cannot break packet structure. **Note: the Slice-4b `oneLine` is module-private to `backend/cadence.ts` (not exported, not reused).** The plan must consciously pick one: (a) a small private `oneLine` local to `render-context.ts` (matches the current per-module convention; cheapest), or (b) extract `oneLine` to a shared module and have both `backend/cadence.ts` and `render-context.ts` import it (DRY but touches a shipped file). Recommendation: (a) — keep the slice's blast radius minimal, mirror the existing per-module-private pattern.
- **Strict TS:** `noUncheckedIndexedAccess` → any `arr[0]` access guarded `const head = arr[0]!` (carried gotcha).
- **Honest-empty (residual, by design, not a gap):** the standalone `assumptions.json` / `decisions.json` ledgers have **no intake command yet** (no producer on this branch). The two new readers + the policy are wired correctly and future-proof; until an intake slice lands, those packet sections render `_(none)_`. This is faithful (no fabrication), documented here so spec review does not flag it as missing functionality. Assumptions/decisions are also reachable today only as `assumptionIds`/`decisionIds` on recommendations — the MVP does not resolve those into the packet (kept simple; revisit when intake exists).

## Testing (per CADENCE test idioms)

- **`context.test.ts`** — pure `synthesizeContextPacket` per scope: top-`N` cap + `recommendationsOmitted`; ranked-only (parked/excluded/needs-attention never leak); Slice-3 ordering reproduced; `phase` ties assumptions/decisions/files to selected recs while `handoff` carries all; `open`-only assumptions; `loop` block populated from `BackendStatus` and degrades when `present:false`/`stateError`; empty sources → empty arrays; `oneLine` collapses embedded newlines; deterministic with injected `now`.
- **`render-context.test.ts`** — pure `renderContextMd`: every section present, `_(none)_` placeholders when empty, scope label correct, no raw ledger newline breaks Markdown structure.
- **`context-cli.test.ts`** — spawned-CLI idiom: `context phase` / `context handoff` write `context/<scope>.{json,md}` **and** print Markdown to stdout; `--json` prints JSON that re-parses through `ContextPacketZ`; invalid scope → exit 2, stderr-clean; no-backend repo → graceful packet (exit 0, `loop.present=false`).
- **Drift guard:** Phase-31 `cli-reference.test.ts` stays green — `docs/reference/commands.md` marker block + `### context` section updated in the same slice (carried 36.1 deviation lesson: a new top-level command fails the drift guard otherwise).
- **Done-bar:** full `pnpm turbo run lint typecheck test build` 16/16 — not a subset; `lint` included per task (carried 4a pipeline lesson).

## Commit Convention

Plan-doc-first (design + plan committed before feat commits), then per-task `feat`/`test`/`docs` commits on `praxis-intelligence-ledger`. Push user-authorised for this branch after the full gate is green; PR #9 stays DRAFT, not merged to `main`.

## Success Criteria

- `cadence context phase` and `cadence context handoff` each write `.cadence/intelligence/context/<scope>.{json,md}` and print the rendered Markdown packet to stdout; `--json` prints `ContextPacketZ`-valid JSON.
- The packet is bounded by construction (ranked-only, top-`N`, `open`-only assumptions, file refs not contents) with an accurate `recommendationsOmitted`.
- `phase` scopes assumptions/decisions/files to the selected recommendations; `handoff` carries the broader trail; both share the read-only `loop` block.
- No `state.json` / loop interaction anywhere; writes confined to `.cadence/intelligence/context/`; graceful when no backend or corrupt state.
- Deterministic packet (clock only in `generatedAt` via injected `now`); free text newline-safe.
- Full repo gate green; `cli-reference` drift guard green.

## Decision Log

| # | Decision | Alternatives rejected | Why |
|---|----------|----------------------|-----|
| 1 | `<scope>` = fixed enum `phase` + `handoff` only | all 4 kinds; single generic packet; freeform string | two highest-leverage kinds; bounded testable contract; review/agent are a cheap later policy branch |
| 2 | Compactness bounded-by-construction | hard size budget + truncation; configurable budget | deterministic, no truncation algo, mirrors prior slices' conservative fact-only posture |
| 3 | Files = references from ledger fields only | fresh-scan refs; embed snippets; omit files | bounded, read-only-pure, no Slice-2 scanner coupling, no read-narrow breach |
| 4 | `phase` = active phase, zero-arg; `handoff` = current loop state | optional/required explicit `<phase-id>` target | symmetric simplest contract; common case is "current"; backend-aware read-only |
| 5 | Persist `context/<scope>.{json,md}` **and** print Markdown to stdout | summary-line only; stdout-only no file | serves handoff/agent paste-or-pipe without a new idiom; keeps the inspectable artifact |
| 6 | One parameterised synth + one render | per-scope synth/render pair; render-time-only view | smallest, one-synth-per-slice precedent, cheapest to extend to review/agent |
| 7 | Add two thin ledger readers to `store.ts` | resolve assumption/decision ids off recommendations | mirrors existing readers; future-proof for an intake slice; MVP stays simple |
| 8 | Reuse `partitionLedger`/`scoreRecommendation` from `recommend.ts` | re-derive ranking locally | single source of truth for ranking; no drift between `recommend` and `context` |
| 9 | Private `oneLine` local to `render-context.ts` | extract a shared `oneLine` module; import the existing one (not exported) | Slice-4b `oneLine` is module-private; matching the per-module convention keeps blast radius minimal (no shipped-file edit) |

## Follow-On (not in this slice)

- `review` and `agent` scopes (new policy branches on the existing enum/switch).
- Milestone pre-mortems as a first-class command.
- Resolving `assumptionIds`/`decisionIds` off recommendations once an assumption/decision intake command exists.
- A size-budget / truncation mode if real packets ever overflow practical limits.
