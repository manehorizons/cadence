# CADENCE Intelligence Inspection & Status Synthesis — Design

**Date:** 2026-05-17
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Branch:** `praxis-intelligence-ledger`
**Parent design:** `synth/docs/superpowers/specs/2026-05-17-cadence-praxis-strategic-intelligence-design.md` (authoritative architecture)
**Prior slice:** CADENCE Intelligence Ledger (shipped on this branch — `@cadence/types` recommendation/evidence schemas, `packages/core/src/intelligence/{store,render}.ts`, `cadence recommendation add/list`).

## Summary

This is the second Praxis slice. It adds project inspection and strategic-status synthesis: a Project Scanner, a thin read-only CADENCE backend adapter, an inspection synthesizer that emits a small bounded set of staleness/contradiction flags, and a `cadence inspect` command that persists `inspection.json` + a rendered `STRATEGY.md`.

It does **not** add ranked next-move recommendations (`cadence recommend`), milestone proposal, SPEC export, context packets, or any backend write methods. Those are later slices.

## Product Boundary (design's #1 risk: do not rebuild the loop)

CADENCE already owns the execution loop and its status surface:

- `cadence status` → `loadStatus`/`renderStatus` — full loop context (phase, draft, tasks, ACs, next) + `status anomalies`.
- `cadence progress` → `nextAction(state)` — single recommended next loop command.

Both read `state.json` via `SimpleStateBackend.readState()`.

`cadence inspect` is the **strategic layer**, a different question: project-wide shape (git, package metadata, doc presence, build surfaces, phase artifacts, ledger contents) synthesized into a strategic status with conservative flags. It **reads** execution state via the existing `SimpleStateBackend` + `nextAction` and **never**: writes `state.json`, transitions the loop, or invokes draft/build/settle. Strategic output is `.cadence/intelligence/STRATEGY.md`, deliberately distinct from execution-layer `.cadence/STATE.md`.

## Scope

### In scope

- Project Scanner (`scan.ts`).
- Thin read-only `PraxisBackend` interface + CADENCE implementation (`backend/cadence.ts`) — `detect`, `readStatus`, `readArtifacts`, `listLegalActions` only.
- Pure inspection synthesizer (`inspect.ts`) computing exactly four conservative flags.
- Pure strategic-status Markdown renderer (`render-inspection.ts`).
- New `@cadence/types` schemas: `RepoScanZ`, `BackendStatusZ`, `InspectionFlagZ`, `InspectionZ`.
- `cadence inspect` CLI (default rendered output; `--json` machine-readable, mirroring `cadence status --json`).
- Persisted `.cadence/intelligence/inspection.json` + rendered `.cadence/intelligence/STRATEGY.md`.
- Docs: `docs/reference/commands.md` drift-marker block + `### cadence inspect`; `CHANGELOG.md` Unreleased.

### Out of scope (later slices)

- `cadence recommend` ranked next-moves / Intelligence Engine ranking.
- `PraxisBackend.renderSpecDraft` / `exportMilestone` (SPEC-export slice).
- Milestone proposal, pre-mortems, context packets.
- Doc-staleness-by-mtime / ROADMAP-references-unknown-phase flags (explicitly deferred — false-positive risk).
- Any second backend.
- Any write/mutation of CADENCE loop state.

## Architecture

Approach: mirror the shipped ledger layout. All new core modules live under `packages/core/src/intelligence/`.

### `scan.ts` — Project Scanner

Produces `RepoScan`. Pure-ish (IO in, plain data out):

- **git** (via `spawn`, never a shell string): current branch; dirty via `git status --porcelain`; ahead/behind via `git rev-list --left-right --count origin/main...HEAD`; recent commits via `git log --oneline -n <k>`. Not a git repo or no `origin/main` → `git.available=false`, dependent fields omitted, no throw.
- **package metadata**: root `package.json` → name, version, `workspaces` presence, scripts (test/build/lint/typecheck).
- **doc presence**: README.md, DESIGN.md, `.cadence/ROADMAP.md`, CHANGELOG.md, `docs/` dir (booleans).
- **build surfaces**: `turbo.json` presence.
- **phase artifacts**: tally of `.cadence/phases/**` (count + latest phase/draft id if derivable).

### `backend/cadence.ts` — thin read-only `PraxisBackend`

Interface declares **only** the members this slice uses:

```ts
type BackendDetection = { present: boolean; kind: 'cadence' | null };
interface PraxisBackend {
  id: string;
  detect(root: string): Promise<BackendDetection>;
  readStatus(root: string): Promise<BackendStatus>;
  readArtifacts(root: string): Promise<BackendArtifacts>;
  listLegalActions(root: string): Promise<string[]>;
}
```

CADENCE impl:

- `detect`: `.cadence/` exists and `state.json` is parseable.
- `readStatus`: wrap `SimpleStateBackend.readState()` → `loopPosition`, `activePhase`, `activeDraft`, `tier`. **Sourcing note:** `tier` is on `CadenceState` (nullable); `profile` is **not** on state (it lives in `ConfigZ.profile` / optional per-phase plan override) — read it from config when cheap, else leave `profile` undefined (schema-optional). Do not look for `state.profile`. `StateCorruptError` is caught and surfaced as `stateError` (no throw).
- `readArtifacts`: enumerate `.cadence/phases/**`; presence of ROADMAP/STATE/MILESTONES.
- `listLegalActions`: reuse `nextAction(state)` from `progress.js` as the single source of loop-legal commands — does **not** re-implement loop rules. **Adaptation note:** `nextAction` returns a single `{command, reason}` object, not a list; `listLegalActions` wraps it into a one-element array (`[action.command]`). The `string[]` shape is forward-compatible if the loop later exposes multiple legal commands.

`renderSpecDraft`/`exportMilestone` are intentionally absent; added when the SPEC-export slice defines their real shape.

### `inspect.ts` — synthesizer + store glue

- Pure: `synthesizeInspection(scan, backendStatus, ledgerSummary) → Inspection` — assembles facts, computes the four flags. No IO inside.
- Glue: reads ledgers read-only via existing `readRecommendationLedger`/`readEvidenceLedger`; `InspectionZ.parse`; `mkdir intelligenceDir`; `atomicWriteJSON('inspection.json')` + `atomicWriteText('STRATEGY.md')`.

### `render-inspection.ts`

Pure `renderStrategyMd(inspection) → string`, mirroring `renderRecommendationsMd` conventions (heading, generated-from note, sectioned facts + flags).

### `@cadence/types/src/intelligence.ts` (extended) + index export

### `cli/commands/inspect.ts` + `register.ts`

`cadence inspect`: scan → backend reads → ledger reads → synthesize → write artifacts → print `renderStrategyMd`. `--json` writes the `inspection.json` content to stdout instead (mirrors `cadence status --json`). Registered in `register.ts`. `docs/reference/commands.md` drift-marker block updated + `### cadence inspect` section (mandatory — the Phase 31.1 `cli-reference.test.ts` drift guard fails otherwise). `CHANGELOG.md` Unreleased entry.

## Data Model (Zod)

```ts
RepoScanZ = {
  git: { available: boolean; branch?: string; dirty?: boolean;
         ahead?: number; behind?: number; recentCommits?: string[] };
  pkg: { name?: string; version?: string; workspaces?: boolean;
         scripts: { test?: boolean; build?: boolean; lint?: boolean; typecheck?: boolean } };
  docs: { readme: boolean; design: boolean; roadmap: boolean; changelog: boolean; docsDir: boolean };
  surfaces: { turbo: boolean };
  phases: { count: number; latestId?: string };
}

BackendStatusZ = {
  present: boolean; kind: 'cadence' | null;
  loopPosition?: string; activePhase?: string | null; activeDraft?: string | null;
  profile?: string; tier?: string; legalActions: string[]; stateError?: string;
}

InspectionFlagZ = {
  code: 'git-dirty-or-diverged' | 'loop-state-inconsistent' | 'ledger-decay' | 'docs-missing';
  severity: 'info' | 'warn';
  message: string;
  evidence?: string;
}

InspectionZ = {
  schemaVersion: 1;             // literal, like the ledgers
  generatedAt: string;          // ISO8601 offset
  repo: RepoScan;
  backend: BackendStatus;
  ledger: { recommendations: number; byDecay: Record<string, number>; evidence: number };
  flags: InspectionFlag[];
}
```

## Flag Specification (the conservative four)

1. **`git-dirty-or-diverged`** (warn): `repo.git.available && (dirty || (ahead ?? 0) > 0 || (behind ?? 0) > 0)`. Evidence = porcelain summary / ahead-behind counts. Suppressed entirely when git unavailable.
2. **`loop-state-inconsistent`** (warn): `backend.stateError` is set, OR `loopPosition` not `IDLE` while `activeDraft` is absent (and the symmetric obvious mismatches). Evidence = the stateError or the inconsistent pair.
3. **`ledger-decay`** (warn): any recommendation `decayState ∈ {stale, needs-revalidation, contradicted}`. Evidence = count by decay bucket.
4. **`docs-missing`** (info): any of README.md / DESIGN.md / `.cadence/ROADMAP.md` / CHANGELOG.md absent. Evidence = the missing names.

No other flags this slice. Conservative by design — "noisy analysis is worse than missing low-value findings" (parent design, Risks).

## Flow

`cadence inspect`
→ `scan(root)` [IO]
→ `cadenceBackend.detect/readStatus/readArtifacts/listLegalActions` [IO; may set `stateError`]
→ `readRecommendationLedger` + `readEvidenceLedger` [IO, read-only]
→ `synthesizeInspection(scan, backendStatus, ledgerSummary)` [pure: facts + 4 flags]
→ `InspectionZ.parse`
→ `mkdir intelligenceDir`; `atomicWriteJSON inspection.json`; `atomicWriteText STRATEGY.md`
→ print `renderStrategyMd(inspection)` (or, with `--json`, write inspection JSON to stdout)
→ exit 0.

## Error Handling

Follows the existing CLI idiom (degrade gracefully; `stderr` + `process.exitCode = 1` only on genuine failure):

- Not a git repo / no `origin/main` → `git.available = false`; git flag suppressed; no throw.
- No `.cadence/` → `backend.present = false`; degraded `STRATEGY.md` ("no CADENCE backend detected"); exit 0.
- Corrupt `state.json` → catch `StateCorruptError` → `backend.stateError` set → drives `loop-state-inconsistent`; no crash.
- Artifact write failure → `stderr` + exit 1.

## Testing (per CADENCE test idioms)

- `packages/types/tests/intelligence.test.ts` (extend): `InspectionZ` accepts a valid inspection; rejects `schemaVersion ≠ 1` and an unknown flag `code`.
- `packages/core/tests/intelligence/inspect.test.ts`: pure `synthesizeInspection`, table-driven — clean repo → 0 flags; dirty/ahead → flag 1; injected `stateError` → flag 2; a decayed rec → flag 3; missing DESIGN → flag 4. Zero IO.
- `packages/core/tests/intelligence/render-inspection.test.ts`: `renderStrategyMd` structural assertions (heading, facts, flag rendering, empty-flags case).
- `packages/core/tests/cli/inspect.test.ts`: spawned-CLI idiom (`tempRepo({ initialized: true })`, `spawn(process.execPath, [CADENCE_CLI, 'inspect'])`) — exit 0; `inspection.json` + `STRATEGY.md` written; `--json` emits parseable JSON; degraded path (no `.cadence/`) still exits 0. `afterEach` cleanup. Core built before this file runs (rebuild-order idiom).
- `packages/core/tests/docs/cli-reference.test.ts` stays green via the commands.md drift-block update.
- **Done bar:** full `pnpm turbo run lint typecheck test build` (mirrors `.githooks/pre-push`; not a subset — durable lesson).

## Commit Convention

Continues this branch's raw-superpowers per-task commit style (as used for the ledger), plan-doc-first:

1. `docs: design — CADENCE Intelligence Inspection (Praxis)` — this spec.
2. `docs: implementation plan — CADENCE Intelligence Inspection (Praxis)` — the writing-plans output.
3. Per-task `feat`/`test`/`docs` commits.

All commits on `praxis-intelligence-ledger`. Unpushed (user directive: do not push yet; build on the branch).

## Success Criteria

- `cadence inspect` on a CADENCE repo emits an accurate strategic status: git/package/doc/surface facts, backend loop position + legal next actions, ledger counts by decay.
- The four flags fire precisely on their conditions and stay silent otherwise (no noise on a clean repo).
- Degraded gracefully with no git repo and with no `.cadence/` backend.
- Never mutates loop state; `STRATEGY.md` is separate from `STATE.md`.
- Full repo gate green.

## Follow-On (not in this slice)

- `cadence recommend` (ranked next-moves; Intelligence Engine).
- `PraxisBackend.renderSpecDraft` / `exportMilestone` + `cadence milestone propose/export` (SPEC-export slice).
- Context packets; milestone pre-mortems; doc-staleness/ROADMAP-contradiction flags.
