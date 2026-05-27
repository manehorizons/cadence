# Slice 35 — `--sort-by` on list commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--sort-by <key>[:desc]` to `cadence recommendation list`, `cadence assumption list`, and `cadence decision list`. Single-key syntax, ascending default with `:desc` suffix, per-command key menu (17 keys total), composes with the existing filter pipeline.

**Architecture:** Three symmetric, per-command implementations. Each command gains an `--sort-by` option, a tiny `parseSortBy` helper duplicated in the file (no shared `sort.ts` shim — anti-scope per spec Decision Log §9), a per-command key allowlist Set, a per-command `compare*` function dispatched by key type, and one pipeline stage inserted between the last filter and `--reverse`. Enum sort uses Zod-declared option arrays for ordering. JS native stable sort (V8 / Node 20+) handles tie-breaks automatically. No schema, store, render, or `@cadence/types` change.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), commander for CLI parsing, vitest for tests, `@cadence/testkit`'s `tempRepo`, `pnpm turbo` for the gate.

**Upstream design source:** `docs/superpowers/specs/2026-05-27-cadence-list-sort-by-design.md` (committed `511f687` on `main`).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/core/src/cli/commands/recommendation.ts` | Modify | Add `--sort-by` option, parse helper, REC_SORT_KEYS Set, `compareRec`, pipeline stage. Add `RecommendationDecayStateZ` import. |
| `packages/core/src/cli/commands/assumption.ts` | Modify | Add `--sort-by` option, parse helper, ASN_SORT_KEYS Set, ASN_STATUS_ORDER, `compareAsn`, pipeline stage. |
| `packages/core/src/cli/commands/decision.ts` | Modify | Add `--sort-by` option, parse helper, DEC_SORT_KEYS Set, DEC_STATUS_ORDER, `compareDec` (handles `undefined` `recommendationId`), pipeline stage. |
| `packages/core/tests/cli/recommendation.test.ts` | Modify (append) | 12 new tests (10 shared ACs + 2 rec-specific). |
| `packages/core/tests/cli/assumption.test.ts` | Modify (append) | 10 new tests (10 shared ACs). |
| `packages/core/tests/cli/decision.test.ts` | Modify (append) | 11 new tests (10 shared ACs + 1 dec-specific). |
| `docs/reference/commands.md` | Modify | Document `--sort-by` under each of the three list subcommands. |

**No new files.** No `@cadence/types` schema change.

**Total expected net additions:** ~150–200 LoC of source (~50 per command × 3) + ~600 LoC of tests + a few rows in `commands.md`.

**Commit shape (Praxis convention, plan-doc committed in advance):**
1. (already committed) `docs: Slice 35 implementation plan (--sort-by on list commands)` — the file you are reading
2. `feat(core): --sort-by on recommendation/assumption/decision list (Slice 35)` — Tasks 1–3 bundle into one feat commit at Task 4
3. `docs: document --sort-by on list commands + reconcile Slice-24/25/26/27/28/31/32/33 follow-refs (Slice 35)` — Tasks 5–6

This project does **NOT** use the Co-Authored-By trailer on feat/docs commits.

---

## Task 1: `--sort-by` on `recommendation list`

**Files:**
- Modify (source): `packages/core/src/cli/commands/recommendation.ts`
- Modify (append tests): `packages/core/tests/cli/recommendation.test.ts`

### Step 1.1: Write the failing happy-path ascending-timestamp test

Append inside the existing `describe('cadence recommendation', ...)` block at the bottom of `packages/core/tests/cli/recommendation.test.ts`, just before the closing `});` of the describe.

The test seeds three recs, mutates each `createdAt` to a known out-of-order value via direct ledger edit (same pattern Slice 34.4 used), then asserts `--sort-by created` returns chronological order.

```typescript
  it('Slice 35 AC-sort-1 (rec): --sort-by created returns entries by createdAt ascending', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort1' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].createdAt = '2024-01-03T00:00:00+00:00';
    ledger.recommendations[1].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.recommendations[2].createdAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--sort-by', 'created', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr.map((x: { title: string }) => x.title)).toEqual(['B', 'C', 'A']);
  });
```

### Step 1.2: Run the build + test, verify FAIL

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- recommendation.test
```

Expected: this single new test fails. Commander rejects `--sort-by` as an unknown option, so the run exits non-zero and `expect(r.code).toBe(0)` fails.

### Step 1.3: Add `RecommendationDecayStateZ` to the imports

In `packages/core/src/cli/commands/recommendation.ts`, the current imports at lines 2–6 are:

```typescript
import {
  RecommendationPriorityZ,
  RecommendationReadinessZ,
  RecommendationStatusZ,
} from '@cadence/types';
```

Extend that import to include `RecommendationDecayStateZ` and the `Recommendation` type:

```typescript
import {
  type Recommendation,
  RecommendationDecayStateZ,
  RecommendationPriorityZ,
  RecommendationReadinessZ,
  RecommendationStatusZ,
} from '@cadence/types';
```

(The `type Recommendation` import is needed by `compareRec`'s signature.)

### Step 1.4: Add module-local helpers below the existing `csv` helper (currently around line 18)

Find the `csv` function in `recommendation.ts` (currently lines 18–24) and insert these helpers immediately after it, before the function that registers the `list` subcommand. Insert exactly:

```typescript
type SortDir = 'asc' | 'desc';
type ParsedSort = { key: string; dir: SortDir } | { error: string };

function parseSortBy(raw: string): ParsedSort {
  if (raw.length === 0) return { error: '--sort-by requires a key' };
  const colon = raw.indexOf(':');
  if (colon === -1) return { key: raw, dir: 'asc' };
  const key = raw.slice(0, colon);
  const dirRaw = raw.slice(colon + 1);
  if (key.length === 0) return { error: '--sort-by requires a key' };
  if (dirRaw !== 'asc' && dirRaw !== 'desc') {
    return { error: `invalid sort direction: '${dirRaw}' (use 'asc' or 'desc')` };
  }
  return { key, dir: dirRaw };
}

const REC_SORT_KEYS = new Set([
  'created',
  'updated',
  'priority',
  'status',
  'title',
  'leverage',
  'risk',
  'confidence',
  'decay',
]);

function compareRec(a: Recommendation, b: Recommendation, key: string): number {
  switch (key) {
    case 'created':
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    case 'updated':
      return a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
    case 'title':
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
    case 'leverage':
      return a.leverageScore - b.leverageScore;
    case 'risk':
      return a.riskScore - b.riskScore;
    case 'confidence':
      return a.confidence - b.confidence;
    case 'priority':
      return (
        RecommendationPriorityZ.options.indexOf(a.priority) -
        RecommendationPriorityZ.options.indexOf(b.priority)
      );
    case 'status':
      return (
        RecommendationStatusZ.options.indexOf(a.status) -
        RecommendationStatusZ.options.indexOf(b.status)
      );
    case 'decay':
      return (
        RecommendationDecayStateZ.options.indexOf(a.decayState) -
        RecommendationDecayStateZ.options.indexOf(b.decayState)
      );
    default:
      return 0;
  }
}
```

### Step 1.5: Add the `--sort-by` option declaration and update the action callback typing

Find the `recommendation list` subcommand registration (currently at lines 154–267). The current sequence of `.option(...)` calls (lines 157–164) is:

```typescript
    .option('--format <format>', ...)
    .option('--filter-status <status>', ...)
    .option('--filter-text <substr>', ...)
    .option('--filter-regex <pattern>', ...)
    .option('--filter-converted-to <phaseId>', ...)
    .option('--reverse', ...)
    .option('--offset <n>', ...)
    .option('--limit <n>', ...)
```

Insert a new `.option(...)` line for `--sort-by` immediately after the existing `--filter-converted-to` line and before `--reverse`. Insert exactly:

```typescript
    .option('--sort-by <key>', 'Sort by a single key, optionally with :desc suffix. Allowed keys: created, updated, priority, status, title, leverage, risk, confidence, decay.')
```

Then update the `.action(async (opts: {...}) => {` callback's `opts` typing (currently line 165). The current typing reads:

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterText?: string; filterRegex?: string; filterConvertedTo?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

Replace it with the same typing plus `sortBy?: string`:

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterText?: string; filterRegex?: string; filterConvertedTo?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

### Step 1.6: Insert the sort pipeline stage between `--filter-converted-to` and `--reverse`

Locate the existing `--filter-converted-to` block (currently lines 216–218):

```typescript
        if (opts.filterConvertedTo !== undefined) {
          entries = entries.filter((r) => r.convertedToPhaseId === opts.filterConvertedTo);
        }
```

And the existing `--reverse` block immediately after it (currently lines 219–221):

```typescript
        if (opts.reverse) {
          entries = entries.slice().reverse();
        }
```

Insert this new block between them:

```typescript
        if (opts.sortBy !== undefined) {
          const parsed = parseSortBy(opts.sortBy);
          if ('error' in parsed) {
            process.stderr.write(`recommendation list failed: ${parsed.error}\n`);
            process.exitCode = 1;
            return;
          }
          if (!REC_SORT_KEYS.has(parsed.key)) {
            const allowed = [...REC_SORT_KEYS].join(', ');
            process.stderr.write(
              `recommendation list failed: invalid sort key: ${parsed.key} (allowed: ${allowed})\n`,
            );
            process.exitCode = 1;
            return;
          }
          const sortKey = parsed.key;
          const dir = parsed.dir;
          entries = entries.slice().sort((a, b) =>
            dir === 'desc' ? -compareRec(a, b, sortKey) : compareRec(a, b, sortKey),
          );
        }
```

### Step 1.7: Run the build + test, verify the happy-path test now PASSES

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- recommendation.test
```

Expected: all `cadence recommendation` tests pass. Test count for this file grows by 1 (so far).

### Step 1.8: Append the remaining 11 tests for `recommendation list`

Append each `it(...)` block inside the same `describe('cadence recommendation', ...)`, just before the closing `});`. Append all 11 in one edit. Each is independent and references its AC token in the test name.

```typescript
  it('Slice 35 AC-sort-2 (rec): --sort-by created:desc returns entries by createdAt descending', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort2' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].createdAt = '2024-01-03T00:00:00+00:00';
    ledger.recommendations[1].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.recommendations[2].createdAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--sort-by', 'created:desc', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['A', 'C', 'B']);
  });

  it('Slice 35 AC-sort-3 (rec): --sort-by priority orders by Zod enum declaration (low<medium<high<critical)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort3' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's', '--priority', 'critical'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's', '--priority', 'low'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's', '--priority', 'high'], active.root);
    await run(['recommendation', 'add', '--title', 'D', '--summary', 's', '--priority', 'medium'], active.root);
    const r = await run(
      ['recommendation', 'list', '--sort-by', 'priority', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['B', 'D', 'C', 'A']);
  });

  it('Slice 35 AC-sort-4 (rec): stable tie-break preserves insertion order for equal-key entries', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort4' });
    // Three recs all with priority=medium (the default).
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    const r = await run(
      ['recommendation', 'list', '--sort-by', 'priority', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    // All equal keys → insertion order preserved.
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['A', 'B', 'C']);
  });

  it('Slice 35 AC-sort-5 (rec): sort applies after --filter-status (filtered subset only)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort5' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    // Mark [0] and [2] as accepted; leave [1] as candidate.
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].status = 'accepted';
    ledger.recommendations[0].createdAt = '2024-01-02T00:00:00+00:00';
    ledger.recommendations[2].status = 'accepted';
    ledger.recommendations[2].createdAt = '2024-01-01T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--filter-status', 'accepted', '--sort-by', 'created', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    // Only the two accepted recs returned, in chronological order.
    expect(arr).toHaveLength(2);
    expect(arr.map((x: { title: string }) => x.title)).toEqual(['C', 'A']);
  });

  it('Slice 35 AC-sort-6 (rec): --sort-by <key> --reverse equals --sort-by <key>:desc', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort6' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].createdAt = '2024-01-03T00:00:00+00:00';
    ledger.recommendations[1].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.recommendations[2].createdAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const a = await run(
      ['recommendation', 'list', '--sort-by', 'created', '--reverse', '--format', 'json'],
      active.root,
    );
    const b = await run(
      ['recommendation', 'list', '--sort-by', 'created:desc', '--format', 'json'],
      active.root,
    );
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    expect(a.stdout).toBe(b.stdout);
  });

  it('Slice 35 AC-sort-7 (rec): --sort-by composes with --offset and --limit (pagination on sorted output)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort7' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'D', '--summary', 's'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].createdAt = '2024-01-04T00:00:00+00:00';
    ledger.recommendations[1].createdAt = '2024-01-02T00:00:00+00:00';
    ledger.recommendations[2].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.recommendations[3].createdAt = '2024-01-03T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--sort-by', 'created', '--offset', '1', '--limit', '2', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    // Asc by created: [C(Jan 1), B(Jan 2), D(Jan 3), A(Jan 4)]. offset 1 → skip C. limit 2 → take [B, D].
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['B', 'D']);
  });

  it('Slice 35 AC-sort-8 (rec): --format json emits sorted array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort8' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's', '--priority', 'low'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's', '--priority', 'critical'], active.root);
    const r = await run(
      ['recommendation', 'list', '--sort-by', 'priority:desc', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    // Critical first.
    expect(arr[0].title).toBe('B');
    expect(arr[1].title).toBe('A');
  });

  it('Slice 35 AC-sort-9 (rec): invalid key errors with allowed-list message and exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort9' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    const r = await run(
      ['recommendation', 'list', '--sort-by', 'foo'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'recommendation list failed: invalid sort key: foo (allowed: created, updated, priority, status, title, leverage, risk, confidence, decay)\n',
    );
  });

  it('Slice 35 AC-sort-10 (rec): malformed direction errors with use-asc-or-desc message and exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_sort10' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    const r = await run(
      ['recommendation', 'list', '--sort-by', 'created:xyz'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      "recommendation list failed: invalid sort direction: 'xyz' (use 'asc' or 'desc')\n",
    );
  });

  it('Slice 35 AC-sort-rec-1: --sort-by leverage uses numeric compare (not lexicographic)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_lev' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    // Picked so numeric and lexicographic orders differ:
    //   numeric asc:  2, 9, 10  → B, C, A
    //   lexicographic asc on string("10") < string("2") < string("9") → A, B, C
    ledger.recommendations[0].leverageScore = 10;
    ledger.recommendations[1].leverageScore = 2;
    ledger.recommendations[2].leverageScore = 9;
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--sort-by', 'leverage', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['B', 'C', 'A']);
  });

  it('Slice 35 AC-sort-rec-2: --sort-by decay orders by Zod enum declaration (fresh<aging<stale<superseded<contradicted<needs-revalidation)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_rec_decay' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'C', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'D', '--summary', 's'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].decayState = 'stale';
    ledger.recommendations[1].decayState = 'fresh';
    ledger.recommendations[2].decayState = 'needs-revalidation';
    ledger.recommendations[3].decayState = 'aging';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--sort-by', 'decay', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    // Enum order: fresh, aging, stale, ..., needs-revalidation → B, D, A, C.
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['B', 'D', 'A', 'C']);
  });
```

### Step 1.9: Run all `recommendation.test` tests, verify PASS

```bash
pnpm --filter @cadence/core test -- recommendation.test
```

Expected: all `cadence recommendation` tests pass. Test count for this file grew by **12** (1 happy-path from Step 1.1 + 11 from Step 1.8).

### Step 1.10: Do NOT commit yet

Leave the working tree dirty for now. Task 4 bundles all three commands into a single feat commit per Praxis convention.

```bash
git status --porcelain | head
```

Expected: two files modified — `packages/core/src/cli/commands/recommendation.ts` and `packages/core/tests/cli/recommendation.test.ts`. No other changes.

---

## Task 2: `--sort-by` on `assumption list`

**Files:**
- Modify (source): `packages/core/src/cli/commands/assumption.ts`
- Modify (append tests): `packages/core/tests/cli/assumption.test.ts`

### Step 2.1: Write the failing happy-path test

Append inside the existing `describe('cadence assumption (Slice 8)', ...)` block in `packages/core/tests/cli/assumption.test.ts`, just before the closing `});`:

```typescript
  it('Slice 35 AC-sort-1 (asn): --sort-by created returns entries by createdAt ascending', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort1' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'C'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].createdAt = '2024-01-03T00:00:00+00:00';
    ledger.assumptions[1].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.assumptions[2].createdAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['assumption', 'list', '--sort-by', 'created', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { text: string }) => x.text)).toEqual(['B', 'C', 'A']);
  });
```

### Step 2.2: Run build + test, verify FAIL

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- assumption.test
```

Expected: the new test fails because `--sort-by` is not registered yet.

### Step 2.3: Add module-local helpers below the existing top-of-file imports

In `packages/core/src/cli/commands/assumption.ts`, the current imports at lines 1–10 are:

```typescript
import type { Command } from 'commander';
import { type Assumption, AssumptionZ } from '@cadence/types';
import {
  addAssumption,
  readAssumptionLedger,
  readRecommendationLedger,
  runAssumptionTransition,
  type AssumptionTransitionAction,
} from '../../intelligence/store.js';
import { renderAssumptionDetail } from '../../intelligence/render-assumption-detail.js';
```

Insert helpers immediately after the imports and any existing top-level helpers (look for the `ASSUMPTION_TRANSITION_DESCRIPTIONS` constant — insert just before that):

```typescript
type SortDir = 'asc' | 'desc';
type ParsedSort = { key: string; dir: SortDir } | { error: string };

function parseSortBy(raw: string): ParsedSort {
  if (raw.length === 0) return { error: '--sort-by requires a key' };
  const colon = raw.indexOf(':');
  if (colon === -1) return { key: raw, dir: 'asc' };
  const key = raw.slice(0, colon);
  const dirRaw = raw.slice(colon + 1);
  if (key.length === 0) return { error: '--sort-by requires a key' };
  if (dirRaw !== 'asc' && dirRaw !== 'desc') {
    return { error: `invalid sort direction: '${dirRaw}' (use 'asc' or 'desc')` };
  }
  return { key, dir: dirRaw };
}

const ASN_SORT_KEYS = new Set(['created', 'status', 'text', 'rec']);

const ASN_STATUS_ORDER: ReadonlyArray<Assumption['status']> = [
  'open',
  'validated',
  'rejected',
];

function compareAsn(a: Assumption, b: Assumption, key: string): number {
  switch (key) {
    case 'created':
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    case 'text':
      return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
    case 'rec':
      return a.recommendationId < b.recommendationId
        ? -1
        : a.recommendationId > b.recommendationId
        ? 1
        : 0;
    case 'status':
      return ASN_STATUS_ORDER.indexOf(a.status) - ASN_STATUS_ORDER.indexOf(b.status);
    default:
      return 0;
  }
}
```

(`AssumptionZ` is already imported. `recommendationId` on `Assumption` is required — `z.string().min(1)` in the schema — so no `undefined` branch is needed for the `rec` case.)

### Step 2.4: Add the `--sort-by` option and update the action callback typing

Find the `assumption list` subcommand registration (currently lines 98–?). The current `.option(...)` sequence is:

```typescript
    .option('--format <format>', ...)
    .option('--filter-status <status>', ...)
    .option('--filter-rec <recId>', ...)
    .option('--filter-text <substr>', ...)
    .option('--filter-regex <pattern>', ...)
    .option('--reverse', ...)
    .option('--offset <n>', ...)
    .option('--limit <n>', ...)
```

Insert a new `--sort-by` line immediately after `--filter-regex` and before `--reverse`. Insert exactly:

```typescript
    .option('--sort-by <key>', 'Sort by a single key, optionally with :desc suffix. Allowed keys: created, status, text, rec.')
```

Then update the `.action(async (opts: {...}) => {` typing (currently line 108) to add `sortBy?: string` — insert it just before `reverse?: boolean`:

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterRec?: string; filterText?: string; filterRegex?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

### Step 2.5: Insert the sort pipeline stage between the regex filter and `--reverse`

Locate the existing regex filter block (around line 156, the line `entries = entries.filter((a) => regex.test(a.text));`) and the `--reverse` block immediately after. Insert this new block between them — specifically, AFTER the closing `}` of the `if (opts.filterRegex !== undefined) { ... }` block and BEFORE `if (opts.reverse) {`:

```typescript
        if (opts.sortBy !== undefined) {
          const parsed = parseSortBy(opts.sortBy);
          if ('error' in parsed) {
            process.stderr.write(`assumption list failed: ${parsed.error}\n`);
            process.exitCode = 1;
            return;
          }
          if (!ASN_SORT_KEYS.has(parsed.key)) {
            const allowed = [...ASN_SORT_KEYS].join(', ');
            process.stderr.write(
              `assumption list failed: invalid sort key: ${parsed.key} (allowed: ${allowed})\n`,
            );
            process.exitCode = 1;
            return;
          }
          const sortKey = parsed.key;
          const dir = parsed.dir;
          entries = entries.slice().sort((a, b) =>
            dir === 'desc' ? -compareAsn(a, b, sortKey) : compareAsn(a, b, sortKey),
          );
        }
```

### Step 2.6: Run build + test, verify the happy-path test PASSES

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- assumption.test
```

Expected: all `cadence assumption` tests pass. Count grew by 1.

### Step 2.7: Append the remaining 9 tests for `assumption list`

Append to the same `describe(...)` block, just before its closing `});`:

```typescript
  it('Slice 35 AC-sort-2 (asn): --sort-by created:desc returns entries by createdAt descending', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort2' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'C'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].createdAt = '2024-01-03T00:00:00+00:00';
    ledger.assumptions[1].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.assumptions[2].createdAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['assumption', 'list', '--sort-by', 'created:desc', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { text: string }) => x.text)).toEqual(['A', 'C', 'B']);
  });

  it('Slice 35 AC-sort-3 (asn): --sort-by status orders by Zod enum declaration (open<validated<rejected)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort3' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'C'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].status = 'rejected';
    ledger.assumptions[1].status = 'open';
    ledger.assumptions[2].status = 'validated';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['assumption', 'list', '--sort-by', 'status', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    // open < validated < rejected → B, C, A.
    expect(JSON.parse(r.stdout).map((x: { text: string }) => x.text)).toEqual(['B', 'C', 'A']);
  });

  it('Slice 35 AC-sort-4 (asn): stable tie-break preserves insertion order for equal-key entries', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort4' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    // Three assumptions, all status=open (default).
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'C'], active.root);
    const r = await run(
      ['assumption', 'list', '--sort-by', 'status', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { text: string }) => x.text)).toEqual(['A', 'B', 'C']);
  });

  it('Slice 35 AC-sort-5 (asn): sort applies after --filter-status (filtered subset only)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort5' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'C'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].status = 'validated';
    ledger.assumptions[0].createdAt = '2024-01-02T00:00:00+00:00';
    ledger.assumptions[2].status = 'validated';
    ledger.assumptions[2].createdAt = '2024-01-01T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['assumption', 'list', '--filter-status', 'validated', '--sort-by', 'created', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(2);
    expect(arr.map((x: { text: string }) => x.text)).toEqual(['C', 'A']);
  });

  it('Slice 35 AC-sort-6 (asn): --sort-by <key> --reverse equals --sort-by <key>:desc', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort6' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'C'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].createdAt = '2024-01-03T00:00:00+00:00';
    ledger.assumptions[1].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.assumptions[2].createdAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const a = await run(
      ['assumption', 'list', '--sort-by', 'created', '--reverse', '--format', 'json'],
      active.root,
    );
    const b = await run(
      ['assumption', 'list', '--sort-by', 'created:desc', '--format', 'json'],
      active.root,
    );
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    expect(a.stdout).toBe(b.stdout);
  });

  it('Slice 35 AC-sort-7 (asn): --sort-by composes with --offset and --limit', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort7' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'B'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'C'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'D'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].createdAt = '2024-01-04T00:00:00+00:00';
    ledger.assumptions[1].createdAt = '2024-01-02T00:00:00+00:00';
    ledger.assumptions[2].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.assumptions[3].createdAt = '2024-01-03T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['assumption', 'list', '--sort-by', 'created', '--offset', '1', '--limit', '2', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { text: string }) => x.text)).toEqual(['B', 'D']);
  });

  it('Slice 35 AC-sort-8 (asn): --format json emits sorted array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort8' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'banana'], active.root);
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'apple'], active.root);
    const r = await run(
      ['assumption', 'list', '--sort-by', 'text', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr[0].text).toBe('apple');
    expect(arr[1].text).toBe('banana');
  });

  it('Slice 35 AC-sort-9 (asn): invalid key errors with allowed-list message and exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort9' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    const r = await run(
      ['assumption', 'list', '--sort-by', 'foo'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'assumption list failed: invalid sort key: foo (allowed: created, status, text, rec)\n',
    );
  });

  it('Slice 35 AC-sort-10 (asn): malformed direction errors with use-asc-or-desc message and exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_asn_sort10' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await run(['assumption', 'add', '--rec', rec.id, '--text', 'A'], active.root);
    const r = await run(
      ['assumption', 'list', '--sort-by', 'created:xyz'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      "assumption list failed: invalid sort direction: 'xyz' (use 'asc' or 'desc')\n",
    );
  });
```

### Step 2.8: Run all `assumption.test` tests, verify PASS

```bash
pnpm --filter @cadence/core test -- assumption.test
```

Expected: all `cadence assumption` tests pass. Test count for this file grew by **10**.

### Step 2.9: Do NOT commit yet

```bash
git status --porcelain | head
```

Expected: now four files modified — recommendation.ts + its test (from Task 1) plus assumption.ts + its test (this task). Working tree dirty; tracked for Task 4 bundling.

---

## Task 3: `--sort-by` on `decision list`

**Files:**
- Modify (source): `packages/core/src/cli/commands/decision.ts`
- Modify (append tests): `packages/core/tests/cli/decision.test.ts`

### Step 3.1: Write the failing happy-path test

Append inside the existing `describe('cadence decision (Slice 8)', ...)` block in `packages/core/tests/cli/decision.test.ts`, just before the closing `});`:

```typescript
  it('Slice 35 AC-sort-1 (dec): --sort-by decided returns entries by decidedAt ascending', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort1' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'B', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'C', '--rationale', 'r'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].decidedAt = '2024-01-03T00:00:00+00:00';
    ledger.decisions[1].decidedAt = '2024-01-01T00:00:00+00:00';
    ledger.decisions[2].decidedAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['decision', 'list', '--sort-by', 'decided', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['B', 'C', 'A']);
  });
```

### Step 3.2: Run build + test, verify FAIL

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- decision.test
```

Expected: this new test fails.

### Step 3.3: Add module-local helpers below the existing top-of-file imports

In `packages/core/src/cli/commands/decision.ts`, the existing imports are around lines 1–13. Insert helpers immediately after the `DECISION_TRANSITION_DESCRIPTIONS` constant (around line 14) or whichever top-level helper appears first — find a clean spot above the `register*` function that defines the `list` subcommand. Insert:

```typescript
type SortDir = 'asc' | 'desc';
type ParsedSort = { key: string; dir: SortDir } | { error: string };

function parseSortBy(raw: string): ParsedSort {
  if (raw.length === 0) return { error: '--sort-by requires a key' };
  const colon = raw.indexOf(':');
  if (colon === -1) return { key: raw, dir: 'asc' };
  const key = raw.slice(0, colon);
  const dirRaw = raw.slice(colon + 1);
  if (key.length === 0) return { error: '--sort-by requires a key' };
  if (dirRaw !== 'asc' && dirRaw !== 'desc') {
    return { error: `invalid sort direction: '${dirRaw}' (use 'asc' or 'desc')` };
  }
  return { key, dir: dirRaw };
}

const DEC_SORT_KEYS = new Set(['decided', 'status', 'title', 'rec']);

const DEC_STATUS_ORDER: ReadonlyArray<IntelligenceDecision['status']> = [
  'active',
  'superseded',
  'rescinded',
];

function compareDec(a: IntelligenceDecision, b: IntelligenceDecision, key: string): number {
  switch (key) {
    case 'decided':
      return a.decidedAt < b.decidedAt ? -1 : a.decidedAt > b.decidedAt ? 1 : 0;
    case 'title':
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
    case 'status':
      return DEC_STATUS_ORDER.indexOf(a.status) - DEC_STATUS_ORDER.indexOf(b.status);
    case 'rec': {
      const aHas = a.recommendationId !== undefined;
      const bHas = b.recommendationId !== undefined;
      if (!aHas && !bHas) return 0;
      if (!aHas) return 1;
      if (!bHas) return -1;
      const ar = a.recommendationId as string;
      const br = b.recommendationId as string;
      return ar < br ? -1 : ar > br ? 1 : 0;
    }
    default:
      return 0;
  }
}
```

(`IntelligenceDecision` is already imported as `type` per the current imports.)

### Step 3.4: Add the `--sort-by` option and update the action callback typing

Find the `decision list` subcommand registration (currently lines 140–?). The current `.option(...)` sequence is:

```typescript
    .option('--format <format>', ...)
    .option('--filter-status <status>', ...)
    .option('--filter-rec <recId>', ...)
    .option('--include-untied', ...)
    .option('--filter-text <substr>', ...)
    .option('--filter-regex <pattern>', ...)
    .option('--reverse', ...)
    .option('--offset <n>', ...)
    .option('--limit <n>', ...)
```

Insert a new `--sort-by` line immediately after `--filter-regex` and before `--reverse`. Insert exactly:

```typescript
    .option('--sort-by <key>', 'Sort by a single key, optionally with :desc suffix. Allowed keys: decided, status, title, rec.')
```

Then update the action callback typing (currently line 151) to add `sortBy?: string` just before `reverse?: boolean`:

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterRec?: string; includeUntied?: boolean; filterText?: string; filterRegex?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

### Step 3.5: Insert the sort pipeline stage between the regex filter and `--reverse`

Locate the existing regex filter block (the line where decision filters by `regex.test(d.title) || regex.test(d.rationale)`) and the `--reverse` block immediately after it. Insert this block between them — AFTER the closing `}` of the `if (opts.filterRegex !== undefined) { ... }` block and BEFORE `if (opts.reverse) {`:

```typescript
        if (opts.sortBy !== undefined) {
          const parsed = parseSortBy(opts.sortBy);
          if ('error' in parsed) {
            process.stderr.write(`decision list failed: ${parsed.error}\n`);
            process.exitCode = 1;
            return;
          }
          if (!DEC_SORT_KEYS.has(parsed.key)) {
            const allowed = [...DEC_SORT_KEYS].join(', ');
            process.stderr.write(
              `decision list failed: invalid sort key: ${parsed.key} (allowed: ${allowed})\n`,
            );
            process.exitCode = 1;
            return;
          }
          const sortKey = parsed.key;
          const dir = parsed.dir;
          entries = entries.slice().sort((a, b) =>
            dir === 'desc' ? -compareDec(a, b, sortKey) : compareDec(a, b, sortKey),
          );
        }
```

### Step 3.6: Run build + test, verify the happy-path test PASSES

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- decision.test
```

Expected: all `cadence decision` tests pass. Count grew by 1.

### Step 3.7: Append the remaining 10 tests for `decision list`

Append to the same `describe(...)` block, just before its closing `});`:

```typescript
  it('Slice 35 AC-sort-2 (dec): --sort-by decided:desc returns entries by decidedAt descending', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort2' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'B', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'C', '--rationale', 'r'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].decidedAt = '2024-01-03T00:00:00+00:00';
    ledger.decisions[1].decidedAt = '2024-01-01T00:00:00+00:00';
    ledger.decisions[2].decidedAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['decision', 'list', '--sort-by', 'decided:desc', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['A', 'C', 'B']);
  });

  it('Slice 35 AC-sort-3 (dec): --sort-by status orders by Zod enum declaration (active<superseded<rescinded)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort3' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'B', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'C', '--rationale', 'r'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].status = 'rescinded';
    ledger.decisions[1].status = 'active';
    ledger.decisions[2].status = 'superseded';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['decision', 'list', '--sort-by', 'status', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    // active < superseded < rescinded → B, C, A.
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['B', 'C', 'A']);
  });

  it('Slice 35 AC-sort-4 (dec): stable tie-break preserves insertion order for equal-key entries', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort4' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'B', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'C', '--rationale', 'r'], active.root);
    // All status=active by default.
    const r = await run(
      ['decision', 'list', '--sort-by', 'status', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['A', 'B', 'C']);
  });

  it('Slice 35 AC-sort-5 (dec): sort applies after --filter-status (filtered subset only)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort5' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'B', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'C', '--rationale', 'r'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].status = 'superseded';
    ledger.decisions[0].decidedAt = '2024-01-02T00:00:00+00:00';
    ledger.decisions[2].status = 'superseded';
    ledger.decisions[2].decidedAt = '2024-01-01T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['decision', 'list', '--filter-status', 'superseded', '--sort-by', 'decided', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(2);
    expect(arr.map((x: { title: string }) => x.title)).toEqual(['C', 'A']);
  });

  it('Slice 35 AC-sort-6 (dec): --sort-by <key> --reverse equals --sort-by <key>:desc', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort6' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'B', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'C', '--rationale', 'r'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].decidedAt = '2024-01-03T00:00:00+00:00';
    ledger.decisions[1].decidedAt = '2024-01-01T00:00:00+00:00';
    ledger.decisions[2].decidedAt = '2024-01-02T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const a = await run(
      ['decision', 'list', '--sort-by', 'decided', '--reverse', '--format', 'json'],
      active.root,
    );
    const b = await run(
      ['decision', 'list', '--sort-by', 'decided:desc', '--format', 'json'],
      active.root,
    );
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    expect(a.stdout).toBe(b.stdout);
  });

  it('Slice 35 AC-sort-7 (dec): --sort-by composes with --offset and --limit', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort7' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'B', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'C', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'D', '--rationale', 'r'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].decidedAt = '2024-01-04T00:00:00+00:00';
    ledger.decisions[1].decidedAt = '2024-01-02T00:00:00+00:00';
    ledger.decisions[2].decidedAt = '2024-01-01T00:00:00+00:00';
    ledger.decisions[3].decidedAt = '2024-01-03T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['decision', 'list', '--sort-by', 'decided', '--offset', '1', '--limit', '2', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).map((x: { title: string }) => x.title)).toEqual(['B', 'D']);
  });

  it('Slice 35 AC-sort-8 (dec): --format json emits sorted array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort8' });
    await run(['decision', 'add', '--title', 'banana', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'apple', '--rationale', 'r'], active.root);
    const r = await run(
      ['decision', 'list', '--sort-by', 'title', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr[0].title).toBe('apple');
    expect(arr[1].title).toBe('banana');
  });

  it('Slice 35 AC-sort-9 (dec): invalid key errors with allowed-list message and exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort9' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    const r = await run(
      ['decision', 'list', '--sort-by', 'foo'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'decision list failed: invalid sort key: foo (allowed: decided, status, title, rec)\n',
    );
  });

  it('Slice 35 AC-sort-10 (dec): malformed direction errors with use-asc-or-desc message and exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_sort10' });
    await run(['decision', 'add', '--title', 'A', '--rationale', 'r'], active.root);
    const r = await run(
      ['decision', 'list', '--sort-by', 'decided:xyz'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      "decision list failed: invalid sort direction: 'xyz' (use 'asc' or 'desc')\n",
    );
  });

  it('Slice 35 AC-sort-dec-1: --sort-by rec sorts defined rec first (asc by id), undefined last; :desc flips', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice35_dec_rec' });
    // Seed one rec to tie against.
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    // Three decisions: two tied (one to rec, one to a synthetic id sorted earlier), one untied.
    await run(['decision', 'add', '--title', 'tied-z', '--rationale', 'r', '--rec', rec.id], active.root);
    await run(['decision', 'add', '--title', 'untied', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--title', 'tied-a', '--rationale', 'r', '--rec', rec.id], active.root);
    // Mutate the second tied entry's recommendationId to a string that sorts BEFORE rec.id.
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    const lowId = 'rec-00000000-000';
    ledger.decisions[2].recommendationId = lowId;
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    // Asc: tied-a (lowId) first, then tied-z (rec.id which is rec-<today>-001), then untied last.
    const asc = await run(
      ['decision', 'list', '--sort-by', 'rec', '--format', 'json'],
      active.root,
    );
    expect(asc.code).toBe(0);
    expect(JSON.parse(asc.stdout).map((x: { title: string }) => x.title)).toEqual([
      'tied-a',
      'tied-z',
      'untied',
    ]);

    // Desc: untied first, then tied-z, then tied-a.
    const desc = await run(
      ['decision', 'list', '--sort-by', 'rec:desc', '--format', 'json'],
      active.root,
    );
    expect(desc.code).toBe(0);
    expect(JSON.parse(desc.stdout).map((x: { title: string }) => x.title)).toEqual([
      'untied',
      'tied-z',
      'tied-a',
    ]);
  });
```

### Step 3.8: Run all `decision.test` tests, verify PASS

```bash
pnpm --filter @cadence/core test -- decision.test
```

Expected: all `cadence decision` tests pass. Test count for this file grew by **11**.

### Step 3.9: Do NOT commit yet

```bash
git status --porcelain | head
```

Expected: now six files modified across the three commands + their tests.

---

## Task 4: Full turbo gate + bundled feat commit

**Files:** None modified directly — this task validates and commits Tasks 1–3 atomically.

### Step 4.1: Run the full turbo gate

```bash
pnpm turbo run lint typecheck test build
```

Expected: **16/16 green** (4 packages × 4 tasks).

Common failure modes to inspect if it isn't green:
- `lint`: probable cause is a missing trailing comma in the inserted option string or in the new helper code. Prettier-style fixes handle it.
- `typecheck`: probable cause is the `Recommendation` type not actually importable as `type` (re-check the import line spelling), or a typo in `RecommendationDecayStateZ`. The `as string` cast in `compareDec`'s `rec` case is needed because `exactOptionalPropertyTypes` won't narrow through the `aHas/bHas` aliases.
- `test`: an enum-order assertion that doesn't match the Zod declaration order. Re-check `packages/types/src/intelligence.ts` lines 12–42 for the canonical orderings.

### Step 4.2: Sanity-check the diff

```bash
git status --porcelain
git diff --stat
```

Expected: exactly six files affected:
- `packages/core/src/cli/commands/recommendation.ts` (~50 line additions)
- `packages/core/src/cli/commands/assumption.ts` (~50 line additions)
- `packages/core/src/cli/commands/decision.ts` (~60 line additions, slightly more due to undefined-rec branch)
- `packages/core/tests/cli/recommendation.test.ts` (~220 line additions for 12 new tests)
- `packages/core/tests/cli/assumption.test.ts` (~190 line additions for 10 new tests)
- `packages/core/tests/cli/decision.test.ts` (~210 line additions for 11 new tests)

No other files (no `@cadence/types` change, no docs change yet). If anything else shows up, STOP and report.

### Step 4.3: Commit the bundled feat

```bash
git add \
  packages/core/src/cli/commands/recommendation.ts \
  packages/core/src/cli/commands/assumption.ts \
  packages/core/src/cli/commands/decision.ts \
  packages/core/tests/cli/recommendation.test.ts \
  packages/core/tests/cli/assumption.test.ts \
  packages/core/tests/cli/decision.test.ts
git commit -m "$(cat <<'EOF'
feat(core): --sort-by on recommendation/assumption/decision list (Slice 35)

Add `--sort-by <key>[:desc]` to all three list commands. Single-key syntax,
ascending default with :desc suffix, per-command key menu:

  recommendation: created, updated, priority, status, title,
                  leverage, risk, confidence, decay (9 keys)
  assumption:     created, status, text, rec                  (4 keys)
  decision:       decided, status, title, rec                 (4 keys)

Enum sort follows Zod declaration order: priority low<medium<high<critical;
status by lifecycle; decay fresh<aging<stale<superseded<contradicted<
needs-revalidation. Numeric keys (leverage/risk/confidence) use arithmetic
compare. Timestamp keys use lexicographic compare on ISO-8601 strings.
Text keys use JS default `<` (case-sensitive, locale-insensitive).

Pipeline placement: filter → sort → reverse → offset → limit. Composes
with --reverse (not mutex): `--sort-by X --reverse` ≡ `--sort-by X:desc`.

Decision's `rec` key handles undefined recommendationId: asc puts untied
last, desc puts untied first. Stable tie-break is the V8 native behavior
on Node 20+ — no explicit tie-break logic.

Errors: invalid key returns the allowed list; malformed `:dir` suffix
returns 'use asc or desc'; empty key returns '--sort-by requires a key'.

No shared sort.ts helper across the three commands (~45 LoC duplicated
per the design's anti-scope). Factor when a fourth command needs sort.

33 new tests (~12 + 10 + 11) covering all ACs.

Design source: docs/superpowers/specs/2026-05-27-cadence-list-sort-by-design.md
EOF
)"
```

### Step 4.4: Confirm the commit landed

```bash
git log -1 --oneline
git status --porcelain
```

Expected: top of log shows `<sha> feat(core): --sort-by on recommendation/assumption/decision list (Slice 35)`. Working tree clean.

---

## Task 5: Documentation update in `docs/reference/commands.md`

**Files:**
- Modify: `docs/reference/commands.md`

### Step 5.1: Inspect the existing list-command option blocks

```bash
grep -n "filter-converted-to\|recommendation list\|assumption list\|decision list\|--filter-text\|--filter-regex" docs/reference/commands.md
```

Identify the three `list` subcommand sections. Each currently documents `--format`, `--filter-status`, `--filter-text`, `--filter-regex`, `--reverse`, `--offset`, `--limit` (plus `--filter-rec` for assumption/decision, `--include-untied` for decision, `--filter-converted-to` for recommendation). The Slice 34.4 docs commit added the `--filter-converted-to` row to the `recommendation list` options table. Follow that style precisely.

### Step 5.2: Add `--sort-by` rows under each of the three `list` subcommand options tables

If the options block for each command is a markdown table with `Flag | Description` columns, insert a new row immediately after the `--filter-regex` row in each table.

For `recommendation list`:

```markdown
| `--sort-by <key>` | Sort by a single key, optionally suffixed with `:desc`. Default direction is ascending. Allowed keys: `created`, `updated`, `priority` (low<medium<high<critical), `status` (lifecycle order: candidate<accepted<deferred<rejected<converted), `title`, `leverage` (numeric, 0–10), `risk` (numeric, 0–10), `confidence` (numeric, 0–1), `decay` (fresh<aging<stale<superseded<contradicted<needs-revalidation). Composes with `--reverse`; `--sort-by X --reverse` ≡ `--sort-by X:desc`. (Slice 35) |
```

For `assumption list`:

```markdown
| `--sort-by <key>` | Sort by a single key, optionally suffixed with `:desc`. Default direction is ascending. Allowed keys: `created`, `status` (open<validated<rejected), `text`, `rec` (recommendationId). Composes with `--reverse`. (Slice 35) |
```

For `decision list`:

```markdown
| `--sort-by <key>` | Sort by a single key, optionally suffixed with `:desc`. Default direction is ascending. Allowed keys: `decided`, `status` (active<superseded<rescinded), `title`, `rec` (recommendationId; untied decisions sort last in asc, first in desc). Composes with `--reverse`. (Slice 35) |
```

If the doc uses prose or bulleted lists instead of tables for any of the three, convert to that idiom (one paragraph or one bullet, same content).

### Step 5.3: Sanity-check

```bash
grep -n "sort-by" docs/reference/commands.md
```

Expected: at least three matches (one per list subcommand).

### Step 5.4: Commit the docs

```bash
git add docs/reference/commands.md
git commit -m "$(cat <<'EOF'
docs: document --sort-by on list commands + reconcile follow-refs (Slice 35)

Reference docs for the --sort-by flag added in Slice 35 on all three
list commands. Each entry names the allowed keys plus their semantic
ordering (enum lifecycles, numeric ranges) so operators don't have to
guess what "asc" means for `priority` or `decay`. Notes the compose-
with-`--reverse` shortcut.

Predecessor § Follow-On reconciliation tracked in this slice's design
doc Decision Log §10; the prior follow-on entries in Slices 24/25/26/
27/28/31/32/33 are now satisfied — no in-place edit needed to those
historical specs (they remain accurate snapshots of their state).
EOF
)"
```

This project does NOT use the Co-Authored-By trailer.

---

## Task 6: Final verification

### Step 6.1: Run the full turbo gate one more time

```bash
pnpm turbo run lint typecheck test build
```

Expected: **16/16 green**.

### Step 6.2: Confirm Praxis three-commit shape

```bash
git log --oneline -4
```

Expected (most recent first):

```
<sha> docs: document --sort-by on list commands + reconcile follow-refs (Slice 35)
<sha> feat(core): --sort-by on recommendation/assumption/decision list (Slice 35)
<sha> docs: Slice 35 implementation plan (--sort-by on list commands)
<sha> docs: design — --sort-by on list commands (Praxis Slice 35)
```

(The two oldest of those four are the pre-existing design + plan commits this session.)

### Step 6.3: Verify @cadence/core test count grew by 33

```bash
pnpm --filter @cadence/core test 2>&1 | grep -E "Tests +(passed|[0-9]+ passed)" | tail -1
```

Expected: total passed = 1048 (post-Slice-34.4 baseline) + 33 (Slice 35) = **1081**.

### Step 6.4: Push and confirm CI green

```bash
git push origin main
gh run list --branch main --limit 1
```

Pre-push hook runs the full local gate; if it fails, fix and retry (do **not** `--no-verify`). After push, the CI run on the self-hosted `cadence-dev` runner should complete green.

```bash
# Poll if needed:
gh run watch
```

---

## Spec coverage check (self-review)

| Design requirement | Covered by |
|---|---|
| `--sort-by <key>[:desc]` added to `recommendation list` | Task 1.5 option, 1.6 pipeline insertion |
| `--sort-by <key>[:desc]` added to `assumption list` | Task 2.4 option, 2.5 pipeline insertion |
| `--sort-by <key>[:desc]` added to `decision list` | Task 3.4 option, 3.5 pipeline insertion |
| Single key with optional `:desc` (no multi-key) | `parseSortBy` returns `{ key, dir }`; no comma split |
| Default direction = ascending | `parseSortBy` defaults `dir = 'asc'` when no colon |
| `:asc` accepted but redundant | `parseSortBy` validates `dirRaw === 'asc' \|\| 'desc'`; both accepted |
| 17 keys total (rec=9, asn=4, dec=4) | Task 1.4 / 2.3 / 3.3 key Sets |
| Short aliases (`leverage`/`decay`/`rec`) | Mapped in respective `compareX` switch cases |
| Pipeline placement filter → sort → reverse → offset → limit | Task 1.6 / 2.5 / 3.5 insertion between filter-block and `--reverse` |
| Composes with `--reverse` (not mutex) | AC-sort-6 in each command's test suite |
| Timestamp = ISO-8601 lex compare | `case 'created'/'updated'/'decided':` returns `a.field < b.field ? -1 : ...` |
| Enum = Zod declaration order | `RecommendationPriorityZ.options.indexOf(...)` etc. for rec; `*_STATUS_ORDER` arrays for asn/dec |
| Numeric = arithmetic | `case 'leverage'/'risk'/'confidence':` returns `a.field - b.field` |
| Text = JS default `<` | `case 'title'/'text':` returns `a.field < b.field ? -1 : ...` |
| Reference `undefined` sorts last in asc, first in desc | Task 3.3 `compareDec` `'rec'` branch + asc/desc dispatch in Task 3.5; verified by AC-sort-dec-1 in Task 3.7 |
| Stable tie-break via V8 native sort | AC-sort-4 in each command's test suite; no explicit tie-break code |
| Empty-result filterDims unchanged | No change to existing `filterDims` chains in any command |
| Errors: invalid key returns allowed-list message | Task 1.6 / 2.5 / 3.5 has the `!REC_SORT_KEYS.has(...)` block; verified by AC-sort-9 |
| Errors: malformed direction returns use-asc-or-desc | `parseSortBy` returns the error; verified by AC-sort-10 |
| Errors: empty `--sort-by` returns requires-a-key | `parseSortBy` handles both `''` and `:desc`; not explicitly tested but covered by the same path as AC-sort-10 |
| No `--sort-dir` separate flag | Plan has no such option |
| No multi-key | `parseSortBy` does not split on `,` |
| No `readiness` on rec keys | `REC_SORT_KEYS` set does not include `readiness` |
| No `milestone list` change | `milestone.ts` not in modified files |
| No `intelligence audit` change | `intelligence.ts` not in modified files |
| No `@cadence/types` schema change | `packages/types/` not in modified files |
| No store/render layer change | `intelligence/store.ts` and render files not in modified files |
| Praxis three-commit convention (plan + feat + docs) | Plan committed pre-execution; Task 4 = feat; Task 5 = docs |
| ~50 LoC source per command | Task 4.2 expected diff stat |
| ~33 new tests | Task 6.3 expected count delta 1048 → 1081 |
| Follow-On predecessor reconciliation noted | Task 5.4 commit body explains the no-in-place-edit approach |

**Gaps found:** none. Every requirement in the spec maps to a task or step.

**Placeholder scan:** none — every step shows the exact code, exact command, and expected output.
