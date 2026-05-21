# CADENCE Assumption `reopen` Transition — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Slice:** 10 (follow-on to Slice 9 — Assumption Status Transitions)
**Predecessor slice docs:**
- [`2026-05-20-cadence-assumption-transitions-design.md`](2026-05-20-cadence-assumption-transitions-design.md) (Slice 9 — `validate`/`reject` from `'open'`; § Out of scope + Follow-On both explicitly listed `reopen` as the next slice)
- [`2026-05-20-cadence-assumption-decision-intake-design.md`](2026-05-20-cadence-assumption-decision-intake-design.md) (Slice 8 — `cadence assumption add|list` parent + ledger schema; render contract under `## Open` / `## Validated` / `## Rejected` sections established Slice 9)
- [`2026-05-17-cadence-context-packets-design.md`](2026-05-17-cadence-context-packets-design.md) (Slice 5 — `status === 'open'` filter on assumptions in context packets; `reopen` benefits without context-layer change)

## Summary

**Slice 10** ships one new subcommand on the existing `cadence assumption` parent — `cadence assumption reopen <id>` — backed by extending `applyAssumptionTransition` + `runAssumptionTransition` with a third action `'reopen'`. Allowed source statuses: `['validated', 'rejected']`. Target status: `'open'`. Completes the assumption status transition matrix (`open ↔ {validated, rejected}`). Closes Slice-9 § Out-of-scope + § Follow-On "`cadence assumption reopen`" entries.

- **`cadence assumption reopen <id>`** flips status `'validated' | 'rejected'` → `'open'` and rewrites `assumptions.json` + `ASSUMPTIONS.md`. Refuses with exit 1 + stderr if id unknown OR source status is `'open'` (idempotent same-state refused, mirroring Slice 9 strictness).
- Internal CLI ternary `action === 'validate' ? 'validated' : 'rejected'` becomes a `PAST: Record<AssumptionTransitionAction, Assumption['status']>` map. The same map drives stdout success line + description text generation. Same pattern as `ALLOWED` map already in `store.ts`.
- Slice-5 context-packet `status === 'open'` filter automatically RE-ADMITS the reopened assumption — AC-11 integration test extends Slice-9's by asserting count rises after reopen.

It does **not** change `@cadence/types` schemas, modify the `cadence assumption add|list|validate|reject` subcommands (only adds a third transition verb), touch `cadence decision`, modify `context.ts` / `render-context.ts`, extend `renderAssumptionsMd` (Slice 9's bucket render already handles all three statuses), add `--note` / `lastNote` / `updatedAt` fields, transition the loop, read file contents outside the assumption ledger, or perform a fresh fs/git scan.

## Product Boundary (parent design's #1 risk: do not rebuild / drive the loop)

Strict read-only outside the assumption ledger. Re-affirmed:

- Writes ONLY to `.cadence/intelligence/{assumptions.json, ASSUMPTIONS.md}`.
- READS ONLY `assumptions.json` (via Slice-5 reader).
- **NEVER** calls `cadence spec new`, **NEVER** reads/writes `state.json` / `STATE.md`, **NEVER** transitions `SPEC→DRAFT→BUILD→SETTLE`.
- The new subcommand changes no loop state and forces no transition.

## Scope

### In scope

- Extend `AssumptionTransitionAction` union to `'validate' | 'reject' | 'reopen'` in `intelligence/store.ts`.
- Extend `ALLOWED` map in `applyAssumptionTransition` with `reopen: ['validated', 'rejected']`.
- Replace inline ternary `action === 'validate' ? 'validated' : 'rejected'` with a `NEXT: Record<AssumptionTransitionAction, Assumption['status']>` map at module scope so the body stays branch-free.
- One new CLI subcommand on `cadence assumption`: `reopen <id>` (registered by extending the existing `for (const action of [...] as const)` loop in `cli/commands/assumption.ts`).
- Replace the CLI's inline `${action === 'validate' ? 'validated' : 'rejected'}` template fragment with a `PAST: Record<AssumptionTransitionAction, Assumption['status']>` map mirroring the store's `NEXT`. Same map drives `description()` text via a `DESCRIPTIONS` map (or inline switch — see § Decision Log #2).
- Test coverage per ACs (extend existing test files; do NOT create new files since the contract is the same as Slice 9 with one verb added).

### Out of scope (later / parked)

- A `cadence assumption update <id> --text "..."` command (text edit).
- A `--note <text>` option carrying rationale alongside the flip. Schema would need `lastNote?: string`; out of scope.
- `updatedAt` timestamp field. Status flip alone is the record; git log captures temporal info if needed.
- Bulk transitions (`cadence assumption reopen --all-rec <recId>`).
- ~~Status-transition commands for `cadence decision` (decisions have no status field; separate follow-on).~~ **SHIPPED Slice 13** — see [decision status + transitions design](2026-05-20-cadence-decision-status-transitions-design.md).
- Any `@cadence/types` schema change.
- A `state.json` / loop transition / `cadence spec new` side effect of any kind.
- Auto-dispatch / subagent routing (parent design's forever-deferred risk).

## Architecture

### MODIFIED files

- `packages/core/src/intelligence/store.ts`:
  - `AssumptionTransitionAction` type extended to include `'reopen'`.
  - `applyAssumptionTransition`: extend `ALLOWED` map with `reopen: ['validated', 'rejected']`; replace inline `nextStatus` ternary with module-scope `NEXT` map.
- `packages/core/src/cli/commands/assumption.ts`:
  - Extend the `for (const action of [...] as const)` loop array with `'reopen'`.
  - Replace inline past-tense ternary with `PAST` map.
  - Add `DESCRIPTIONS` map (or inline switch) for the `description()` strings.
- `packages/core/tests/intelligence/store-assumption-transition.test.ts`:
  - + `reopen` happy-path cases (validated→open, rejected→open).
  - + `reopen` refusal from `open` status; + already-covered refusal table updated with `reopen` cases.
- `packages/core/tests/cli/assumption-transition.test.ts`:
  - + `cadence assumption reopen` describe block (happy path validated→open, non-validated-or-rejected refusal, unknown id refusal).
- `packages/core/tests/intelligence/context.test.ts`:
  - + Extension of AC-11: reopened assumption RE-APPEARS in packet `assumptions[]` (count goes back up).

### NEW files

None. All test coverage extends existing files.

### Untouched

- `@cadence/types`: `AssumptionZ.status` enum (`'open' | 'validated' | 'rejected'`) already supports all three states. No schema change.
- `cli/commands/decision.ts`: decision has no status field — out of scope.
- `cli/commands/assumption.ts` `add` + `list` subcommands: unchanged.
- `cli/register.ts`: NO new top-level commands. Phase-31.1 cli-reference drift guard UNTRIPPED.
- `docs/reference/commands.md` `<!-- cadence:commands -->` marker block: UNCHANGED (no new top-level commands).
- `intelligence/render-assumption.ts`: Slice 9's three-bucket render already correctly displays a reopened assumption back under `## Open`. Zero change.
- `intelligence/context.ts` / `intelligence/render-context.ts`: Slice-5's `status === 'open'` filter automatically re-admits reopened assumptions. Zero change.
- `Slice-4a milestone code`: untouched.
- Slice-1 `addRecommendation` / `nextRecommendationId` etc.: untouched.

## Data Model

### Type signatures (after slice)

```ts
export type AssumptionTransitionAction = 'validate' | 'reject' | 'reopen';

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

`now` parameter remains optional and unused (no `updatedAt` field still).

### Allowed-status map

```ts
const ALLOWED: Record<AssumptionTransitionAction, Assumption['status'][]> = {
  validate: ['open'],
  reject:   ['open'],
  reopen:   ['validated', 'rejected'],
};
```

### Next-status map (new module-scope constant)

```ts
const NEXT: Record<AssumptionTransitionAction, Assumption['status']> = {
  validate: 'validated',
  reject:   'rejected',
  reopen:   'open',
};
```

Inside `applyAssumptionTransition`, `const nextStatus = NEXT[action];` replaces the prior ternary. Code stays branch-free as the action set grows.

### `applyAssumptionTransition` algorithm

```ts
1. target = ledger.assumptions.find(a => a.id === id)
2. if (!target) → { ok: false, error: `assumption ${id} not found` }
3. if (!ALLOWED[action].includes(target.status)) →
     { ok: false, error: `cannot ${action} assumption in status ${target.status}` }
4. nextStatus = NEXT[action]
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

Algorithm unchanged from Slice 9 in spirit; only the source of `nextStatus` is now a map lookup rather than a ternary.

### `runAssumptionTransition` flow

Unchanged from Slice 9 — read → apply → early-return on `!ok` → write atomic JSON + atomic MD.

### State-machine transition matrix (full)

| Pre-state | `validate <id>` | `reject <id>` | `reopen <id>` |
|---|---|---|---|
| id not in ledger | refuses `assumption <id> not found` | same | same |
| status='open' | → validated | → rejected | refuses `cannot reopen assumption in status open` |
| status='validated' | refuses `cannot validate ... validated` | refuses `cannot reject ... validated` | → open |
| status='rejected' | refuses `cannot validate ... rejected` | refuses `cannot reject ... rejected` | → open |

Matrix fully covered; every refusal path enumerated by Slice 9 still holds, plus the new `reopen-from-open` refusal.

## Render Policy

### `renderAssumptionsMd` UNCHANGED

Slice 9 already partitions by status into `## Open` / `## Validated` / `## Rejected`. A `reopen` flip merely moves an entry between buckets. Zero render-layer code change.

### `list` (CLI) UNCHANGED

Compact one-line shape preserved; entry's `status` column reflects the reopened state.

## Flow

### `cadence assumption reopen <id>`

```
CLI action (extends cli/commands/assumption.ts existing for-loop):
  for (const action of ['validate', 'reject', 'reopen'] as const) {
    cmd
      .command(`${action} <id>`)
      .description(DESCRIPTIONS[action])
      .action(async (id: string) => {
        try {
          const res = await runAssumptionTransition(process.cwd(), id, action);
          if (!res.ok) {
            process.stderr.write(`assumption ${action} refused: ${res.error}\n`);
            process.exitCode = 1;
            return;
          }
          process.stdout.write(`assumption ${id} → ${PAST[action]}\n`);
        } catch (err) {
          process.stderr.write(
            `assumption ${action} failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      });
  }

const DESCRIPTIONS: Record<AssumptionTransitionAction, string> = {
  validate: 'Mark an open assumption validated',
  reject:   'Mark an open assumption rejected',
  reopen:   'Reopen a validated or rejected assumption',
};

const PAST: Record<AssumptionTransitionAction, Assumption['status']> = {
  validate: 'validated',
  reject:   'rejected',
  reopen:   'open',
};
```

Same refused-vs-failed distinction as Slice 9. Stdout success: `assumption <id> → open` for reopen.

## Error Handling

| Failure | Path | Behavior |
|---|---|---|
| `<id>` not in ledger | `applyAssumptionTransition` returns `{ok:false, error:'assumption <id> not found'}` | exit 1, stderr `assumption reopen refused: assumption <id> not found\n` |
| Source status = `'open'` | `applyAssumptionTransition` returns `{ok:false, error:'cannot reopen assumption in status open'}` | exit 1, stderr `assumption reopen refused: cannot reopen assumption in status open\n` |
| Ledger JSON corrupt | thrown by Slice-5 reader | exit 1, stderr `assumption reopen failed: <zod error>\n` |
| Zod write validation fails | thrown by `writeAssumptionLedger` | exit 1, stderr `assumption reopen failed: <zod error>\n` |
| `mkdir`/`atomicWrite` failure | thrown by `writeAssumptionLedger` | exit 1, stderr `assumption reopen failed: <message>\n` |
| Ledger absent | reader returns `emptyAssumptionLedger()`; refuses `assumption <id> not found` | exit 1, stderr `assumption reopen refused: assumption <id> not found\n` |
| Missing `<id>` arg | commander usage error before action runs | non-zero exit |

**Strict read-only audit (re-affirmed):** same eight bullets as Slice 9. No `state.json` / `STATE.md` / `cadence spec new` / loop transition.

**No write on failure:** verified by Slice-9's `runAssumptionTransition` early-return; unchanged. AC-4 regression continues to hold (test asserts snapshot byte-equality on any refused transition, which now includes `reopen` cases).

## Acceptance Criteria

| AC | Statement | Linked test surface |
|---|---|---|
| AC-1 | `applyAssumptionTransition(ledger, id, 'reopen')` on `status='validated'` returns `{ok:true, ledger}` with target's status flipped to `'open'`; all other assumptions byte-equal; `createdAt` preserved. Same for source `'rejected'`. | `tests/intelligence/store-assumption-transition.test.ts` (extend Slice-9 file) |
| AC-2 | `applyAssumptionTransition` with `action='reopen'` refuses source status `'open'` with `{ok:false, error:'cannot reopen assumption in status open'}` — ledger unchanged. Refusal table extended: validate-from-open ✓ already (Slice 9), reject-from-open ✓ already, reopen-from-open NEW. | `store-assumption-transition.test.ts` |
| AC-3 | `applyAssumptionTransition` refuses unknown id with `{ok:false, error:'assumption <id> not found'}` for `action='reopen'` (mirrors AC-2 of Slice 9). | `store-assumption-transition.test.ts` |
| AC-4 | `runAssumptionTransition(root, id, 'reopen')` happy path: starting from a `'validated'` (or `'rejected'`) entry, post-call ledger has `status='open'`; entry returns to `## Open` bucket in MD. | `store-assumption-transition.test.ts` (extend existing successful-transition test) |
| AC-5 | CLI `cadence assumption reopen <id>` on a `'validated'` (or `'rejected'`) entry → exit 0, stdout `assumption <id> → open\n`; on `'open'` status → exit 1, stderr `assumption reopen refused: cannot reopen assumption in status open\n`; on unknown id → exit 1, stderr `assumption reopen refused: assumption <id> not found\n`. JSON post-success has `status:'open'`; MD has entry under `## Open`. | `tests/cli/assumption-transition.test.ts` (extend) |
| AC-6 | Slice-5/7 context-packet integration: after `validate`+`reopen` sequence, the reopened assumption RE-APPEARS in `synthesizeContextPacket('handoff' | 'review' | 'phase' | 'agent')` packet's `assumptions[]` (count rises back to its original cardinality). | `tests/intelligence/context.test.ts` (extend Slice-9's AC-11 block) |
| AC-7 | Phase-31.1 cli-reference drift guard still passes. NO new top-level commands; marker block UNCHANGED. | `tests/docs/cli-reference.test.ts` (passes unchanged) |
| AC-8 | Regression: Slice-9 `validate` + `reject` still work; existing Slice-9 + Slice-8 tests still pass. Refactor of `nextStatus` ternary → `NEXT` map is observably equivalent. | full `tests/` run; specifically `store-assumption-transition.test.ts` + `assumption-transition.test.ts` (existing cases UNCHANGED). |

## Testing (per CADENCE test idioms)

- **Spawned-CLI pattern** for `reopen` CLI tests (AC-5). Reuse the existing `run()` helper at the top of `tests/cli/assumption-transition.test.ts` verbatim — same module.
- **Pure-function vitest** for `applyAssumptionTransition` reopen cases (AC-1, AC-2, AC-3).
- **In-process `tempRepo` via `@cadence/testkit`** for `runAssumptionTransition` (AC-4) and the integration test (AC-6).
- **Test-coverage gate (Phase 14):** every AC maps to ≥1 linked test.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (16/16). Lint must be in every per-task check — slice-7/8/9 carried gotcha: subset checks miss `no-unused-vars` lint regressions.

## Commit Convention

Mirror Slice 9 conventional commits, one per task. Praxis workstream — NO `cadence draft/settle` loop, NO `.cadence/phases/*` artifacts.

```
docs: design — assumption reopen transition (Praxis Slice 10)
docs: implementation plan — assumption reopen (Praxis Slice 10)
feat(core): applyAssumptionTransition supports reopen (Slice 10)
feat(core): CLI cadence assumption reopen (Slice 10)
test(core): integration — reopened assumption re-enters context packets (Slice 10 AC-6)
docs: document assumption reopen + reconcile Slice-9 follow-ref (Slice 10)
```

Six commits, one per task. Smaller than Slice 9 because (a) no render-layer change, (b) no schema change, (c) no separate test-rewrite commit.

## Success Criteria

The slice succeeds if:

1. All 8 ACs pass.
2. Full turbo gate green at every task's done-bar (16/16; lint included).
3. Slice-9 § Out-of-scope `reopen` entry closed (reconcile strike + annotate).
4. Slice-9 § Follow-On "`cadence assumption reopen`" entry closed (reconcile strike + annotate).
5. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched (boundary audit).
6. Phase-31.1 cli-reference drift guard passes UNCHANGED (no new top-level commands).
7. Branch HEAD pushes clean through pre-push to `origin/praxis-intelligence-ledger`; PR #9 stays draft + unmerged.

## Decision Log

1. **Three-action union over Booleanizing.** `AssumptionTransitionAction = 'validate' | 'reject' | 'reopen'` — additive third literal, NOT a structural change. Same shape as Slice-4a milestone's two-action union (`accept` / `defer`); a third verb is a natural extension. No need to introduce a parameterized `TransitionAction<T>` generic — concrete unions are fine until a third subject (e.g. decision lifecycle) appears.
2. **`ALLOWED` + `NEXT` maps at module scope.** Pre-Slice-10 code used inline ternary `action === 'validate' ? 'validated' : 'rejected'` in the store and a parallel inline ternary in the CLI for the past-tense success line + description. Adding a third action makes ternary unreadable; map lookups are O(1), exhaustive (TS catches missing keys via `Record`), and add zero runtime cost. CLI gets a parallel `PAST` + `DESCRIPTIONS` map. Refactor is observably equivalent for the two existing actions (Slice-9 tests pass unchanged — AC-8).
3. **`reopen` from `'open'` is REFUSED** (strict, mirrors Slice 9 idempotent-same-state refusal). Output: `cannot reopen assumption in status open`. No silent no-op. Override path = nothing — `'open'` is already the target state, so the user must mean something else (most likely operator error).
4. **Both source statuses (`validated` + `rejected`) → same target (`'open'`).** No distinction at flip time. The `recommendation`, `createdAt`, `text`, and `id` fields all preserved; only `status` changes. Audit trail = git log of `assumptions.json`.
5. **No `@cadence/types` schema change.** Confirmed — `AssumptionZ.status` enum already covers all three states. The enum exhaustiveness check `Assumption['status']` in `NEXT` ensures the maps stay aligned if the enum ever grows.
6. **No render-layer change.** Slice 9 already established the three-bucket render with always-emit `_(none)_`. A reopened assumption simply re-renders under `## Open`. Verified by reading [`render-assumption.ts:14-39`](../../../packages/core/src/intelligence/render-assumption.ts) — partition is pure-functional on `status`, no special-case for "newly added vs reopened".
7. **No `--note <text>` on `reopen`.** Same rationale as Slice 9: schema additive (`lastNote?: string`) — out of scope for a transition slice. Operator rationale is captured in commit message + git log if needed.
8. **CLI `list` still UNCHANGED.** Compact one-line `${id}  ${status}  ${recId}  ${text}` shape; status column simply reflects the reopened value.
9. **Slice-5 packet contract preserved AGAIN.** No `context.ts` / `render-context.ts` change. `status === 'open'` filter automatically re-admits the reopened assumption — AC-6 integration test asserts the count goes back up. Same contract symmetry that Slice 9 leveraged for AC-11.
10. **No `cadence decision reopen` parallel slice in this scope.** Decisions have no status field today. Adding a decision-status field is a separate `@cadence/types` schema-additive slice; tracked in Slice 9 § Follow-On "decision status field + transitions" (still open).
11. **NO new top-level CLI commands.** `reopen` is a sub-subcommand on the existing `cadence assumption` parent (registered Slice 8). Phase-31.1 cli-reference drift guard marker block UNCHANGED. Symmetric with how Slice 9 added `validate` + `reject` without tripping the guard.
12. **Six-commit slice (one per task), not bundled.** Mirrors Slice 9's per-task-commit convention (Praxis workstream — no `cadence draft/settle` loop). Smaller than Slice 9 because there's no render layer change, no schema change, and no separate test-rewrite commit needed.

## Follow-On (not in this slice)

- ~~**`cadence decision` status field + transitions.** Decision has no status field today; would be a `@cadence/types` schema additive change.~~ **SHIPPED Slice 13** — see [decision status + transitions design](2026-05-20-cadence-decision-status-transitions-design.md).
- ~~**Auto-backfill `assumptionIds[]`/`decisionIds[]` arrays on Recommendation** (Slice-5/6 forward-ref still open).~~ **SHIPPED Slice 11** — see [`2026-05-20-cadence-rec-link-backfill-design.md`](2026-05-20-cadence-rec-link-backfill-design.md).
- **Update / delete commands** for assumption text editing.
- **Filter options on `list`** (`--status open|validated|rejected`).
- **`--note <text>` option on transitions** (schema additive: `lastNote?: string`).
- **`updatedAt` timestamp field** on `AssumptionZ` (schema additive).
- **Bulk transitions** (`cadence assumption reopen --all-rec <recId>`).
- **Rec↔phase linkage** — still open from Slice 7/8.
- **Auto-dispatch / subagent routing** — forever-deferred per parent design.
