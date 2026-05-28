# Slice 36 — `--filter-text-exact` on list commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--filter-text-exact <str>` to `cadence recommendation list`, `cadence assumption list`, and `cadence decision list`. Case-insensitive whole-field equality match on the same per-subject text scope as `--filter-text` (rec → title + summary; asn → text; dec → title + rationale). Pairwise mutex with `--filter-text` and `--filter-regex`; empty literal refuses; no trim; composes with the rest of the filter / sort / reverse / offset / limit pipeline.

**Architecture:** Three symmetric, per-command implementations. Each command gains a `--filter-text-exact` option, three new validation guards (empty-refuse, mutex-vs-text, mutex-vs-regex) placed immediately before the existing `--filter-text` vs `--filter-regex` mutex check, one new apply block placed between the existing `--filter-text` / `--filter-regex` blocks and the subject-specific filter blocks (`--filter-converted-to` for rec; `--filter-rec` for asn / dec), and one `filterDims.push` for the empty-result message inserted between the existing `text=` and `regex=` pushes. **No shared `filter-exact.ts` helper** — ~10 LoC per command × 3 stays inline (Slice 35 / Slice 34.3 precedent). No schema, store, render, or `@cadence/types` change.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), commander for CLI parsing, vitest for tests, `@cadence/testkit`'s `tempRepo`, `pnpm turbo` for the gate.

**Upstream design source:** `docs/superpowers/specs/2026-05-27-cadence-list-filter-text-exact-design.md` (committed `1b0fb34` on `main`).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/core/src/cli/commands/recommendation.ts` | Modify | Add `--filter-text-exact` option, three validation guards, apply block (title \| summary equality), filterDims push. ~10 LoC added. |
| `packages/core/src/cli/commands/assumption.ts` | Modify | Add `--filter-text-exact` option, three validation guards, apply block (text equality only), filterDims push. ~10 LoC added. |
| `packages/core/src/cli/commands/decision.ts` | Modify | Add `--filter-text-exact` option, three validation guards, apply block (title \| rationale equality), filterDims push. ~10 LoC added. |
| `packages/core/tests/cli/recommendation.test.ts` | Modify (append) | 11 new tests (10 shared ACs + AC-exact-rec-1). |
| `packages/core/tests/cli/assumption.test.ts` | Modify (append) | 10 new tests (10 shared ACs). |
| `packages/core/tests/cli/decision.test.ts` | Modify (append) | 11 new tests (10 shared ACs + AC-exact-dec-1). |
| `docs/reference/commands.md` | Modify | Insert `--filter-text-exact` row in each of the three list option tables (between `--filter-text` and `--filter-regex`); update mutex notes on the existing `--filter-text` and `--filter-regex` rows to mention the new flag. |

**No new files.** No `@cadence/types` schema change. No new helper files.

**Total expected net additions:** ~30 LoC of source (~10 per command × 3) + ~600 LoC of tests + ~9 row edits in `commands.md` (3 added + 6 existing updated).

**Commit shape (Praxis convention, design + plan committed before execution):**
1. (already committed `1b0fb34`) `docs: design — --filter-text-exact on list commands (Praxis Slice 36)`
2. `docs: Slice 36 implementation plan (--filter-text-exact on list commands)` — committed before Task 1 runs
3. `feat(core): --filter-text-exact on recommendation/assumption/decision list (Slice 36)` — Tasks 1–3 bundle into one feat commit at Task 4
4. `docs: document --filter-text-exact on list commands + reconcile Slice-33 follow-ref (Slice 36)` — Task 5

This project does **NOT** use the Co-Authored-By trailer on feat/docs commits.

---

## Task 1: `--filter-text-exact` on `recommendation list`

**Files:**
- Modify (source): `packages/core/src/cli/commands/recommendation.ts`
- Modify (append tests): `packages/core/tests/cli/recommendation.test.ts`

### Step 1.1: Write the failing happy-path equality test

Append inside the existing `describe('cadence recommendation', ...)` block at the bottom of `packages/core/tests/cli/recommendation.test.ts`, just before the closing `});` of the describe.

The fixture seeds three recs with distinct titles and asserts `--filter-text-exact 'Adopt token bucket'` returns only the rec whose title equals that literal.

```typescript
  it('Slice 36 AC-exact-1 (rec): --filter-text-exact returns only entries whose scoped field equals the literal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact1' });
    await run(['recommendation', 'add', '--title', 'Adopt token bucket', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'Adopt token bucket strategy', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'Token bucket adoption', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'Adopt token bucket', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('Adopt token bucket');
  });
```

### Step 1.2: Run the build + test, verify FAIL

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- recommendation.test
```

Expected: this single new test fails. Commander rejects `--filter-text-exact` as an unknown option, so the run exits non-zero and `expect(r.code).toBe(0)` fails.

### Step 1.3: Add the `--filter-text-exact` option declaration and update the action callback typing

Find the `recommendation list` subcommand registration in `packages/core/src/cli/commands/recommendation.ts`. The current `.option(...)` sequence (currently lines 221–229) reads:

```typescript
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .option('--filter-status <status>', 'Filter to only entries with this status')
    .option('--filter-text <substr>', 'Case-insensitive substring search on title or summary')
    .option('--filter-regex <pattern>', 'Power-user regex filter on title or summary (always case-sensitive; use character classes like [Cc]ycle for case-insensitive). Mutually exclusive with --filter-text.')
    .option('--filter-converted-to <phaseId>', 'Reverse-lookup filter: only recommendations with convertedToPhaseId equal to <phaseId>. Implies status=converted (Slice 34.4).')
    .option('--sort-by <key>', 'Sort by a single key, optionally with :desc suffix. Allowed keys: created, updated, priority, status, title, leverage, risk, confidence, decay.')
    .option('--reverse', 'Reverse the entry order (after filters, before offset/limit)')
    .option('--offset <n>', 'Skip the first N entries (after filters)')
    .option('--limit <n>', 'Cap output to first N entries (after filters)')
```

Insert a new `.option(...)` line for `--filter-text-exact` immediately after the existing `--filter-text` line and before `--filter-regex`. Insert exactly:

```typescript
    .option('--filter-text-exact <str>', 'Case-insensitive whole-field equality match on title or summary. Mutually exclusive with --filter-text and --filter-regex.')
```

Also update the existing `--filter-text` and `--filter-regex` descriptions in this file to mention the new flag in their mutex lists. Replace the existing `--filter-text` line with:

```typescript
    .option('--filter-text <substr>', 'Case-insensitive substring search on title or summary. Mutually exclusive with --filter-text-exact and --filter-regex.')
```

And replace the existing `--filter-regex` line with:

```typescript
    .option('--filter-regex <pattern>', 'Power-user regex filter on title or summary (always case-sensitive; use character classes like [Cc]ycle for case-insensitive). Mutually exclusive with --filter-text and --filter-text-exact.')
```

Then update the `.action(async (opts: {...}) => {` callback's `opts` typing (currently line 230). The current typing reads:

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterText?: string; filterRegex?: string; filterConvertedTo?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

Replace with the same typing plus `filterTextExact?: string`, inserted in source order (after `filterText` and before `filterRegex`):

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterText?: string; filterTextExact?: string; filterRegex?: string; filterConvertedTo?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

### Step 1.4: Insert the three new validation guards before the existing `--filter-text` vs `--filter-regex` mutex check

Locate the existing mutex check (currently lines 253–259):

```typescript
        if (opts.filterText !== undefined && opts.filterRegex !== undefined) {
          process.stderr.write(
            `recommendation list failed: cannot combine --filter-text and --filter-regex\n`,
          );
          process.exitCode = 1;
          return;
        }
```

Insert this block of three guards **immediately before** that mutex check (i.e., after the `--filter-status` block at line 251 and before the existing mutex check at line 253):

```typescript
        if (opts.filterTextExact === '') {
          process.stderr.write(
            `recommendation list failed: --filter-text-exact requires a non-empty value\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterTextExact !== undefined && opts.filterText !== undefined) {
          process.stderr.write(
            `recommendation list failed: cannot combine --filter-text-exact with --filter-text\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterTextExact !== undefined && opts.filterRegex !== undefined) {
          process.stderr.write(
            `recommendation list failed: cannot combine --filter-text-exact with --filter-regex\n`,
          );
          process.exitCode = 1;
          return;
        }
```

Order matters: empty-refuse fires first (most specific), then the two mutex guards. The existing `--filter-text` vs `--filter-regex` mutex below remains unchanged.

Note on the empty-refuse check: `opts.filterTextExact === ''` is sufficient. If the option was not provided, the field is `undefined`, which is `!== ''`. If commander received `--filter-text-exact ''` it stores the empty string. No need for a redundant `!== undefined` clause first.

### Step 1.5: Insert the apply block between `--filter-regex` and `--filter-converted-to`

Locate the existing `--filter-regex` apply block (currently lines 268–280):

```typescript
        if (opts.filterRegex !== undefined) {
          let regex: RegExp;
          try {
            regex = new RegExp(opts.filterRegex);
          } catch (err) {
            process.stderr.write(
              `recommendation list failed: invalid regex: ${err instanceof Error ? err.message : String(err)}\n`,
            );
            process.exitCode = 1;
            return;
          }
          entries = entries.filter((r) => regex.test(r.title) || regex.test(r.summary));
        }
```

And the existing `--filter-converted-to` block immediately after it (currently lines 281–283):

```typescript
        if (opts.filterConvertedTo !== undefined) {
          entries = entries.filter((r) => r.convertedToPhaseId === opts.filterConvertedTo);
        }
```

Insert this new apply block between them (i.e., after the `--filter-regex` close-brace, before the `--filter-converted-to` if):

```typescript
        if (opts.filterTextExact !== undefined) {
          const needle = opts.filterTextExact.toLowerCase();
          entries = entries.filter(
            (r) =>
              r.title.toLowerCase() === needle ||
              r.summary.toLowerCase() === needle,
          );
        }
```

Because the mutex guards in Step 1.4 ensure only one of `--filter-text` / `--filter-text-exact` / `--filter-regex` is set per invocation, this block runs only when the other two are absent. Equality on `.toLowerCase()` is case-insensitive but byte-identical comparison — no Unicode normalization (parity with `--filter-text`'s `.includes()` behavior).

### Step 1.6: Insert the filterDims push between the existing `text=` and `regex=` pushes

Locate the existing empty-result filterDims block (currently lines 335–340):

```typescript
          const filterDims: string[] = [];
          if (opts.filterStatus) filterDims.push(`status=${opts.filterStatus}`);
          if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.filterConvertedTo !== undefined) filterDims.push(`converted-to="${opts.filterConvertedTo}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
```

Insert a new push line **between** the `text=` line and the `regex=` line so the three text-mode dims stay contiguous:

```typescript
          const filterDims: string[] = [];
          if (opts.filterStatus) filterDims.push(`status=${opts.filterStatus}`);
          if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
          if (opts.filterTextExact !== undefined) filterDims.push(`text-exact="${opts.filterTextExact}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.filterConvertedTo !== undefined) filterDims.push(`converted-to="${opts.filterConvertedTo}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
```

### Step 1.7: Run the build + test, verify the happy-path test now PASSES

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- recommendation.test
```

Expected: all `cadence recommendation` tests pass, including the new Slice 36 AC-exact-1 test from Step 1.1. Test count for this file grew by 1 so far.

### Step 1.8: Append the remaining 10 tests for `recommendation list`

Append each `it(...)` block inside the same `describe('cadence recommendation', ...)`, just before the closing `});`. Append all 10 in one edit. Each is independent and references its AC token in the test name.

```typescript
  it('Slice 36 AC-exact-2 (rec): --filter-text-exact is case-insensitive', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact2' });
    await run(['recommendation', 'add', '--title', 'Adopt token bucket', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'ADOPT TOKEN BUCKET', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('Adopt token bucket');
  });

  it('Slice 36 AC-exact-3 (rec): equality not substring — substring superset does NOT match', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact3' });
    await run(['recommendation', 'add', '--title', 'Adopt token bucket strategy', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'Adopt token bucket', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 36 AC-exact-4 (rec): empty literal refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact4' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', ''],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'recommendation list failed: --filter-text-exact requires a non-empty value\n',
    );
  });

  it('Slice 36 AC-exact-5 (rec): mutex with --filter-text — combined errors with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact5' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'foo', '--filter-text', 'bar'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'recommendation list failed: cannot combine --filter-text-exact with --filter-text\n',
    );
  });

  it('Slice 36 AC-exact-6 (rec): mutex with --filter-regex — combined errors with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact6' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'foo', '--filter-regex', '^bar$'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'recommendation list failed: cannot combine --filter-text-exact with --filter-regex\n',
    );
  });

  it('Slice 36 AC-exact-7 (rec): no trim — surrounding whitespace in literal is significant', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact7' });
    // Title is the bare word (no spaces).
    await run(['recommendation', 'add', '--title', 'foo', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', ' foo ', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    // The literal ' foo ' (with spaces) does NOT equal the title 'foo'.
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 36 AC-exact-8 (rec): empty result includes text-exact="..." in filterDims', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact8' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'no-such-title'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      'No recommendations matching text-exact="no-such-title" recorded.\n',
    );
  });

  it('Slice 36 AC-exact-9 (rec): composes with --filter-status and --sort-by', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact9' });
    // Three recs all with the same exact title; flip statuses on the ledger so only one is 'accepted'.
    await run(['recommendation', 'add', '--title', 'Same title', '--summary', 'A'], active.root);
    await run(['recommendation', 'add', '--title', 'Same title', '--summary', 'B'], active.root);
    await run(['recommendation', 'add', '--title', 'Other title', '--summary', 'C'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].status = 'accepted';
    ledger.recommendations[0].createdAt = '2024-01-02T00:00:00+00:00';
    ledger.recommendations[1].status = 'candidate';
    ledger.recommendations[1].createdAt = '2024-01-01T00:00:00+00:00';
    ledger.recommendations[2].status = 'accepted';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      [
        'recommendation', 'list',
        '--filter-text-exact', 'Same title',
        '--filter-status', 'accepted',
        '--sort-by', 'created',
        '--format', 'json',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    // Only rec[0] matches both equality and status filter (rec[1] wrong status; rec[2] wrong title).
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].summary).toBe('A');
  });

  it('Slice 36 AC-exact-10 (rec): --format json emits matched entries as JSON array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_exact10' });
    await run(['recommendation', 'add', '--title', 'X', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'Y', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'X', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('X');
    // JSON array shape (not a single object).
    expect(Array.isArray(arr)).toBe(true);
  });

  it('Slice 36 AC-exact-rec-1: matches when only summary (not title) equals the literal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_rec_summary' });
    // Two recs whose title is NOT 'Token bucket' but whose summary IS.
    await run(['recommendation', 'add', '--title', 'A', '--summary', 'Token bucket'], active.root);
    await run(['recommendation', 'add', '--title', 'B', '--summary', 'Different summary'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-text-exact', 'Token bucket', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('A');
    expect(arr[0].summary).toBe('Token bucket');
  });
```

### Step 1.9: Run all `recommendation.test` tests, verify PASS

```bash
pnpm --filter @cadence/core test -- recommendation.test
```

Expected: all `cadence recommendation` tests pass. Test count for this file grew by **11** (1 happy-path from Step 1.1 + 10 from Step 1.8).

### Step 1.10: Do NOT commit yet

Leave the working tree dirty for now. Task 4 bundles all three commands into a single feat commit per Praxis convention.

```bash
git status --porcelain | head
```

Expected: two files modified — `packages/core/src/cli/commands/recommendation.ts` and `packages/core/tests/cli/recommendation.test.ts`. No other changes.

---

## Task 2: `--filter-text-exact` on `assumption list`

**Files:**
- Modify (source): `packages/core/src/cli/commands/assumption.ts`
- Modify (append tests): `packages/core/tests/cli/assumption.test.ts`

### Step 2.1: Write the failing happy-path equality test

Append inside the existing `describe('cadence assumption', ...)` block at the bottom of `packages/core/tests/cli/assumption.test.ts`, just before the closing `});` of the describe.

The fixture seeds three assumptions and asserts `--filter-text-exact 'Rate limit will handle bursts'` returns only the one whose `text` equals that literal.

```typescript
  it('Slice 36 AC-exact-1 (asn): --filter-text-exact returns only entries whose text equals the literal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact1' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'Rate limit will handle bursts'], active.root);
    await run(['assumption', 'add', '--rec', recId, '--text', 'Rate limit will handle bursts gracefully'], active.root);
    await run(['assumption', 'add', '--rec', recId, '--text', 'Bursts will be rare'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', 'Rate limit will handle bursts', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('Rate limit will handle bursts');
  });
```

`addRecommendation` is the existing `@cadence/core` store helper already imported at the top of `packages/core/tests/cli/assumption.test.ts` from `../../src/intelligence/store.js`. Every existing assumption test seeds its recommendation this way (search the file for `await addRecommendation(active.root, {`). The shape `{ title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea', affectedAreas: [], affectedFiles: [] }` is the canonical minimal seed used throughout the suite — copy it exactly. The returned `rec` object exposes `.id` for use in the subsequent `--rec` flag. No new import is needed.

### Step 2.2: Run the build + test, verify FAIL

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- assumption.test
```

Expected: this new test fails (commander rejects `--filter-text-exact`).

### Step 2.3: Add the `--filter-text-exact` option declaration and update the action callback typing

Find the `assumption list` subcommand registration in `packages/core/src/cli/commands/assumption.ts`. The current `.option(...)` sequence (currently lines 144–151) reads:

```typescript
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .option('--filter-status <status>', 'Filter to only entries with this status')
    .option('--filter-rec <recId>', 'Filter to only entries tied to this recommendation')
    .option('--filter-text <substr>', 'Case-insensitive substring search on text')
    .option('--filter-regex <pattern>', 'Power-user regex filter on text (always case-sensitive; use character classes like [Cc]ycle for case-insensitive). Mutually exclusive with --filter-text.')
    .option('--sort-by <key>', 'Sort by a single key, optionally with :desc suffix. Allowed keys: created, status, text, rec.')
    .option('--reverse', 'Reverse the entry order (after filters, before offset/limit)')
    .option('--offset <n>', 'Skip the first N entries (after filters)')
    .option('--limit <n>', 'Cap output to first N entries (after filters)')
```

Insert a new `.option(...)` line for `--filter-text-exact` immediately after the existing `--filter-text` line and before `--filter-regex`. Insert exactly:

```typescript
    .option('--filter-text-exact <str>', 'Case-insensitive whole-field equality match on text. Mutually exclusive with --filter-text and --filter-regex.')
```

Also update the existing `--filter-text` and `--filter-regex` descriptions in this file to mention the new flag in their mutex lists. Replace the existing `--filter-text` line with:

```typescript
    .option('--filter-text <substr>', 'Case-insensitive substring search on text. Mutually exclusive with --filter-text-exact and --filter-regex.')
```

And replace the existing `--filter-regex` line with:

```typescript
    .option('--filter-regex <pattern>', 'Power-user regex filter on text (always case-sensitive; use character classes like [Cc]ycle for case-insensitive). Mutually exclusive with --filter-text and --filter-text-exact.')
```

Then update the `.action(async (opts: {...}) => {` callback's `opts` typing (currently line 152). The current typing reads:

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterRec?: string; filterText?: string; filterRegex?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

Replace with the same typing plus `filterTextExact?: string`, inserted in source order (after `filterText` and before `filterRegex`):

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterRec?: string; filterText?: string; filterTextExact?: string; filterRegex?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

### Step 2.4: Insert the three new validation guards before the existing `--filter-text` vs `--filter-regex` mutex check

Locate the existing mutex check (currently lines 178–184):

```typescript
        if (opts.filterText !== undefined && opts.filterRegex !== undefined) {
          process.stderr.write(
            `assumption list failed: cannot combine --filter-text and --filter-regex\n`,
          );
          process.exitCode = 1;
          return;
        }
```

Insert this block of three guards **immediately before** that mutex check (i.e., after the `--filter-rec` apply block at line 175–177 and before the existing mutex check at line 178):

```typescript
        if (opts.filterTextExact === '') {
          process.stderr.write(
            `assumption list failed: --filter-text-exact requires a non-empty value\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterTextExact !== undefined && opts.filterText !== undefined) {
          process.stderr.write(
            `assumption list failed: cannot combine --filter-text-exact with --filter-text\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterTextExact !== undefined && opts.filterRegex !== undefined) {
          process.stderr.write(
            `assumption list failed: cannot combine --filter-text-exact with --filter-regex\n`,
          );
          process.exitCode = 1;
          return;
        }
```

### Step 2.5: Insert the apply block between `--filter-regex` and `--sort-by`

Locate the existing `--filter-regex` apply block (currently lines 189–201):

```typescript
        if (opts.filterRegex !== undefined) {
          let regex: RegExp;
          try {
            regex = new RegExp(opts.filterRegex);
          } catch (err) {
            process.stderr.write(
              `assumption list failed: invalid regex: ${err instanceof Error ? err.message : String(err)}\n`,
            );
            process.exitCode = 1;
            return;
          }
          entries = entries.filter((a) => regex.test(a.text));
        }
```

And the existing `--sort-by` block immediately after it (currently starting line 202):

```typescript
        if (opts.sortBy !== undefined) {
          const parsed = parseSortBy(opts.sortBy);
          // ...
```

Insert this new apply block between them (i.e., after the `--filter-regex` close-brace, before the `--sort-by` if):

```typescript
        if (opts.filterTextExact !== undefined) {
          const needle = opts.filterTextExact.toLowerCase();
          entries = entries.filter((a) => a.text.toLowerCase() === needle);
        }
```

### Step 2.6: Insert the filterDims push between the existing `text=` and `regex=` pushes

Locate the existing empty-result filterDims block (currently lines 253–258):

```typescript
          const filterDims: string[] = [];
          if (opts.filterStatus) filterDims.push(`status=${opts.filterStatus}`);
          if (opts.filterRec) filterDims.push(`rec=${opts.filterRec}`);
          if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
```

Insert a new push line **between** the `text=` line and the `regex=` line:

```typescript
          const filterDims: string[] = [];
          if (opts.filterStatus) filterDims.push(`status=${opts.filterStatus}`);
          if (opts.filterRec) filterDims.push(`rec=${opts.filterRec}`);
          if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
          if (opts.filterTextExact !== undefined) filterDims.push(`text-exact="${opts.filterTextExact}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
```

### Step 2.7: Run the build + test, verify the happy-path test now PASSES

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- assumption.test
```

Expected: all `cadence assumption` tests pass.

### Step 2.8: Append the remaining 9 tests for `assumption list`

Append each `it(...)` block inside the same `describe('cadence assumption', ...)`. The same 9 shared ACs as the rec suite (AC-exact-2 through AC-exact-10), targeting the `text` field. No subject-specific ACs for assumption (single-field scope).

Every test below uses the same `addRecommendation` seed shape introduced in Step 2.1 — already imported at the top of the test file. Copy each test verbatim.

```typescript
  it('Slice 36 AC-exact-2 (asn): --filter-text-exact is case-insensitive', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact2' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'Rate limit will handle bursts'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', 'RATE LIMIT WILL HANDLE BURSTS', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('Rate limit will handle bursts');
  });

  it('Slice 36 AC-exact-3 (asn): equality not substring', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact3' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'Rate limit will handle bursts gracefully'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', 'Rate limit will handle bursts', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 36 AC-exact-4 (asn): empty literal refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact4' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'foo'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', ''],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'assumption list failed: --filter-text-exact requires a non-empty value\n',
    );
  });

  it('Slice 36 AC-exact-5 (asn): mutex with --filter-text', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact5' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'foo'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', 'foo', '--filter-text', 'bar'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'assumption list failed: cannot combine --filter-text-exact with --filter-text\n',
    );
  });

  it('Slice 36 AC-exact-6 (asn): mutex with --filter-regex', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact6' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'foo'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', 'foo', '--filter-regex', '^bar$'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'assumption list failed: cannot combine --filter-text-exact with --filter-regex\n',
    );
  });

  it('Slice 36 AC-exact-7 (asn): no trim — surrounding whitespace significant', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact7' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'foo'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', ' foo ', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 36 AC-exact-8 (asn): empty result includes text-exact="..." in filterDims', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact8' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'foo'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', 'no-such-text'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      'No assumptions matching text-exact="no-such-text" recorded.\n',
    );
  });

  it('Slice 36 AC-exact-9 (asn): composes with --filter-status and --sort-by', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact9' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    // Two assumptions with the same exact text. Then flip statuses so one is validated, the other open.
    await run(['assumption', 'add', '--rec', recId, '--text', 'Same text'], active.root);
    await run(['assumption', 'add', '--rec', recId, '--text', 'Same text'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].status = 'validated';
    ledger.assumptions[0].createdAt = '2024-01-02T00:00:00+00:00';
    ledger.assumptions[1].status = 'open';
    ledger.assumptions[1].createdAt = '2024-01-01T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      [
        'assumption', 'list',
        '--filter-text-exact', 'Same text',
        '--filter-status', 'validated',
        '--sort-by', 'created',
        '--format', 'json',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].status).toBe('validated');
  });

  it('Slice 36 AC-exact-10 (asn): --format json emits matched entries as JSON array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_asn_exact10' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'X'], active.root);
    await run(['assumption', 'add', '--rec', recId, '--text', 'Y'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-text-exact', 'X', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].text).toBe('X');
    expect(Array.isArray(arr)).toBe(true);
  });
```

### Step 2.9: Run all `assumption.test` tests, verify PASS

```bash
pnpm --filter @cadence/core test -- assumption.test
```

Expected: all `cadence assumption` tests pass. Test count for this file grew by **10** (1 happy-path + 9 from Step 2.8).

### Step 2.10: Do NOT commit yet

```bash
git status --porcelain | head
```

Expected: four files modified so far (rec.ts, rec.test.ts, asn.ts, asn.test.ts).

---

## Task 3: `--filter-text-exact` on `decision list`

**Files:**
- Modify (source): `packages/core/src/cli/commands/decision.ts`
- Modify (append tests): `packages/core/tests/cli/decision.test.ts`

### Step 3.1: Write the failing happy-path equality test

Append inside the existing `describe('cadence decision', ...)` block at the bottom of `packages/core/tests/cli/decision.test.ts`, just before the closing `});`.

The `decision add` command takes `--title` and `--rationale` and optionally `--rec`. The `addRecommendation` store helper is already imported at the top of `packages/core/tests/cli/decision.test.ts` from `../../src/intelligence/store.js` and is the canonical seed pattern in every existing decision test (search the file for `await addRecommendation(active.root, {`). Use the same minimal seed shape `{ title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea', affectedAreas: [], affectedFiles: [] }` — already returned in every test, exposes `.id` for the `--rec` flag. No new import is needed.

```typescript
  it('Slice 36 AC-exact-1 (dec): --filter-text-exact returns only entries whose scoped field equals the literal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact1' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'Adopt token bucket', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--rec', recId, '--title', 'Adopt token bucket strategy', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--rec', recId, '--title', 'Token bucket adoption', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'Adopt token bucket', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('Adopt token bucket');
  });
```

### Step 3.2: Run the build + test, verify FAIL

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- decision.test
```

Expected: this new test fails.

### Step 3.3: Add the `--filter-text-exact` option declaration and update the action callback typing

Find the `decision list` subcommand registration in `packages/core/src/cli/commands/decision.ts`. The current `.option(...)` sequence (currently lines 188–198) reads:

```typescript
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .option('--filter-status <status>', 'Filter to only entries with this status')
    .option('--filter-rec <recId>', 'Filter to only entries tied to this recommendation')
    .option('--include-untied', 'When combined with --filter-rec, also include decisions with no recommendationId')
    .option('--filter-text <substr>', 'Case-insensitive substring search on title or rationale')
    .option('--filter-regex <pattern>', 'Power-user regex filter on title or rationale (always case-sensitive; use character classes like [Cc]ycle for case-insensitive). Mutually exclusive with --filter-text.')
    .option('--sort-by <key>', 'Sort by a single key, optionally with :desc suffix. Allowed keys: decided, status, title, rec.')
    .option('--reverse', 'Reverse the entry order (after filters, before offset/limit)')
    .option('--offset <n>', 'Skip the first N entries (after filters)')
    .option('--limit <n>', 'Cap output to first N entries (after filters)')
```

Insert a new `.option(...)` line for `--filter-text-exact` immediately after the existing `--filter-text` line and before `--filter-regex`. Insert exactly:

```typescript
    .option('--filter-text-exact <str>', 'Case-insensitive whole-field equality match on title or rationale. Mutually exclusive with --filter-text and --filter-regex.')
```

Also update the existing `--filter-text` and `--filter-regex` descriptions in this file to mention the new flag in their mutex lists. Replace the existing `--filter-text` line with:

```typescript
    .option('--filter-text <substr>', 'Case-insensitive substring search on title or rationale. Mutually exclusive with --filter-text-exact and --filter-regex.')
```

And replace the existing `--filter-regex` line with:

```typescript
    .option('--filter-regex <pattern>', 'Power-user regex filter on title or rationale (always case-sensitive; use character classes like [Cc]ycle for case-insensitive). Mutually exclusive with --filter-text and --filter-text-exact.')
```

Then update the `.action(async (opts: {...}) => {` callback's `opts` typing (currently line 199). The current typing reads:

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterRec?: string; includeUntied?: boolean; filterText?: string; filterRegex?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

Replace with the same typing plus `filterTextExact?: string`, inserted in source order (after `filterText` and before `filterRegex`):

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterRec?: string; includeUntied?: boolean; filterText?: string; filterTextExact?: string; filterRegex?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

### Step 3.4: Insert the three new validation guards before the existing `--filter-text` vs `--filter-regex` mutex check

Locate the existing mutex check (currently lines 231–237):

```typescript
        if (opts.filterText !== undefined && opts.filterRegex !== undefined) {
          process.stderr.write(
            `decision list failed: cannot combine --filter-text and --filter-regex\n`,
          );
          process.exitCode = 1;
          return;
        }
```

Insert this block of three guards **immediately before** that mutex check (i.e., after the `--filter-rec` / `--include-untied` apply block ending around line 230 and before the existing mutex check at line 231):

```typescript
        if (opts.filterTextExact === '') {
          process.stderr.write(
            `decision list failed: --filter-text-exact requires a non-empty value\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterTextExact !== undefined && opts.filterText !== undefined) {
          process.stderr.write(
            `decision list failed: cannot combine --filter-text-exact with --filter-text\n`,
          );
          process.exitCode = 1;
          return;
        }
        if (opts.filterTextExact !== undefined && opts.filterRegex !== undefined) {
          process.stderr.write(
            `decision list failed: cannot combine --filter-text-exact with --filter-regex\n`,
          );
          process.exitCode = 1;
          return;
        }
```

### Step 3.5: Insert the apply block between `--filter-regex` and `--sort-by`

Locate the existing `--filter-regex` apply block (currently lines 246–258):

```typescript
        if (opts.filterRegex !== undefined) {
          let regex: RegExp;
          try {
            regex = new RegExp(opts.filterRegex);
          } catch (err) {
            process.stderr.write(
              `decision list failed: invalid regex: ${err instanceof Error ? err.message : String(err)}\n`,
            );
            process.exitCode = 1;
            return;
          }
          entries = entries.filter((d) => regex.test(d.title) || regex.test(d.rationale));
        }
```

And the existing `--sort-by` block immediately after it (currently starting line 259):

```typescript
        if (opts.sortBy !== undefined) {
          const parsed = parseSortBy(opts.sortBy);
          // ...
```

Insert this new apply block between them:

```typescript
        if (opts.filterTextExact !== undefined) {
          const needle = opts.filterTextExact.toLowerCase();
          entries = entries.filter(
            (d) =>
              d.title.toLowerCase() === needle ||
              d.rationale.toLowerCase() === needle,
          );
        }
```

### Step 3.6: Insert the filterDims push between the existing `text=` and `regex=` pushes

Locate the existing empty-result filterDims block (currently lines 310–316):

```typescript
          const filterDims: string[] = [];
          if (opts.filterStatus) filterDims.push(`status=${opts.filterStatus}`);
          if (opts.filterRec) filterDims.push(`rec=${opts.filterRec}`);
          if (opts.filterRec && opts.includeUntied) filterDims.push('untied=incl');
          if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
```

Insert a new push line **between** the `text=` line and the `regex=` line:

```typescript
          const filterDims: string[] = [];
          if (opts.filterStatus) filterDims.push(`status=${opts.filterStatus}`);
          if (opts.filterRec) filterDims.push(`rec=${opts.filterRec}`);
          if (opts.filterRec && opts.includeUntied) filterDims.push('untied=incl');
          if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
          if (opts.filterTextExact !== undefined) filterDims.push(`text-exact="${opts.filterTextExact}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
```

### Step 3.7: Run the build + test, verify the happy-path test now PASSES

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- decision.test
```

Expected: all `cadence decision` tests pass.

### Step 3.8: Append the remaining 10 tests for `decision list`

Append each `it(...)` block inside the same `describe('cadence decision', ...)`. The 9 shared ACs (2–10) target `title` (with one targeting `rationale` to prove the multi-field ANY-of scope on decisions), plus AC-exact-dec-1 specifically asserting summary→rationale equality.

```typescript
  it('Slice 36 AC-exact-2 (dec): --filter-text-exact is case-insensitive', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact2' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'Adopt token bucket', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'ADOPT TOKEN BUCKET', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('Adopt token bucket');
  });

  it('Slice 36 AC-exact-3 (dec): equality not substring', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact3' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'Adopt token bucket strategy', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'Adopt token bucket', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 36 AC-exact-4 (dec): empty literal refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact4' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', ''],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'decision list failed: --filter-text-exact requires a non-empty value\n',
    );
  });

  it('Slice 36 AC-exact-5 (dec): mutex with --filter-text', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact5' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'foo', '--filter-text', 'bar'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'decision list failed: cannot combine --filter-text-exact with --filter-text\n',
    );
  });

  it('Slice 36 AC-exact-6 (dec): mutex with --filter-regex', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact6' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'foo', '--filter-regex', '^bar$'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'decision list failed: cannot combine --filter-text-exact with --filter-regex\n',
    );
  });

  it('Slice 36 AC-exact-7 (dec): no trim — surrounding whitespace significant', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact7' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'foo', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', ' foo ', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual([]);
  });

  it('Slice 36 AC-exact-8 (dec): empty result includes text-exact="..." in filterDims', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact8' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'no-such-title'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      'No decisions matching text-exact="no-such-title" recorded.\n',
    );
  });

  it('Slice 36 AC-exact-9 (dec): composes with --filter-status and --sort-by', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact9' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    // Two decisions with the same exact title. Then flip statuses so one is superseded, the other active.
    await run(['decision', 'add', '--rec', recId, '--title', 'Same title', '--rationale', 'A'], active.root);
    await run(['decision', 'add', '--rec', recId, '--title', 'Same title', '--rationale', 'B'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].status = 'active';
    ledger.decisions[0].decidedAt = '2024-01-02T00:00:00+00:00';
    ledger.decisions[1].status = 'superseded';
    ledger.decisions[1].decidedAt = '2024-01-01T00:00:00+00:00';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      [
        'decision', 'list',
        '--filter-text-exact', 'Same title',
        '--filter-status', 'active',
        '--sort-by', 'decided',
        '--format', 'json',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].rationale).toBe('A');
  });

  it('Slice 36 AC-exact-10 (dec): --format json emits matched entries as JSON array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_exact10' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'X', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--rec', recId, '--title', 'Y', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'X', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('X');
    expect(Array.isArray(arr)).toBe(true);
  });

  it('Slice 36 AC-exact-dec-1: matches when only rationale (not title) equals the literal', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice36_dec_rationale' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    // Two decisions whose title is NOT 'Token bucket' but whose rationale IS.
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'Token bucket'], active.root);
    await run(['decision', 'add', '--rec', recId, '--title', 'B', '--rationale', 'Different rationale'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-text-exact', 'Token bucket', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('A');
    expect(arr[0].rationale).toBe('Token bucket');
  });
```

### Step 3.9: Run all `decision.test` tests, verify PASS

```bash
pnpm --filter @cadence/core test -- decision.test
```

Expected: all `cadence decision` tests pass. Test count for this file grew by **11** (1 happy-path + 10 from Step 3.8).

### Step 3.10: Do NOT commit yet

```bash
git status --porcelain | head
```

Expected: six files modified (rec.ts, rec.test.ts, asn.ts, asn.test.ts, dec.ts, dec.test.ts). No other changes.

---

## Task 4: Full turbo gate + bundled feat commit

**Files:** None modified directly — this task validates and commits Tasks 1–3 atomically.

### Step 4.1: Run the full turbo gate

```bash
pnpm turbo run lint typecheck test build
```

Expected: **16/16 green** (4 packages × 4 tasks).

Common failure modes to inspect if it isn't green:
- `lint`: probable cause is a missing trailing comma in the inserted option string or in a new error-message template. Prettier-style fixes handle it.
- `typecheck`: probable cause is the `filterTextExact?: string` field placed in the wrong order in the `.action((opts: {...}) =>)` typing (commander doesn't care, but the codebase convention is source order: text → text-exact → regex). Or the `opts.filterTextExact === ''` check tripping a strict-eq lint that the codebase isn't using — verify the check passes typecheck before assuming it's wrong.
- `test`: a `text-exact="..."` string in the empty-filterDims message that doesn't match exactly (whitespace, quote placement). Re-read the expected stderr/stdout in the failing tests carefully.

### Step 4.2: Sanity-check the diff

```bash
git status --porcelain
git diff --stat
```

Expected: exactly six files affected:
- `packages/core/src/cli/commands/recommendation.ts` (~13 line additions — option row, action typing, 3 validation guards, apply block, filterDims push, plus 2 mutex-note rewrites on existing `--filter-text` / `--filter-regex` rows)
- `packages/core/src/cli/commands/assumption.ts` (~13 line additions, same shape)
- `packages/core/src/cli/commands/decision.ts` (~13 line additions, same shape)
- `packages/core/tests/cli/recommendation.test.ts` (~200 line additions for 11 new tests)
- `packages/core/tests/cli/assumption.test.ts` (~180 line additions for 10 new tests)
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
feat(core): --filter-text-exact on recommendation/assumption/decision list (Slice 36)

Add `--filter-text-exact <str>` to all three list commands. Case-insensitive
whole-field equality match on the same per-subject text scope as
--filter-text:

  recommendation: title OR summary
  assumption:     text
  decision:       title OR rationale

All three text-mode filters (--filter-text, --filter-text-exact,
--filter-regex) are pairwise mutually exclusive. Empty literal refuses
with `--filter-text-exact requires a non-empty value` and exit 1
(Slice 35 --sort-by precedent). No trim: surrounding whitespace in the
literal is significant. Single value (commander last-wins on repeat);
operators wanting OR-of-equalities use --filter-regex '^(A|B)$'.

Pipeline placement: validation guards run before the existing
--filter-text vs --filter-regex mutex; the equality apply block runs
between --filter-regex and the subject-specific filter (--filter-converted-to
for rec, --filter-rec for asn/dec) so that --filter-text-exact composes
with the rest of the filter / sort / reverse / offset / limit pipeline.

Empty-result filterDims gains a `text-exact="..."` push between the
existing `text="..."` and `regex="..."` pushes, keeping the three
text-mode dims contiguous.

Mutex notes on the existing --filter-text and --filter-regex option
descriptions updated to enumerate all three text-mode flags.

No shared filter-exact.ts helper across the three commands (~10 LoC
per command × 3 stays inline per the design's anti-scope — same call
as Slice 35's no-shared-sort.ts and Slice 34.3's no-from-rec.ts).

32 new tests (11 + 10 + 11) covering all ACs.

Design source: docs/superpowers/specs/2026-05-27-cadence-list-filter-text-exact-design.md
EOF
)"
```

### Step 4.4: Confirm the commit landed

```bash
git log -1 --oneline
git status --porcelain
```

Expected: top of log shows `<sha> feat(core): --filter-text-exact on recommendation/assumption/decision list (Slice 36)`. Working tree clean.

---

## Task 5: Documentation update in `docs/reference/commands.md`

**Files:**
- Modify: `docs/reference/commands.md`

### Step 5.1: Inspect the existing list-command option blocks

```bash
grep -n "filter-text\|filter-regex" docs/reference/commands.md
```

Expected: 6 matches — two rows per list command (rec, asn, dec), each describing `--filter-text` and `--filter-regex`. As of post-Slice-35, the three relevant lines for each command are something like:

```
| `--filter-text <substr>` | Case-insensitive substring search on title or summary. Mutually exclusive with `--filter-regex`. |
| `--filter-regex <pattern>` | Power-user regex filter on title or summary (always case-sensitive; use character classes like `[Cc]ycle` for case-insensitive). Mutually exclusive with `--filter-text`. |
```

(Substitute `text` for `title or summary` in the assumption section and `title or rationale` for the decision section.)

### Step 5.2: Update each of the three list option tables

For each of the three `list` subcommand options tables, do TWO things:

1. Update the existing `--filter-text` row to mention `--filter-text-exact` in its mutex clause.
2. Update the existing `--filter-regex` row to mention `--filter-text-exact` in its mutex clause.
3. Insert a new `--filter-text-exact` row **between** them.

For `recommendation list`:

```markdown
| `--filter-text <substr>` | Case-insensitive substring search on title or summary. Mutually exclusive with `--filter-text-exact` and `--filter-regex`. |
| `--filter-text-exact <str>` | Case-insensitive whole-field equality match on title or summary. The entire scoped field must equal the literal (case-insensitive); substring matches do NOT match. Surrounding whitespace in the literal is significant (no trim). Mutually exclusive with `--filter-text` and `--filter-regex`. Empty literal returns exit 1. (Slice 36) |
| `--filter-regex <pattern>` | Power-user regex filter on title or summary (always case-sensitive; use character classes like `[Cc]ycle` for case-insensitive). Mutually exclusive with `--filter-text` and `--filter-text-exact`. |
```

For `assumption list`:

```markdown
| `--filter-text <substr>` | Case-insensitive substring search on `text`. Mutually exclusive with `--filter-text-exact` and `--filter-regex`. |
| `--filter-text-exact <str>` | Case-insensitive whole-field equality match on `text`. The entire scoped field must equal the literal (case-insensitive); substring matches do NOT match. Surrounding whitespace in the literal is significant (no trim). Mutually exclusive with `--filter-text` and `--filter-regex`. Empty literal returns exit 1. (Slice 36) |
| `--filter-regex <pattern>` | Power-user regex filter on `text` (always case-sensitive; use character classes like `[Cc]ycle` for case-insensitive). Mutually exclusive with `--filter-text` and `--filter-text-exact`. |
```

For `decision list`:

```markdown
| `--filter-text <substr>` | Case-insensitive substring search on title or rationale. Mutually exclusive with `--filter-text-exact` and `--filter-regex`. |
| `--filter-text-exact <str>` | Case-insensitive whole-field equality match on title or rationale. The entire scoped field must equal the literal (case-insensitive); substring matches do NOT match. Surrounding whitespace in the literal is significant (no trim). Mutually exclusive with `--filter-text` and `--filter-regex`. Empty literal returns exit 1. (Slice 36) |
| `--filter-regex <pattern>` | Power-user regex filter on title or rationale (always case-sensitive; use character classes like `[Cc]ycle` for case-insensitive). Mutually exclusive with `--filter-text` and `--filter-text-exact`. |
```

If the actual current rows differ slightly from the snippets above (e.g., different phrasing), preserve the existing description and only update the mutex clause + insert the new row.

### Step 5.3: Sanity-check the new rows landed and the mutex clauses are updated

```bash
grep -n "filter-text-exact" docs/reference/commands.md
grep -nE "filter-text.*Mutually exclusive|filter-regex.*Mutually exclusive" docs/reference/commands.md
```

Expected:
- First grep: at least 3 matches (one per list subcommand row).
- Second grep: 6 matches — all six mutex clauses now mention three flags each.

### Step 5.4: Run the full turbo gate one more time

```bash
pnpm turbo run lint typecheck test build
```

Expected: **16/16 green**. The docs change should not affect tests, but the CLI-reference drift guard (if any) checks that documented flags appear in command help — running the gate confirms.

### Step 5.5: Commit the docs

```bash
git add docs/reference/commands.md
git commit -m "$(cat <<'EOF'
docs: document --filter-text-exact on list commands + reconcile Slice-33 follow-ref (Slice 36)

Reference docs for the --filter-text-exact flag added in Slice 36 on all
three list commands. Each entry names the whole-field equality semantics,
case-insensitivity, no-trim behavior, and the three-way mutex with
--filter-text and --filter-regex.

Existing --filter-text and --filter-regex rows updated to mention the
new flag in their mutex clauses (now enumerating all three text-mode
flags pairwise).

Slice-33 § Follow-On "--filter-text-exact" entry is now satisfied — no
in-place edit needed to that historical spec (it remains an accurate
snapshot of its state). Reconciliation tracked in this slice's design
doc Decision Log.
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

### Step 6.2: Confirm Praxis four-commit shape (design + plan + feat + docs)

```bash
git log --oneline -4
```

Expected (most recent first):

```
<sha> docs: document --filter-text-exact on list commands + reconcile Slice-33 follow-ref (Slice 36)
<sha> feat(core): --filter-text-exact on recommendation/assumption/decision list (Slice 36)
<sha> docs: Slice 36 implementation plan (--filter-text-exact on list commands)
1b0fb34 docs: design — --filter-text-exact on list commands (Praxis Slice 36)
```

(The bottom of those four is the design commit from before execution started; the second-bottom is this plan committed before Task 1 ran.)

### Step 6.3: Verify @cadence/core test count grew by 32

```bash
pnpm --filter @cadence/core test 2>&1 | grep -E "Tests.*passed" | tail -1
```

Expected: total passed = 1081 (post-Slice-35 baseline) + 32 (Slice 36) = **1113**.

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

### Step 6.5: Sanity-check the runner is still running

```bash
gh api repos/manehorizons/cadence/actions/runners --jq '.runners[] | {name, status, busy}'
```

Expected: the `cadence-dev` runner is `online` and was momentarily `busy: true` during the CI run.

---

## Spec coverage check (self-review)

| Design requirement | Covered by |
|---|---|
| `--filter-text-exact <str>` added to `recommendation list` | Task 1.3 option, 1.4 validation, 1.5 apply, 1.6 filterDims |
| `--filter-text-exact <str>` added to `assumption list` | Task 2.3 option, 2.4 validation, 2.5 apply, 2.6 filterDims |
| `--filter-text-exact <str>` added to `decision list` | Task 3.3 option, 3.4 validation, 3.5 apply, 3.6 filterDims |
| Whole-field equality, case-insensitive | Task 1.5 / 2.5 / 3.5 apply block uses `.toLowerCase() === needle` |
| Scope: rec = title \| summary | Task 1.5 apply block has both `r.title` and `r.summary` checks |
| Scope: asn = text | Task 2.5 apply block has only `a.text` check |
| Scope: dec = title \| rationale | Task 3.5 apply block has both `d.title` and `d.rationale` checks |
| All three text-mode filters pairwise mutex | Task 1.4 / 2.4 / 3.4 insert two new mutex guards (vs `--filter-text`, vs `--filter-regex`); existing `--filter-text` vs `--filter-regex` mutex unchanged |
| Single value, no array semantics | No commander `.option(..., collect)` call — default last-wins behavior (verified by typing as `filterTextExact?: string`, not `string[]`) |
| Empty literal refuses with clear error | Task 1.4 / 2.4 / 3.4 empty-refuse guard; verified by AC-exact-4 test in each suite |
| No trim — whitespace significant | Apply block uses raw `.toLowerCase()` without any `.trim()`; verified by AC-exact-7 test in each suite |
| Pipeline stage: same as `--filter-text` / `--filter-regex` | Apply block placed between `--filter-regex` and the subject-specific filter in each command |
| Pairwise mutex error messages name both flags | Mutex guards emit `cannot combine --filter-text-exact with --filter-text` and `cannot combine --filter-text-exact with --filter-regex` |
| `text-exact="..."` filterDims display | Task 1.6 / 2.6 / 3.6 push inserted between `text=` and `regex=` |
| FilterDims order: status → text → text-exact → regex → subject-specific | Position of the new push in each command preserves this order |
| Composes with `--filter-status`, `--sort-by`, `--reverse`, `--offset`, `--limit`, `--filter-rec`, `--filter-converted-to` | Verified by AC-exact-9 (composes with status + sort-by) in each suite |
| `--format json` emits matched JSON array | Verified by AC-exact-10 in each suite |
| Multi-field ANY-of scope (rec, dec) | Verified by AC-exact-rec-1 (rec; summary-only match) and AC-exact-dec-1 (dec; rationale-only match) |
| No `--filter-text-exact-in` per-field scope | No such option added to any command |
| No mode flag (`--filter-text-mode`) | No such option added |
| No grammar suffix (`'foo:exact'`) | Option declared as plain `<str>`, parsed as the literal value |
| No shared `filter-exact.ts` helper | No new files; each command has its own ~10 LoC inline block |
| No `intelligence audit` change | `intelligence.ts` not in modified files |
| No `milestone list` change | `milestone.ts` not in modified files |
| No `@cadence/types` schema change | `packages/types/` not in modified files |
| No store/render layer change | `intelligence/store.ts` and render files not in modified files |
| Slice-33 § Follow-On `--filter-text-exact` entry reconciled | Task 5.5 commit body explains the no-in-place-edit approach |
| Existing `--filter-text` / `--filter-regex` mutex notes updated to enumerate three flags | Task 1.3 / 2.3 / 3.3 (source) + Task 5.2 (docs) |
| Praxis four-commit convention (design + plan + feat + docs) | Design at `1b0fb34`; plan committed pre-execution; Task 4 = feat; Task 5 = docs |
| ~10 LoC source per command | Task 4.2 expected diff stat |
| ~32 new tests (11 + 10 + 11) | Task 6.3 expected count delta 1081 → 1113 |
| Test count target 1081 → ~1113 | Task 6.3 explicit assertion |

**Gaps found:** none. Every requirement in the spec maps to a task or step.
