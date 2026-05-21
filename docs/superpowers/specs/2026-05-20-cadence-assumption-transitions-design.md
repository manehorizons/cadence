# CADENCE Assumption Status Transitions — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Slice:** 9 (follow-on to Slice 8 — Assumption + Decision Intake)
**Parent design:** [`synth/docs/superpowers/specs/2026-05-17-cadence-praxis-strategic-intelligence-design.md`](../../../../synth/docs/superpowers/specs/2026-05-17-cadence-praxis-strategic-intelligence-design.md)
**Predecessor slice docs:**
- [`2026-05-20-cadence-assumption-decision-intake-design.md`](2026-05-20-cadence-assumption-decision-intake-design.md) (Slice 8 — Decision Log #9 explicitly deferred bucket render to this transitions slice; § Follow-On listed assumption status transitions as recommended next)
- [`2026-05-17-cadence-context-packets-design.md`](2026-05-17-cadence-context-packets-design.md) (Slice 5 — `status === 'open'` filter on assumptions in context packets)
- Slice-4a milestone code at `packages/core/src/intelligence/milestone.ts:280-342` + `packages/core/src/cli/commands/milestone.ts:40-66` (architectural template — `applyTransition` + `runMilestoneTransition` + CLI verb-per-action loop)

## Summary

**Slice 9** ships two new subcommands on the existing `cadence assumption` parent (registered Slice 8) — `cadence assumption validate <id>` and `cadence assumption reject <id>` — backed by pure `applyAssumptionTransition` + IO glue `runAssumptionTransition` in `store.ts`. Strict allowed-status guard: both transitions only from `'open'`. Mirrors Slice-4a milestone `accept`/`defer` architecture verbatim. ALSO extends `renderAssumptionsMd` to partition by status into 3 always-emit sections (`## Open` / `## Validated` / `## Rejected`), demoting per-entry headings to `###` and removing the now-redundant `- status:` bullet — closes Slice-8 § Decision Log #9 in the same slice.

- **`cadence assumption validate <id>`** flips status `'open'` → `'validated'` and rewrites `assumptions.json` + `ASSUMPTIONS.md`. Refuses with exit 1 + stderr if id unknown OR source status not `'open'`.
- **`cadence assumption reject <id>`** symmetric — `'open'` → `'rejected'`.
- **`renderAssumptionsMd`** now bucket-rendered. Empty buckets emit `_(none)_`. Structure stable regardless of ledger contents (Slice-7 needsAttention always-emit precedent).

It does **not** add `reopen` or any other transition (out-of-MVP; manual JSON edit OR future slice — **`reopen` SHIPPED Slice 10, see [`2026-05-20-cadence-assumption-reopen-design.md`](2026-05-20-cadence-assumption-reopen-design.md)**), change `@cadence/types` schemas, modify the `cadence assumption add|list` subcommands shipped Slice 8, touch `cadence decision` (decision has no status field), modify `context.ts` / `render-context.ts` (Slice-5's `status === 'open'` filter does the right thing automatically), add `--note` option or `lastNote` field, add `updatedAt` field, transition the loop, read file contents, or perform a fresh fs/git scan.

## Product Boundary (parent design's #1 risk: do not rebuild / drive the loop)

Strict read-only outside the assumption ledger. Re-affirmed:

- Writes ONLY to `.cadence/intelligence/{assumptions.json, ASSUMPTIONS.md}`.
- READS ONLY `assumptions.json` (via Slice-5 reader). NO recommendation-ledger read — transitions take `<id>` directly; FK was checked at `add` time per Slice 8.
- **NEVER** calls `cadence spec new`, **NEVER** reads/writes `state.json` / `STATE.md`, **NEVER** transitions `SPEC→DRAFT→BUILD→SETTLE`.
- The new subcommands change no loop state and force no transition.

## Scope

### In scope

- New pure helper `applyAssumptionTransition(ledger, id, action, now?): AssumptionTransitionResult` in `intelligence/store.ts`.
- New IO glue `runAssumptionTransition(root, id, action): Promise<AssumptionTransitionResult>` in `intelligence/store.ts`.
- New exported type `AssumptionTransitionAction = 'validate' | 'reject'` and `AssumptionTransitionResult` discriminated union.
- Two new CLI subcommands on `cadence assumption`: `validate <id>` and `reject <id>` (registered via `for (const action of ['validate', 'reject'] as const)` loop, mirror of `cli/commands/milestone.ts:40-66`).
- Extend `renderAssumptionsMd`: status-partitioned 3-section render, always-emit `_(none)_` for empty buckets, per-entry heading demoted to `###`, per-entry `- status:` bullet removed.
- Update Slice-8 render tests to match the new bucket shape (deliberate test rewrite — see Decision Log #3).
- Test coverage per ACs.

### Out of scope (later / parked)

- ~~A `cadence assumption reopen <id>` transition (rejected/validated → open). Override path via direct JSON edit for now; future slice.~~ **SHIPPED Slice 10** — see [`2026-05-20-cadence-assumption-reopen-design.md`](2026-05-20-cadence-assumption-reopen-design.md). `ALLOWED.reopen=['validated','rejected']`, target `'open'`; refused from `'open'` source.
- An update/edit command (`cadence assumption update <id> --text "..."`).
- A `--note <text>` option carrying rationale alongside the flip. Schema would need `lastNote?: string`; out of scope.
- `updatedAt` timestamp field. Status flip alone is the record; git log of `assumptions.json` captures temporal information if needed.
- Bulk transitions (`cadence assumption validate --all-rec <recId>`).
- Status-transition commands for `cadence decision` (decisions have no status field per `IntelligenceDecisionZ`).
- Any `@cadence/types` schema change.
- A `state.json` / loop transition / `cadence spec new` side effect of any kind.
- Auto-dispatch / subagent routing (parent design's forever-deferred risk).

## Architecture

### MODIFIED files

- `packages/core/src/intelligence/store.ts`:
  - + `AssumptionTransitionAction` type.
  - + `AssumptionTransitionResult` discriminated union.
  - + `applyAssumptionTransition(ledger, id, action, now?): AssumptionTransitionResult` — pure.
  - + `runAssumptionTransition(root, id, action): Promise<AssumptionTransitionResult>` — IO glue.
- `packages/core/src/intelligence/render-assumption.ts`:
  - `renderAssumptionsMd` body rewritten: empty-ledger path unchanged; non-empty path partitions by status into 3 always-emit sections.
- `packages/core/src/cli/commands/assumption.ts`:
  - + `for (const action of ['validate', 'reject'] as const)` loop adding 2 new subcommands. Direct mirror of `cli/commands/milestone.ts:40-66`.
- `packages/core/tests/intelligence/render-assumption.test.ts`:
  - Existing AC-5 tests UPDATED to match the new bucket shape (heading demotion, status bullet removal, section headers). New tests added for bucket partition + empty-bucket case + section ordering.
- `packages/core/tests/intelligence/store-assumption.test.ts`:
  - Regression: existing `add` flow tests still pass (schema unchanged); the MD assertion in the success test updates to find the new entry under `## Open` (was flat).

### NEW files

- `packages/core/tests/intelligence/store-assumption-transition.test.ts` — `applyAssumptionTransition` + `runAssumptionTransition` unit tests (AC-1, AC-2, AC-3, AC-4).
- `packages/core/tests/cli/assumption-transition.test.ts` — spawn-CLI tests for `validate` + `reject` (AC-7, AC-8).

### Untouched

- `@cadence/types`: `AssumptionZ.status` enum already supports `'open' | 'validated' | 'rejected'` (Slice-1-era schema). No schema change.
- `cli/commands/decision.ts`: decision has no status field — out of scope.
- `cli/commands/assumption.ts` `add` + `list` subcommands: unchanged. Only the new transition subcommands added.
- `cli/register.ts`: NO new top-level commands; transitions are subcommands of existing `cadence assumption` parent. Phase-31.1 cli-reference drift guard UNTRIPPED.
- `docs/reference/commands.md` `<!-- cadence:commands -->` marker block: UNCHANGED (no new top-level commands).
- `intelligence/context.ts` / `intelligence/render-context.ts`: Slice-5's `status === 'open'` filter automatically removes validated/rejected assumptions from packet `assumptions[]` arrays. Zero changes; AC-11 integration test exists for free.
- `Slice-4a milestone code`: untouched. `TransitionResult` not generalized (per-subject result type kept to avoid refactor scope creep).
- Slice-1 `addRecommendation` / `nextRecommendationId` etc.: untouched.

## Data Model

### Type signatures (in `store.ts`)

```ts
export type AssumptionTransitionAction = 'validate' | 'reject';

export type AssumptionTransitionResult =
  | { ok: true; ledger: AssumptionLedger }
  | { ok: false; error: string };

export function applyAssumptionTransition(
  ledger: AssumptionLedger,
  id: string,
  action: AssumptionTransitionAction,
  now?: Date,
): AssumptionTransitionResult;

export async function runAssumptionTransition(
  root: string,
  id: string,
  action: AssumptionTransitionAction,
): Promise<AssumptionTransitionResult>;
```

`now` parameter on `applyAssumptionTransition` is OPTIONAL and currently UNUSED (no `updatedAt` field on the assumption schema). Kept in the signature for shape symmetry with `applyTransition` (milestone) at `milestone.ts:289` AND for future-proofing if a future slice adds `updatedAt` — callers would pass `now`; the helper would bump the timestamp. Today: omit at call site, fine.

### Allowed-status map

```ts
const ALLOWED: Record<AssumptionTransitionAction, Assumption['status'][]> = {
  validate: ['open'],
  reject:   ['open'],
};
```

Strict (per brainstorm Q2): both transitions only from `'open'`. Override path = manual JSON edit OR future `reopen` slice (**SHIPPED Slice 10** — `ALLOWED` map extended with `reopen: ['validated', 'rejected']` and `nextStatus` ternary replaced by `NEXT` map). No way to silently flip already-decided state.

### `applyAssumptionTransition` algorithm

```ts
1. target = ledger.assumptions.find(a => a.id === id)
2. if (!target) → { ok: false, error: `assumption ${id} not found` }
3. if (!ALLOWED[action].includes(target.status)) →
     { ok: false, error: `cannot ${action} assumption in status ${target.status}` }
4. nextStatus = (action === 'validate') ? 'validated' : 'rejected'
5. return {
     ok: true,
     ledger: {
       schemaVersion: 1,
       assumptions: ledger.assumptions.map(a =>
         a.id === id ? { ...a, status: nextStatus } : a
       ),
     },
   }
```

Pure: returns a new ledger; never mutates input. `createdAt` and all other fields preserved on the target. All non-target assumptions byte-equal.

### `runAssumptionTransition` flow

```
runAssumptionTransition(root, id, action):
  ├─ ledger = await readAssumptionLedger(root)
  ├─ res = applyAssumptionTransition(ledger, id, action, new Date())
  ├─ if (!res.ok) return res                            // NO write on failure
  ├─ await writeAssumptionLedger(root, res.ledger)      // Slice-8 helper: atomic JSON + atomic MD
  └─ return res
```

Mirrors `runMilestoneTransition` (milestone.ts:332-342) verbatim.

### State-machine transition matrix

| Pre-state | `validate <id>` | `reject <id>` |
|---|---|---|
| id not in ledger | refuses `assumption <id> not found` | same |
| status='open' | → validated, write succeeds | → rejected, write succeeds |
| status='validated' | refuses `cannot validate assumption in status validated` | refuses `cannot reject assumption in status validated` |
| status='rejected' | refuses `cannot validate assumption in status rejected` | refuses `cannot reject assumption in status rejected` |

Idempotent same-status refused (strict; mirrors milestone-accept-from-accepted refusing).

## Render Policy

### `renderAssumptionsMd` extension

Empty-ledger path UNCHANGED: header + blockquote + `No assumptions recorded.` early-return preserved.

Non-empty path NEW: partitions ledger by status, always-emits 3 sections in fixed order with `_(none)_` for empty buckets.

```ts
export function renderAssumptionsMd(ledger: AssumptionLedger): string {
  const lines: string[] = [
    '# CADENCE Assumptions',
    '',
    '> Generated from `.cadence/intelligence/assumptions.json`.',
    '',
  ];
  if (ledger.assumptions.length === 0) {
    lines.push('No assumptions recorded.', '');
    return lines.join('\n');
  }

  const open      = ledger.assumptions.filter(a => a.status === 'open');
  const validated = ledger.assumptions.filter(a => a.status === 'validated');
  const rejected  = ledger.assumptions.filter(a => a.status === 'rejected');

  const SECTIONS: Array<[string, Assumption[]]> = [
    ['## Open',      open],
    ['## Validated', validated],
    ['## Rejected',  rejected],
  ];

  for (const [header, items] of SECTIONS) {
    lines.push(header, '');
    if (items.length === 0) {
      lines.push('_(none)_');
      lines.push('');
      continue;
    }
    for (const a of items) {
      lines.push(`### ${a.id} — ${a.text}`);
      lines.push('');
      lines.push(`- recommendation: ${a.recommendationId}`);
      lines.push(`- recorded: ${a.createdAt}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
```

### Per-entry shape diff vs Slice-8

| | Slice 8 | Slice 9 |
|---|---|---|
| Per-entry heading | `## ${id} — ${text}` (H2) | `### ${id} — ${text}` (H3, demoted under section H2) |
| `- recommendation:` bullet | ✓ | ✓ |
| `- status:` bullet | ✓ | ✗ removed (section heading conveys) |
| `- recorded:` bullet | ✓ | ✓ |
| Trailing blank `lines.push('')` after entry | ✓ | ✓ |

### Always-emit empty buckets

Matches Slice-7 `## Needs Attention → _(none)_` precedent. Structure stable regardless of ledger contents — diff-stable; reader sees the same skeleton every time; downstream parsers/greppers can rely on the three section headers existing.

### `list` (CLI) UNCHANGED

`cadence assumption list` keeps its compact one-line shape `${id}  ${status}  ${recommendationId}  ${text}` (Slice-8 contract). Status stays in the list line because the compact view needs it. Only the MD render gets bucket sections.

### Section order

Open → Validated → Rejected. Fixed. Reading-order: active items first, then audited items.

### Insertion order within each bucket

Preserved from ledger (chronological by `createdAt`, since adds always append and transitions preserve index via `.map` in `applyAssumptionTransition`).

## Flow

### `cadence assumption validate <id>` / `cadence assumption reject <id>`

```
CLI action (mirror cli/commands/milestone.ts:40-66):
  for (const action of ['validate', 'reject'] as const) {
    cmd
      .command(`${action} <id>`)
      .description(
        action === 'validate'
          ? 'Mark an open assumption validated'
          : 'Mark an open assumption rejected',
      )
      .action(async (id: string) => {
        try {
          const res = await runAssumptionTransition(process.cwd(), id, action);
          if (!res.ok) {
            process.stderr.write(`assumption ${action} refused: ${res.error}\n`);
            process.exitCode = 1;
            return;
          }
          process.stdout.write(
            `assumption ${id} → ${action === 'validate' ? 'validated' : 'rejected'}\n`,
          );
        } catch (err) {
          process.stderr.write(
            `assumption ${action} failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      });
  }
```

Verbatim shape from `cli/commands/milestone.ts:40-66`. Only the noun (`milestone`→`assumption`), verbs (`accept`/`defer`→`validate`/`reject`), past-tense (`accepted`/`deferred`→`validated`/`rejected`), and runner function name change.

Refused-vs-failed distinction matches milestone precedent:
- Business-logic refusal (`res.ok === false`): exit 1, stderr `assumption <action> refused: <error>\n`.
- Thrown exception (disk/permission/parse): exit 1, stderr `assumption <action> failed: <message>\n`.

## Error Handling

| Failure | Path | Behavior |
|---|---|---|
| `<id>` not in ledger | `applyAssumptionTransition` returns `{ok:false, error:'assumption <id> not found'}` | exit 1, stderr `assumption <action> refused: assumption <id> not found\n` |
| Wrong source status | `applyAssumptionTransition` returns `{ok:false, error:'cannot <action> assumption in status <s>'}` | exit 1, stderr `assumption <action> refused: cannot <action> assumption in status <s>\n` |
| Ledger JSON corrupt (Zod parse fails on read) | thrown by Slice-5 reader inside `runAssumptionTransition` | exit 1, stderr `assumption <action> failed: <zod error>\n` |
| `AssumptionLedgerZ.parse` fails on write | thrown by `writeAssumptionLedger` | exit 1, stderr `assumption <action> failed: <zod error>\n` |
| `mkdir`/`atomicWrite` failure (disk/perm) | thrown by `writeAssumptionLedger` | exit 1, stderr `assumption <action> failed: <message>\n` |
| Ledger file absent | reader returns `emptyAssumptionLedger()`; `applyAssumptionTransition` then refuses `assumption <id> not found` | exit 1, stderr `assumption <action> refused: assumption <id> not found\n` |
| Missing `<id>` arg | commander usage error before action runs | non-zero exit |

**Strict read-only audit (re-affirmed):**
- Writes ONLY to `.cadence/intelligence/{assumptions.json, ASSUMPTIONS.md}`.
- Reads ONLY `assumptions.json` (via Slice-5 reader). NO recommendation-ledger read.
- NO `state.json` / `STATE.md` mutation.
- NO `cadence spec new` invocation.
- NO loop transition.
- NO file content reads outside ledger JSON.
- NO fresh fs/git scan.

**No write on failure:** verified by mirror to `runMilestoneTransition` (early-returns on `!res.ok` BEFORE `writeMilestoneLedger`). AC-4 test asserts snapshot byte-equality of `assumptions.json` + `ASSUMPTIONS.md` pre/post a refused transition.

## Acceptance Criteria

| AC | Statement | Linked test surface |
|---|---|---|
| AC-1 | `applyAssumptionTransition(ledger, id, 'validate', now)` on `status='open'` returns `{ok:true, ledger}` with the target's status flipped to `'validated'`; all other assumptions byte-equal; `createdAt` preserved. Same shape for `'reject'`→`'rejected'`. | `tests/intelligence/store-assumption-transition.test.ts` (pure) |
| AC-2 | `applyAssumptionTransition` refuses unknown id with `{ok:false, error:'assumption <id> not found'}` — ledger unchanged. | `store-assumption-transition.test.ts` |
| AC-3 | `applyAssumptionTransition` refuses wrong source status with `{ok:false, error:'cannot <action> assumption in status <s>'}` — ledger unchanged. Four cases enumerated: validate-from-validated, validate-from-rejected, reject-from-validated, reject-from-rejected (idempotent same-state refused). | `store-assumption-transition.test.ts` |
| AC-4 | `runAssumptionTransition(root, id, action)` reads ledger → applyTransition → on ok, writes new ledger (atomic JSON + atomic `ASSUMPTIONS.md` via `writeAssumptionLedger`); on !ok, NO write side effects. Pre-call snapshot of `assumptions.json` + `ASSUMPTIONS.md` is byte-equal to post-call snapshot. | `store-assumption-transition.test.ts` (with tempRepo) |
| AC-5 | `renderAssumptionsMd` (non-empty ledger) partitions by status into 3 always-emit sections `## Open` / `## Validated` / `## Rejected` (fixed order). Each populated section emits per-entry `### ${id} — ${text}` heading + `- recommendation:` + `- recorded:` bullets (NO `- status:` bullet). Empty section emits `_(none)_`. | `tests/intelligence/render-assumption.test.ts` (extend; UPDATE existing Slice-8 assertions per Decision Log #3) |
| AC-6 | Empty-ledger path UNCHANGED: header + blockquote + `No assumptions recorded.` early-return preserved (no buckets emitted). | `render-assumption.test.ts` |
| AC-7 | CLI `cadence assumption validate <id>` on `'open'` assumption → exit 0, stdout `assumption <id> → validated\n`; on missing id → exit 1, stderr `assumption validate refused: assumption <id> not found\n`; on non-`'open'` status → exit 1, stderr `assumption validate refused: cannot validate assumption in status <s>\n`. JSON file post-success has target `status:'validated'`; MD has the entry under `## Validated`. | `tests/cli/assumption-transition.test.ts` (spawn-CLI) |
| AC-8 | CLI `cadence assumption reject <id>` symmetric — same shape, opposite verb/past-tense. | `tests/cli/assumption-transition.test.ts` |
| AC-9 | Regression: Slice-8 `add` flow still works; the just-added assumption appears under `## Open` in the rendered MD (not as a flat list — the bucket shape is the new default). | `tests/intelligence/store-assumption.test.ts` (extend the existing success-test MD assertion) |
| AC-10 | Phase-31.1 cli-reference drift guard still passes (`tests/docs/cli-reference.test.ts`). NO new top-level commands added; marker block UNCHANGED. | `tests/docs/cli-reference.test.ts` (passes unchanged) |
| AC-11 | Slice-5/7 context-packet integration: transitioning an `'open'` assumption to `'validated'` or `'rejected'` removes it from `synthesizeContextPacket('handoff' or 'review' or 'phase' or 'agent')` packet's `assumptions[]` (Slice-5 `status === 'open'` filter). Extends Slice-8's AC-11 densification integration test. | `tests/intelligence/context.test.ts` (extend Slice-8's densification block) |

## Testing (per CADENCE test idioms)

- **Spawned-CLI pattern** for CLI tests (AC-7, AC-8). Reuse the local `run()` helper from `tests/cli/assumption.test.ts` verbatim — do NOT introduce a shared helper file.
- **Pure-function vitest** for `applyAssumptionTransition` (AC-1, AC-2, AC-3) and `renderAssumptionsMd` (AC-5, AC-6).
- **In-process `tempRepo` via `@cadence/testkit`** for `runAssumptionTransition` (AC-4) and the integration test (AC-11).
- **Test-coverage gate (Phase 14):** every AC maps to ≥1 linked test. AC-4 is explicit no-write-on-failure regression.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (16/16). Lint must be in every per-task check — Slice-4a/Slice-6/Slice-7/Slice-8 gotcha: subset checks miss `no-unused-vars` lint regressions.
- **No-write-on-failure isolation (AC-4):** test takes a snapshot of `assumptions.json` + `ASSUMPTIONS.md` BEFORE the refused transition call, attempts the refused call, then asserts both files are byte-equal to the snapshot. Closest analog to Slice-8 FK-failure isolation test.
- **Slice-8 render test update:** the existing `render-assumption.test.ts` `non-empty: per-entry block in insertion order with bullets` test will FAIL after this slice (asserts `## as-...` H2 heading and `- status: open` bullet — both shape-changed). Update assertions to the new bucket shape (entry now `### as-...` H3 under `## Open` section header). Document as deliberate test rewrite (Decision Log #3).

## Commit Convention

Mirror Slice-4a / Slice-7 / Slice-8 conventional commits, one per task:

```
feat(core): applyAssumptionTransition + runAssumptionTransition (Slice 9)
feat(core): renderAssumptionsMd status-partitioned bucket sections (Slice 9)
feat(core): CLI cadence assumption validate + reject (Slice 9)
test(core): integration — context packets respect transitioned status (Slice 9 AC-11)
docs: document assumption status transitions + bucket render (Slice 9)
```

(One commit per task — Slice 7/8 actual norm; tests + impl land together per task.)

## Success Criteria

The slice succeeds if:

1. All 11 ACs pass.
2. Full turbo gate green at every task's done-bar (16/16; lint included).
3. Slice-8 § Decision Log #9 closed (bucket render shipped).
4. Slice-8 § Follow-On "Assumption status transitions" closed (validate + reject shipped).
5. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched (boundary audit).
6. Phase-31.1 cli-reference drift guard passes UNCHANGED (no new top-level commands).
7. Branch HEAD pushes clean through pre-push to `origin/praxis-intelligence-ledger`; PR #9 stays draft + unmerged.
8. Slice-8 design's Follow-On entry "Assumption status transitions" reconciled (strike + annotate, mirror Slice-6/7/8 pattern).

## Decision Log

1. **Single coherent slice: transitions + render buckets bundled.** Closes Slice-8 § Decision Log #9 (bucket render — explicitly deferred to "the transitions slice") AND Slice-8 § Follow-On "Assumption status transitions" in one slice. Bundling makes sense because buckets are dead until transitions exist; shipping them separately would either render empty `## Validated` / `## Rejected` sections forever (premature) OR ship a hidden `'validated'` state nothing can produce.
2. **Strict allowed-status: both transitions only from `'open'`.** Matches Slice-4a milestone-accept strictness (`['proposed']` only). Override path = manual JSON edit OR future `reopen` slice (**SHIPPED Slice 10**). No way to silently flip already-decided state. Refused with `cannot <action> assumption in status <s>`. Idempotent same-status refused (mirrors milestone-accept-from-accepted refusing).
3. **Slice-8 render test gets a deliberate rewrite.** The existing `non-empty: per-entry block in insertion order with bullets` test asserts `## as-...` H2 heading and `- status: open` bullet — both shape-changed by this slice. Updated to assert `### as-...` H3 heading + entry-under-`## Open` section + absence of `- status:` bullet. Acknowledged as test-rewrite-by-design, not a regression. Without this, the slice's done-bar fails.
4. **No `@cadence/types` schema change.** No `updatedAt`, no `lastNote`. Status flip alone is the record; git log of `assumptions.json` captures temporal information if needed. Matches Slice-1/Slice-8 minimalism.
5. **`now` parameter on `applyAssumptionTransition` kept in the signature but unused.** Mirrors `applyTransition` (milestone) at `milestone.ts:289` for shape symmetry and future-proofing (if a future slice adds `updatedAt`, callers already pass `now`). No-op today.
6. **Per-subject `AssumptionTransitionResult` rather than generalizing milestone's `TransitionResult`.** Generalization would refactor `milestone.ts` — scope creep. Same shape, different ledger type. If a 3rd subject lands later (e.g. decision lifecycle), that's the right moment to extract `TransitionResult<L>`.
7. **No FK check on `recommendationId` at transition time.** Transitions take `<id>` directly (assumption id); FK was checked at `add` time (Slice 8). Recommendation ledger is NOT read by `runAssumptionTransition`.
8. **NO new top-level CLI commands.** Both new transitions are subcommands on existing `cadence assumption` parent (registered Slice 8). Phase-31.1 cli-reference drift guard marker block UNCHANGED. Symmetric with how Slice-6 added `cadence milestone premortem` to existing `milestone` parent without tripping the guard.
9. **Always-emit 3 sections (Open / Validated / Rejected) in fixed order, with `_(none)_` for empty buckets.** Matches Slice-7 `## Needs Attention → _(none)_` precedent. Structure stable regardless of ledger contents — diff-stable; downstream parsers/greppers can rely on the three section headers existing.
10. **Per-entry heading demoted to H3 under H2 section.** Maintains valid Markdown hierarchy under bucket section headers. The `- status:` bullet REMOVED from per-entry because the section heading already conveys it (avoids redundancy).
11. **CLI `list` UNCHANGED.** Keeps Slice-8 compact one-line `${id}  ${status}  ${recId}  ${text}` shape; status stays in the list line because the compact view needs it. Only the MD render gets buckets. The two surfaces serve different consumers (terminal-glance vs persistent audit doc).
12. **Slice-5 context-packet contract preserved.** Slice-5's `status === 'open'` filter on assumptions automatically removes validated/rejected items from `synthesizeContextPacket` packets — `phase`/`handoff`/`review`/`agent` all benefit without any `context.ts` / `render-context.ts` change. AC-11 integration test extends Slice-8's densification block.
13. **`runAssumptionTransition` does NOT bump `createdAt` or any other field.** Only `status` flips. The Zod schema validation in `writeAssumptionLedger` confirms the entity still validates.
14. **`writeAssumptionLedger` is reused unchanged from Slice 8.** Atomic JSON + atomic MD render. The MD now bucket-renders because `renderAssumptionsMd` is bucket-extended in this slice — no change to the writer's call site.

## Follow-On (not in this slice)

- ~~**`cadence assumption reopen <id>`** transition (rejected/validated → open). Currently override path = manual JSON edit.~~ **SHIPPED Slice 10** — see [`2026-05-20-cadence-assumption-reopen-design.md`](2026-05-20-cadence-assumption-reopen-design.md).
- **`cadence decision` status field + transitions.** Decision has no status field today; would be a `@cadence/types` schema additive change.
- ~~**Auto-backfill `assumptionIds[]`/`decisionIds[]` arrays on Recommendation** (Slice-5/6 forward-ref still open; intake-fed pre-mortem deepening per Slice-6 F-new-3 family).~~ **SHIPPED Slice 11** — see [`2026-05-20-cadence-rec-link-backfill-design.md`](2026-05-20-cadence-rec-link-backfill-design.md).
- **Update / delete commands** for either subject.
- **Filter options on `list`** (`--status open|validated|rejected` for assumption).
- **`--note <text>` option on transitions** (schema additive: `lastNote?: string`).
- **`updatedAt` timestamp field** on `AssumptionZ` (schema additive).
- **Bulk transitions** (`cadence assumption validate --all-rec <recId>` to mark every assumption tied to a rec).
- **Rec↔phase linkage** — the other still-open Slice-7+8 follow-on. Independent of this slice.
- **Auto-dispatch / subagent routing** — forever-deferred per parent design.
