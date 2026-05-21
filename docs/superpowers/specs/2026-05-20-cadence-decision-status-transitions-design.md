# CADENCE Decision Status Field + Transitions — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Slice:** 13 (follow-on to Slice 10 — Assumption Status Transitions complete; Slice 11 — Rec Link Backfill; Slice 12 — Rec MD Render Links)
**Predecessor slice docs:**
- [`2026-05-20-cadence-assumption-transitions-design.md`](2026-05-20-cadence-assumption-transitions-design.md) (Slice 9 — `validate`/`reject` from `'open'`; established `ALLOWED`/`NEXT` map template + bucket render contract)
- [`2026-05-20-cadence-assumption-reopen-design.md`](2026-05-20-cadence-assumption-reopen-design.md) (Slice 10 — completed assumption status matrix; Follow-On listed "`cadence decision` status field + transitions" as parallel symmetric work)
- [`2026-05-20-cadence-assumption-decision-intake-design.md`](2026-05-20-cadence-assumption-decision-intake-design.md) (Slice 8 — established `cadence decision add | list` parent + ledger schema; explicitly deferred status field to "a separate `@cadence/types` schema-additive slice")
- [`2026-05-20-cadence-rec-link-backfill-design.md`](2026-05-20-cadence-rec-link-backfill-design.md) (Slice 11 — `deriveRecommendationLinks` populates `decisionIds[]`; § Follow-On listed decision status as next)
- [`2026-05-17-cadence-context-packets-design.md`](2026-05-17-cadence-context-packets-design.md) (Slice 5 — assumption `status === 'open'` filter precedent; decision lacks parallel filter today)

## Summary

**Slice 13** adds a `status` field to `IntelligenceDecisionZ` with three states (`'active' | 'superseded' | 'rescinded'`), three CLI transition verbs (`supersede`, `rescind`, `reactivate`), bucket-partitioned `DECISIONS.md` render mirroring Slice-9's three-bucket assumption render, and a `status === 'active'` context-packet filter mirroring Slice-5's assumption filter. Closes Slice-8/9/10/11 cross-slice "decision status field + transitions" follow-ref entries.

- **Schema additive, back-compat.** `status: z.enum(['active', 'superseded', 'rescinded']).default('active')`. Pre-Slice-13 decisions on disk parse with `status: 'active'` automatically (Zod default kicks in on `undefined` input). First post-Slice-13 write normalizes the field; no migration command needed.
- **`addIntelligenceDecision` defaults to `'active'`.** At add-time, decisions are in force.
- **Three transitions** mirror Slice-9/10 pattern verbatim:
  - `cadence decision supersede <id>`: `'active' → 'superseded'`. Refused from non-`'active'`.
  - `cadence decision rescind <id>`: `'active' → 'rescinded'`. Refused from non-`'active'`.
  - `cadence decision reactivate <id>`: `'superseded' | 'rescinded' → 'active'`. Refused from `'active'`.
- **Bucket render**: `DECISIONS.md` partitions into 3 always-emit sections `## Active` / `## Superseded` / `## Rescinded` with `_(none)_` for empty buckets. Per-entry heading demoted to `###`. Mirrors Slice-9 assumption render verbatim.
- **Context-packet filter**: decisions are filtered to `status === 'active'` for parity with Slice-5's assumption `status === 'open'` filter. Superseded/rescinded decisions disappear from `phase`/`handoff`/`review`/`agent` packets. Packet schema gains `status: z.literal('active')` field for symmetry with the existing assumption packet shape.
- **Untied decisions unchanged.** `recommendationId` optional; the existing untied path keeps its byte-equal recommendation-ledger guarantee. Untied decisions still get a `status` field.

It does **not** change `Recommendation.decisionIds[]` semantics (Slice-11 `deriveRecommendationLinks` stays status-agnostic — link arrays mirror persisted ledger; Slice-11 Decision Log #2 precedent), change Slice-12 `- decisions:` MD bullet (renders all linked ids regardless of status — operator cross-references `DECISIONS.md` buckets), modify `cadence decision add | list` subcommands, modify `cadence recommendation`/`milestone`/`spec`/loop commands, touch `state.json` / `STATE.md` / `cadence spec new` / loop transition, add `--note` / `lastNote` / `supersededBy` / `rescindedAt` fields, or perform a fresh fs/git scan.

## Product Boundary (parent design's #1 risk: do not rebuild / drive the loop)

Strict read-only outside the decision ledger + context packet + recommendation MD re-render side effects:

- Writes ONLY to `.cadence/intelligence/{decisions.json, DECISIONS.md}` (transitions) + `.cadence/intelligence/{recommendations.json, RECOMMENDATIONS.md}` indirectly via Slice-11 re-derivation when `addIntelligenceDecision` is called (unchanged from Slice 11; transitions do NOT re-derive — link arrays are status-agnostic).
- READS ONLY `decisions.json` (via Slice-5 reader). NO recommendation-ledger read at transition time (FK was checked at `add` time per Slice 8; transitions take `<id>` directly).
- **NEVER** calls `cadence spec new`, **NEVER** reads/writes `state.json` / `STATE.md`, **NEVER** transitions `SPEC→DRAFT→BUILD→SETTLE`.
- The new subcommands change no loop state and force no transition.

## Scope

### In scope

- `@cadence/types` schema additive: `IntelligenceDecisionZ.status` enum + default; `ContextPacketZ.decisions[].status: z.literal('active')`.
- `addIntelligenceDecision` populates `status: 'active'` at add-time.
- New pure helper `applyDecisionTransition(ledger, id, action, now?): DecisionTransitionResult` in `intelligence/store.ts`.
- New IO glue `runDecisionTransition(root, id, action): Promise<DecisionTransitionResult>` in `intelligence/store.ts`.
- New exported types: `DecisionTransitionAction = 'supersede' | 'rescind' | 'reactivate'`; `DecisionTransitionResult`.
- `ALLOWED` + `NEXT` maps at module scope (same pattern as Slice-10 `ASSUMPTION_TRANSITION_*` constants).
- Three new CLI subcommands on `cadence decision`: `supersede <id>` / `rescind <id>` / `reactivate <id>` (registered via `for (const action of [...] as const)` loop; mirror of Slice-10 `cli/commands/assumption.ts:55-81`).
- CLI module-scope `DECISION_TRANSITION_DESCRIPTIONS` + `DECISION_TRANSITION_PAST` maps.
- Extend `renderDecisionsMd`: status-partitioned 3-section render, always-emit `_(none)_` for empty buckets, per-entry heading demoted to `###`. Mirrors Slice 9's `renderAssumptionsMd` rewrite verbatim.
- Add `status === 'active'` filter to the decisions branch of `synthesizeContextPacket` in `context.ts`. Decision-packet shape gains `status: 'active' as const` for symmetry with assumption packet.
- Update existing Slice-8 `decision add | list` tests where they assert decision shape (now includes `status: 'active'`).
- Update existing Slice-12 integration test asserting `- decisions:` MD bullet — the rec MD remains unchanged because Slice-12 bullets render all linked ids regardless of status (Slice 11/12 decision precedent).
- Test coverage per ACs.

### Out of scope (later / parked)

- A `--note <text>` option carrying rationale alongside the flip. Schema would need `lastNote?: string`; out of scope.
- `supersededBy <id>` field linking the replacement decision. Useful but additive; defer.
- `rescindedAt` / `updatedAt` timestamp fields.
- Bulk transitions (`cadence decision supersede --all-rec <recId>`).
- Filter options on `list` (`--status active|superseded|rescinded`).
- An update/edit command (`cadence decision update <id> --title|--rationale ...`).
- Status filtering on Slice-12 `- decisions:` MD bullet (consumer-side; defer).
- Status filtering on Slice-11 `deriveRecommendationLinks` (link arrays stay status-agnostic; Slice-11 precedent).
- A `state.json` / loop transition / `cadence spec new` side effect of any kind.
- Auto-dispatch / subagent routing (parent design's forever-deferred risk).

## Architecture

### MODIFIED files

- `packages/types/src/intelligence.ts`:
  - `IntelligenceDecisionZ` gains `status: z.enum(['active', 'superseded', 'rescinded']).default('active')`.
  - `ContextPacketZ.decisions[]` gains `status: z.literal('active')`.
- `packages/core/src/intelligence/store.ts`:
  - `addIntelligenceDecision` sets `status: 'active'` on the new decision entity.
  - + `DecisionTransitionAction` type.
  - + `DecisionTransitionResult` discriminated union.
  - + `DECISION_TRANSITION_ALLOWED` + `DECISION_TRANSITION_NEXT` module-scope maps.
  - + `applyDecisionTransition(ledger, id, action, now?): DecisionTransitionResult` — pure.
  - + `runDecisionTransition(root, id, action): Promise<DecisionTransitionResult>` — IO glue.
- `packages/core/src/intelligence/render-decision.ts`:
  - `renderDecisionsMd` body rewritten: empty-ledger path unchanged; non-empty path partitions by status into 3 always-emit sections with `_(none)_` empty bucket marker.
- `packages/core/src/cli/commands/decision.ts`:
  - + `for (const action of ['supersede', 'rescind', 'reactivate'] as const)` loop adding 3 new subcommands. Direct mirror of `cli/commands/assumption.ts:55-81`.
  - + module-scope `DECISION_TRANSITION_DESCRIPTIONS` + `DECISION_TRANSITION_PAST` maps.
- `packages/core/src/intelligence/context.ts`:
  - Decisions filter gains `d.status === 'active'` predicate; map projects `status: 'active' as const`.
- `packages/core/tests/intelligence/store.test.ts`:
  - Existing `addIntelligenceDecision` tests get one new matcher: `expect(d.status).toBe('active')`.
- `packages/core/tests/intelligence/render-decision.test.ts` (if exists; else create):
  - Existing tests UPDATED to match the new bucket shape; ADD bucket section + empty-bucket + section-order tests.
- `packages/core/tests/cli/decision.test.ts`:
  - Existing decision add/list tests get a `status` matcher where they assert decision shape (back-compat — default).
- `packages/core/tests/intelligence/context.test.ts`:
  - + Integration test: `supersede` a tied decision → it disappears from `phase`/`handoff` packet. `reactivate` it → it returns.

### NEW files

- `packages/core/tests/intelligence/store-decision-transition.test.ts` — `applyDecisionTransition` + `runDecisionTransition` unit tests.
- `packages/core/tests/cli/decision-transition.test.ts` — spawn-CLI tests for `supersede` + `rescind` + `reactivate`.

### Untouched

- `cli/commands/assumption.ts`: untouched.
- `intelligence/render.ts` (rec MD): unchanged. Slice-12 `- decisions:` bullet renders all linked ids regardless of status. (Slice-11/12 precedent — link arrays + render bullets are status-agnostic; status partitioning lives in `DECISIONS.md` buckets.)
- `intelligence/store.ts` `deriveRecommendationLinks`: unchanged. Same Slice-11 precedent.
- `cli/register.ts`: NO new top-level commands. Phase-31.1 cli-reference drift guard UNTRIPPED.
- `docs/reference/commands.md` `<!-- cadence:commands -->` marker block: UNCHANGED.
- Slice-1 `addRecommendation` / `nextRecommendationId` etc.: untouched.

## Data Model

### Schema diff

```ts
// IntelligenceDecisionZ after:
export const IntelligenceDecisionZ = z.object({
  id: z.string().min(1),
  recommendationId: z.string().optional(),
  title: z.string().min(1),
  rationale: z.string().min(1),
  status: z.enum(['active', 'superseded', 'rescinded']).default('active'),  // NEW
  decidedAt: z.string().datetime({ offset: true }),
});
```

`.default('active')` kicks in when the field is `undefined` at parse-time. Pre-Slice-13 decisions on disk lack the field → parse adds it → first write normalizes the JSON. No migration.

```ts
// ContextPacketZ.decisions[] after:
decisions: z.array(
  z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    rationale: z.string().min(1),
    recommendationId: z.string().optional(),
    status: z.literal('active'),  // NEW
  }),
),
```

### Type signatures (in `store.ts`)

```ts
export type DecisionTransitionAction = 'supersede' | 'rescind' | 'reactivate';

export type DecisionTransitionResult =
  | { ok: true; ledger: IntelligenceDecisionLedger }
  | { ok: false; error: string };

export function applyDecisionTransition(
  ledger: IntelligenceDecisionLedger,
  id: string,
  action: DecisionTransitionAction,
  now?: Date,
): DecisionTransitionResult;

export async function runDecisionTransition(
  root: string,
  id: string,
  action: DecisionTransitionAction,
): Promise<DecisionTransitionResult>;
```

`now` parameter optional and unused (no `updatedAt` field). Kept for shape symmetry with Slice-9/10 assumption transitions.

### Allowed-status map

```ts
const DECISION_TRANSITION_ALLOWED: Record<
  DecisionTransitionAction,
  IntelligenceDecision['status'][]
> = {
  supersede:  ['active'],
  rescind:    ['active'],
  reactivate: ['superseded', 'rescinded'],
};

const DECISION_TRANSITION_NEXT: Record<
  DecisionTransitionAction,
  IntelligenceDecision['status']
> = {
  supersede:  'superseded',
  rescind:    'rescinded',
  reactivate: 'active',
};
```

Strict: idempotent same-state refused, mirroring Slice-9/10.

### `applyDecisionTransition` algorithm

```ts
1. target = ledger.decisions.find(d => d.id === id)
2. if (!target) → { ok: false, error: `decision ${id} not found` }
3. if (!DECISION_TRANSITION_ALLOWED[action].includes(target.status)) →
     { ok: false, error: `cannot ${action} decision in status ${target.status}` }
4. nextStatus = DECISION_TRANSITION_NEXT[action]
5. return {
     ok: true,
     ledger: {
       schemaVersion: 1,
       decisions: ledger.decisions.map(d =>
         d.id === id ? { ...d, status: nextStatus } : d
       ),
     },
   }
```

Pure. Returns a new ledger. Non-target decisions byte-equal (`.map` preserves reference for non-target items).

### `runDecisionTransition` flow

```
runDecisionTransition(root, id, action):
  ├─ ledger = await readIntelligenceDecisionLedger(root)
  ├─ res = applyDecisionTransition(ledger, id, action, new Date())
  ├─ if (!res.ok) return res                              // NO write on failure
  ├─ await writeIntelligenceDecisionLedger(root, res.ledger)   // atomic JSON + atomic MD
  └─ return res
```

Mirrors `runAssumptionTransition`. NO Slice-11 `deriveRecommendationLinks` re-derive — link arrays are status-agnostic per Slice-11 Decision Log; the `recommendationId` link doesn't change under transition.

### State-machine transition matrix

| Pre-state | `supersede` | `rescind` | `reactivate` |
|---|---|---|---|
| id not in ledger | refuses `decision <id> not found` | same | same |
| status='active' | → superseded | → rescinded | refuses `cannot reactivate decision in status active` |
| status='superseded' | refuses | refuses | → active |
| status='rescinded' | refuses | refuses | → active |

## Render Policy

### `renderDecisionsMd` extension

Empty-ledger path UNCHANGED: header + blockquote + `No decisions recorded.` early-return preserved.

Non-empty path NEW: partitions ledger by status, always-emits 3 sections in fixed order with `_(none)_` for empty buckets. Mirrors Slice-9's `renderAssumptionsMd` rewrite verbatim.

```ts
export function renderDecisionsMd(ledger: IntelligenceDecisionLedger): string {
  const lines: string[] = [
    '# CADENCE Decisions',
    '',
    '> Generated from `.cadence/intelligence/decisions.json`.',
    '',
  ];
  if (ledger.decisions.length === 0) {
    lines.push('No decisions recorded.', '');
    return lines.join('\n');
  }

  const active     = ledger.decisions.filter((d) => d.status === 'active');
  const superseded = ledger.decisions.filter((d) => d.status === 'superseded');
  const rescinded  = ledger.decisions.filter((d) => d.status === 'rescinded');

  const SECTIONS: Array<[string, IntelligenceDecision[]]> = [
    ['## Active',     active],
    ['## Superseded', superseded],
    ['## Rescinded',  rescinded],
  ];

  for (const [header, items] of SECTIONS) {
    lines.push(header, '');
    if (items.length === 0) {
      lines.push('_(none)_');
      lines.push('');
      continue;
    }
    for (const d of items) {
      lines.push(`### ${d.id} — ${d.title}`);
      lines.push('');
      if (d.recommendationId) lines.push(`- recommendation: ${d.recommendationId}`);
      lines.push(`- decided: ${d.decidedAt}`);
      lines.push('');
      lines.push(d.rationale);
      lines.push('');
    }
  }
  return lines.join('\n');
}
```

### Section order

Active → Superseded → Rescinded. Fixed. Reading-order: active in-force decisions first, then audited/historical.

### Insertion order within each bucket

Preserved from ledger (chronological by `decidedAt`).

### `list` (CLI) — gains status column

`cadence decision list` compact line now: `${id}  ${status}  ${recommendationId ?? '—'}  ${title}`. Same minimal column-add Slice 8/9 chose for assumption.

## Flow

### `cadence decision supersede|rescind|reactivate <id>`

```ts
const DECISION_TRANSITION_DESCRIPTIONS: Record<DecisionTransitionAction, string> = {
  supersede:  'Mark an active decision superseded',
  rescind:    'Mark an active decision rescinded',
  reactivate: 'Reactivate a superseded or rescinded decision',
};

const DECISION_TRANSITION_PAST: Record<
  DecisionTransitionAction,
  IntelligenceDecision['status']
> = {
  supersede:  'superseded',
  rescind:    'rescinded',
  reactivate: 'active',
};

for (const action of ['supersede', 'rescind', 'reactivate'] as const) {
  cmd
    .command(`${action} <id>`)
    .description(DECISION_TRANSITION_DESCRIPTIONS[action])
    .action(async (id: string) => {
      try {
        const res = await runDecisionTransition(process.cwd(), id, action);
        if (!res.ok) {
          process.stderr.write(`decision ${action} refused: ${res.error}\n`);
          process.exitCode = 1;
          return;
        }
        process.stdout.write(
          `decision ${id} → ${DECISION_TRANSITION_PAST[action]}\n`,
        );
      } catch (err) {
        process.stderr.write(
          `decision ${action} failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
```

Refused-vs-failed distinction matches Slice 9/10 precedent.

### Context-packet decisions filter

```ts
const decisions = sources.decisions
  .filter((d) =>
    d.status === 'active'
    && (scope === 'handoff' || scope === 'review'
      ? true
      : d.recommendationId !== undefined && selectedIds.has(d.recommendationId)),
  )
  .map((d) => {
    const out: ContextPacket['decisions'][number] = {
      id: d.id,
      title: oneLine(d.title),
      rationale: oneLine(d.rationale),
      status: 'active' as const,
    };
    if (d.recommendationId !== undefined) out.recommendationId = d.recommendationId;
    return out;
  });
```

Symmetric with Slice-5 assumption filter (`a.status === 'open' && inScope(...)`). The packet-shape `status: 'active' as const` field is the runtime narrow + ts proof.

## Error Handling

| Failure | Path | Behavior |
|---|---|---|
| `<id>` not in ledger | `applyDecisionTransition` returns `{ok:false, error:'decision <id> not found'}` | exit 1, stderr `decision <action> refused: decision <id> not found\n` |
| Wrong source status | `applyDecisionTransition` returns `{ok:false, error:'cannot <action> decision in status <s>'}` | exit 1, stderr `decision <action> refused: cannot <action> decision in status <s>\n` |
| Ledger JSON corrupt | thrown by Slice-5 reader | exit 1, stderr `decision <action> failed: <zod error>\n` |
| Zod write validation fails | thrown by `writeIntelligenceDecisionLedger` | exit 1, stderr `decision <action> failed: <zod error>\n` |
| `mkdir`/`atomicWrite` failure | thrown by `writeIntelligenceDecisionLedger` | exit 1, stderr `decision <action> failed: <message>\n` |
| Ledger file absent | reader returns `emptyIntelligenceDecisionLedger()`; refuses `decision <id> not found` | exit 1, stderr `decision <action> refused: decision <id> not found\n` |
| Missing `<id>` arg | commander usage error before action runs | non-zero exit |

**Strict read-only audit (re-affirmed):**
- Writes ONLY to `.cadence/intelligence/{decisions.json, DECISIONS.md}`.
- NO recommendation-ledger write at transition time.
- NO `state.json` / `STATE.md` mutation.
- NO `cadence spec new` invocation.
- NO loop transition.
- NO file content reads outside ledger JSON.
- NO fresh fs/git scan.

**No write on failure:** verified by mirror to `runAssumptionTransition`. AC-4 test asserts snapshot byte-equality of `decisions.json` + `DECISIONS.md` pre/post a refused transition.

## Acceptance Criteria

| AC | Statement | Linked test surface |
|---|---|---|
| AC-1 | `applyDecisionTransition(ledger, id, 'supersede')` on `status='active'` returns `{ok:true, ledger}` with target's status flipped to `'superseded'`; all other decisions byte-equal; `decidedAt`/`recommendationId`/`title`/`rationale` preserved. Same shape for `'rescind'`→`'rescinded'` and `'reactivate'`→`'active'`. | `tests/intelligence/store-decision-transition.test.ts` |
| AC-2 | `applyDecisionTransition` refuses unknown id with `{ok:false, error:'decision <id> not found'}` — ledger unchanged. | `store-decision-transition.test.ts` |
| AC-3 | `applyDecisionTransition` refuses wrong source status with `{ok:false, error:'cannot <action> decision in status <s>'}` — ledger unchanged. Six cases enumerated: supersede-from-superseded, supersede-from-rescinded, rescind-from-superseded, rescind-from-rescinded, reactivate-from-active (idempotent), and one unknown-id case. | `store-decision-transition.test.ts` |
| AC-4 | `runDecisionTransition(root, id, action)` reads ledger → applyTransition → on ok, writes new ledger (atomic JSON + atomic `DECISIONS.md`); on !ok, NO write side effects. Pre-call snapshot of `decisions.json` + `DECISIONS.md` is byte-equal to post-call snapshot after refused call. | `store-decision-transition.test.ts` |
| AC-5 | `renderDecisionsMd` (non-empty ledger) partitions by status into 3 always-emit sections `## Active` / `## Superseded` / `## Rescinded` (fixed order). Each populated section emits per-entry `### ${id} — ${title}` heading + `- recommendation:` (if set) + `- decided:` bullets, then rationale on its own line. Empty section emits `_(none)_`. | `tests/intelligence/render-decision.test.ts` |
| AC-6 | Empty-ledger path UNCHANGED: header + blockquote + `No decisions recorded.` early-return preserved. | `render-decision.test.ts` |
| AC-7 | CLI `cadence decision supersede <id>` on `'active'` decision → exit 0, stdout `decision <id> → superseded\n`; on missing id → exit 1, stderr `decision supersede refused: decision <id> not found\n`; on non-`'active'` status → exit 1, stderr `decision supersede refused: cannot supersede decision in status <s>\n`. JSON post-success has `status:'superseded'`; MD has entry under `## Superseded`. | `tests/cli/decision-transition.test.ts` |
| AC-8 | CLI `cadence decision rescind <id>` symmetric — same shape, opposite verb/past-tense. | `tests/cli/decision-transition.test.ts` |
| AC-9 | CLI `cadence decision reactivate <id>` on `'superseded'` (or `'rescinded'`) → exit 0, stdout `decision <id> → active\n`; on `'active'` → exit 1 refused. | `tests/cli/decision-transition.test.ts` |
| AC-10 | Back-compat parse: a `decisions.json` file written pre-Slice-13 (i.e. WITHOUT a `status` field) is parsed by `readIntelligenceDecisionLedger` and every entry gets `status: 'active'`. First post-Slice-13 write normalizes the JSON. | `tests/intelligence/store.test.ts` (new test using `writeFile` to plant a legacy-shape JSON, then read it) |
| AC-11 | Context-packet status filter: `supersede` (or `rescind`) a tied decision → it DISAPPEARS from `synthesizeContextPacket('handoff' or 'review' or 'phase' or 'agent')` packet's `decisions[]`. `reactivate` it → it REAPPEARS. Mirrors Slice-9 AC-11 + Slice-10 AC-6 for assumptions. | `tests/intelligence/context.test.ts` |
| AC-12 | Phase-31.1 cli-reference drift guard still passes. NO new top-level commands; marker block UNCHANGED. | `tests/docs/cli-reference.test.ts` |
| AC-13 | Regression: Slice-8 `add`/`list`, Slice-11 backfill, Slice-12 rec MD `- decisions:` bullet all still work. The Slice-12 `- decisions:` bullet renders all linked ids regardless of status (link arrays + render bullet remain status-agnostic per Slice-11/12 precedent). | extended Slice-12 integration test in `store.test.ts` |
| AC-14 | `addIntelligenceDecision` populates `status: 'active'` on the new entity (both tied + untied paths). | `tests/intelligence/store.test.ts` (new matcher on existing tests) |

## Testing (per CADENCE test idioms)

- **Spawned-CLI pattern** for CLI tests (AC-7, AC-8, AC-9). Reuse the local `run()` helper from `tests/cli/decision.test.ts` verbatim.
- **Pure-function vitest** for `applyDecisionTransition` (AC-1, AC-2, AC-3) and `renderDecisionsMd` (AC-5, AC-6).
- **In-process `tempRepo` via `@cadence/testkit`** for `runDecisionTransition` (AC-4), back-compat (AC-10), and context-packet integration (AC-11).
- **Test-coverage gate (Phase 14):** every AC maps to ≥1 linked test.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (16/16). Lint must be in every per-task check — Slice-4a/Slice-6/Slice-7/Slice-8/Slice-9 carried gotcha: subset checks miss `no-unused-vars` lint regressions.
- **No-write-on-failure isolation (AC-4):** test takes a snapshot of `decisions.json` + `DECISIONS.md` BEFORE the refused transition call, attempts the refused call, then asserts both files are byte-equal to the snapshot.
- **Slice-12 integration test extension (AC-13):** `- decisions:` bullet renders even when decision is `'superseded'`. Add an explicit case.

## Commit Convention

Mirror Slice 9 / 10 / 11 / 12 per-task commits. Praxis workstream — NO `cadence draft/settle` loop.

```
docs: design — decision status field + transitions (Praxis Slice 13)
docs: implementation plan — decision status + transitions (Praxis Slice 13)
feat(types): IntelligenceDecisionZ.status + packet decision status (Slice 13)
feat(core): applyDecisionTransition + runDecisionTransition (Slice 13)
feat(core): renderDecisionsMd status-partitioned bucket sections (Slice 13)
feat(core): CLI cadence decision supersede + rescind + reactivate (Slice 13)
feat(core): context packet filters decisions to status=active (Slice 13)
test(core): integration — supersede/reactivate cycle in context packets (Slice 13 AC-11)
docs: document decision status + transitions + reconcile Slice-8/9/10/11 follow-refs (Slice 13)
```

Nine commits (medium-large slice). Bigger than Slice 9 (~6 commits) because (a) schema change carries its own commit, (b) context-packet filter is a third surface beyond store + render + CLI, (c) more reconcile work across 4 prior slices.

## Success Criteria

The slice succeeds if:

1. All 14 ACs pass.
2. Full turbo gate green at every task's done-bar (16/16; lint included).
3. Slice-8 § "Status-transition commands for `cadence decision` — separate follow-on" reconciled.
4. Slice-9 § Follow-On "`cadence decision` status field + transitions" reconciled.
5. Slice-10 § Follow-On "`cadence decision` status field + transitions" reconciled.
6. Slice-11 § Follow-On "`cadence decision` status field + transitions" reconciled.
7. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched (boundary audit).
8. Phase-31.1 cli-reference drift guard passes UNCHANGED.
9. Pre-Slice-13 `decisions.json` files on disk parse cleanly via Zod default; first re-write normalizes (verified by AC-10).
10. Branch HEAD pushes clean through pre-push to `origin/praxis-intelligence-ledger`; PR #9 stays draft + unmerged.

## Decision Log

1. **Three states (`'active' | 'superseded' | 'rescinded'`) and three transitions.** Picked over the simpler `'active' | 'superseded'` two-state pair because Slice 9 lesson held: ship the full transition matrix in one slice (`open ↔ {validated, rejected}` for assumptions; `active ↔ {superseded, rescinded}` for decisions). Avoids the Slice-9→Slice-10 follow-up split. `rescinded` and `superseded` are semantically distinct: rescinded = withdrawn without replacement; superseded = replaced by a later decision (explicit linkage to the replacement is deferred via `supersededBy` follow-on).
2. **Default status = `'active'`.** Decisions are recorded with `decidedAt` already required at add-time; they are in force the moment they exist. The `'open'`-equivalent (tentative/proposed) is rejected — that's what assumptions are for. If you want a tentative decision, file an assumption first; validate it; THEN record the decision. The two ledgers have intentionally different lifecycles.
3. **`.default('active')` Zod additive, NOT a required-field migration.** Pre-Slice-13 `decisions.json` files on disk lack the `status` field. `.default()` makes Zod parse them cleanly and inject `'active'`. First post-Slice-13 write normalizes. No migration command, no operator action, no roadmap-of-pain.
4. **NO `deriveRecommendationLinks` filter on status.** Link arrays mirror persisted decisions (Slice-11 Decision Log #2 precedent). Filtering at link-derivation time would introduce JSON↔MD drift between `recommendations.json` (all linked ids) and the rec entry's effective active decisions. Status partitioning lives in `DECISIONS.md` buckets; operator cross-references.
5. **NO change to Slice-12 `- decisions:` MD bullet.** It renders all linked ids regardless of status — same Slice-11/12 precedent. Operator who wants active-only joins via `DECISIONS.md`.
6. **Context-packet filter DOES apply.** Symmetric with Slice-5 assumption `status === 'open'` filter. Superseded/rescinded decisions are historical record, not operative context; packets should reflect what's currently in force. Packet schema gains `status: z.literal('active')` for symmetry with the existing assumption packet shape.
7. **Per-subject `DecisionTransitionResult` (not generalized).** Same shape as Slice-9 `AssumptionTransitionResult`, different ledger type. Generalization would refactor Slice-9 / Slice-10 code — scope creep. If a 4th transitioning subject lands, extract `TransitionResult<L>` then.
8. **No `--note <text>` on transitions.** Same rationale as Slice 9/10: schema additive (`lastNote?: string`) — out of scope. Operator rationale captured in commit / git log.
9. **No `supersededBy <id>` linking field.** Useful but separate concern (decision-graph). Deferred.
10. **`runDecisionTransition` does NOT call `deriveRecommendationLinks`.** Status flip alone is the record; the `recommendationId` link is invariant under transition. No need to re-derive — the link arrays are already correct.
11. **CLI `list` gains a `status` column** to match Slice-8 assumption-list shape: `${id}  ${status}  ${recId ?? '—'}  ${title}`. The compact terminal-glance surface needs the status; only the MD render gets buckets.
12. **NO new top-level CLI commands.** Three transitions are subcommands on existing `cadence decision` parent (registered Slice 8). Phase-31.1 cli-reference drift guard marker block UNCHANGED.
13. **Always-emit 3 sections (Active / Superseded / Rescinded) in fixed order, with `_(none)_` for empty buckets.** Matches Slice-9 assumption render precedent. Structure stable regardless of ledger contents.
14. **No back-compat shim in code beyond `.default()`.** Tests cover legacy-JSON parse (AC-10). No "if no status, treat as active" runtime branch needed — Zod handles it at parse-time.
15. **No `RECOMMENDATIONS.md` re-render triggered by decision transitions.** Slice-12 bullets render all linked ids regardless of status; status flip doesn't change link arrays; no `recommendations.json` change; no rec MD re-render needed. Saves a redundant disk write.

## Follow-On (not in this slice)

- **`supersededBy <id>`** linking field — explicit graph of decision replacement.
- **`--note <text>`** option on transitions (schema additive: `lastNote?: string`).
- **`updatedAt` timestamp** on `IntelligenceDecisionZ` (schema additive).
- **Bulk transitions** (`cadence decision supersede --all-rec <recId>`).
- **Filter options on `list`** (`--status active|superseded|rescinded`).
- **`cadence intelligence reconcile`** standalone admin command (Slice-11 Follow-On still open).
- **Rec↔phase linkage** — still open from Slice 7+ designs.
- **`cadence recommendation show <id>`** CLI deep-dive — would benefit from active-only filtering of linked decisions; needs separate design.
- **Status-aware variant of Slice-12 `- decisions:` MD bullet** (e.g. `- decisions: dec-1 (active), dec-2 (superseded)`).
- **`update`/`delete`** commands for either subject.
- **Auto-dispatch / subagent routing** — forever-deferred per parent design.
