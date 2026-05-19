# CADENCE Milestone Pre-Mortem — First-Class Command — Design

**Date:** 2026-05-18
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Branch:** `praxis-intelligence-ledger`
**Parent design:** `synth/docs/superpowers/specs/2026-05-17-cadence-praxis-strategic-intelligence-design.md` (§"Milestone Model → Milestone Pre-Mortem", §"Command Flow")
**Sibling (must preserve its invariants):** `docs/superpowers/specs/2026-05-17-cadence-milestone-propose-design.md` (Slice 4a — `seedPreMortem` propose-time behavior + Decision-Log item 6 id-collision guard) and `2026-05-17-cadence-milestone-export-design.md` (Slice 4b — 4b reads `milestone.preMortem` to build SPEC Constraints/Open-Questions; `exported` is terminal/no-re-export).
**Prior slices (shipped on this branch):** Slice 1 Ledger · Slice 2 Inspection · Slice 3 Recommend · Slice 4a Milestone Propose · Slice 4b Milestone Export · Slice 5 Context Packets.

## Summary

**Slice 6** promotes the milestone pre-mortem from a propose-time-only seed into a re-runnable first-class command: `cadence milestone premortem <id> [--json]` recomputes a **deepened, deterministic** pre-mortem for one milestone against the **current** recommendation/assumption ledger state and writes it back in-place to `.cadence/intelligence/milestones.json` (which auto-re-renders `MILESTONES.md`).

The parent design (§"Milestone Pre-Mortem") says a pre-mortem should run **"before export"** and should cover five concerns including *"user value that might be overestimated"* and *explicit out-of-scope boundaries*. Slice 4a's `seedPreMortem` only fires at propose-time, never re-runs, is unaware of decay/status drift since propose, never fills the overestimated-value concern, and always leaves `outOfScope` empty. Slice 6 closes that gap **without** an `@cadence/types` schema change and **without** an LLM: it adds four new deterministic signal families folded into the existing 4-field `MilestonePreMortem`, treats `outOfScope` as operator-owned, and is re-runnable on the exact milestone the operator is about to accept/export.

It does **not** add a schema field, a renderer, a top-level command, an LLM/provider, a `state.json`/loop touch, change `seedPreMortem`'s shipped propose-time behavior, auto-write `outOfScope`, or merge to `main`/undraft PR #9.

## Product Boundary (parent design's #1 risk: do not rebuild / drive the loop)

Same strict posture as every shipped slice. Slice 6:

- reads the milestone ledger + recommendation ledger + assumption ledger **read-only**;
- writes **only** under `.cadence/intelligence/` (the milestone ledger + its auto-rendered `MILESTONES.md`);
- **never** calls `cadence spec new`, **never** reads/writes `state.json`/`STATE.md`, **never** transitions `SPEC→DRAFT→BUILD→SETTLE`;
- is **backend-free** — never constructs or calls `PraxisBackend` (unlike Slice 3/5; like Slice 4a — it reads only the intelligence ledgers, not loop state);
- mutates only the intelligence ledger, exactly as 4a (`seedPreMortem` writes `preMortem` at propose) and 4b (flips status, appends `exportTarget`) already do — writing the Praxis-owned ledger is in-boundary; driving the loop is not.

## Scope

### In scope

- New pure `deepenPreMortem(milestone, recs, assumptions, now): MilestonePreMortem` in `intelligence/milestone.ts` — a superset of `seedPreMortem`'s three rules plus four new deterministic signal families (see §Deepening Rules).
- Extract shared sub-helpers (shared-`affectedFiles` map; doc-surface predicate) so `seedPreMortem` (4a, unchanged behavior) and `deepenPreMortem` cannot drift.
- IO glue `runMilestonePreMortem(root, id, now?)` in `intelligence/milestone.ts` (read milestone+rec+assumption ledgers → find id → assert state ∈ {proposed,accepted} → `deepenPreMortem` → write back `preMortem` + bump `updatedAt` → `writeMilestoneLedger`).
- `cadence milestone premortem <id> [--json]` subcommand (extends the existing `registerMilestoneCommand`; no `register.ts` change — not a new top-level command).
- Docs: `docs/reference/commands.md` `### milestone` Subcommands list + behavior sentence; the user-docs CLI page `milestone` section; `CHANGELOG.md` Unreleased. Reconcile the stale forward-refs in `2026-05-17-cadence-milestone-export-design.md` (Follow-On) and the Slice 5 context-packets design that name "milestone pre-mortems as a first-class command" as a *later slice* (durable pipeline gotcha (e): a slice that ships a previously-deferred thing must grep prior docs for stale "later slice" forward-refs).

### Out of scope (later / parked)

- Any `@cadence/types` / `MilestonePreMortemZ` schema change (no 5th dimension — overestimated-value is folded into `likelyFailureModes`).
- LLM / gate-provider augmentation (no `--deep` flag; a later follow-on slice if ever).
- A new renderer (reuse `renderMilestonesMd`; pre-mortem is already rendered per-milestone).
- A new top-level `cadence premortem` command or a top-level alias.
- Running on `exported`/`deferred`/`closed` milestones (refused).
- Auto-writing `outOfScope` (operator-owned; preserved verbatim, never derived).
- Changing `seedPreMortem`'s propose-time output (4a stays byte-stable).
- Any `state.json`/loop/`spec new` interaction; any `PraxisBackend` use.
- Pre-flight `cadence spec check` or export from inside premortem (operator runs `milestone export` separately).

## Architecture

Approach A (chosen, user-approved) — schema-stable, deepener supersedes seed, full mirror of the shipped slices: pure synth → thin IO glue → thin CLI; reuse the existing renderer.

### `intelligence/milestone.ts` — pure `deepenPreMortem`

```ts
export function deepenPreMortem(
  milestone: IntelligenceMilestone,
  recs: ReadonlyArray<Recommendation>,
  assumptions: ReadonlyArray<Assumption>,
  now: Date = new Date(),
): MilestonePreMortem;
```

Pure: same `(milestone, recs, assumptions)` → byte-identical `MilestonePreMortem`. `now` is reserved for symmetry with sibling glue signatures and any future age-based rule; this slice's rules are clock-free (no time-window decay computed here — `decayState` is read off the rec, not recomputed). No IO, no randomness.

Member resolution: `milestone.recommendationIds` → look up each in a `Map<id, Recommendation>` built from `recs`. An id with no current ledger entry is **not** silently dropped — it emits a `likelyFailureModes` line (scope erosion). The three derived dimensions are computed fresh from the resolved members and **replace** the prior values; `milestone.preMortem.outOfScope` is copied through untouched.

Shared sub-helpers extracted and consumed by both `seedPreMortem` (4a) and `deepenPreMortem`:
- `sharedFileDeps(recs): string[]` — the 4a shared-`affectedFiles` (≥2 recs) coordination lines.
- `docDriftRisk(recs): string[]` — the 4a doc-surface single drift line (`affectedAreas` has `docs` OR a file matches the existing `DOC_PATH_RE`/`DOC_NAME_RE`).

`seedPreMortem` is refactored to call these helpers; its **observable output is unchanged** (asserted by the existing unchanged 4a tests + a byte-stability assertion).

### `intelligence/milestone.ts` — `runMilestonePreMortem` glue

Mirrors `runMilestoneExport`/`runMilestoneTransition`. Read milestone ledger → find `id` (not found → `{ok:false}`) → assert `status ∈ {'proposed','accepted'}` (else `{ok:false}`) → read recommendation ledger + assumption ledger (both empty-if-absent — `readAssumptionLedger` is the Slice-5 reader) → `deepenPreMortem` → replace that milestone's `preMortem`, bump its `updatedAt` to `now.toISOString()`, leave all other fields and other milestones untouched → `writeMilestoneLedger(root, next)` (Zod-validates, atomic write, **auto re-renders `MILESTONES.md`** — store.ts already does this). Returns `{ok:true; ledger}` | `{ok:false; error}`.

### `cli/commands/milestone.ts` — `premortem` subcommand

Added to the existing `registerMilestoneCommand` parent (sixth subcommand). Copies the propose/export idiom verbatim: `--json` `option`; on `res.ok===false` → stderr `milestone premortem refused: <error>` + `process.exitCode = 1`; on thrown → stderr `milestone premortem failed: <msg>` + `process.exitCode = 1`; on success with `--json` → `process.stdout.write(JSON.stringify(res.ledger) + '\n')`, else a one-line confirmation `milestone <id> → pre-mortem refreshed\n` (the full pre-mortem is visible in the re-rendered `MILESTONES.md`). Exit code is `1` on refuse/fail — milestone subcommands use `process.exitCode = 1` (Slice 5's exit-2 was the *top-level* `context` scope `safeParse`, a different surface; this is a `milestone` subcommand and mirrors export/accept/defer).

## Data Model

No `@cadence/types` schema change. `MilestonePreMortemZ` stays the fixed four-field shape the parent design pins:

```ts
{ likelyFailureModes: string[]; hiddenDependencies: string[]; driftRisks: string[]; outOfScope: string[] }
```

`IntelligenceMilestoneZ` already carries `preMortem` + `updatedAt`. `deepenPreMortem` returns the same `MilestonePreMortem` type 4a returns.

```ts
export type PreMortemResult =
  | { ok: true; ledger: MilestoneLedger }
  | { ok: false; error: string };
```

## Deepening Rules (exact deterministic signal spec)

Member set `M` = milestone's `recommendationIds` resolved against the current `RecommendationLedger`. Free-text rec fields (`id`, `title`) interpolated into any output line pass through a module-private `oneLine(s) = s.replace(/\s*[\r\n]+\s*/g,' ').trim()` (durable 4b gotcha: a newline in an interpolated ledger field corrupts the structured artifact / round-trip). Array indexing under `noUncheckedIndexedAccess` uses `const x = arr[i]!` guards (durable gotcha (b)). All list outputs are sorted by rec `id` ascending for determinism; each family contributes a distinctly-prefixed line so families never collide (F-new-2 is the one family that contributes **two** prefixes — `Eroded input:` for status/readiness erosion and `Missing input:` for an unresolved member — they are distinct, independently-assertable lines). Numeric rec fields are rendered deterministically: `confidence` via the 4a-verbatim `.toFixed(2)`; `leverageScore`/`riskScore`/evidence-count via `String(n)` — exact value, no rounding (scores are conventionally integers on the 0–10 scale, but a fractional score renders exactly, e.g. `2.5`, so goldens stay stable).

**`hiddenDependencies`** (recompute + replace):
- *4a rule retained* — `sharedFileDeps`: a file in `affectedFiles` of ≥2 members → `Shared file <f> edited by <ids…> — ordering/coordination dependency.` (verbatim 4a wording, via the shared helper).

**`driftRisks`** (recompute + replace):
- *4a rule retained* — `docDriftRisk`: any member touches a doc surface → the single 4a line `Milestone touches documentation surfaces — spec/doc drift risk.` (verbatim, via the shared helper).

**`likelyFailureModes`** (recompute + replace, sorted by rec id; one prefix per family):
- *4a rule retained* — member `confidence < 0.5` → `Low-confidence input: <id> (confidence <c.toFixed(2)>) — assumption may be wrong.` (verbatim 4a wording).
- **F-new-1 Decay/staleness** — member `decayState ∈ {superseded, contradicted, stale, needs-revalidation}` → `Decayed input: <id> (<decayState>) — milestone rests on a recommendation that has drifted since propose.`
- **F-new-2 Status/readiness erosion** — member `status ∈ {rejected, deferred}` OR `readiness ∈ {blocked, needs-evidence, needs-decision}` → `Eroded input: <id> (status <status>, readiness <readiness>) — no longer cleanly milestone-ready.` AND a member id in `recommendationIds` with **no** entry in the current ledger → `Missing input: <id> — member recommendation no longer in ledger (scope erosion).`
- **F-new-3 Open assumptions** — a member with ≥1 `Assumption` whose `recommendationId === <id>` and `status === 'open'` → `Unvalidated assumptions: <id> rests on <n> open assumption(s).` (`<n>` = exact open count for that member).
- **F-new-4 Overestimated value** — a member with `leverageScore <= LEV_LOW` AND `riskScore >= RISK_HIGH`, OR `evidenceIds.length === 0` → `Overestimated value: <id> (leverage <leverageScore>, risk <riskScore>, evidence <evidenceIds.length>) — claimed value may be overstated.` (thresholds `LEV_LOW`/`RISK_HIGH` are named module constants pinned in the plan, conservative defaults `LEV_LOW = 3`, `RISK_HIGH = 7`; both bounds are on the 0–10 rec scales.)

**`outOfScope`** — **operator-owned. Never written by this command.** `deepenPreMortem` copies `milestone.preMortem.outOfScope` through verbatim (whether empty or operator-curated). The parent design's "explicit out-of-scope boundaries" is operator intent, not data-derivable; deriving it would be speculative/noisy (Slice 5 "honest-empty by design" precedent). Scope-erosion facts surface under F-new-2, not here.

### Refresh / clobber invariant

> The three derived dimensions (`likelyFailureModes`, `hiddenDependencies`, `driftRisks`) are **drop-and-rebuilt** from current ledger state every run — a risk that is no longer true (e.g. a member's `decayState` returned to `fresh`, or `confidence` rose ≥ 0.5) **disappears** on the next run (genuinely "fresher", not monotonically accreting). `outOfScope` is the only operator-owned field and is **preserved verbatim**. Crisp invariant: *derived fields refresh, operator field persists.* Operator-authored edits to the three derived dimensions are intentionally **not** preserved — they are declared derived; operators curate `outOfScope`.

## Flow

```
cadence milestone premortem <id> [--json]
→ runMilestonePreMortem(cwd, id):
  → readMilestoneLedger                       [IO read]
  → milestone not found → {ok:false, error:"milestone <id> not found"}
  → status ∉ {proposed,accepted} → {ok:false, error:"cannot pre-mortem milestone in status <s>"}
  → readRecommendationLedger ; readAssumptionLedger   [IO read, empty-if-absent]
  → deepenPreMortem(milestone, recs, assumptions, now)            [pure]
  → next = ledger with milestone.preMortem replaced (outOfScope preserved) + updatedAt bumped
  → writeMilestoneLedger(cwd, next)           [Zod + atomic + MILESTONES.md re-render]
  → {ok:true, ledger:next}
→ ok + --json   → stdout JSON.stringify(ledger) + "\n"
→ ok (default)  → stdout "milestone <id> → pre-mortem refreshed\n"
→ {ok:false}    → stderr "milestone premortem refused: <error>\n" + exitCode 1
→ throw         → stderr "milestone premortem failed: <msg>\n" + exitCode 1
```

## Error Handling

- Milestone id not found → `refused: milestone <id> not found`, exitCode 1, **no write**.
- Status `exported` / `deferred` / `closed` → `refused: cannot pre-mortem milestone in status <s>`, exitCode 1, **no write** (a refreshed pre-mortem on an `exported` milestone would desync from the already-staged SPEC because 4b refuses re-export — so refreshing it is dead work and is refused).
- Recommendation/assumption ledger absent → treated as empty (`readAssumptionLedger` is empty-if-absent; same for the rec reader). A milestone whose members all resolve to nothing yields an all-erosion `likelyFailureModes` (every `recommendationId` → `Missing input:` line) — correct and honest, no throw.
- `writeMilestoneLedger` throws → `preMortem` not persisted, propagate `failed:` exitCode 1, **no partial state** (the ledger is written atomically by store; a throw leaves the prior `milestones.json` intact). No residual-window issue: there is exactly one write and it is atomic — unlike 4b there is no SPEC-then-ledger ordering.
- Pure `deepenPreMortem` never throws on well-typed Zod-parsed inputs (the ledgers are already Zod-validated by their readers).

## Testing (per CADENCE test idioms)

- `milestone.test.ts` (extend) — pure `deepenPreMortem`:
  - one golden per family (4a-retained ×3, F-new-1..4), each asserting the exact prefixed line + sort-by-id order.
  - `outOfScope` preserved verbatim (empty → empty; operator-set → identical).
  - **drop-stale**: a fixture whose member is `superseded` yields the `Decayed input:` line; the same fixture with that member `fresh` and `confidence ≥ 0.5` yields **no** failure line for it (proves rebuild-not-accrete).
  - missing-member line (id in `recommendationIds`, absent from recs).
  - `oneLine` collapse: a rec `title`/`id` containing `\n` does not break the line.
  - determinism: same inputs → deepEqual output across two calls; member order in `recs` does not change output (sorted).
  - **4a byte-stability**: `seedPreMortem` over a shared fixture returns exactly its pre-refactor value (helpers extracted, behavior unchanged).
- `milestone.test.ts` (extend) — `runMilestonePreMortem` via `tempRepo`:
  - `proposed` and `accepted` happy paths → `preMortem` replaced, `updatedAt` bumped (injected `now`), other milestones/fields untouched, `MILESTONES.md` re-rendered, `outOfScope` preserved.
  - idempotent: two runs with the same ledger + same `now` → identical `milestones.json`.
  - refuse on not-found / `exported` / `deferred` / `closed` → `{ok:false}`, disk byte-unchanged.
  - rec/assumption ledger absent → tolerated (erosion lines, no throw).
- `cli/milestone.test.ts` (extend):
  - `premortem <accepted-id> --json` → exit 0, stdout parses as `MilestoneLedger`, target milestone's `preMortem` refreshed.
  - `premortem <proposed-id>` (no `--json`) → exit 0, stdout `→ pre-mortem refreshed`.
  - `premortem <exported-id>` → exitCode 1, stderr `cannot pre-mortem milestone in status exported`.
  - `premortem <unknown-id>` → exitCode 1, stderr `not found`.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (full, not a subset — `lint` included; durable gotcha (c): per-task subset misses lint regressions).

## Commit Convention

Plan-doc-first (this design + the implementation plan committed before any feat commit), then per-task `feat`/`refactor`/`test`/`docs` commits on `praxis-intelligence-ledger`. The shared-helper extraction is a `refactor(core): extract shared pre-mortem helpers (Slice 6)` commit asserting 4a byte-stability before the `feat` that adds `deepenPreMortem`. Push is user-authorised for this branch after the full gate is green; PR #9 stays DRAFT, **not** merged to `main`, not undrafted. Pipeline: brainstorm → spec → spec-review → plan → plan-review → subagent-driven (per-task spec + code-quality reviews + holistic whole-slice review).

## Success Criteria

- `cadence milestone premortem <proposed|accepted-id>` recomputes the three derived pre-mortem dimensions from current ledger state, preserves `outOfScope`, bumps `updatedAt`, re-renders `MILESTONES.md`, and (with `--json`) emits the refreshed `MilestoneLedger`.
- The four new deterministic families fire exactly per §Deepening Rules; a no-longer-true derived risk disappears on re-run; `seedPreMortem` (4a) output is byte-identical to its pre-slice behavior.
- Refused (exitCode 1, zero writes) for unknown id or status ∈ {exported, deferred, closed}.
- No `@cadence/types` schema change, no new renderer, no new top-level command, no LLM, no `state.json`/loop/`spec new`/`PraxisBackend` interaction; writes confined to `.cadence/intelligence/`.
- Deterministic `deepenPreMortem` (clock only ever in glue-side `updatedAt`, never in pre-mortem content).
- Stale "later slice" forward-refs in the 4b and Slice-5 design docs reconciled.
- Full repo gate green (`pnpm turbo run lint typecheck test build` 16/16).

## Decision Log

| # | Decision | Alternatives rejected | Why |
|---|----------|----------------------|-----|
| 1 | `cadence milestone premortem <id>` (6th subcommand) | top-level `cadence premortem`; both/alias | pre-mortem is intrinsically milestone-id-scoped; matches the `milestone` subcommand family; top-level commands so far are not single-id-scoped; one registration site |
| 2 | Deterministic, broader + fresher (no LLM) | LLM-backed; hybrid `--deep` | parent design says "lightweight"; every shipped slice is pure-deterministic; the real gap is freshness + missing dimensions, not generative depth; preserves pure-synth+thin-IO architecture and golden-testability |
| 3 | In-place refresh of `milestones.json` | separate `premortems/<id>` artifact; both | 4b export reads `milestone.preMortem` to build the SPEC; a separate artifact never reaches the SPEC, defeating "strengthens SPEC inputs"; one source of truth; mirrors 4a/4b ledger writes |
| 4 | Legal states `proposed` + `accepted` | `accepted` only; any non-terminal | `accepted` = the design's explicit pre-export checkpoint; `proposed` lets the operator deepen before deciding to accept; `exported` refused (would desync vs staged SPEC since 4b is no-re-export); deferred/closed moot |
| 5 | All four new families (decay, erosion, open-assumptions, overestimated-value) | subset | user-selected all; decay+erosion are the "fresher" core, open-assumptions maps the design's unknowns, overestimated-value is the explicitly-missing design dimension |
| 6 | Overestimated-value folded into `likelyFailureModes`; no schema change | new 5th `overestimatedValue` field; deepener replaces seed everywhere | parent design pins the 4-field type; an additive `MilestonePreMortemZ` field ripples into 4a/4b/render/all tests + the Zod additive-default compile gotcha; 4a already folds low-confidence into `likelyFailureModes` (same pattern); propose-time deep pass is meaningless (fresh recs) and would change shipped 4a behavior |
| 7 | Derived dimensions drop-and-rebuilt; `outOfScope` preserved verbatim, never auto-written | full replace `outOfScope=[]`; additive merge all dims | crisp invariant; protects the one operator-owned field; rebuild makes a no-longer-true risk vanish (genuine freshness); merge accretes stale entries forever |
| 8 | New `runMilestonePreMortem` glue; `seedPreMortem` refactored to shared helpers but behavior-frozen | reuse `applyTransition`; rewrite `seedPreMortem` to delegate to `deepenPreMortem` | pre-mortem refresh has a ledger write but is not a status flip (≠ `applyTransition`); shared helpers prevent 4a/Slice-6 drift while keeping 4a's cheap propose-time output byte-stable (4a tests + a byte-stability assertion guard it) |

## Follow-On (not in this slice)

- Context-packet `review`/`agent` scopes (cheap follow-on on the existing `ContextScopeZ` enum/switch).
- Resolve `assumptionIds`/`decisionIds` off recs once an assumption/decision intake command exists (would also let an intake-fed pre-mortem deepen further).
- Optional later `--deep` LLM augmentation of the pre-mortem (explicitly parked; only if a generative pre-mortem is ever justified).
- Operator-initiated promotion helper / multi-backend `renderSpecDraft` / context size-budget mode (carried from prior slices).
