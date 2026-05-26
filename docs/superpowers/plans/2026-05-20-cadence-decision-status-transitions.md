# CADENCE Decision Status Field + Transitions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `status` field + 3 transitions + bucket render + context filter to `cadence decision`, completing decision-side symmetry with assumption (Slice 8/9/10). Closes Slice-8/9/10/11 cross-slice decision-status follow-refs.

**Architecture:** Schema additive (`.default('active')`, no migration). Mirrors Slice-9/10 transition template verbatim with three differences: (a) per-subject `DecisionTransitionResult` type; (b) three actions not two; (c) context-packet decisions filter added in parallel (Slice-5 assumption-filter precedent).

**Tech Stack:** TypeScript, Zod v3, vitest, Commander; pnpm + turbo.

**Spec:** [`docs/superpowers/specs/2026-05-20-cadence-decision-status-transitions-design.md`](../specs/2026-05-20-cadence-decision-status-transitions-design.md)

**Branch:** `praxis-intelligence-ledger` (long-lived Praxis workstream; PR #9 stays draft).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/types/src/intelligence.ts` | Modify | `IntelligenceDecisionZ` gets `status: z.enum(...).default('active')`; `ContextPacketZ.decisions[]` gets `status: z.literal('active')`. |
| `packages/core/src/intelligence/store.ts` | Modify | `addIntelligenceDecision` sets `status:'active'`. + `DecisionTransitionAction`/`DecisionTransitionResult` types. + `DECISION_TRANSITION_ALLOWED`/`DECISION_TRANSITION_NEXT` maps. + `applyDecisionTransition` pure. + `runDecisionTransition` IO glue. |
| `packages/core/src/intelligence/render-decision.ts` | Modify | Rewrite to bucket-partition into `## Active` / `## Superseded` / `## Rescinded` always-emit sections; per-entry heading `###`. Mirrors Slice-9 `renderAssumptionsMd`. |
| `packages/core/src/cli/commands/decision.ts` | Modify | + `DECISION_TRANSITION_DESCRIPTIONS`/`DECISION_TRANSITION_PAST` maps. + `for (const action of ['supersede','rescind','reactivate'] as const)` loop. `list` line gains status column. |
| `packages/core/src/intelligence/context.ts` | Modify | Decisions filter gains `d.status === 'active'`. Map projects `status:'active' as const`. |
| `packages/core/tests/intelligence/store-decision-transition.test.ts` | Create | AC-1, AC-2, AC-3, AC-4. |
| `packages/core/tests/cli/decision-transition.test.ts` | Create | AC-7, AC-8, AC-9. |
| `packages/core/tests/intelligence/render-decision.test.ts` | Modify (or create) | AC-5, AC-6. |
| `packages/core/tests/intelligence/store.test.ts` | Modify | + AC-10 (back-compat parse) + AC-13 (Slice-12 bullet unchanged) + AC-14 (status:'active' on add). |
| `packages/core/tests/cli/decision.test.ts` | Modify | + status column on list output. |
| `packages/core/tests/intelligence/context.test.ts` | Modify | + AC-11 supersede/reactivate cycle. |
| `CHANGELOG.md` | Modify | + Unreleased entry. |
| `docs/superpowers/specs/2026-05-20-cadence-assumption-decision-intake-design.md` | Modify | Reconcile § Out-of-scope decision-status. |
| `docs/superpowers/specs/2026-05-20-cadence-assumption-transitions-design.md` | Modify | Reconcile § Follow-On decision-status. |
| `docs/superpowers/specs/2026-05-20-cadence-assumption-reopen-design.md` | Modify | Reconcile § Follow-On decision-status. |
| `docs/superpowers/specs/2026-05-20-cadence-rec-link-backfill-design.md` | Modify | Reconcile § Follow-On decision-status. |

**Slice-9/10 reference patterns (mirror verbatim):**

- `applyAssumptionTransition` at `packages/core/src/intelligence/store.ts:264-293` — pure transition template.
- `runAssumptionTransition` at `store.ts:295-305` — IO glue.
- `ASSUMPTION_TRANSITION_ALLOWED`/`NEXT` at `store.ts:258-282` — map shape.
- CLI loop at `packages/core/src/cli/commands/assumption.ts:55-81`.
- `renderAssumptionsMd` at `packages/core/src/intelligence/render-assumption.ts:1-42` — bucket-render template.
- `tests/cli/assumption-transition.test.ts` — spawn-CLI helper to mirror.

---

## Per-task done-bar (apply to EVERY task before committing)

Full turbo gate. Slice-4a/Slice-6/Slice-7/Slice-8/Slice-9 gotcha: subset checks miss lint regressions.

```bash
pnpm turbo run lint typecheck test build
```

Expect 16/16 successful. Do NOT commit if red.

---

## Task 1: `@cadence/types` schema additive

**Files:**
- Modify: `packages/types/src/intelligence.ts`

- [ ] **Step 1: Extend `IntelligenceDecisionZ`**

Add `status: z.enum(['active', 'superseded', 'rescinded']).default('active'),` between `rationale` and `decidedAt`.

- [ ] **Step 2: Extend `ContextPacketZ.decisions[]`**

Add `status: z.literal('active'),` to the object schema (mirrors the assumption packet shape).

- [ ] **Step 3: Full turbo gate**

Expect cascading type errors from consumers: `addIntelligenceDecision`, `synthesizeContextPacket`, existing tests asserting decision shape. Resolve in subsequent tasks (Task 2 + Task 5 + Task 6). Wait — actually, since `.default` makes the input field optional, TypeScript will treat `status` as required on the OUTPUT (parsed) type but optional on the INPUT. Construction sites (`addIntelligenceDecision`, test fixtures) must supply it; readers don't have to. Consumers may need updates this task.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(types): IntelligenceDecisionZ.status + packet decision status (Slice 13)"
```

If full gate is still red after Task 1 (consumer updates needed first), bundle this into Task 2's commit instead.

---

## Task 2: `applyDecisionTransition` + `runDecisionTransition` + types + `addIntelligenceDecision` default

**Files:**
- Modify: `packages/core/src/intelligence/store.ts`
- Create: `packages/core/tests/intelligence/store-decision-transition.test.ts`

- [ ] **Step 1: Extend `store.ts`**

In `store.ts`:

1. Update `addIntelligenceDecision` to set `status: 'active'` on the new entity.

2. Add module-scope:

```ts
export type DecisionTransitionAction = 'supersede' | 'rescind' | 'reactivate';

export type DecisionTransitionResult =
  | { ok: true; ledger: IntelligenceDecisionLedger }
  | { ok: false; error: string };

const DECISION_TRANSITION_ALLOWED: Record<
  DecisionTransitionAction,
  IntelligenceDecision['status'][]
> = {
  supersede: ['active'],
  rescind: ['active'],
  reactivate: ['superseded', 'rescinded'],
};

const DECISION_TRANSITION_NEXT: Record<
  DecisionTransitionAction,
  IntelligenceDecision['status']
> = {
  supersede: 'superseded',
  rescind: 'rescinded',
  reactivate: 'active',
};

export function applyDecisionTransition(
  ledger: IntelligenceDecisionLedger,
  id: string,
  action: DecisionTransitionAction,
  _now?: Date,
): DecisionTransitionResult {
  const target = ledger.decisions.find((d) => d.id === id);
  if (!target) return { ok: false, error: `decision ${id} not found` };
  if (!DECISION_TRANSITION_ALLOWED[action].includes(target.status)) {
    return { ok: false, error: `cannot ${action} decision in status ${target.status}` };
  }
  const nextStatus = DECISION_TRANSITION_NEXT[action];
  return {
    ok: true,
    ledger: {
      schemaVersion: 1,
      decisions: ledger.decisions.map((d) =>
        d.id === id ? { ...d, status: nextStatus } : d,
      ),
    },
  };
}

export async function runDecisionTransition(
  root: string,
  id: string,
  action: DecisionTransitionAction,
): Promise<DecisionTransitionResult> {
  const ledger = await readIntelligenceDecisionLedger(root);
  const res = applyDecisionTransition(ledger, id, action, new Date());
  if (!res.ok) return res;
  await writeIntelligenceDecisionLedger(root, res.ledger);
  return res;
}
```

- [ ] **Step 2: Write tests**

Create `tests/intelligence/store-decision-transition.test.ts`. Mirror `store-assumption-transition.test.ts` verbatim with subject = decision. Cover AC-1/2/3/4. Three happy-path cases (supersede, rescind, reactivate); refusal table with six rows.

- [ ] **Step 3: Full turbo gate**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(core): applyDecisionTransition + runDecisionTransition (Slice 13)"
```

---

## Task 3: `renderDecisionsMd` bucket-partition

**Files:**
- Modify: `packages/core/src/intelligence/render-decision.ts`
- Modify (or Create): `packages/core/tests/intelligence/render-decision.test.ts`

- [ ] **Step 1: Rewrite `renderDecisionsMd`**

See design § Render Policy for the full code. Empty-ledger path unchanged; non-empty path bucket-partitions into 3 always-emit sections.

- [ ] **Step 2: Update tests**

Existing tests asserting flat `## ${id}` heading + flat per-entry shape will FAIL. Update to expect `### ${id}` under section header. Add new tests: bucket section + empty-bucket `_(none)_` + section order.

- [ ] **Step 3: Full turbo gate**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(core): renderDecisionsMd status-partitioned bucket sections (Slice 13)"
```

---

## Task 4: CLI `cadence decision supersede / rescind / reactivate`

**Files:**
- Modify: `packages/core/src/cli/commands/decision.ts`
- Create: `packages/core/tests/cli/decision-transition.test.ts`
- Modify: `packages/core/tests/cli/decision.test.ts` (list column update)

- [ ] **Step 1: Extend `cli/commands/decision.ts`**

Add module-scope `DECISION_TRANSITION_DESCRIPTIONS` + `DECISION_TRANSITION_PAST` maps and the `for (const action of [...] as const)` loop. See design § Flow for full code.

Also update `list` to render the status column: `process.stdout.write(\`${d.id}  ${d.status}  ${d.recommendationId ?? '—'}  ${d.title}\n\`);`

- [ ] **Step 2: Write spawn-CLI tests**

Create `tests/cli/decision-transition.test.ts`. Mirror `tests/cli/assumption-transition.test.ts`. Cover AC-7/8/9: happy-path + non-active refusal + unknown-id refusal for each action.

- [ ] **Step 3: Update existing `tests/cli/decision.test.ts`**

The list test now asserts a status column. Update fixture/assertions.

- [ ] **Step 4: Full turbo gate**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(core): CLI cadence decision supersede + rescind + reactivate (Slice 13)"
```

---

## Task 5: Context-packet status filter

**Files:**
- Modify: `packages/core/src/intelligence/context.ts`
- Modify: `packages/core/tests/intelligence/context.test.ts`

- [ ] **Step 1: Add filter in `context.ts`**

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

- [ ] **Step 2: Integration test**

Add to `context.test.ts`: tied decision → handoff packet has 1 → `runDecisionTransition(..., 'supersede')` → packet has 0 → `runDecisionTransition(..., 'reactivate')` → packet has 1 again. Mirror Slice-10 AC-6 shape.

Also update existing context tests if they construct decisions without `status` (they'll need `status:'active'` now since the runtime path requires it on packet output).

- [ ] **Step 3: Full turbo gate**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(core): context packet filters decisions to status=active (Slice 13)"
```

---

## Task 6: Back-compat parse test (AC-10) + add-default test (AC-14) + Slice-12 regression (AC-13)

**Files:**
- Modify: `packages/core/tests/intelligence/store.test.ts`

- [ ] **Step 1: Back-compat test (AC-10)**

Plant a `decisions.json` file using `writeFile` WITHOUT the `status` field. Read via `readIntelligenceDecisionLedger`. Assert every entry has `status: 'active'`.

```ts
it('Slice 13 AC-10: legacy decisions.json (no status field) parses with default active', async () => {
  active = await tempRepo({ initialized: true, projectName: 'slice13' });
  const path = join(active.root, '.cadence/intelligence/decisions.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({
    schemaVersion: 1,
    decisions: [{
      id: 'dec-1',
      title: 'old',
      rationale: 'r',
      decidedAt: '2026-05-15T00:00:00.000Z',
      // NO status field
    }],
  }));
  const ledger = await readIntelligenceDecisionLedger(active.root);
  expect(ledger.decisions[0]!.status).toBe('active');
});
```

- [ ] **Step 2: Add-default test (AC-14)**

```ts
it('Slice 13 AC-14: addIntelligenceDecision populates status=active', async () => {
  active = await tempRepo({ initialized: true, projectName: 'slice13' });
  const rec = await addRecommendation(active.root, {
    title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
    affectedAreas: [], affectedFiles: [],
  });
  const tied = await addIntelligenceDecision(active.root, {
    recommendationId: rec.id, title: 'T', rationale: 'r',
  });
  expect(tied.status).toBe('active');
  const untied = await addIntelligenceDecision(active.root, { title: 'U', rationale: 'r' });
  expect(untied.status).toBe('active');
});
```

- [ ] **Step 3: Slice-12 regression (AC-13)**

Add a case in the Slice-12 `rec MD link surfacing` block: supersede the decision, assert the rec MD STILL contains `- decisions: <id>` (link-array remains status-agnostic).

- [ ] **Step 4: Full turbo gate**

- [ ] **Step 5: Commit**

```bash
git commit -m "test(core): integration — decision status back-compat + Slice-12 regression (Slice 13 AC-10/13/14)"
```

---

## Task 7: Docs reconcile + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`
- Modify: 4 design docs (Slice 8/9/10/11) — reconcile decision-status follow-refs.

- [ ] **Step 1: CHANGELOG**

Add at top of existing `## [Unreleased]` Praxis stream:

```
- **Praxis Slice 13** — `cadence decision` now carries a `status` field (`'active' | 'superseded' | 'rescinded'`, default `'active'`, Zod additive so pre-Slice-13 ledgers parse cleanly without migration) and three new transition verbs `supersede`/`rescind`/`reactivate`. `DECISIONS.md` now bucket-partitions into `## Active` / `## Superseded` / `## Rescinded` always-emit sections (mirrors Slice-9 assumption render). Context packets (`phase`/`handoff`/`review`/`agent`) filter decisions to `status === 'active'` for parity with Slice-5's assumption filter — superseded/rescinded decisions disappear from packets and re-enter on reactivate. `list` line gains a status column. NO `@cadence/types` non-additive change. NO new top-level CLI commands. Closes Slice-8/9/10/11 cross-slice decision-status follow-refs.
```

- [ ] **Step 2: Reconcile 4 design docs**

In each, strike + annotate "SHIPPED Slice 13":

1. `2026-05-20-cadence-assumption-decision-intake-design.md` — § Out-of-scope "Status-transition commands for cadence decision".
2. `2026-05-20-cadence-assumption-transitions-design.md` — § Follow-On "cadence decision status field + transitions".
3. `2026-05-20-cadence-assumption-reopen-design.md` — § Follow-On "cadence decision status field + transitions".
4. `2026-05-20-cadence-rec-link-backfill-design.md` — § Follow-On "cadence decision status field + transitions".

- [ ] **Step 3: Full turbo gate**

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: document decision status + transitions + reconcile Slice-8/9/10/11 follow-refs (Slice 13)"
```

---

## Task 8: Final review pass + push

- [ ] **Step 1: Verify slice landed**

```bash
git log --oneline origin/praxis-intelligence-ledger..HEAD
```

Expect ~8–9 commits (design + plan + types + store + render + CLI + context + tests + docs).

- [ ] **Step 2: Pre-push gate**

```bash
pnpm turbo run lint typecheck test build
```

Must be 16/16 green LOCALLY before push.

- [ ] **Step 3: Push**

```bash
git push
```

PR #9 stays draft.

---

## Definition of Done

- [ ] All 14 ACs in `2026-05-20-cadence-decision-status-transitions-design.md` pass.
- [ ] Full `pnpm turbo run lint typecheck test build` green at every task's done-bar.
- [ ] Slice-8/9/10/11 decision-status follow-refs all reconciled (strike + annotate).
- [ ] CHANGELOG entry added.
- [ ] `cli-reference.test.ts` (Phase-31.1 drift guard) passes UNCHANGED — no new top-level commands.
- [ ] No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
- [ ] Pre-Slice-13 `decisions.json` files parse cleanly via Zod `.default('active')` (AC-10).
- [ ] Branch pushed to `origin/praxis-intelligence-ledger`. PR #9 stays draft.
