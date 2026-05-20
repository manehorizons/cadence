# CADENCE Assumption + Decision Intake — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Slice:** 8 (follow-on to Slice 7 — Context Packets `review` + `agent` scopes)
**Parent design:** [`synth/docs/superpowers/specs/2026-05-17-cadence-praxis-strategic-intelligence-design.md`](../../../../synth/docs/superpowers/specs/2026-05-17-cadence-praxis-strategic-intelligence-design.md)
**Predecessor slice docs:**
- [`2026-05-17-cadence-context-packets-design.md`](2026-05-17-cadence-context-packets-design.md) (Slice 5 — documented the honest-empty gap this slice closes)
- [`2026-05-18-cadence-context-packets-review-agent-design.md`](2026-05-18-cadence-context-packets-review-agent-design.md) (Slice 7 — explicit Follow-On entry for this slice)
- [`2026-05-17-cadence-intelligence-ledger.md`](../plans/2026-05-17-cadence-intelligence-ledger.md) (Slice 1 — architectural template this slice mirrors)

## Summary

**Slice 8** adds two top-level CLI commands — `cadence assumption add|list` and `cadence decision add|list` — that populate the `AssumptionLedger` and `IntelligenceDecisionLedger` ledgers Slice 5 wired readers for and Slices 5 + 7 documented as honest-empty until intake exists. Mirrors Slice-1's `cadence recommendation add|list` architecture verbatim: per-subject CLI parent + `add` writer + `list` dump + Markdown render artifact + atomic JSON ledger.

- **`cadence assumption add --rec <id> --text "..."`** allocates `as-<YYYYMMDD>-<NNN>`, persists `assumptions.json` + `ASSUMPTIONS.md`, refuses unknown `recommendationId` at intake.
- **`cadence decision add [--rec <id>] --title "..." --rationale "..."`** allocates `dec-<YYYYMMDD>-<NNN>`, persists `decisions.json` + `DECISIONS.md`. `--rec` is optional (decisions can be untied per `IntelligenceDecisionZ` schema); when present, FK-checked same as assumption.
- **`cadence assumption list` / `cadence decision list`** read the respective ledger and write a compact one-line-per-entry summary to stdout (mirrors Slice 1's `recommendation list` shape verbatim — `${rec.id}  ${rec.priority}  ${rec.readiness}  ${rec.title}\n`). NOT a full Markdown dump. The `.md` artifact is regenerated only by `add`.

Status transitions (`validate`/`reject` for assumptions) deferred to a follow-up slice, mirroring Slice 1's deferral of `recommendation accept/defer/reject` until Slice 3.

It does **not** add status-transition commands, modify any `@cadence/types` schema (schemas are pre-existing from Slice-1 era), modify `context.ts` / `render-context.ts` (Slice 5 readers already wired — packets densify automatically), build any UI surface beyond the CLI, transition the loop, read file *contents* (only ledger JSON), or perform a fresh fs/git scan.

## Product Boundary (parent design's #1 risk: do not rebuild / drive the loop)

Strict read-only outside the new ledger artifacts. Re-affirmed:

- Writes ONLY to `.cadence/intelligence/{assumptions.json, decisions.json, ASSUMPTIONS.md, DECISIONS.md}` (the Praxis-owned namespace).
- READS `.cadence/intelligence/recommendations.json` for FK existence-check; never writes it.
- **NEVER** calls `cadence spec new`, **NEVER** reads/writes `state.json` / `STATE.md`, **NEVER** transitions `SPEC→DRAFT→BUILD→SETTLE`.
- The new commands change no loop state and force no transition.

## Scope

### In scope

- New CLI command `cadence assumption` with `add` + `list` subcommands.
- New CLI command `cadence decision` with `add` + `list` subcommands.
- Two new writers in `intelligence/store.ts`: `addAssumption(root, input)` + `addIntelligenceDecision(root, input)`.
- Two new ledger writers in `intelligence/store.ts`: `writeAssumptionLedger(root, ledger)` + `writeIntelligenceDecisionLedger(root, ledger)` (atomic JSON + atomic .md render).
- Two new ID-allocation helpers in `intelligence/store.ts`: `nextAssumptionId(ledger, now)` + `nextIntelligenceDecisionId(ledger, now)` (prefix `as-`/`dec-`, mirror of `nextRecommendationId`/`nextEvidenceId`).
- Two new render modules: `intelligence/render-assumption.ts` (`renderAssumptionsMd`) + `intelligence/render-decision.ts` (`renderDecisionsMd`).
- CLI registration in `cli/register.ts` for both new top-level commands.
- `docs/reference/commands.md` `<!-- cadence:commands -->` auto-marker region regenerated; new `### assumption` + `### decision` sections.
- Test coverage per Acceptance Criteria.

### Out of scope (later / parked)

- Status transitions for assumptions (`cadence assumption validate <id>` / `reject <id>`) — deferred (Slice-1 minimalism precedent; Slice 3 added transitions for recommendations months after Slice 1).
- Update / delete commands for either subject (append-only ledgers for MVP).
- Filter options on `list` (no `--status`, `--rec`, `--since`, `--limit`).
- Cross-subject coupling — e.g. auto-resolving `assumptionIds[]` / `decisionIds[]` arrays on the Recommendation type. The Recommendation schema has these arrays but they remain operator-managed; this slice does NOT automatically backfill them.
- A `cadence assumption update <id> --text "..."` or rationale edit — corrections via direct ledger edit OR a future slice.
- Any `@cadence/types` schema change (every shape this slice needs already exists).
- Any change to `context.ts` / `render-context.ts` (Slice 5 readers already wired; new ledger data flows in automatically).
- Auto-dispatch / subagent routing of any kind (parent design's forever-deferred risk).

## Architecture

Five new files, three modified files. Zero `@cadence/types` changes.

### NEW files

- `packages/core/src/cli/commands/assumption.ts` — parent + `add` + `list` subcommands.
- `packages/core/src/cli/commands/decision.ts` — parent + `add` + `list` subcommands.
- `packages/core/src/intelligence/render-assumption.ts` — pure `renderAssumptionsMd(ledger): string`.
- `packages/core/src/intelligence/render-decision.ts` — pure `renderDecisionsMd(ledger): string`.
- Test files: `tests/intelligence/store-assumption.test.ts`, `tests/intelligence/store-decision.test.ts`, `tests/intelligence/render-assumption.test.ts`, `tests/intelligence/render-decision.test.ts`, `tests/cli/assumption.test.ts`, `tests/cli/decision.test.ts`.

### MODIFIED files

- `packages/core/src/intelligence/store.ts`:
  - + `ASSUMPTIONS_MD = 'ASSUMPTIONS.md'` and `DECISIONS_MD = 'DECISIONS.md'` constants. **`ASSUMPTIONS_JSON` / `DECISIONS_JSON` + `assumptionsPath()` / `decisionsPath()` helpers already exist at `store.ts` lines 33-34 + 58-64** (added when the Slice-5 readers landed) — REUSE them; DO NOT redeclare. Add new `assumptionsMdPath(root)` / `decisionsMdPath(root)` helpers mirroring the existing `recommendationsMdPath(root)` at line 66.
  - + `nextAssumptionId(ledger, now): string` — prefix `as-`, mirror of `nextRecommendationId`.
  - + `nextIntelligenceDecisionId(ledger, now): string` — prefix `dec-`, same shape.
  - + `writeAssumptionLedger(root, ledger): Promise<void>` — atomic JSON + atomic `ASSUMPTIONS.md` render.
  - + `writeIntelligenceDecisionLedger(root, ledger): Promise<void>` — atomic JSON + atomic `DECISIONS.md` render.
  - + `addAssumption(root, input): Promise<Assumption>` — FK-check + ID alloc + ledger write.
  - + `addIntelligenceDecision(root, input): Promise<IntelligenceDecision>` — FK-check (only when --rec) + ID alloc + ledger write.
- `packages/core/src/cli/register.ts`:
  - + `registerAssumptionCommand(program)`, `registerDecisionCommand(program)` calls + imports.
- `docs/reference/commands.md`:
  - + `### assumption` section (mirror `### recommendation` shape).
  - + `### decision` section.
  - Auto-marker region (`<!-- cadence:commands:start/end -->`) regenerated to list `assumption` + `decision` as top-level commands.

### Untouched

- `@cadence/types`: `AssumptionZ`, `IntelligenceDecisionZ`, `AssumptionLedgerZ`, `IntelligenceDecisionLedgerZ`, `emptyAssumptionLedger`, `emptyIntelligenceDecisionLedger` — all exist verbatim (verified at `packages/types/src/intelligence.ts` lines 79-95, 109-119, 129-135).
- `intelligence/context.ts`, `intelligence/render-context.ts` — Slice 5 readers (`readAssumptionLedger`, `readIntelligenceDecisionLedger`) already in place; Slice-5/7 context packets densify automatically when this slice's writers populate the ledgers.
- `intelligence/store.ts` reader functions (`readAssumptionLedger`, `readIntelligenceDecisionLedger`) — Slice 5 implementation unchanged.
- Slice 1's `RECOMMENDATIONS_MD` constant, `renderRecommendationsMd`, `addRecommendation`, `writeIntelligenceLedgers` — untouched (this slice mirrors them, doesn't refactor).
- No `state.json`/`STATE.md`/loop touch.

## Data Model

### Writer signatures (in `intelligence/store.ts`)

```ts
export type AddAssumptionInput = {
  recommendationId: string;   // required, FK-checked
  text: string;               // required, non-empty
  // status is hardcoded 'open' at add time — no override (Slice-1 minimalism)
};

export async function addAssumption(
  root: string,
  input: AddAssumptionInput,
): Promise<Assumption>;

export type AddIntelligenceDecisionInput = {
  recommendationId?: string;  // optional; FK-checked only when present
  title: string;              // required, non-empty
  rationale: string;          // required, non-empty
};

export async function addIntelligenceDecision(
  root: string,
  input: AddIntelligenceDecisionInput,
): Promise<IntelligenceDecision>;
```

### ID allocation

```ts
function nextAssumptionId(ledger: AssumptionLedger, now: Date): string {
  // returns `as-<YYYYMMDD>-<NNN>` (zero-padded, monotone per-day per-ledger)
}
function nextIntelligenceDecisionId(ledger: IntelligenceDecisionLedger, now: Date): string {
  // returns `dec-<YYYYMMDD>-<NNN>` (same scheme)
}
```

Both reuse the existing `slugDate(now)` helper. Counter scope = entries in the ledger that share the day-prefix (NOT a global counter; same as `nextRecommendationId`).

### Persisted entity shapes

`Assumption` (matches `AssumptionZ` verbatim):

```
id               = nextAssumptionId(asLedger, now)
recommendationId = input.recommendationId
text             = input.text
status           = 'open'                  // hardcoded for MVP
createdAt        = now.toISOString()
```

`IntelligenceDecision` (matches `IntelligenceDecisionZ` verbatim):

```
id               = nextIntelligenceDecisionId(decLedger, now)
recommendationId = input.recommendationId  // field OMITTED when undefined (exact-optional)
title            = input.title
rationale        = input.rationale
decidedAt        = now.toISOString()
```

### FK enforcement

| Subject | `--rec` flag | FK behavior |
|---|---|---|
| Assumption | required (`requiredOption`) | refuses with `Error("unknown recommendation \"<id>\"")` if not in recommendation ledger; CLI surfaces as `assumption add failed: unknown recommendation "<id>"` on stderr + exit 1 |
| Decision | optional (`option`) | refuses ONLY when `--rec` is provided AND id is not in ledger; absent `--rec` = untied decision, accepted |

FK check happens INSIDE the writer (`addAssumption` / `addIntelligenceDecision`), not in the CLI. Any future programmatic caller gets the same guarantee.

### Path constants (in `store.ts`)

```ts
// EXISTING (do not redeclare):
//   const ASSUMPTIONS_JSON = 'assumptions.json';                  // line 33
//   const DECISIONS_JSON   = 'decisions.json';                    // line 34
//   function assumptionsPath(root): string                         // line 58
//   function decisionsPath(root): string                           // line 62
//
// NEW (add):
const ASSUMPTIONS_MD = 'ASSUMPTIONS.md';
const DECISIONS_MD   = 'DECISIONS.md';

function assumptionsMdPath(root: string): string {
  return join(intelligenceDir(root), ASSUMPTIONS_MD);
}
function decisionsMdPath(root: string): string {
  return join(intelligenceDir(root), DECISIONS_MD);
}
```

All under `.cadence/intelligence/` (via existing `intelligenceDir(root)`).

## Render Policy

Both render modules mirror Slice-1's `renderRecommendationsMd` idiom (`lines: string[]` builder + `return lines.join('\n')`).

### `renderAssumptionsMd(ledger): string`

Full output structure — **header + blockquote always emitted**, in both empty and non-empty cases (mirrors Slice-1 `renderRecommendationsMd` at `render.ts` lines 7-12 verbatim):

```
# CADENCE Assumptions

> Generated from `.cadence/intelligence/assumptions.json`.

[ empty case appends: "No assumptions recorded." + blank line ]
[ non-empty case appends one per-entry block per assumption: ]

## ${a.id} — ${a.text}

- recommendation: ${a.recommendationId}
- status: ${a.status}
- recorded: ${a.createdAt}

```

Per-entry heading uses `text` (the assumption statement IS the natural heading; `id` precedes for stability/grep). Em-dash `—` (U+2014) matches Slice-1's heading shape.

### `renderDecisionsMd(ledger): string`

Same envelope (header + blockquote always emitted):

```
# CADENCE Decisions

> Generated from `.cadence/intelligence/decisions.json`.

[ empty case appends: "No decisions recorded." + blank line ]
[ non-empty case appends one per-entry block: ]

## ${d.id} — ${d.title}

- recommendation: ${d.recommendationId}     # ONLY emitted when defined (decision's --rec is optional)
- decided: ${d.decidedAt}

${d.rationale}

```

`rationale` is the body paragraph (symmetric with Slice-1's `rec.summary` body). The `- recommendation:` bullet line is emitted ONLY when `d.recommendationId` is present; absent for untied decisions.

### Ordering

Insertion order from the ledger (push-order = chronological by `createdAt`/`decidedAt` since adds always append). NO sort — preserves the literal ledger order, deterministic by construction.

### No status-discriminated sections

Both render shapes are flat. The `status` field on assumption is rendered as a per-entry bullet, NOT as a section discriminant (no `## Open / ## Validated / ## Rejected` buckets). A future slice that ships transitions can add bucket-rendering then.

## Flow

### `cadence assumption add --rec <id> --text "..."`

```
CLI action:
  ├─ commander validates --rec + --text required (usage error + exit 1 if missing)
  ├─ try {
  │    const a = await addAssumption(process.cwd(), {
  │      recommendationId: opts.rec,
  │      text: opts.text,
  │    });
  │    process.stdout.write(`Added ${a.id}: ${a.text}\n`);
  │    process.stdout.write(`Next: cadence assumption list\n`);
  │  } catch (err) {
  │    process.stderr.write(`assumption add failed: ${err.message}\n`);
  │    process.exitCode = 1;
  │  }

addAssumption(root, input):
  ├─ readRecommendationLedger(root) → recLedger
  ├─ if (!recLedger.recommendations.some(r => r.id === input.recommendationId))
  │     throw new Error(`unknown recommendation "${input.recommendationId}"`);
  ├─ readAssumptionLedger(root) → asLedger
  ├─ const now = new Date(); const ts = now.toISOString();
  ├─ const a: Assumption = {
  │     id: nextAssumptionId(asLedger, now),
  │     recommendationId: input.recommendationId,
  │     text: input.text,
  │     status: 'open',
  │     createdAt: ts,
  │   };
  ├─ asLedger.assumptions.push(a);
  ├─ await writeAssumptionLedger(root, asLedger);
  └─ return a;

writeAssumptionLedger(root, ledger):
  ├─ AssumptionLedgerZ.parse(ledger)            // contract enforcement
  ├─ await mkdir(intelligenceDir(root), { recursive: true })
  ├─ await atomicWriteJSON(<assumptions.json>, ledger)
  └─ await atomicWriteText(<ASSUMPTIONS.md>, renderAssumptionsMd(ledger))
```

### `cadence decision add [--rec <id>] --title "..." --rationale "..."`

Identical shape, with two differences:
1. `--rec` is `.option(...)` not `.requiredOption(...)`.
2. FK check inside `addIntelligenceDecision` runs ONLY when `input.recommendationId !== undefined`.
3. The persisted entity OMITS `recommendationId` entirely when `input.recommendationId` is undefined (exact-optional, matches `IntelligenceDecisionZ`'s `.optional()`):

```ts
const out: IntelligenceDecision = {
  id: nextIntelligenceDecisionId(...),
  title: input.title,
  rationale: input.rationale,
  decidedAt: ts,
};
if (input.recommendationId !== undefined) out.recommendationId = input.recommendationId;
```

### `cadence assumption list`

```
CLI action:
  ├─ try {
  │    const ledger = await readAssumptionLedger(process.cwd());
  │    if (ledger.assumptions.length === 0) {
  │      process.stdout.write('No assumptions recorded.\n');
  │      return;
  │    }
  │    for (const a of ledger.assumptions) {
  │      process.stdout.write(`${a.id}  ${a.status}  ${a.recommendationId}  ${a.text}\n`);
  │    }
  │  } catch (err) {
  │    process.stderr.write(`assumption list failed: ${err.message}\n`);
  │    process.exitCode = 1;
  │  }
```

### `cadence decision list`

```
CLI action:
  ├─ try {
  │    const ledger = await readIntelligenceDecisionLedger(process.cwd());
  │    if (ledger.decisions.length === 0) {
  │      process.stdout.write('No decisions recorded.\n');
  │      return;
  │    }
  │    for (const d of ledger.decisions) {
  │      process.stdout.write(`${d.id}  ${d.recommendationId ?? '—'}  ${d.title}\n`);
  │    }
  │  } catch (err) {
  │    process.stderr.write(`decision list failed: ${err.message}\n`);
  │    process.exitCode = 1;
  │  }
```

Both mirror Slice 1's `recommendation list` shape verbatim: compact one-line-per-entry summary written directly to stdout via a `for` loop — NOT the full Markdown renderer. Untied decisions (no `recommendationId`) print the em-dash placeholder `—` in the rec column. The `.md` artifacts (`ASSUMPTIONS.md` / `DECISIONS.md`) are regenerated only by `add` (no `list`-side side effects).

## Error Handling

| Failure | Behavior |
|---|---|
| `--rec` / `--text` / `--title` / `--rationale` missing | commander usage error + non-zero exit (before action runs) |
| Unknown `recommendationId` on assumption add | `process.exitCode = 1`; stderr `assumption add failed: unknown recommendation "<id>"` |
| Unknown `recommendationId` on decision add (when `--rec` provided) | `process.exitCode = 1`; stderr `decision add failed: unknown recommendation "<id>"` |
| Decision add WITHOUT `--rec` | accepted (untied decision); persisted entity omits `recommendationId` field |
| Ledger JSON corrupt (Zod parse fails on read) | exit 1, stderr from existing Slice-5 reader's throw |
| `mkdir` / `atomicWrite` fails (disk/perm) | exit 1, stderr passthrough — same surface as Slice 1 |
| `AssumptionLedgerZ.parse` / `IntelligenceDecisionLedgerZ.parse` fails on write | throws — schema contract enforcer; real bug, not runtime |
| Ledger file absent | reader returns `emptyAssumptionLedger()` / `emptyIntelligenceDecisionLedger()` (Slice 5 readers already honest-empty); add proceeds, creating the file |
| Empty ledger on `list` | exit 0, stdout `No assumptions recorded.\n` (or `No decisions recorded.\n`) |

**Strict-read-only audit (re-affirmed):**
- No write outside `.cadence/intelligence/{assumptions.json, decisions.json, ASSUMPTIONS.md, DECISIONS.md}`.
- READS `recommendations.json` for FK check; no write to it.
- No `state.json` / `STATE.md` mutation, no `cadence spec new`, no loop transition.
- No file content reads outside ledger JSON.
- No fresh fs / git scan.

## Acceptance Criteria

| AC | Statement | Linked test surface |
|---|---|---|
| AC-1 | `addAssumption(root, {recommendationId, text})` allocates id `as-<YYYYMMDD>-001`, sets `status='open'`, `createdAt=ISO now`, appends to ledger, persists `assumptions.json` + `ASSUMPTIONS.md`; counter increments monotone per-day per-ledger (3 sequential adds same day → `001`/`002`/`003`). | `tests/intelligence/store-assumption.test.ts` |
| AC-2 | `addAssumption` refuses unknown `recommendationId` with `Error("unknown recommendation \"<id>\"")`; ledger file remains absent (or byte-equal if pre-existing); no `ASSUMPTIONS.md` write. | `tests/intelligence/store-assumption.test.ts` |
| AC-3 | `addIntelligenceDecision(root, {title, rationale})` (no `--rec`) allocates id `dec-<YYYYMMDD>-001`, OMITS `recommendationId` field entirely (not `undefined`), sets `decidedAt=ISO now`, persists `decisions.json` + `DECISIONS.md`. | `tests/intelligence/store-decision.test.ts` |
| AC-4 | `addIntelligenceDecision` WITH `recommendationId` refuses unknown id (same shape as AC-2); WITH known id, persists with the field present. | `tests/intelligence/store-decision.test.ts` |
| AC-5 | `renderAssumptionsMd` ALWAYS emits the `# CADENCE Assumptions` header + `> Generated from \`.cadence/intelligence/assumptions.json\`.` blockquote envelope (mirrors Slice-1 `renderRecommendationsMd` shape). Non-empty ledger appends per-entry block: `## ${id} — ${text}` heading + `- recommendation:` / `- status:` / `- recorded:` bullets in insertion order. Empty ledger appends `No assumptions recorded.` (header + blockquote still present). | `tests/intelligence/render-assumption.test.ts` |
| AC-6 | `renderDecisionsMd` ALWAYS emits the `# CADENCE Decisions` header + `> Generated from \`.cadence/intelligence/decisions.json\`.` blockquote envelope. Non-empty ledger appends per-entry block: `## ${id} — ${title}` heading + `- recommendation:` line (ONLY when `recommendationId` present) + `- decided:` bullet + body paragraph (`rationale`). Empty ledger appends `No decisions recorded.` | `tests/intelligence/render-decision.test.ts` |
| AC-7 | CLI `cadence assumption add --rec <id> --text "..."` succeeds (exit 0, stdout `Added <id>: <text>\nNext: cadence assumption list\n`); missing `--rec` or `--text` → commander usage error + non-zero exit; unknown rec → `process.exitCode = 1`, stderr `assumption add failed: unknown recommendation "<id>"\n`. | `tests/cli/assumption.test.ts` (spawned-CLI) |
| AC-8 | CLI `cadence assumption list` reads ledger and writes one line per entry to stdout: `${a.id}  ${a.status}  ${a.recommendationId}  ${a.text}\n` (Slice-1 compact-list shape; NOT the full Markdown renderer). Empty ledger → `No assumptions recorded.\n`. | `tests/cli/assumption.test.ts` |
| AC-9 | CLI `cadence decision add [--rec <id>] --title "..." --rationale "..."` symmetric (with `--rec` optional; FK-check only when provided; same error+success shapes). `cadence decision list` writes one line per entry: `${d.id}  ${d.recommendationId ?? '—'}  ${d.title}\n` (em-dash placeholder for untied decisions). Empty ledger → `No decisions recorded.\n`. | `tests/cli/decision.test.ts` |
| AC-10 | Phase-31.1 cli-reference drift guard passes after regenerating `docs/reference/commands.md` `<!-- cadence:commands -->` auto-marker region: `tests/docs/cli-reference.test.ts` finds both `assumption` and `decision` as top-level commands. | `tests/docs/cli-reference.test.ts` |
| AC-11 | Slice-5/7 context packets DENSIFY automatically once intake exists. Integration test: add 2 assumptions + 1 decision against an existing rec, then call `synthesizeContextPacket('handoff', ...)` and assert `packet.assumptions.length === 2` and `packet.decisions.length === 1`. No changes to `context.ts`/`render-context.ts` required for this to pass. | `tests/intelligence/context.test.ts` (extend existing block) |

## Testing (per CADENCE test idioms)

- **Spawned-CLI pattern** for CLI tests (AC-7, AC-8, AC-9). Reuse the local `run(args, cwd): Promise<{stdout, stderr, code}>` helper pattern from `tests/cli/context.test.ts` (Slice 7 verified). Do NOT introduce a new helper.
- **Pure-function vitest** for render (AC-5, AC-6).
- **In-process tempRepo via `@cadence/testkit`** for store-writer tests (AC-1 through AC-4) and the integration test (AC-11). Each test seeds the recommendation ledger via real `addRecommendation(...)` calls (not synthetic JSON).
- **Test-coverage gate (Phase 14):** every AC maps to ≥1 linked test.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (16/16). Lint must be in every per-task check — Slice-4a/Slice-6 gotcha: subset checks miss `no-unused-vars` lint regressions.
- **ID-allocation determinism:** `nextAssumptionId` and `nextIntelligenceDecisionId` tests pin `now` to a fixed Date (`new Date('2026-05-20T00:00:00.000Z')`) so the date-slug `20260520` is deterministic. Counter tests add 2-3 entries with same `now` to verify monotone increment.
- **FK-failure isolation:** tests that exercise the "unknown rec id" path must assert NO write happened on failure (assert `assumptions.json` does NOT exist OR is byte-equal to pre-call snapshot).
- **Render tests:** full `Assumption[]` / `IntelligenceDecision[]` fixture literals — no `as` casts.

## Commit Convention

Mirror Slice 1 / Slice 7 conventional commits, one per task:

```
feat(core): addAssumption + writeAssumptionLedger + nextAssumptionId (Slice 8)
feat(core): addIntelligenceDecision + writeIntelligenceDecisionLedger + nextIntelligenceDecisionId (Slice 8)
feat(core): renderAssumptionsMd + renderDecisionsMd (Slice 8)
feat(core): CLI cadence assumption + cadence decision (Slice 8)
test(core): integration — Slice-5/7 packets densify on intake (Slice 8)
docs: document assumption + decision intake + regenerate cli-reference auto-marker (Slice 8)
```

(One commit per task — Slice 6/7 actual norm; tests + impl land together per task.)

## Success Criteria

The slice succeeds if:

1. All 11 ACs pass.
2. Full turbo gate green at every task's done-bar (16/16; lint included).
3. Slice-5/7 documented honest-empty gap closed (AC-11 is the canary).
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched (boundary audit).
5. Branch HEAD pushes clean through pre-push to `origin/praxis-intelligence-ledger`; PR #9 stays draft + unmerged.
6. Slice-7 design's Follow-On entry "An assumption / decision intake command" reconciled (strike + annotate, mirror Slice-6/7 pattern).
7. Slice-5 design's Follow-On entry "Resolving `assumptionIds`/`decisionIds` off recommendations once an assumption/decision intake command exists" remains open (this slice does NOT auto-backfill those arrays — that's a future slice).

## Decision Log

1. **Symmetric pair in one slice** — both subjects share architecture (writer + ID alloc + ledger writer + render + CLI parent + 2 subcommands), so bundling avoids duplicated test/PR overhead. Same precedent as Slice 7 (`review` + `agent` together) and Slice 1 (`recommendation` + `evidence` together).
2. **Two new top-level commands (`assumption` + `decision`)** rather than nesting under an `intelligence` parent — mirrors Slice 1's `cadence recommendation` precedent; no existing CADENCE command is verb-nested under a vague parent.
3. **add + list only; transitions deferred** — mirrors Slice 1's deferral of `recommendation accept/defer/reject` until Slice 3. Future slice ships `cadence assumption validate <id>` / `cadence assumption reject <id>`.
4. **FK enforcement at writer level, not CLI** — any future programmatic caller (e.g. an intake-fed pre-mortem refresh) gets the same guarantee. CLI's `try`/`catch` surfaces the writer's error message.
5. **Decision's `--rec` is optional, assumption's is required** — schema-driven (`AssumptionZ.recommendationId` is `z.string().min(1)`; `IntelligenceDecisionZ.recommendationId` is `z.string().optional()`). An untied decision (no rec) is a valid project-level architectural decision; an assumption without a recommendation has nothing to be an assumption ABOUT.
6. **ID scheme `as-<YYYYMMDD>-<NNN>` / `dec-<YYYYMMDD>-<NNN>`** — mirrors `rec-` and `ev-` exactly. Same `slugDate(now)` helper. Counter scoped per-ledger per-day, not global.
7. **`status` hardcoded `'open'` at add time** — no `--status` option in `add`. Status transitions ship via dedicated subcommands in a future slice (point 3).
8. **`list` is compact one-line-per-entry, NOT the full Markdown renderer** — Slice-1 `recommendation list` (`packages/core/src/cli/commands/recommendation.ts` lines 73-94) verifiably uses a tight loop `process.stdout.write(\`${rec.id}  ${rec.priority}  ${rec.readiness}  ${rec.title}\n\`)`, not `renderRecommendationsMd`. Mirroring that shape keeps the terminal output scannable. The full Markdown artifact (`ASSUMPTIONS.md` / `DECISIONS.md`) is regenerated only by `add` — `list` is read-only with NO write side effects. Untied decisions print the em-dash placeholder `—` in the rec column for the column to stay aligned.
9. **No bucket-by-status render** — both shapes are flat. `## Open / ## Validated / ## Rejected` sections wait until the transitions slice exists (otherwise the `## Validated` / `## Rejected` sections are dead until status moves off `'open'`).
10. **`recommendationId` field omitted (not `undefined`) on untied decisions** — exact-optional pattern (matches Slice-4b/5/6/7 precedent for optional fields persisted to JSON). The schema's `.optional()` allows both absent and `undefined`; absent is preferred for clean JSON.
11. **No `@cadence/types` schema change in this slice** — every type this slice persists already exists (Slice-1-era). The slice is purely additive new files + small `store.ts` additions + CLI registration.
12. **CLI registration is the Phase-31.1 drift-guard surface** — adding two top-level commands re-trips the auto-marker region in `docs/reference/commands.md`. Plan must include the regeneration step explicitly.
13. **Integration test (AC-11) is the practical canary** that Slice 5/7 packets densify "for free" once intake exists. Validates the slice's stated leverage claim without requiring any change to `context.ts` / `render-context.ts`.

## Follow-On (not in this slice)

- **Assumption status transitions** (`cadence assumption validate <id>` / `cadence assumption reject <id>`). Highest-priority follow-on; closes the asymmetry between Slice-3's recommendation lifecycle and this slice's assumption stub. Render gets bucket sections at that point.
- **Auto-backfill `assumptionIds[]` / `decisionIds[]` on the Recommendation type** when an intake `add` is called with `--rec`. Currently those arrays stay operator-managed; auto-backfill closes the Slice 5 / 7 design's "resolving `assumptionIds`/`decisionIds` off recs once an intake command exists" follow-on.
- **Update / delete commands** for either subject (`cadence assumption update <id> --text "..."`, `cadence decision update <id>`, delete). Append-only is the MVP discipline.
- **Filter options on `list`** (`--status open|validated|rejected` for assumption, `--rec <id>` for both, `--since <iso>`, `--limit N`).
- **An intake-fed pre-mortem refresh** — once `assumptionIds[]` resolution is automatic, Slice 6's `deepenPreMortem` family F-new-3 (open-assumptions) densifies further.
- **Rec↔phase linkage** — the other Slice 7 Follow-On candidate; would let `review` filter recs by phase membership. Independent of this slice.
- **Auto-dispatch / subagent routing** — forever-deferred per parent design.
