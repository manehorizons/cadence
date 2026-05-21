# CADENCE Assumption `reopen` Transition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `cadence assumption reopen <id>` as the third action on the existing `cadence assumption` transition surface, completing the status transition matrix `open ↔ {validated, rejected}`. Mirrors Slice 9 architecture verbatim with one additive verb. Closes Slice-9 § Out-of-scope + § Follow-On `reopen` entries.

**Architecture:** Pure additive. Extends `AssumptionTransitionAction` union with `'reopen'`; extends `ALLOWED` map with `reopen: ['validated', 'rejected']`; replaces inline ternary `nextStatus` with module-scope `NEXT` map; extends CLI for-loop and replaces inline past-tense ternary with `PAST` map. Zero `@cadence/types` changes. Zero render-layer changes. Zero new top-level CLI commands. Slice-5/7 context-packet `status === 'open'` filter automatically re-admits reopened assumptions.

**Tech Stack:** TypeScript, Zod v3, vitest, Commander; pnpm + turbo.

**Spec:** [`docs/superpowers/specs/2026-05-20-cadence-assumption-reopen-design.md`](../specs/2026-05-20-cadence-assumption-reopen-design.md)

**Branch:** `praxis-intelligence-ledger` (long-lived Praxis workstream; PR #9 stays draft).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/core/src/intelligence/store.ts` | Modify | Extend `AssumptionTransitionAction` union with `'reopen'`; extend `ALLOWED` map; introduce module-scope `NEXT` map; replace inline `nextStatus` ternary inside `applyAssumptionTransition` with `NEXT[action]`. |
| `packages/core/src/cli/commands/assumption.ts` | Modify | Extend `for (const action of [...] as const)` loop with `'reopen'`; replace inline past-tense ternary on stdout success line with `PAST` map; add `DESCRIPTIONS` map for `description()` strings. |
| `packages/core/tests/intelligence/store-assumption-transition.test.ts` | Modify | + happy-path cases (validated→open, rejected→open); + refusal cases (reopen-from-open); + AC-4 no-write-on-failure variant for reopen-from-open. |
| `packages/core/tests/cli/assumption-transition.test.ts` | Modify | + `describe('cadence assumption reopen ...')` block (happy path, refusal-from-open, unknown id). |
| `packages/core/tests/intelligence/context.test.ts` | Modify | + Extend Slice-9 AC-11 block: validate then reopen → count goes back up to 2. |
| `CHANGELOG.md` | Modify | + Unreleased entry under existing Praxis Slice section. |
| `docs/superpowers/specs/2026-05-20-cadence-assumption-transitions-design.md` | Modify | Reconcile: strike `reopen` from § Out-of-scope and § Follow-On with `(SHIPPED Slice 10)` annotation. |

**Slice-9 reference patterns (mirror verbatim):**

- `applyAssumptionTransition` at `packages/core/src/intelligence/store.ts:264-293` — pure helper; extend `ALLOWED` only.
- `runAssumptionTransition` at `store.ts:295-305` — IO glue; unchanged.
- CLI loop at `packages/core/src/cli/commands/assumption.ts:55-81` — extend `'reopen'` into the action array.
- `tests/cli/assumption-transition.test.ts:1-26` — existing `run()` spawn-CLI helper to reuse verbatim.

---

## Per-task done-bar (apply to EVERY task before committing)

Slice-7 / Slice-8 / Slice-9 carried gotcha: per-task subset checks miss `lint` regressions. Full turbo gate is the done-bar.

```bash
pnpm turbo run lint typecheck test build
```

Expect 16/16 successful. Do NOT commit if red. If lint fails for a `no-unused-vars` regression, fix in the same task before commit.

---

## Task 1: Extend `applyAssumptionTransition` + `runAssumptionTransition` for `reopen`

**Files:**
- Modify: `packages/core/src/intelligence/store.ts`
- Modify: `packages/core/tests/intelligence/store-assumption-transition.test.ts`

- [ ] **Step 1: Extend types + maps + algorithm in `store.ts`**

In `packages/core/src/intelligence/store.ts`:

1. Change `AssumptionTransitionAction`:
   ```ts
   export type AssumptionTransitionAction = 'validate' | 'reject' | 'reopen';
   ```
2. Inside `applyAssumptionTransition`, change `ALLOWED`:
   ```ts
   const ALLOWED: Record<AssumptionTransitionAction, Assumption['status'][]> = {
     validate: ['open'],
     reject:   ['open'],
     reopen:   ['validated', 'rejected'],
   };
   ```
3. Replace the inline `nextStatus` ternary with a module-scope (or function-scope) `NEXT` map:
   ```ts
   const NEXT: Record<AssumptionTransitionAction, Assumption['status']> = {
     validate: 'validated',
     reject:   'rejected',
     reopen:   'open',
   };
   // ...
   const nextStatus = NEXT[action];
   ```

`runAssumptionTransition` is UNCHANGED — already action-agnostic.

- [ ] **Step 2: Extend tests in `store-assumption-transition.test.ts`**

Add inside existing `describe('applyAssumptionTransition (Slice 9 / AC-1)', ...)`:

```ts
it('reopen: validated → open (createdAt + other fields preserved)', () => {
  const ledger = mkLedger([
    { id: 'as-1', recommendationId: 'r-1', text: 't1', status: 'validated',
      createdAt: '2026-05-20T00:00:00.000Z' },
    { id: 'as-2', recommendationId: 'r-2', text: 't2', status: 'rejected',
      createdAt: '2026-05-20T01:00:00.000Z' },
  ]);
  const res = applyAssumptionTransition(ledger, 'as-1', 'reopen');
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error('expected ok');
  expect(res.ledger.assumptions[0]).toEqual({
    id: 'as-1', recommendationId: 'r-1', text: 't1', status: 'open',
    createdAt: '2026-05-20T00:00:00.000Z',
  });
  expect(res.ledger.assumptions[1]).toBe(ledger.assumptions[1]);
});

it('reopen: rejected → open (createdAt preserved)', () => {
  const ledger = mkLedger([
    { id: 'as-1', recommendationId: 'r-1', text: 't1', status: 'rejected',
      createdAt: '2026-05-20T00:00:00.000Z' },
  ]);
  const res = applyAssumptionTransition(ledger, 'as-1', 'reopen');
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error('expected ok');
  expect(res.ledger.assumptions[0]!.status).toBe('open');
  expect(res.ledger.assumptions[0]!.createdAt).toBe('2026-05-20T00:00:00.000Z');
});
```

Extend the existing `it.each([...])` refusal table with a `reopen-from-open` row:

```ts
['open', 'reopen', 'cannot reopen assumption in status open'],
```

Add an AC-4 no-write-on-failure case for `reopen`:

```ts
it('refused reopen-from-open leaves files byte-equal', async () => {
  active = await tempRepo({ initialized: true, projectName: 'slice10' });
  const { assumptionId } = await seedRecAndAssumption(active.root);
  const jsonPath = join(active.root, '.cadence/intelligence/assumptions.json');
  const mdPath = join(active.root, '.cadence/intelligence/ASSUMPTIONS.md');
  // After seed, file may or may not exist depending on writeAssumptionLedger semantics.
  // Capture state, attempt refused reopen-from-open, assert byte-equal.
  const jsonBefore = await readFile(jsonPath, 'utf8');
  const mdBefore = await readFile(mdPath, 'utf8');
  const refused = await runAssumptionTransition(active.root, assumptionId, 'reopen');
  expect(refused).toEqual({
    ok: false,
    error: 'cannot reopen assumption in status open',
  });
  expect(await readFile(jsonPath, 'utf8')).toBe(jsonBefore);
  expect(await readFile(mdPath, 'utf8')).toBe(mdBefore);
});
```

Add a `runAssumptionTransition` happy-path round-trip case for `reopen` (validated → open) inside the existing successful-transition describe block.

- [ ] **Step 3: Run full turbo gate**

```bash
pnpm turbo run lint typecheck test build
```

Must be 16/16 green.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(core): applyAssumptionTransition supports reopen (Slice 10)"
```

---

## Task 2: CLI `cadence assumption reopen`

**Files:**
- Modify: `packages/core/src/cli/commands/assumption.ts`
- Modify: `packages/core/tests/cli/assumption-transition.test.ts`

- [ ] **Step 1: Extend the for-loop with `'reopen'`**

In `packages/core/src/cli/commands/assumption.ts`:

1. Extend the loop array:
   ```ts
   for (const action of ['validate', 'reject', 'reopen'] as const) {
   ```
2. Replace inline ternary `action === 'validate' ? 'Mark an open assumption validated' : 'Mark an open assumption rejected'` with a `DESCRIPTIONS` map at module/function scope:
   ```ts
   const DESCRIPTIONS: Record<AssumptionTransitionAction, string> = {
     validate: 'Mark an open assumption validated',
     reject:   'Mark an open assumption rejected',
     reopen:   'Reopen a validated or rejected assumption',
   };
   ```
3. Replace inline ternary `action === 'validate' ? 'validated' : 'rejected'` on the stdout success line with a `PAST` map:
   ```ts
   const PAST: Record<AssumptionTransitionAction, Assumption['status']> = {
     validate: 'validated',
     reject:   'rejected',
     reopen:   'open',
   };
   // ...
   process.stdout.write(`assumption ${id} → ${PAST[action]}\n`);
   ```

Import `AssumptionTransitionAction` + `Assumption` type from where appropriate (`store.js` for action; `@cadence/types` for `Assumption`).

- [ ] **Step 2: Extend tests in `assumption-transition.test.ts`**

Add a new `describe` block:

```ts
describe('cadence assumption reopen (Slice 10 / AC-5)', () => {
  it('validated → open: exit 0, success line, JSON + MD reflect new status', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice10' });
    const id = await seedRecAndAssumption(active.root);
    // validate first
    const v = await run(['assumption', 'validate', id], active.root);
    expect(v.code).toBe(0);
    // reopen
    const r = await run(['assumption', 'reopen', id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`assumption ${id} → open\n`);
    const json = JSON.parse(
      await readFile(join(active.root, '.cadence/intelligence/assumptions.json'), 'utf8'),
    );
    expect(json.assumptions[0].status).toBe('open');
    const md = await readFile(
      join(active.root, '.cadence/intelligence/ASSUMPTIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Open[\s\S]*?### as-/);
    expect(md).toMatch(/## Validated[\s\S]*?_\(none\)_/);
  });

  it('rejected → open: exit 0, success line, MD reflects bucket move', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice10' });
    const id = await seedRecAndAssumption(active.root);
    await run(['assumption', 'reject', id], active.root);
    const r = await run(['assumption', 'reopen', id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`assumption ${id} → open\n`);
    const md = await readFile(
      join(active.root, '.cadence/intelligence/ASSUMPTIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Open[\s\S]*?### as-/);
    expect(md).toMatch(/## Rejected[\s\S]*?_\(none\)_/);
  });

  it('open status → exit 1, stderr `refused: cannot reopen ... open`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice10' });
    const id = await seedRecAndAssumption(active.root);
    const r = await run(['assumption', 'reopen', id], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'assumption reopen refused: cannot reopen assumption in status open\n',
    );
  });

  it('unknown id → exit 1, stderr `refused: ... not found`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice10' });
    const r = await run(['assumption', 'reopen', 'as-bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'assumption reopen refused: assumption as-bogus not found\n',
    );
  });
});
```

- [ ] **Step 3: Full turbo gate**

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(core): CLI cadence assumption reopen (Slice 10)"
```

---

## Task 3: Context-packet integration test (AC-6)

**Files:**
- Modify: `packages/core/tests/intelligence/context.test.ts`

- [ ] **Step 1: Extend Slice-9 AC-11 block**

Append a new `it` block inside the existing Slice-9 AC-11 describe (or as a sibling, mirroring the existing `Slice 9 AC-11: validated assumption disappears...` block):

```ts
it('Slice 10 AC-6: reopened assumption re-enters handoff packet assumptions[]', async () => {
  active = await tempRepo({ initialized: true, projectName: 'slice10' });
  const rec = await addRecommendation(active.root, {
    title: 'seed', summary: 's', priority: 'medium', readiness: 'raw-idea',
    affectedAreas: [], affectedFiles: [],
  });
  const a1 = await addAssumption(active.root, { recommendationId: rec.id, text: 'A1' });
  await addAssumption(active.root, { recommendationId: rec.id, text: 'A2' });
  // Pre: 2 assumptions
  const before = await runContext(active.root, 'handoff', new Date('2026-05-20T00:00:00.000Z'));
  expect(before.assumptions).toHaveLength(2);
  // Validate one → drops to 1
  await runAssumptionTransition(active.root, a1.id, 'validate');
  const mid = await runContext(active.root, 'handoff', new Date('2026-05-20T00:00:00.000Z'));
  expect(mid.assumptions).toHaveLength(1);
  // Reopen → rises back to 2
  const r = await runAssumptionTransition(active.root, a1.id, 'reopen');
  expect(r.ok).toBe(true);
  const after = await runContext(active.root, 'handoff', new Date('2026-05-20T00:00:00.000Z'));
  expect(after.assumptions).toHaveLength(2);
  expect(after.assumptions.map((a) => a.text).sort()).toEqual(['A1', 'A2']);
});
```

- [ ] **Step 2: Full turbo gate**

- [ ] **Step 3: Commit**

```bash
git commit -m "test(core): integration — reopened assumption re-enters context packets (Slice 10 AC-6)"
```

---

## Task 4: Docs reconcile + CHANGELOG

**Files:**
- Modify: `docs/superpowers/specs/2026-05-20-cadence-assumption-transitions-design.md`
- Modify: `CHANGELOG.md`
- Modify (if cli-reference auto-genned): nothing — no new top-level commands.

- [ ] **Step 1: Reconcile Slice-9 design**

In `2026-05-20-cadence-assumption-transitions-design.md`:

- § Summary line 21: add inline strike `~~It does not add `reopen`...~~` (or annotate `**Now shipped Slice 10 — see [reopen design](2026-05-20-cadence-assumption-reopen-design.md).**`).
- § Out of scope line 46: strike + annotate `**SHIPPED Slice 10.**`.
- § Allowed-status map line 126: annotate `(Slice 10 adds `reopen: ['validated', 'rejected']`.)`.
- § Decision Log #2 line 369: similar annotation.
- § Follow-On line 385: strike + annotate `**SHIPPED Slice 10.**`.

Match Slice-6/7/8/9 strike-and-annotate convention.

- [ ] **Step 2: CHANGELOG**

Add `[Praxis Slice 10]` entry under `## [Unreleased]` documenting the new `reopen` verb, the `NEXT`/`PAST`/`DESCRIPTIONS` map refactor, and AC-6 packet behavior.

- [ ] **Step 3: Full turbo gate**

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: document assumption reopen + reconcile Slice-9 follow-ref (Slice 10)"
```

---

## Task 5: Final review pass + push

- [ ] **Step 1: Verify nothing slipped**

```bash
git log --oneline origin/praxis-intelligence-ledger..HEAD
```

Expect 4 commits (design doc landed pre-plan via Task 0; plan doc lands via this file; impl + CLI + integration + docs = 4 here, plus the design + plan = 6 total over the slice).

- [ ] **Step 2: Pre-push gate**

`pre-push` hook runs full `pnpm turbo run lint typecheck test build` (per CADENCE done-bar memory). Confirm 16/16 green LOCALLY before push:

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 3: Push**

```bash
git push
```

Pre-push hook re-runs the gate. PR #9 stays draft.

---

## Definition of Done

- [ ] All 8 ACs in `2026-05-20-cadence-assumption-reopen-design.md` pass.
- [ ] Full `pnpm turbo run lint typecheck test build` green at every task's done-bar.
- [ ] Slice-9 design reconciled (strike + annotate on Out-of-scope + Follow-On).
- [ ] CHANGELOG entry added.
- [ ] `cli-reference.test.ts` (Phase-31.1 drift guard) passes UNCHANGED — no new top-level commands.
- [ ] No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
- [ ] Branch pushed to `origin/praxis-intelligence-ledger`. PR #9 stays draft.
