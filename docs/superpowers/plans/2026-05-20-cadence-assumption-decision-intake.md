# CADENCE Assumption + Decision Intake — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two top-level CLI commands — `cadence assumption add|list` + `cadence decision add|list` — that populate the `AssumptionLedger` + `IntelligenceDecisionLedger` ledgers Slice 5 wired readers for. Closes Slice-5/7's documented honest-empty gap.

**Architecture:** Per-subject writer in `store.ts` (`addAssumption` / `addIntelligenceDecision`) + per-subject ID-allocation helper (`as-`/`dec-` prefix; per-day per-ledger counter) + per-subject ledger writer (atomic JSON + atomic Markdown re-render) + pure render module (`renderAssumptionsMd` / `renderDecisionsMd`) + CLI parent with `add` + `list` subcommands. Zero `@cadence/types` changes (schemas pre-existing). Strict read-only outside the new ledger artifacts.

**Tech Stack:** TypeScript, Zod v3, vitest, Commander; pnpm + turbo. Mirrors Slice-1 architecture verbatim.

**Spec:** [`docs/superpowers/specs/2026-05-20-cadence-assumption-decision-intake-design.md`](../specs/2026-05-20-cadence-assumption-decision-intake-design.md)

**Branch:** `praxis-intelligence-ledger` (long-lived Praxis workstream; PR #9 stays draft).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/core/src/intelligence/store.ts` | Modify | + `ASSUMPTIONS_MD` / `DECISIONS_MD` constants; + `assumptionsMdPath` / `decisionsMdPath` helpers; + `nextAssumptionId` / `nextIntelligenceDecisionId`; + `addAssumption` / `addIntelligenceDecision`; + `writeAssumptionLedger` / `writeIntelligenceDecisionLedger`. **DO NOT redeclare** `ASSUMPTIONS_JSON` / `DECISIONS_JSON` / `assumptionsPath` / `decisionsPath` — they already exist at lines 33-34 + 58-64. |
| `packages/core/src/intelligence/render-assumption.ts` | Create | Pure `renderAssumptionsMd(ledger): string`. |
| `packages/core/src/intelligence/render-decision.ts` | Create | Pure `renderDecisionsMd(ledger): string`. |
| `packages/core/src/cli/commands/assumption.ts` | Create | `registerAssumptionCommand(program)` — parent `cadence assumption` + `add` + `list`. |
| `packages/core/src/cli/commands/decision.ts` | Create | `registerDecisionCommand(program)` — parent `cadence decision` + `add` + `list`. |
| `packages/core/src/cli/register.ts` | Modify | + import lines + 2 calls inside `registerAllCommands(...)`. |
| `packages/core/tests/intelligence/store-assumption.test.ts` | Create | AC-1 / AC-2 unit tests (writer + ID alloc + FK refuse). |
| `packages/core/tests/intelligence/store-decision.test.ts` | Create | AC-3 / AC-4 unit tests. |
| `packages/core/tests/intelligence/render-assumption.test.ts` | Create | AC-5 render tests. |
| `packages/core/tests/intelligence/render-decision.test.ts` | Create | AC-6 render tests. |
| `packages/core/tests/cli/assumption.test.ts` | Create | AC-7 / AC-8 spawn-CLI tests. |
| `packages/core/tests/cli/decision.test.ts` | Create | AC-9 spawn-CLI tests. |
| `packages/core/tests/intelligence/context.test.ts` | Modify | + AC-11 integration test (Slice-5/7 packets densify on intake). |
| `docs/reference/commands.md` | Modify | + `### assumption` / `### decision` sections; regenerate `<!-- cadence:commands:start -->` ... `<!-- cadence:commands:end -->` auto-marker region (lines ~56–74) to list both new top-level commands. |
| `CHANGELOG.md` | Modify | + one line under `## [Unreleased] → ### Added`. |
| `docs/superpowers/specs/2026-05-18-cadence-context-packets-review-agent-design.md` | Modify | Follow-On reconciliation: strike + annotate the "assumption / decision intake command" forward-ref. |

**Slice-1 reference patterns (already in tree; mirror verbatim):**

- `nextRecommendationId(ledger, now)` at `packages/core/src/intelligence/store.ts:118-127` — prefix + `slugDate(now)` + zero-padded counter scoped per-ledger per-day.
- `addRecommendation(root, input)` at `store.ts:140-183` — writer template (read ledgers, allocate id, build entity, push, write).
- `renderRecommendationsMd(ledger, evidenceLedger)` at `packages/core/src/intelligence/render.ts:3-41` — `lines: string[]` builder; `## ${id} — ${title}` em-dash heading; bullet rows; body paragraph; trailing `lines.push('')`.
- `registerRecommendationCommand(program)` at `packages/core/src/cli/commands/recommendation.ts:21-95` — parent + `add` (`requiredOption`/`option` + try/catch action) + `list` (compact one-line-per-entry).
- `tests/cli/context.test.ts:1-25` — spawn-CLI `run(args, cwd)` helper pattern; reuse with `import { run } from '...'` if extracted, OR inline the same pattern in the new test files (no new helper).

---

## Per-task done-bar (apply to EVERY task before committing)

Slice-4a / Slice-6 / Slice-7 carried gotcha: **per-task subset checks miss `lint` regressions**. The done-bar is the FULL turbo gate, not a subset.

```bash
pnpm turbo run lint typecheck test build
```

Expect 16/16 successful (cached after first run). Do NOT commit if the gate is red. If lint fails for a `no-unused-vars` regression (e.g. you added a constant or import that isn't used yet), that's the Slice-4a class of issue — fix in the same task before commit; don't carry it forward.

---

## Task 1: `addAssumption` + `writeAssumptionLedger` + `nextAssumptionId`

**Files:**
- Modify: `packages/core/src/intelligence/store.ts`
- Create: `packages/core/tests/intelligence/store-assumption.test.ts`

- [ ] **Step 1: Skim existing patterns in store.ts**

```bash
grep -n "nextRecommendationId\|addRecommendation\|RECOMMENDATIONS_MD\|recommendationsMdPath\|atomicWriteJSON\|atomicWriteText" packages/core/src/intelligence/store.ts
```

Read lines 118-127 (`nextRecommendationId`) + 140-183 (`addRecommendation`) + 66-68 (`recommendationsMdPath`). The new code mirrors these verbatim.

Read `packages/core/src/state/atomic-write.ts` briefly to confirm `atomicWriteJSON(path, obj)` + `atomicWriteText(path, text)` signatures.

- [ ] **Step 2: Write failing tests**

Create `packages/core/tests/intelligence/store-assumption.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { AssumptionLedgerZ } from '@cadence/types';
import {
  addAssumption,
  addRecommendation,
  readAssumptionLedger,
} from '../../src/intelligence/store.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function seedRec(root: string): Promise<string> {
  const r = await addRecommendation(root, {
    title: 'seed rec',
    summary: 'seed',
    priority: 'medium',
    readiness: 'raw-idea',
    affectedAreas: [],
    affectedFiles: [],
  });
  return r.id;
}

describe('addAssumption (Slice 8)', () => {
  it('allocates `as-<YYYYMMDD>-001`, sets status=open, persists assumptions.json + ASSUMPTIONS.md', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const recId = await seedRec(active.root);
    const a = await addAssumption(active.root, { recommendationId: recId, text: 'db reachable' });
    expect(a.id).toMatch(/^as-\d{8}-001$/);
    expect(a.recommendationId).toBe(recId);
    expect(a.text).toBe('db reachable');
    expect(a.status).toBe('open');
    expect(a.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // JSON persisted + parseable
    const json = await readFile(join(active.root, '.cadence/intelligence/assumptions.json'), 'utf8');
    const parsed = AssumptionLedgerZ.parse(JSON.parse(json));
    expect(parsed.assumptions).toHaveLength(1);
    expect(parsed.assumptions[0]!.id).toBe(a.id);
    // ASSUMPTIONS.md emitted
    const md = await readFile(join(active.root, '.cadence/intelligence/ASSUMPTIONS.md'), 'utf8');
    expect(md).toMatch(/^# CADENCE Assumptions/m);
    expect(md).toMatch(new RegExp(`## ${a.id} — db reachable`));
  });

  it('counter increments monotone per-day per-ledger (001 → 002 → 003)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const recId = await seedRec(active.root);
    const a1 = await addAssumption(active.root, { recommendationId: recId, text: 'A1' });
    const a2 = await addAssumption(active.root, { recommendationId: recId, text: 'A2' });
    const a3 = await addAssumption(active.root, { recommendationId: recId, text: 'A3' });
    const prefix = a1.id.slice(0, -3);
    expect(a1.id).toBe(`${prefix}001`);
    expect(a2.id).toBe(`${prefix}002`);
    expect(a3.id).toBe(`${prefix}003`);
  });

  it('refuses unknown recommendationId with Error and NO write side effects (AC-2)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    await seedRec(active.root); // ensure a real rec exists so the ledger isn't empty
    const jsonPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const mdPath = join(active.root, '.cadence/intelligence/ASSUMPTIONS.md');
    expect(existsSync(jsonPath)).toBe(false); // pre-condition: no assumptions yet
    expect(existsSync(mdPath)).toBe(false);
    await expect(
      addAssumption(active.root, { recommendationId: 'rec-bogus', text: 'will fail' }),
    ).rejects.toThrow('unknown recommendation "rec-bogus"');
    // post-condition: still no assumptions.json + ASSUMPTIONS.md
    expect(existsSync(jsonPath)).toBe(false);
    expect(existsSync(mdPath)).toBe(false);
    // ledger reader returns empty
    const ledger = await readAssumptionLedger(active.root);
    expect(ledger.assumptions).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests — verify FAIL**

```bash
pnpm --filter @cadence/core test -- --run intelligence/store-assumption
```

Expected: `addAssumption is not a function` (or similar) — function doesn't exist yet.

- [ ] **Step 4: Implement in `store.ts`**

Add the path constants AFTER existing line 34 (`const DECISIONS_JSON = 'decisions.json';`):

```ts
const ASSUMPTIONS_MD = 'ASSUMPTIONS.md';
const DECISIONS_MD = 'DECISIONS.md';
```

Add `assumptionsMdPath` AFTER existing `decisionsPath` at line 64:

```ts
function assumptionsMdPath(root: string): string {
  return join(intelligenceDir(root), ASSUMPTIONS_MD);
}

function decisionsMdPath(root: string): string {
  return join(intelligenceDir(root), DECISIONS_MD);
}
```

Add ID-allocation helpers (mirror `nextRecommendationId` shape). Place them AFTER `nextEvidenceId`:

```ts
function nextAssumptionId(ledger: AssumptionLedger, now: Date): string {
  const prefix = `as-${slugDate(now)}-`;
  const max = ledger.assumptions
    .map((a) => a.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function nextIntelligenceDecisionId(
  ledger: IntelligenceDecisionLedger,
  now: Date,
): string {
  const prefix = `dec-${slugDate(now)}-`;
  const max = ledger.decisions
    .map((d) => d.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}
```

Add the writer-level helpers. Place them after the existing reader cluster (lines 84-99). Import `renderAssumptionsMd` from the new module — it doesn't exist yet, so this will fail typecheck until Task 3. To work around for Task 1 alone, you can inline a minimal stub render here that gets replaced in Task 3, OR (preferred) declare the import + do not run typecheck-only checks until Task 3 is also in flight. **Choose: defer the `writeAssumptionLedger` and `addAssumption` code to land alongside the render module in Task 3?** No — that would make Task 1 not test the writer. Instead, **inline a minimal stub renderer call here that Task 3 will replace**:

Actually simplest fix: write `renderAssumptionsMd` AS PART OF THIS TASK (small enough — 18 lines), keep it module-private at the top of `store.ts` for now, and Task 3 will EXTRACT it to its own module + add the render tests. This avoids a typecheck red between tasks.

Wait — that complicates Task 3. Easier path: **land the render module in Task 1 too** (it's tiny). Pivot:

**Revised Step 4 — add the render module first:**

Create `packages/core/src/intelligence/render-assumption.ts` (since the writer needs to call it):

```ts
import type { AssumptionLedger } from '@cadence/types';

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
  for (const a of ledger.assumptions) {
    lines.push(`## ${a.id} — ${a.text}`);
    lines.push('');
    lines.push(`- recommendation: ${a.recommendationId}`);
    lines.push(`- status: ${a.status}`);
    lines.push(`- recorded: ${a.createdAt}`);
    lines.push('');
  }
  return lines.join('\n');
}
```

Now add the writer + ledger writer in `store.ts`. Import:

```ts
import { renderAssumptionsMd } from './render-assumption.js';
```

(Place near the other intelligence-package imports at the top.)

Add the writer functions (after `addRecommendation`):

```ts
export type AddAssumptionInput = {
  recommendationId: string;
  text: string;
};

async function writeAssumptionLedger(root: string, ledger: AssumptionLedger): Promise<void> {
  AssumptionLedgerZ.parse(ledger);
  await mkdir(intelligenceDir(root), { recursive: true });
  await atomicWriteJSON(assumptionsPath(root), ledger);
  await atomicWriteText(assumptionsMdPath(root), renderAssumptionsMd(ledger));
}

export async function addAssumption(
  root: string,
  input: AddAssumptionInput,
): Promise<Assumption> {
  const recLedger = await readRecommendationLedger(root);
  if (!recLedger.recommendations.some((r) => r.id === input.recommendationId)) {
    throw new Error(`unknown recommendation "${input.recommendationId}"`);
  }
  const asLedger = await readAssumptionLedger(root);
  const now = new Date();
  const a: Assumption = {
    id: nextAssumptionId(asLedger, now),
    recommendationId: input.recommendationId,
    text: input.text,
    status: 'open',
    createdAt: now.toISOString(),
  };
  asLedger.assumptions.push(a);
  await writeAssumptionLedger(root, asLedger);
  return a;
}
```

Ensure `mkdir` is imported from `node:fs/promises`; `atomicWriteJSON` / `atomicWriteText` from `../state/atomic-write.js`; `AssumptionLedgerZ` + `Assumption` from `@cadence/types`. Inspect `store.ts`'s existing top-of-file imports — most of these are already there from Slice 1.

Type-annotate `AssumptionLedgerZ` import IF NOT already present. Slice 5 added `readAssumptionLedger` so `AssumptionLedgerZ` is likely already imported; confirm.

- [ ] **Step 5: Run tests — verify GREEN**

```bash
pnpm --filter @cadence/core test -- --run intelligence/store-assumption
```

All 3 tests pass.

- [ ] **Step 6: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

Expected: 16/16 successful. If lint fails for `no-unused-vars` on `DECISIONS_MD` (declared but not yet used — Task 2 uses it), tactical option: declare BOTH constants here but defer `DECISIONS_MD` declaration to Task 2 so the lint stays green. **Pick: declare ONLY `ASSUMPTIONS_MD` in this task; Task 2 declares `DECISIONS_MD`.**

Revise Step 4 to declare ONLY `ASSUMPTIONS_MD` + `assumptionsMdPath` here. `DECISIONS_MD` + `decisionsMdPath` land in Task 2.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/intelligence/store.ts packages/core/src/intelligence/render-assumption.ts packages/core/tests/intelligence/store-assumption.test.ts
git commit -m "$(cat <<'EOF'
feat(core): addAssumption + writeAssumptionLedger + nextAssumptionId (Slice 8)

Adds the assumption-intake writer: per-day per-ledger id allocator
(`as-<YYYYMMDD>-<NNN>` mirroring rec-/ev-), atomic JSON + MD persistence,
FK enforcement (refuses unknown recommendationId with Error and no write
side effects). Includes the renderAssumptionsMd module the writer calls.
AC-1 + AC-2 from the design doc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `addIntelligenceDecision` + `writeIntelligenceDecisionLedger` + `nextIntelligenceDecisionId`

**Files:**
- Modify: `packages/core/src/intelligence/store.ts`
- Create: `packages/core/src/intelligence/render-decision.ts`
- Create: `packages/core/tests/intelligence/store-decision.test.ts`

Symmetric to Task 1 with two differences: `--rec` is optional; `recommendationId` field is OMITTED (not undefined) when absent.

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/intelligence/store-decision.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { IntelligenceDecisionLedgerZ } from '@cadence/types';
import {
  addIntelligenceDecision,
  addRecommendation,
} from '../../src/intelligence/store.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function seedRec(root: string): Promise<string> {
  const r = await addRecommendation(root, {
    title: 'seed', summary: 'seed', priority: 'medium', readiness: 'raw-idea',
    affectedAreas: [], affectedFiles: [],
  });
  return r.id;
}

describe('addIntelligenceDecision (Slice 8)', () => {
  it('untied decision: omits recommendationId field entirely (AC-3)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const d = await addIntelligenceDecision(active.root, {
      title: 'switch to postgres',
      rationale: 'better concurrency story',
    });
    expect(d.id).toMatch(/^dec-\d{8}-001$/);
    expect(d.title).toBe('switch to postgres');
    expect(d.rationale).toBe('better concurrency story');
    expect(d.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect('recommendationId' in d).toBe(false); // OMITTED, not undefined
    // JSON persists the field omission
    const json = await readFile(join(active.root, '.cadence/intelligence/decisions.json'), 'utf8');
    const parsed = IntelligenceDecisionLedgerZ.parse(JSON.parse(json));
    expect('recommendationId' in parsed.decisions[0]!).toBe(false);
    // DECISIONS.md emitted
    const md = await readFile(join(active.root, '.cadence/intelligence/DECISIONS.md'), 'utf8');
    expect(md).toMatch(/^# CADENCE Decisions/m);
  });

  it('tied decision with known recId: persists with field present', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const recId = await seedRec(active.root);
    const d = await addIntelligenceDecision(active.root, {
      recommendationId: recId,
      title: 'tied decision',
      rationale: 'r',
    });
    expect(d.recommendationId).toBe(recId);
  });

  it('refuses unknown recommendationId only when --rec provided (AC-4)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    await seedRec(active.root);
    const jsonPath = join(active.root, '.cadence/intelligence/decisions.json');
    expect(existsSync(jsonPath)).toBe(false);
    await expect(
      addIntelligenceDecision(active.root, {
        recommendationId: 'rec-bogus',
        title: 't',
        rationale: 'r',
      }),
    ).rejects.toThrow('unknown recommendation "rec-bogus"');
    // no write side effects
    expect(existsSync(jsonPath)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

```bash
pnpm --filter @cadence/core test -- --run intelligence/store-decision
```

- [ ] **Step 3: Create `render-decision.ts`**

```ts
import type { IntelligenceDecisionLedger } from '@cadence/types';

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
  for (const d of ledger.decisions) {
    lines.push(`## ${d.id} — ${d.title}`);
    lines.push('');
    if (d.recommendationId) lines.push(`- recommendation: ${d.recommendationId}`);
    lines.push(`- decided: ${d.decidedAt}`);
    lines.push('');
    lines.push(d.rationale);
    lines.push('');
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Add to `store.ts`**

Add `DECISIONS_MD` constant + `decisionsMdPath` helper (declared in Task 1's plan as deferred to here):

```ts
const DECISIONS_MD = 'DECISIONS.md';

function decisionsMdPath(root: string): string {
  return join(intelligenceDir(root), DECISIONS_MD);
}
```

Import the new render module:

```ts
import { renderDecisionsMd } from './render-decision.js';
```

Add writer:

```ts
export type AddIntelligenceDecisionInput = {
  recommendationId?: string;
  title: string;
  rationale: string;
};

async function writeIntelligenceDecisionLedger(
  root: string,
  ledger: IntelligenceDecisionLedger,
): Promise<void> {
  IntelligenceDecisionLedgerZ.parse(ledger);
  await mkdir(intelligenceDir(root), { recursive: true });
  await atomicWriteJSON(decisionsPath(root), ledger);
  await atomicWriteText(decisionsMdPath(root), renderDecisionsMd(ledger));
}

export async function addIntelligenceDecision(
  root: string,
  input: AddIntelligenceDecisionInput,
): Promise<IntelligenceDecision> {
  if (input.recommendationId !== undefined) {
    const recLedger = await readRecommendationLedger(root);
    if (!recLedger.recommendations.some((r) => r.id === input.recommendationId)) {
      throw new Error(`unknown recommendation "${input.recommendationId}"`);
    }
  }
  const decLedger = await readIntelligenceDecisionLedger(root);
  const now = new Date();
  const out: IntelligenceDecision = {
    id: nextIntelligenceDecisionId(decLedger, now),
    title: input.title,
    rationale: input.rationale,
    decidedAt: now.toISOString(),
  };
  if (input.recommendationId !== undefined) out.recommendationId = input.recommendationId;
  decLedger.decisions.push(out);
  await writeIntelligenceDecisionLedger(root, decLedger);
  return out;
}
```

Note the explicit `if (input.recommendationId !== undefined) out.recommendationId = ...` — this OMITS the field entirely when undefined (exact-optional pattern), required by AC-3.

`IntelligenceDecisionLedgerZ`, `IntelligenceDecision` imports: confirm presence at top of `store.ts`; add if needed.

- [ ] **Step 5: Run — verify GREEN**

```bash
pnpm --filter @cadence/core test -- --run intelligence/store-decision
```

- [ ] **Step 6: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/intelligence/store.ts packages/core/src/intelligence/render-decision.ts packages/core/tests/intelligence/store-decision.test.ts
git commit -m "$(cat <<'EOF'
feat(core): addIntelligenceDecision + writeIntelligenceDecisionLedger + nextIntelligenceDecisionId (Slice 8)

Adds the decision-intake writer mirroring assumption. `--rec` is
optional; FK enforcement only when provided. `recommendationId` field
is OMITTED entirely (not undefined) on untied decisions — exact-optional
pattern matching IntelligenceDecisionZ.recommendationId.optional().
Includes the renderDecisionsMd module.
AC-3 + AC-4 from the design doc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Render-module unit tests (`renderAssumptionsMd` + `renderDecisionsMd`)

**Files:**
- Create: `packages/core/tests/intelligence/render-assumption.test.ts`
- Create: `packages/core/tests/intelligence/render-decision.test.ts`

Render modules themselves shipped with Tasks 1+2 (the writers depend on them). This task is the pure-function test layer (AC-5 + AC-6).

- [ ] **Step 1: Write `render-assumption.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { AssumptionLedger } from '@cadence/types';
import { renderAssumptionsMd } from '../../src/intelligence/render-assumption.js';

describe('renderAssumptionsMd (Slice 8)', () => {
  it('always emits header + blockquote envelope; empty ledger → "No assumptions recorded."', () => {
    const ledger: AssumptionLedger = { schemaVersion: 1, assumptions: [] };
    const md = renderAssumptionsMd(ledger);
    expect(md).toMatch(/^# CADENCE Assumptions\n/);
    expect(md).toMatch(/> Generated from `\.cadence\/intelligence\/assumptions\.json`\./);
    expect(md).toMatch(/No assumptions recorded\./);
  });

  it('non-empty: per-entry block in insertion order with bullets', () => {
    const ledger: AssumptionLedger = {
      schemaVersion: 1,
      assumptions: [
        { id: 'as-20260520-001', recommendationId: 'rec-1', text: 'db reachable',
          status: 'open', createdAt: '2026-05-20T00:00:00.000Z' },
        { id: 'as-20260520-002', recommendationId: 'rec-2', text: 'auth flow correct',
          status: 'open', createdAt: '2026-05-20T01:00:00.000Z' },
      ],
    };
    const md = renderAssumptionsMd(ledger);
    expect(md).toMatch(/^# CADENCE Assumptions/);
    expect(md).toMatch(/## as-20260520-001 — db reachable/);
    expect(md).toMatch(/- recommendation: rec-1/);
    expect(md).toMatch(/- status: open/);
    expect(md).toMatch(/- recorded: 2026-05-20T00:00:00\.000Z/);
    expect(md).toMatch(/## as-20260520-002 — auth flow correct/);
    // Insertion order: 001 appears before 002
    expect(md.indexOf('as-20260520-001')).toBeLessThan(md.indexOf('as-20260520-002'));
  });
});
```

- [ ] **Step 2: Write `render-decision.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { IntelligenceDecisionLedger } from '@cadence/types';
import { renderDecisionsMd } from '../../src/intelligence/render-decision.js';

describe('renderDecisionsMd (Slice 8)', () => {
  it('always emits header + blockquote envelope; empty → "No decisions recorded."', () => {
    const ledger: IntelligenceDecisionLedger = { schemaVersion: 1, decisions: [] };
    const md = renderDecisionsMd(ledger);
    expect(md).toMatch(/^# CADENCE Decisions\n/);
    expect(md).toMatch(/> Generated from `\.cadence\/intelligence\/decisions\.json`\./);
    expect(md).toMatch(/No decisions recorded\./);
  });

  it('tied decision: emits `- recommendation:` bullet', () => {
    const ledger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'dec-20260520-001', recommendationId: 'rec-1',
          title: 'use postgres', rationale: 'concurrency',
          decidedAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const md = renderDecisionsMd(ledger);
    expect(md).toMatch(/## dec-20260520-001 — use postgres/);
    expect(md).toMatch(/- recommendation: rec-1/);
    expect(md).toMatch(/- decided: 2026-05-20T00:00:00\.000Z/);
    expect(md).toMatch(/^concurrency$/m); // body paragraph
  });

  it('untied decision: OMITS `- recommendation:` bullet', () => {
    const ledger: IntelligenceDecisionLedger = {
      schemaVersion: 1,
      decisions: [
        { id: 'dec-20260520-001', title: 'top-level decision', rationale: 'no rec',
          decidedAt: '2026-05-20T00:00:00.000Z' },
      ],
    };
    const md = renderDecisionsMd(ledger);
    expect(md).toMatch(/## dec-20260520-001 — top-level decision/);
    expect(md).not.toMatch(/- recommendation:/);
    expect(md).toMatch(/- decided: 2026-05-20T00:00:00\.000Z/);
  });
});
```

- [ ] **Step 3: Run — verify GREEN immediately**

```bash
pnpm --filter @cadence/core test -- --run intelligence/render-assumption intelligence/render-decision
```

These should PASS on first run since the render modules already shipped with Tasks 1+2.

- [ ] **Step 4: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/tests/intelligence/render-assumption.test.ts packages/core/tests/intelligence/render-decision.test.ts
git commit -m "$(cat <<'EOF'
test(core): renderAssumptionsMd + renderDecisionsMd unit tests (Slice 8)

Pure-function vitest for both render modules. Pins: always-emit header +
blockquote envelope (both empty and non-empty), insertion-order
per-entry blocks, untied-decision OMITS `- recommendation:` bullet.
AC-5 + AC-6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: CLI — `cadence assumption add|list`

**Files:**
- Create: `packages/core/src/cli/commands/assumption.ts`
- Modify: `packages/core/src/cli/register.ts`
- Create: `packages/core/tests/cli/assumption.test.ts`

- [ ] **Step 1: Write CLI tests**

Create `packages/core/tests/cli/assumption.test.ts`. Mirror `tests/cli/context.test.ts:1-25` for the local `run()` helper pattern (do NOT introduce a shared helper file):

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { addRecommendation } from '../../src/intelligence/store.js';

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

describe('cadence assumption (Slice 8)', () => {
  it('add: success path (AC-7)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const r = await run(['assumption', 'add', '--rec', rec.id, '--text', 'db reachable'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^Added as-\d{8}-001: db reachable/m);
    expect(r.stdout).toMatch(/Next: cadence assumption list/);
    // Files persisted
    const json = await readFile(join(active.root, '.cadence/intelligence/assumptions.json'), 'utf8');
    expect(JSON.parse(json).assumptions).toHaveLength(1);
  });

  it('add: unknown rec → exit 1 + stderr (AC-7)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const r = await run(['assumption', 'add', '--rec', 'rec-bogus', '--text', 'will fail'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/assumption add failed: unknown recommendation "rec-bogus"/);
  });

  it('add: missing --rec → commander usage error + non-zero exit', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const r = await run(['assumption', 'add', '--text', 'no rec'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/required option/i);
  });

  it('list: empty → "No assumptions recorded." (AC-8)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const r = await run(['assumption', 'list'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^No assumptions recorded\.$/m);
  });

  it('list: non-empty → one line per entry (compact, AC-8)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A1'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A2'], active.root);
    const r = await run(['assumption', 'list'], active.root);
    expect(r.code).toBe(0);
    // One line per entry: `${id}  ${status}  ${recommendationId}  ${text}`
    expect(r.stdout).toMatch(new RegExp(`as-\\d{8}-001\\s+open\\s+${rec.id}\\s+A1`));
    expect(r.stdout).toMatch(new RegExp(`as-\\d{8}-002\\s+open\\s+${rec.id}\\s+A2`));
    // NOT a Markdown render (no `# CADENCE Assumptions` header in stdout)
    expect(r.stdout).not.toMatch(/^# CADENCE Assumptions/m);
  });
});
```

- [ ] **Step 2: Build first (stale-dist trap from Slice 7) — should still pass register-only commands**

```bash
pnpm turbo run build
pnpm --filter @cadence/core test -- --run cli/assumption
```

Expected: all 5 tests FAIL — `assumption` is not a registered command yet.

- [ ] **Step 3: Create `packages/core/src/cli/commands/assumption.ts`**

```ts
import type { Command } from 'commander';
import {
  addAssumption,
  readAssumptionLedger,
} from '../../intelligence/store.js';

export function registerAssumptionCommand(program: Command): void {
  const cmd = program
    .command('assumption')
    .description('Manage CADENCE strategic-intelligence assumptions');

  cmd
    .command('add')
    .description('Add a manual assumption tied to a recommendation')
    .requiredOption('--rec <id>', 'Recommendation id this assumption belongs to')
    .requiredOption('--text <text>', 'Assumption statement')
    .action(async (opts: { rec: string; text: string }) => {
      try {
        const a = await addAssumption(process.cwd(), {
          recommendationId: opts.rec,
          text: opts.text,
        });
        process.stdout.write(`Added ${a.id}: ${a.text}\n`);
        process.stdout.write(`Next: cadence assumption list\n`);
      } catch (err) {
        process.stderr.write(
          `assumption add failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  cmd
    .command('list')
    .description('List recorded assumptions')
    .action(async () => {
      try {
        const ledger = await readAssumptionLedger(process.cwd());
        if (ledger.assumptions.length === 0) {
          process.stdout.write('No assumptions recorded.\n');
          return;
        }
        for (const a of ledger.assumptions) {
          process.stdout.write(`${a.id}  ${a.status}  ${a.recommendationId}  ${a.text}\n`);
        }
      } catch (err) {
        process.stderr.write(
          `assumption list failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
```

- [ ] **Step 4: Register in `register.ts`**

Add import (alphabetical-ish near `registerRecommendationCommand`):

```ts
import { registerAssumptionCommand } from './commands/assumption.js';
```

Add call inside `registerAllCommands(program)`:

```ts
registerAssumptionCommand(program);
```

- [ ] **Step 5: Build + run tests — verify GREEN**

```bash
pnpm turbo run build
pnpm --filter @cadence/core test -- --run cli/assumption
```

- [ ] **Step 6: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/cli/commands/assumption.ts packages/core/src/cli/register.ts packages/core/tests/cli/assumption.test.ts
git commit -m "$(cat <<'EOF'
feat(core): CLI cadence assumption add|list (Slice 8)

Top-level `cadence assumption` command with `add` (required --rec + --text)
and `list` (compact one-line-per-entry stdout, Slice-1 shape) subcommands.
Wires into register.ts. AC-7 + AC-8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: CLI — `cadence decision add|list`

**Files:**
- Create: `packages/core/src/cli/commands/decision.ts`
- Modify: `packages/core/src/cli/register.ts`
- Create: `packages/core/tests/cli/decision.test.ts`

Symmetric to Task 4 with two differences: `--rec` is `.option(...)` (NOT required); list line shape is `${id}  ${recId ?? '—'}  ${title}`.

- [ ] **Step 1: Write CLI tests**

Mirror `tests/cli/assumption.test.ts` structure. Required tests:

```ts
describe('cadence decision (Slice 8)', () => {
  it('add: untied (no --rec) success → exit 0 + Added line', /* ... */);
  it('add: tied (--rec known) success → recommendationId persisted', /* ... */);
  it('add: --rec unknown → exit 1 + stderr', /* ... */);
  it('add: missing --title or --rationale → commander usage error', /* ... */);
  it('list: empty → "No decisions recorded."', /* ... */);
  it('list: untied entry shows em-dash placeholder in rec column', /* ... */);
  it('list: tied entry shows recId in rec column', /* ... */);
});
```

Full fixture pattern: copy `tests/cli/assumption.test.ts`'s top-of-file `run()` + `tempRepo` + `afterEach` boilerplate verbatim.

For the em-dash placeholder regex: `new RegExp(\`dec-\\d{8}-001\\s+—\\s+untied title\`)` — use em-dash U+2014 explicitly.

- [ ] **Step 2: Build + run — verify FAIL**

```bash
pnpm turbo run build
pnpm --filter @cadence/core test -- --run cli/decision
```

- [ ] **Step 3: Create `cli/commands/decision.ts`**

```ts
import type { Command } from 'commander';
import {
  addIntelligenceDecision,
  readIntelligenceDecisionLedger,
  type AddIntelligenceDecisionInput,
} from '../../intelligence/store.js';

export function registerDecisionCommand(program: Command): void {
  const cmd = program
    .command('decision')
    .description('Manage CADENCE strategic-intelligence decisions');

  cmd
    .command('add')
    .description('Record an architectural decision (optionally tied to a recommendation)')
    .option('--rec <id>', 'Recommendation id this decision belongs to (optional)')
    .requiredOption('--title <title>', 'Short decision title')
    .requiredOption('--rationale <text>', 'Decision rationale')
    .action(async (opts: { rec?: string; title: string; rationale: string }) => {
      try {
        const input: AddIntelligenceDecisionInput = {
          title: opts.title,
          rationale: opts.rationale,
        };
        if (opts.rec) input.recommendationId = opts.rec;
        const d = await addIntelligenceDecision(process.cwd(), input);
        process.stdout.write(`Added ${d.id}: ${d.title}\n`);
        process.stdout.write(`Next: cadence decision list\n`);
      } catch (err) {
        process.stderr.write(
          `decision add failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  cmd
    .command('list')
    .description('List recorded decisions')
    .action(async () => {
      try {
        const ledger = await readIntelligenceDecisionLedger(process.cwd());
        if (ledger.decisions.length === 0) {
          process.stdout.write('No decisions recorded.\n');
          return;
        }
        for (const d of ledger.decisions) {
          process.stdout.write(`${d.id}  ${d.recommendationId ?? '—'}  ${d.title}\n`);
        }
      } catch (err) {
        process.stderr.write(
          `decision list failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
```

- [ ] **Step 4: Register in `register.ts`**

Add import + call (mirror Task 4).

- [ ] **Step 5: Build + run — verify GREEN**

```bash
pnpm turbo run build
pnpm --filter @cadence/core test -- --run cli/decision
```

- [ ] **Step 6: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/cli/commands/decision.ts packages/core/src/cli/register.ts packages/core/tests/cli/decision.test.ts
git commit -m "$(cat <<'EOF'
feat(core): CLI cadence decision add|list (Slice 8)

Top-level `cadence decision` command with `add` (optional --rec, required
--title + --rationale) and `list` (one-line-per-entry; em-dash placeholder
for untied decisions) subcommands. AC-9.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Integration test — Slice-5/7 packets densify on intake (AC-11)

**Files:**
- Modify: `packages/core/tests/intelligence/context.test.ts`

This test proves the slice's stated leverage claim: intake writers populate the ledgers; Slice-5/7's existing `synthesizeContextPacket` consumes them; the assumptions/decisions packet sections densify automatically with zero changes to `context.ts` / `render-context.ts`.

- [ ] **Step 1: Add integration test block to `tests/intelligence/context.test.ts`**

Append a new `describe` block at the end of the file:

```ts
describe('Slice-5/7 packets densify on intake (Slice 8 AC-11)', () => {
  it('handoff scope: 2 assumptions + 1 decision appear after intake; no context.ts/render-context.ts change needed', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice8' });
    // Seed one recommendation
    const rec = await addRecommendation(active.root, {
      title: 'seed', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    // Pre-intake: handoff packet has zero assumptions + zero decisions
    const before = synthesizeContextPacket(
      'handoff',
      {
        recommendations: [rec],
        evidence: [],
        assumptions: [],
        decisions: [],
        backend: { present: false, kind: null, legalActions: [] },
      },
      new Date('2026-05-20T00:00:00.000Z'),
    );
    expect(before.assumptions).toHaveLength(0);
    expect(before.decisions).toHaveLength(0);
    // Run the intake writers (the actual filesystem path the slice ships)
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A1' });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A2' });
    await addIntelligenceDecision(active.root, {
      recommendationId: rec.id, title: 'D1', rationale: 'r',
    });
    // Run the actual runContext IO glue (reads the ledgers we just populated)
    const after = await runContext(active.root, 'handoff', new Date('2026-05-20T00:00:00.000Z'));
    expect(after.assumptions).toHaveLength(2);
    expect(after.decisions).toHaveLength(1);
    // No changes to context.ts/render-context.ts required for this to pass
  });
});
```

Imports to add (top of file if not already present):

```ts
import {
  addAssumption,
  addIntelligenceDecision,
  addRecommendation,
} from '../../src/intelligence/store.js';
import { runContext, synthesizeContextPacket } from '../../src/intelligence/context.js';
import { tempRepo, type Fixture } from '@cadence/testkit';
```

If the existing file uses different fixture helpers (which it does for the synth tests), keep them in-place — only ADD what's needed for the integration test (which is the first test in this file to actually use `tempRepo` + `runContext`).

- [ ] **Step 2: Run — verify GREEN immediately**

```bash
pnpm --filter @cadence/core test -- --run intelligence/context
```

The test passes WITHOUT any change to `context.ts` or `render-context.ts`. That IS the AC.

- [ ] **Step 3: Full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/tests/intelligence/context.test.ts
git commit -m "$(cat <<'EOF'
test(core): integration — Slice-5/7 packets densify on intake (Slice 8 AC-11)

Proves the slice's stated leverage: intake writers populate the ledgers,
Slice-5's existing synthesizeContextPacket + runContext consume them, and
the handoff-scope packet's assumptions/decisions sections densify
automatically. Zero changes to context.ts/render-context.ts required —
the test passes by virtue of Slice-5's reader wiring.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Docs — commands.md + CHANGELOG + Slice-7 follow-ref reconcile

**Files:**
- Modify: `docs/reference/commands.md` (regenerate auto-marker region + add 2 new sections)
- Modify: `CHANGELOG.md` (one new line under Unreleased → Added)
- Modify: `docs/superpowers/specs/2026-05-18-cadence-context-packets-review-agent-design.md` (Follow-On reconciliation)

- [ ] **Step 1: Regenerate `commands.md` auto-marker region**

```bash
grep -n "cadence:commands" docs/reference/commands.md
```

Confirms `<!-- cadence:commands:start -->` at line 56 and `<!-- cadence:commands:end -->` at line 74. The block lists all top-level commands.

Two top-level commands are net-new this slice: `assumption`, `decision`. Add bullet entries (insertion order = alphabetical-by-command in the existing list — confirm placement against current alphabetical ordering by reading lines 56-74):

```markdown
  - [assumption](#assumption)
  - [decision](#decision)
```

Place each in the alphabetically correct position (after any existing entries that sort before, before any that sort after).

- [ ] **Step 2: Add `### assumption` and `### decision` sections to `commands.md`**

Place both in alphabetical order relative to existing top-level `###` sections. Use this exact template (mirror Slice-1's `### recommendation` section shape):

```markdown
### assumption

```
Usage: cadence assumption [options] [command]

Manage CADENCE strategic-intelligence assumptions
```

**Subcommands**

| Subcommand | Description |
|---|---|
| `add` | Add a manual assumption tied to a recommendation |
| `list` | List recorded assumptions |

**`add` options**

| Option | Description |
|---|---|
| `--rec <id>` | Recommendation id this assumption belongs to (required) |
| `--text <text>` | Assumption statement (required) |

**Behavior** — part of the CADENCE strategic-intelligence layer (Praxis). Refuses unknown `--rec` with exit 1 + clean stderr. New assumptions land with `status='open'`. Writes `.cadence/intelligence/assumptions.json` + `.cadence/intelligence/ASSUMPTIONS.md` atomically on every add. `list` writes a compact one-line-per-entry summary to stdout (`${id}  ${status}  ${recommendationId}  ${text}`). Status-transition subcommands (`validate` / `reject`) ship in a follow-up slice.

**Exit codes** — `add`: exits 1 on unknown rec id or any artifact write error; usage error from commander on missing required option. `list`: exits 0 even on empty ledger (prints `No assumptions recorded.`).

---

### decision

```
Usage: cadence decision [options] [command]

Manage CADENCE strategic-intelligence decisions
```

**Subcommands**

| Subcommand | Description |
|---|---|
| `add` | Record an architectural decision (optionally tied to a recommendation) |
| `list` | List recorded decisions |

**`add` options**

| Option | Description |
|---|---|
| `--rec <id>` | Recommendation id this decision belongs to (optional) |
| `--title <title>` | Short decision title (required) |
| `--rationale <text>` | Decision rationale (required) |

**Behavior** — `--rec` is optional; FK-checked only when provided. Untied decisions are valid (architectural decisions that don't tie to a specific recommendation). The persisted entity OMITS the `recommendationId` field entirely on untied decisions (exact-optional pattern). Writes `.cadence/intelligence/decisions.json` + `.cadence/intelligence/DECISIONS.md` on every add. `list` writes one line per entry (`${id}  ${recommendationId ?? '—'}  ${title}`); untied decisions show the em-dash placeholder in the rec column.

**Exit codes** — same shape as `assumption`.

---
```

- [ ] **Step 3: Add CHANGELOG line**

Just below the existing Slice-7 `cadence context review + cadence context agent` line under `## [Unreleased] → ### Added`, add:

```markdown
- `cadence assumption add | list` + `cadence decision add | list` — two new top-level intake commands that populate the strategic-intelligence `assumptions.json` + `decisions.json` ledgers Slice 5 wired readers for and Slices 5/7 documented as honest-empty. Assumption `--rec` is required + FK-checked; decision `--rec` is optional (untied decisions valid + `recommendationId` field omitted entirely on the persisted entity). Status transitions for assumptions deferred to a follow-up slice (Slice-1 minimalism precedent). Closes the honest-empty gap — Slice-5/7 `review` + `agent` + `phase` + `handoff` packets now densify automatically (Praxis Slice 8).
```

- [ ] **Step 4: Reconcile Slice-7 Follow-On forward-ref**

In `docs/superpowers/specs/2026-05-18-cadence-context-packets-review-agent-design.md`, find the Follow-On line:

```markdown
- An assumption / decision intake command — would densify both new scopes' assumptions/decisions sections (Slice 5's documented gap applies here verbatim).
```

Replace with strike + annotate (mirror Slice 6/7 pattern):

```markdown
- ~~An assumption / decision intake command — would densify both new scopes' assumptions/decisions sections (Slice 5's documented gap applies here verbatim).~~ — shipped in Slice 8 ([`2026-05-20-cadence-assumption-decision-intake-design.md`](2026-05-20-cadence-assumption-decision-intake-design.md)).
```

Also grep for other forward-refs that may exist in Slice-5 design:

```bash
grep -rn "intake command\|intake.*assumption\|assumption.*intake" docs/superpowers/specs/ | grep -v 2026-05-20-cadence-assumption-decision-intake-design
```

Reconcile every hit with the same strike + annotate pattern.

- [ ] **Step 5: Final full done-bar gate**

```bash
pnpm turbo run lint typecheck test build
```

Expected: 16/16 successful. Phase-31.1 cli-reference drift guard (`tests/docs/cli-reference.test.ts`) is part of the gate — if the auto-marker region wasn't regenerated correctly, this test fails. Read its assertion expectations and fix the marker block to match.

- [ ] **Step 6: Commit**

```bash
git add docs/reference/commands.md CHANGELOG.md docs/superpowers/specs/2026-05-18-cadence-context-packets-review-agent-design.md
git commit -m "$(cat <<'EOF'
docs: document assumption + decision intake + reconcile Slice-7 follow-ref (Slice 8)

- Extends docs/reference/commands.md with ### assumption + ### decision
  sections (mirror Slice-1 ### recommendation shape); regenerates the
  <!-- cadence:commands:start --> auto-marker region to list both new
  top-level commands (Phase-31.1 drift guard).
- CHANGELOG Unreleased → Added: one-liner for Slice 8.
- Slice-7 design Follow-On: strike + annotate the now-shipped assumption/
  decision intake forward-ref (mirrors Slice-6/7 reconciliation pattern).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Verify slice complete**

```bash
git log --oneline -10
git status --short --branch
pnpm turbo run lint typecheck test build  # final sanity
```

Branch state should be ~7 commits ahead of `origin/praxis-intelligence-ledger`. Push is user-gated per workstream rules (memory: `project_praxis_layer.md`). Confirm with user before executing `git push`. Pre-push hook runs full gate; let it run. No `--no-verify`.

After push: update `project_praxis_layer.md` memory entry per Praxis workstream convention (move Slice 8 into shipped-slices list; update branch HEAD sha; update PR #9 commit count; set NEXT SLICE per the new Follow-On).

---

## Slice-level success criteria

Every AC from the spec passes:

- AC-1 + AC-2 (Task 1 — assumption writer + FK refuse)
- AC-3 + AC-4 (Task 2 — decision writer + FK refuse + field omission)
- AC-5 + AC-6 (Task 3 — render unit tests)
- AC-7 + AC-8 (Task 4 — CLI assumption)
- AC-9 (Task 5 — CLI decision)
- AC-11 (Task 6 — integration densification)
- AC-10 (Task 7 — cli-reference drift guard)

Done-bar passes on every task. Branch HEAD pushes clean. PR #9 stays draft + unmerged. CADENCE public release remains held until full Praxis integration.
