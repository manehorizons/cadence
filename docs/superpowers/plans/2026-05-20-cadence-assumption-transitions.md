# CADENCE Assumption Status Transitions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `cadence assumption validate <id>` + `cadence assumption reject <id>` subcommands on the existing assumption parent, backed by pure `applyAssumptionTransition` + IO glue `runAssumptionTransition`, and extend `renderAssumptionsMd` to status-partition into 3 always-emit bucket sections.

**Architecture:** Pure additive. Mirrors Slice-4a milestone transition pattern (`applyTransition` / `runMilestoneTransition` / CLI verb-per-action loop). Strict allowed-status guard (both transitions from `'open'` only). Zero `@cadence/types` changes. NO new top-level CLI commands (drift guard untripped). Slice-5/7 context-packet `status === 'open'` filter automatically respects transitioned status → AC-11 works for free.

**Tech Stack:** TypeScript, Zod v3, vitest, Commander; pnpm + turbo.

**Spec:** [`docs/superpowers/specs/2026-05-20-cadence-assumption-transitions-design.md`](../specs/2026-05-20-cadence-assumption-transitions-design.md)

**Branch:** `praxis-intelligence-ledger` (long-lived Praxis workstream; PR #9 stays draft).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/core/src/intelligence/store.ts` | Modify | + `AssumptionTransitionAction` / `AssumptionTransitionResult` types; + `applyAssumptionTransition(ledger, id, action, now?)`; + `runAssumptionTransition(root, id, action)`. |
| `packages/core/src/intelligence/render-assumption.ts` | Modify | Rewrite non-empty path: partition by status into 3 always-emit sections; demote per-entry heading to `###`; remove `- status:` bullet. Empty-ledger path unchanged. |
| `packages/core/src/cli/commands/assumption.ts` | Modify | + `for (const action of ['validate', 'reject'] as const) { cmd.command(\`${action} <id>\`)... }` loop (mirror `cli/commands/milestone.ts:40-66`). |
| `packages/core/tests/intelligence/store-assumption-transition.test.ts` | Create | AC-1 / AC-2 / AC-3 / AC-4 — pure transition + IO glue + no-write-on-failure. |
| `packages/core/tests/intelligence/render-assumption.test.ts` | Modify | UPDATE existing Slice-8 assertions (heading H2→H3, status bullet removed); ADD bucket section + empty-bucket + section-order tests (AC-5, AC-6). |
| `packages/core/tests/intelligence/store-assumption.test.ts` | Modify | Update existing add-success MD assertion: entry now appears under `## Open` (was flat). Schema unchanged; JSON assertion holds (AC-9). |
| `packages/core/tests/cli/assumption-transition.test.ts` | Create | AC-7 / AC-8 — spawn-CLI tests for validate + reject. |
| `packages/core/tests/intelligence/context.test.ts` | Modify | Extend Slice-8's densification block with AC-11: validate one assumption → packet count drops. |

**Slice-4a reference patterns (verified pre-existing; mirror verbatim):**

- `applyTransition` at `packages/core/src/intelligence/milestone.ts:285-316` — pure helper with `TransitionResult` discriminated union, `ALLOWED` status-map gate, `.map()` non-target preservation.
- `runMilestoneTransition` at `milestone.ts:332-342` — read → apply → early-return on `!ok` → write on ok.
- CLI loop at `packages/core/src/cli/commands/milestone.ts:40-66` — `for (const action of [...] as const) { cmd.command(\`${action} <id>\`)... refused-vs-failed }`.
- `tests/cli/assumption.test.ts:1-25` — local `run()` spawn-CLI helper to MIRROR (do NOT extract a shared helper).

---

## Per-task done-bar (apply to EVERY task before committing)

Slice-4a / Slice-6 / Slice-7 / Slice-8 carried gotcha: per-task subset checks miss `lint` regressions. Full turbo gate is the done-bar.

```bash
pnpm turbo run lint typecheck test build
```

Expect 16/16 successful. Do NOT commit if red. If lint fails for a `no-unused-vars` regression, fix in the same task before commit.

---

## Task 1: `applyAssumptionTransition` + `runAssumptionTransition` + types

**Files:**
- Modify: `packages/core/src/intelligence/store.ts`
- Create: `packages/core/tests/intelligence/store-assumption-transition.test.ts`

- [ ] **Step 1: Skim Slice-4a transition template**

```bash
sed -n '275,345p' packages/core/src/intelligence/milestone.ts
```

Read `TransitionAction` + `TransitionResult` + `applyTransition` + `runMilestoneTransition` shapes. The new code mirrors these verbatim, with two differences: (a) per-subject `AssumptionTransitionResult` rather than reusing milestone's; (b) `now` param accepted but unused (no `updatedAt` field on assumption).

- [ ] **Step 2: Write failing tests**

Create `packages/core/tests/intelligence/store-assumption-transition.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import type { AssumptionLedger } from '@cadence/types';
import {
  addAssumption,
  addRecommendation,
  applyAssumptionTransition,
  readAssumptionLedger,
  runAssumptionTransition,
} from '../../src/intelligence/store.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

function mkLedger(items: AssumptionLedger['assumptions']): AssumptionLedger {
  return { schemaVersion: 1, assumptions: items };
}

async function seedRecAndAssumption(
  root: string,
): Promise<{ recId: string; assumptionId: string }> {
  const r = await addRecommendation(root, {
    title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
    affectedAreas: [], affectedFiles: [],
  });
  const a = await addAssumption(root, { recommendationId: r.id, text: 'A1' });
  return { recId: r.id, assumptionId: a.id };
}

describe('applyAssumptionTransition (Slice 9 / AC-1)', () => {
  it('validate: open → validated (createdAt + other fields preserved)', () => {
    const ledger = mkLedger([
      { id: 'as-1', recommendationId: 'r-1', text: 't1', status: 'open',
        createdAt: '2026-05-20T00:00:00.000Z' },
      { id: 'as-2', recommendationId: 'r-2', text: 't2', status: 'open',
        createdAt: '2026-05-20T01:00:00.000Z' },
    ]);
    const res = applyAssumptionTransition(ledger, 'as-1', 'validate');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.assumptions[0]).toEqual({
      id: 'as-1', recommendationId: 'r-1', text: 't1', status: 'validated',
      createdAt: '2026-05-20T00:00:00.000Z',
    });
    // Non-target preserved byte-equal
    expect(res.ledger.assumptions[1]).toBe(ledger.assumptions[1]);
  });

  it('reject: open → rejected (createdAt preserved)', () => {
    const ledger = mkLedger([
      { id: 'as-1', recommendationId: 'r-1', text: 't1', status: 'open',
        createdAt: '2026-05-20T00:00:00.000Z' },
    ]);
    const res = applyAssumptionTransition(ledger, 'as-1', 'reject');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('expected ok');
    expect(res.ledger.assumptions[0]!.status).toBe('rejected');
    expect(res.ledger.assumptions[0]!.createdAt).toBe('2026-05-20T00:00:00.000Z');
  });
});

describe('applyAssumptionTransition refusals (AC-2 + AC-3)', () => {
  it('id not in ledger', () => {
    const ledger = mkLedger([]);
    const res = applyAssumptionTransition(ledger, 'as-bogus', 'validate');
    expect(res).toEqual({ ok: false, error: 'assumption as-bogus not found' });
  });

  it.each([
    ['validated', 'validate', 'cannot validate assumption in status validated'],
    ['rejected',  'validate', 'cannot validate assumption in status rejected'],
    ['validated', 'reject',   'cannot reject assumption in status validated'],
    ['rejected',  'reject',   'cannot reject assumption in status rejected'],
  ] as const)(
    'wrong source status %s -> %s refused',
    (status, action, expectedError) => {
      const ledger = mkLedger([
        { id: 'as-1', recommendationId: 'r-1', text: 't1', status,
          createdAt: '2026-05-20T00:00:00.000Z' },
      ]);
      const res = applyAssumptionTransition(ledger, 'as-1', action);
      expect(res).toEqual({ ok: false, error: expectedError });
    },
  );
});

describe('runAssumptionTransition no-write-on-failure (AC-4)', () => {
  it('refused transition leaves assumptions.json + ASSUMPTIONS.md byte-equal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const { assumptionId } = await seedRecAndAssumption(active.root);
    // First validate succeeds — flips status
    const ok1 = await runAssumptionTransition(active.root, assumptionId, 'validate');
    expect(ok1.ok).toBe(true);
    // Snapshot files BEFORE the refused call
    const jsonPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const mdPath = join(active.root, '.cadence/intelligence/ASSUMPTIONS.md');
    const jsonBefore = await readFile(jsonPath, 'utf8');
    const mdBefore = await readFile(mdPath, 'utf8');
    // Second validate refused (already validated)
    const refused = await runAssumptionTransition(active.root, assumptionId, 'validate');
    expect(refused).toEqual({
      ok: false,
      error: 'cannot validate assumption in status validated',
    });
    // Files byte-equal
    expect(await readFile(jsonPath, 'utf8')).toBe(jsonBefore);
    expect(await readFile(mdPath, 'utf8')).toBe(mdBefore);
  });

  it('refused unknown id leaves ledger empty (no write created)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    // No assumption seeded; assumptions.json does not exist yet
    const jsonPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const mdPath = join(active.root, '.cadence/intelligence/ASSUMPTIONS.md');
    expect(existsSync(jsonPath)).toBe(false);
    expect(existsSync(mdPath)).toBe(false);
    const res = await runAssumptionTransition(active.root, 'as-bogus', 'validate');
    expect(res).toEqual({ ok: false, error: 'assumption as-bogus not found' });
    expect(existsSync(jsonPath)).toBe(false);
    expect(existsSync(mdPath)).toBe(false);
  });

  it('successful transition writes via writeAssumptionLedger (JSON + MD)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const { assumptionId } = await seedRecAndAssumption(active.root);
    const res = await runAssumptionTransition(active.root, assumptionId, 'validate');
    expect(res.ok).toBe(true);
    // JSON file reflects new status
    const ledger = await readAssumptionLedger(active.root);
    expect(ledger.assumptions[0]!.status).toBe('validated');
    // MD now has the entry under `## Validated`
    const md = await readFile(
      join(active.root, '.cadence/intelligence/ASSUMPTIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Validated[\s\S]*?### as-/);
    expect(md).toMatch(/## Open[\s\S]*?_\(none\)_/);
  });
});
```

- [ ] **Step 3: Run tests — verify FAIL**

```bash
pnpm --filter @cadence/core test -- --run intelligence/store-assumption-transition
```

Expected: `applyAssumptionTransition is not a function` (and `runAssumptionTransition` likewise) — neither exists yet.

- [ ] **Step 4: Implement in `store.ts`**

**Note on test placement of the "successful transition writes via writeAssumptionLedger" test:** that test depends on `renderAssumptionsMd` being bucket-shaped (asserts `## Validated` + `## Open` + `_(none)_`). Bucket render lands in Task 2. So that ONE test will pass green after Task 2, not after Task 1. Add it now (RED-then-deferred-GREEN); Task 1's gate green requirement is for the other 9 tests in the file. Alternatively, mark it `it.skip` here and unskip in Task 2's commit. **Choose: leave `it.skip` for the last test in this file, unskip in Task 2 once render lands.** Document the skip with an in-file comment naming Task 2.

Now `store.ts` additions. Place AFTER the existing `addAssumption` function (Slice 8):

```ts
export type AssumptionTransitionAction = 'validate' | 'reject';

export type AssumptionTransitionResult =
  | { ok: true; ledger: AssumptionLedger }
  | { ok: false; error: string };

export function applyAssumptionTransition(
  ledger: AssumptionLedger,
  id: string,
  action: AssumptionTransitionAction,
  _now?: Date,
): AssumptionTransitionResult {
  const target = ledger.assumptions.find((a) => a.id === id);
  if (!target) return { ok: false, error: `assumption ${id} not found` };

  const ALLOWED: Record<AssumptionTransitionAction, Assumption['status'][]> = {
    validate: ['open'],
    reject: ['open'],
  };
  if (!ALLOWED[action].includes(target.status)) {
    return {
      ok: false,
      error: `cannot ${action} assumption in status ${target.status}`,
    };
  }

  const nextStatus: Assumption['status'] =
    action === 'validate' ? 'validated' : 'rejected';
  const ledgerOut: AssumptionLedger = {
    schemaVersion: 1,
    assumptions: ledger.assumptions.map((a) =>
      a.id === id ? { ...a, status: nextStatus } : a,
    ),
  };
  return { ok: true, ledger: ledgerOut };
}

export async function runAssumptionTransition(
  root: string,
  id: string,
  action: AssumptionTransitionAction,
): Promise<AssumptionTransitionResult> {
  const ledger = await readAssumptionLedger(root);
  const res = applyAssumptionTransition(ledger, id, action, new Date());
  if (!res.ok) return res;
  await writeAssumptionLedger(root, res.ledger);
  return res;
}
```

`_now?` is the unused `now` parameter (underscore-prefixed to satisfy lint per Decision Log #5; signature symmetry with `applyTransition`).

`Assumption` type is ALREADY imported (added by Slice 8 Task 1). Verify with `grep -n "type Assumption[,]" packages/core/src/intelligence/store.ts`. If absent, add to the named-type import block at lines 4-24.

- [ ] **Step 5: Mark the last test `it.skip` with a comment**

In `store-assumption-transition.test.ts`, change the third `describe` block's last test:

```ts
it.skip('successful transition writes via writeAssumptionLedger (JSON + MD) — unskip after Task 2 bucket render lands', async () => {
  // ... body unchanged
});
```

- [ ] **Step 6: Run tests — verify GREEN (9 of 10; 1 skipped)**

```bash
pnpm --filter @cadence/core test -- --run intelligence/store-assumption-transition
```

- [ ] **Step 7: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

Expected: 16/16 successful.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/intelligence/store.ts packages/core/tests/intelligence/store-assumption-transition.test.ts
git commit -m "$(cat <<'EOF'
feat(core): applyAssumptionTransition + runAssumptionTransition (Slice 9)

Adds the pure transition helper + IO glue mirroring Slice-4a milestone
pattern. AssumptionTransitionAction = 'validate'|'reject'; strict
ALLOWED = both from 'open' only. Refuses unknown id and wrong source
status; no write side effects on failure. AC-1 + AC-2 + AC-3 + AC-4
(minus the one test it.skip'd pending Task 2 bucket render).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `renderAssumptionsMd` bucket sections + update existing render tests

**Files:**
- Modify: `packages/core/src/intelligence/render-assumption.ts`
- Modify: `packages/core/tests/intelligence/render-assumption.test.ts`
- Modify: `packages/core/tests/intelligence/store-assumption-transition.test.ts` (unskip the last test from Task 1)
- Modify: `packages/core/tests/intelligence/store-assumption.test.ts` (regression — entry now under `## Open`)

- [ ] **Step 1: Read existing render-assumption shape**

```bash
cat packages/core/src/intelligence/render-assumption.ts
cat packages/core/tests/intelligence/render-assumption.test.ts
```

Existing render at Slice-8 HEAD: per-entry `## ${id} — ${text}` (H2) + `- recommendation:` + `- status:` + `- recorded:` bullets. Two tests: empty-ledger + non-empty insertion order.

- [ ] **Step 2: Update existing tests to match the new bucket shape**

The Slice-8 `non-empty: per-entry block in insertion order with bullets` test asserts `## as-...` H2 and `- status:` bullet — both shape-changed. Rewrite to assert the new bucket shape. Update assertions:

```ts
it('non-empty: 3 always-emit bucket sections with entries under correct headings', () => {
  const ledger: AssumptionLedger = {
    schemaVersion: 1,
    assumptions: [
      { id: 'as-20260520-001', recommendationId: 'rec-1', text: 'db reachable',
        status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
      { id: 'as-20260520-002', recommendationId: 'rec-2', text: 'auth flow correct',
        status: 'validated', createdAt: '2026-05-20T01:00:00.000Z' },
    ],
  };
  const md = renderAssumptionsMd(ledger);
  // Three always-emit sections in fixed order
  expect(md).toMatch(/^## Open$/m);
  expect(md).toMatch(/^## Validated$/m);
  expect(md).toMatch(/^## Rejected$/m);
  // Open entry uses H3 heading (demoted)
  expect(md).toMatch(/^### as-20260520-001 — db reachable$/m);
  // Validated entry under its section
  expect(md).toMatch(/^### as-20260520-002 — auth flow correct$/m);
  // Per-entry bullets — recommendation + recorded only; NO status bullet
  expect(md).toMatch(/- recommendation: rec-1/);
  expect(md).toMatch(/- recorded: 2026-05-20T00:00:00\.000Z/);
  expect(md).not.toMatch(/- status: /);  // REMOVED per Slice-9 Decision Log #10
  // Empty Rejected bucket renders `_(none)_`
  expect(md).toMatch(/^## Rejected$\n+_\(none\)_/m);
  // Section ordering: Open before Validated before Rejected
  expect(md.indexOf('## Open')).toBeLessThan(md.indexOf('## Validated'));
  expect(md.indexOf('## Validated')).toBeLessThan(md.indexOf('## Rejected'));
});
```

Also ADD a new test pinning the empty-state and the always-emit-on-non-empty-ledger semantics:

```ts
it('always emits 3 section headers even when buckets are empty (except all-empty ledger)', () => {
  // All assumptions in one bucket — other two render `_(none)_`
  const ledger: AssumptionLedger = {
    schemaVersion: 1,
    assumptions: [
      { id: 'as-1', recommendationId: 'r-1', text: 't1', status: 'open',
        createdAt: '2026-05-20T00:00:00.000Z' },
    ],
  };
  const md = renderAssumptionsMd(ledger);
  expect(md).toMatch(/## Open\n+### as-1/);
  expect(md).toMatch(/## Validated\n+_\(none\)_/);
  expect(md).toMatch(/## Rejected\n+_\(none\)_/);
});
```

The existing `always emits header + blockquote envelope; empty ledger → "No assumptions recorded."` test STAYS UNCHANGED — Slice-9 preserves the empty-ledger early-return path verbatim.

- [ ] **Step 3: Run render tests — verify FAIL on rewritten + new**

```bash
pnpm --filter @cadence/core test -- --run intelligence/render-assumption
```

Expected: empty-ledger test passes; rewritten + new tests fail (current code is flat, not bucketed).

- [ ] **Step 4: Implement bucket render in `render-assumption.ts`**

REPLACE the entire current body. The new file:

```ts
import type { Assumption, AssumptionLedger } from '@cadence/types';

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

  const open      = ledger.assumptions.filter((a) => a.status === 'open');
  const validated = ledger.assumptions.filter((a) => a.status === 'validated');
  const rejected  = ledger.assumptions.filter((a) => a.status === 'rejected');

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

Note the new `Assumption` named-type import (was just `AssumptionLedger` before).

- [ ] **Step 5: Unskip the deferred test in `store-assumption-transition.test.ts`**

Change `it.skip(...)` back to `it(...)` for the `successful transition writes via writeAssumptionLedger (JSON + MD)` test from Task 1.

- [ ] **Step 6: Update Slice-8 add-success MD assertion**

`packages/core/tests/intelligence/store-assumption.test.ts` has a Slice-8 test that asserts the MD has `## ${a.id} — db reachable`. After bucket render lands, the entry appears as `### as-... — db reachable` under `## Open`. Update the assertion:

```bash
grep -n "## \\${a.id}\\|new RegExp(\`## " packages/core/tests/intelligence/store-assumption.test.ts
```

Find the assertion (around the AC-1 success test) and update to:

```ts
expect(md).toMatch(new RegExp(`### ${a.id} — db reachable`));
expect(md).toMatch(/^## Open$/m);
```

- [ ] **Step 7: Run tests — verify GREEN**

```bash
pnpm --filter @cadence/core test -- --run intelligence
```

All render + store + transition tests pass.

- [ ] **Step 8: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/intelligence/render-assumption.ts packages/core/tests/intelligence/render-assumption.test.ts packages/core/tests/intelligence/store-assumption-transition.test.ts packages/core/tests/intelligence/store-assumption.test.ts
git commit -m "$(cat <<'EOF'
feat(core): renderAssumptionsMd status-partitioned bucket sections (Slice 9)

Rewrites the non-empty render path: always-emits `## Open` /
`## Validated` / `## Rejected` sections in fixed order; per-entry
heading demoted to `### ${id} — ${text}`; `- status:` bullet removed
(section heading conveys); empty bucket emits `_(none)_`. Empty-ledger
path UNCHANGED. Updates Slice-8 render tests + Slice-8 add-success MD
assertion to match the new shape (deliberate test rewrite per Slice-9
Decision Log #3). Unskips the deferred Task-1 test (full MD assertion
on successful transition). Closes Slice-8 § Decision Log #9. AC-5 + AC-6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: CLI — `cadence assumption validate|reject` subcommands

**Files:**
- Modify: `packages/core/src/cli/commands/assumption.ts`
- Create: `packages/core/tests/cli/assumption-transition.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Create `packages/core/tests/cli/assumption-transition.test.ts`. Reuse the local `run()` helper pattern from `tests/cli/assumption.test.ts` — do NOT introduce a shared helper:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import {
  addAssumption,
  addRecommendation,
} from '../../src/intelligence/store.js';

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'dist', 'cli', 'index.js',
);

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function seedRecAndAssumption(root: string): Promise<string> {
  const r = await addRecommendation(root, {
    title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
    affectedAreas: [], affectedFiles: [],
  });
  const a = await addAssumption(root, { recommendationId: r.id, text: 'A1' });
  return a.id;
}

describe('cadence assumption validate (Slice 9 / AC-7)', () => {
  it('open → validated: exit 0, success line, JSON + MD reflect new status', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const id = await seedRecAndAssumption(active.root);
    const r = await run(['assumption', 'validate', id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`assumption ${id} → validated\n`);
    const json = JSON.parse(
      await readFile(join(active.root, '.cadence/intelligence/assumptions.json'), 'utf8'),
    );
    expect(json.assumptions[0].status).toBe('validated');
    const md = await readFile(
      join(active.root, '.cadence/intelligence/ASSUMPTIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Validated[\s\S]*?### as-/);
    expect(md).toMatch(/## Open[\s\S]*?_\(none\)_/);
  });

  it('unknown id → exit 1, stderr `refused: ... not found`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const r = await run(['assumption', 'validate', 'as-bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'assumption validate refused: assumption as-bogus not found\n',
    );
  });

  it('non-open status → exit 1, stderr `refused: cannot validate ...`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const id = await seedRecAndAssumption(active.root);
    await run(['assumption', 'validate', id], active.root); // open → validated
    const r = await run(['assumption', 'validate', id], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'assumption validate refused: cannot validate assumption in status validated\n',
    );
  });

  it('missing <id> arg → commander usage error + non-zero exit', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const r = await run(['assumption', 'validate'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/missing required argument/i);
  });
});

describe('cadence assumption reject (AC-8)', () => {
  it('open → rejected: exit 0, success line, JSON + MD reflect new status', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const id = await seedRecAndAssumption(active.root);
    const r = await run(['assumption', 'reject', id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`assumption ${id} → rejected\n`);
    const md = await readFile(
      join(active.root, '.cadence/intelligence/ASSUMPTIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/## Rejected[\s\S]*?### as-/);
    expect(md).toMatch(/## Open[\s\S]*?_\(none\)_/);
  });

  it('non-open status → exit 1, stderr `refused: cannot reject ...`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice9' });
    const id = await seedRecAndAssumption(active.root);
    await run(['assumption', 'reject', id], active.root); // open → rejected
    const r = await run(['assumption', 'reject', id], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      'assumption reject refused: cannot reject assumption in status rejected\n',
    );
  });
});
```

- [ ] **Step 2: Build + run — verify FAIL**

```bash
pnpm turbo run build
pnpm --filter @cadence/core test -- --run cli/assumption-transition
```

Expected: all tests fail — `validate` / `reject` aren't registered subcommands yet.

- [ ] **Step 3: Extend `cli/commands/assumption.ts`**

Add the new import:

```ts
import {
  addAssumption,
  readAssumptionLedger,
  runAssumptionTransition,         // ADD
} from '../../intelligence/store.js';
```

Add the transition-loop block AFTER the existing `list` subcommand (line ~52, end of `registerAssumptionCommand`). Direct mirror of `cli/commands/milestone.ts:40-66`:

```ts
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

NO change to `register.ts` (no new top-level command).

- [ ] **Step 4: Rebuild + run — verify GREEN**

```bash
pnpm turbo run build
pnpm --filter @cadence/core test -- --run cli/assumption-transition
```

- [ ] **Step 5: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

Phase-31.1 cli-reference drift guard MUST pass UNCHANGED — no new top-level commands. Verify the marker block in `commands.md` is untouched.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/cli/commands/assumption.ts packages/core/tests/cli/assumption-transition.test.ts
git commit -m "$(cat <<'EOF'
feat(core): CLI cadence assumption validate + reject (Slice 9)

Two new subcommands on the existing assumption parent (registered Slice
8). Strict allowed-status: both transitions from `open` only. Refused
vs failed distinction matches Slice-4a milestone precedent. NO new
top-level CLI commands — Phase-31.1 drift guard untripped.
AC-7 + AC-8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Integration test — context packets respect transitioned status (AC-11)

**Files:**
- Modify: `packages/core/tests/intelligence/context.test.ts`

This test extends Slice-8's densification block. Validates that transitioning an open assumption to `'validated'` or `'rejected'` removes it from the `synthesizeContextPacket` `assumptions[]` array (Slice-5's `status === 'open'` filter does the work — zero `context.ts` / `render-context.ts` change required).

- [ ] **Step 1: Locate Slice-8's densification describe block**

```bash
grep -n "Slice-5/7 packets densify\|Slice 8 AC-11" packages/core/tests/intelligence/context.test.ts
```

- [ ] **Step 2: Append a new test inside the existing describe block**

```ts
it('Slice 9 AC-11: validated assumption disappears from handoff packet assumptions[]', async () => {
  active = await tempRepo({ initialized: true, projectName: 'slice9' });
  const rec = await addRecommendation(active.root, {
    title: 'seed', summary: 's', priority: 'medium', readiness: 'raw-idea',
    affectedAreas: [], affectedFiles: [],
  });
  const a1 = await addAssumption(active.root, { recommendationId: rec.id, text: 'A1' });
  await addAssumption(active.root, { recommendationId: rec.id, text: 'A2' });
  // Pre-transition: handoff packet has 2 assumptions
  const before = await runContext(
    active.root,
    'handoff',
    new Date('2026-05-20T00:00:00.000Z'),
  );
  expect(before.assumptions).toHaveLength(2);
  // Validate one
  const res = await runAssumptionTransition(active.root, a1.id, 'validate');
  expect(res.ok).toBe(true);
  // Post-transition: handoff packet has 1 (validated one is gone via Slice-5 status==='open' filter)
  const after = await runContext(
    active.root,
    'handoff',
    new Date('2026-05-20T00:00:00.000Z'),
  );
  expect(after.assumptions).toHaveLength(1);
  expect(after.assumptions[0]!.text).toBe('A2');
});
```

Add the import if not present:

```ts
import {
  addAssumption,
  addIntelligenceDecision,
  addRecommendation,
  runAssumptionTransition,         // ADD if missing
} from '../../src/intelligence/store.js';
```

- [ ] **Step 3: Run — verify GREEN immediately**

```bash
pnpm --filter @cadence/core test -- --run intelligence/context
```

Passes WITHOUT any change to `context.ts` / `render-context.ts` — Slice-5 filter does the work.

- [ ] **Step 4: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/tests/intelligence/context.test.ts
git commit -m "$(cat <<'EOF'
test(core): integration — context packets respect transitioned status (Slice 9 AC-11)

Extends Slice-8's densification block. Proves Slice-5's `status === 'open'`
filter on assumptions automatically removes validated/rejected items
from synthesizeContextPacket packets. Zero changes to context.ts /
render-context.ts required — passes by virtue of Slice-5's filter.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Docs — CHANGELOG + Slice-8 follow-ref reconcile

**Files:**
- Modify: `CHANGELOG.md` (one new line under `## [Unreleased] → ### Added`)
- Modify: `docs/superpowers/specs/2026-05-20-cadence-assumption-decision-intake-design.md` (Slice-8 Follow-On reconciliation — strike + annotate)
- Modify: `docs/reference/commands.md` — extend the `### assumption` section to mention the new transitions (NOT the marker block; no new top-level commands)

- [ ] **Step 1: Update `### assumption` section in `commands.md`**

Slice-8 shipped the `### assumption` section. Find it via `grep -n "### assumption" docs/reference/commands.md`. Extend the Subcommands table from 2 rows to 4:

```markdown
**Subcommands**

| Subcommand | Description |
|---|---|
| `add` | Add a manual assumption tied to a recommendation |
| `list` | List recorded assumptions |
| `validate <id>` | Mark an open assumption validated |
| `reject <id>` | Mark an open assumption rejected |
```

Update the Behavior prose to mention transitions:

> ... Status-transition subcommands ~~(`validate` / `reject`) ship in a follow-up slice~~ **`validate <id>` / `reject <id>` flip an open assumption to validated/rejected respectively; strict allowed-status (only from `'open'`). Refused with `cannot <action> assumption in status <s>` on wrong source or `assumption <id> not found` on unknown id; no write side effects on refusal.**

(Adapt the original Slice-8 sentence — find it via `grep -n "validate / reject" docs/reference/commands.md` and replace inline; the strikethrough form above is the conceptual diff, the actual edit is a clean rewrite of the sentence.)

Similarly extend Exit codes prose if it mentions transitions.

- [ ] **Step 2: CHANGELOG line**

Just below the Slice-8 `cadence assumption add | list + cadence decision add | list` line under `## [Unreleased] → ### Added`, add:

```markdown
- `cadence assumption validate <id>` + `cadence assumption reject <id>` — two new transition subcommands on the existing assumption parent. Strict allowed-status: both transitions from `'open'` only; refused with `cannot <action> assumption in status <s>` on wrong source or `assumption <id> not found` on unknown id; no write side effects on refusal. ALSO partitions `ASSUMPTIONS.md` render into 3 always-emit bucket sections (`## Open` / `## Validated` / `## Rejected`) with per-entry heading demoted to `###`. Slice-5/7 context packets automatically respect transitioned status via existing `status === 'open'` filter (Praxis Slice 9).
```

- [ ] **Step 3: Reconcile Slice-8 Follow-On forward-ref**

In `docs/superpowers/specs/2026-05-20-cadence-assumption-decision-intake-design.md`, find the line:

```
- **Assumption status transitions** (`cadence assumption validate <id>` / `cadence assumption reject <id>`). Highest-priority follow-on; closes the asymmetry between Slice-3's recommendation lifecycle and this slice's assumption stub. Render gets bucket sections at that point.
```

Replace with strike + annotate (mirror Slice 6/7/8 pattern):

```markdown
- ~~**Assumption status transitions** (`cadence assumption validate <id>` / `cadence assumption reject <id>`). Highest-priority follow-on; closes the asymmetry between Slice-3's recommendation lifecycle and this slice's assumption stub. Render gets bucket sections at that point.~~ — shipped in Slice 9 ([`2026-05-20-cadence-assumption-transitions-design.md`](2026-05-20-cadence-assumption-transitions-design.md)).
```

Also reconcile any matching forward-ref about "bucket sections" / "Decision Log #9" pattern:

```bash
grep -rn -i "transitions slice\|bucket section\|Decision Log #9" docs/superpowers/specs/ | grep -v 2026-05-20-cadence-assumption-transitions-design
```

The Slice-8 Decision Log #9 line `**No bucket-by-status render** — both shapes are flat. ...` references this slice. Update the trailing clause from `wait until the transitions slice exists` to `~~wait until the transitions slice exists~~ — shipped in Slice 9` (keep the Slice-8 design's historical "at-the-time" decision visible but annotate the shipped status).

- [ ] **Step 4: Final done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

Expected: 16/16 successful.

- [ ] **Step 5: Commit**

```bash
git add docs/reference/commands.md CHANGELOG.md docs/superpowers/specs/2026-05-20-cadence-assumption-decision-intake-design.md
git commit -m "$(cat <<'EOF'
docs: document assumption validate + reject + reconcile Slice-8 follow-ref (Slice 9)

- Extends docs/reference/commands.md ### assumption section: 4-row
  subcommand table (add + list + validate + reject) and updated behavior
  prose mentioning the new transitions. Marker block UNCHANGED (no new
  top-level commands).
- CHANGELOG Unreleased → Added: one-liner for Slice 9.
- Slice-8 design Follow-On + Decision Log #9: strike + annotate the
  now-shipped transitions + bucket render forward-refs (mirrors
  Slice-6/7/8 reconciliation pattern).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Verify slice complete**

```bash
git log --oneline -8
git status --short --branch
pnpm turbo run lint typecheck test build
```

Branch state should be ~5 commits ahead of `origin/praxis-intelligence-ledger`. Push is user-gated. Confirm with user before `git push`. Pre-push hook runs full gate; no `--no-verify`.

After push: update `project_praxis_layer.md` per Praxis workstream convention (move Slice 9 into shipped-slices list; update branch HEAD sha; update PR #9 commit count; set NEXT SLICE per the new Follow-On).

---

## Slice-level success criteria

Every AC from the spec passes:

- AC-1 + AC-2 + AC-3 + AC-4 (Task 1)
- AC-5 + AC-6 (Task 2)
- AC-7 + AC-8 (Task 3)
- AC-11 (Task 4)
- AC-9 (Task 2 — Slice-8 add-success MD assertion updated)
- AC-10 (verified in Task 3's full gate — drift guard passes unchanged)

Done-bar passes on every task. Branch HEAD pushes clean. PR #9 stays draft + unmerged.
