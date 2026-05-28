# Slice 37 — `--filter-regex-flags` on list commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--filter-regex-flags <flags>` companion flag to `cadence recommendation list`, `cadence assumption list`, and `cadence decision list`. Accepts a string of JS RegExp flag letters from the curated allowlist `{i, m, s, u}` and passes them as the second argument to `new RegExp(pattern, flags)`. Closes the case-insensitivity gap Slice 33 left as a follow-on. Companion to `--filter-regex` — requires `--filter-regex` to also be set; orphan use refuses. Strict validation: empty, duplicates, and invalid letters all refuse with errors that name the specific letter.

**Architecture:** Three symmetric, per-command implementations. Each command file gains: a module-level `parseRegexFlags(raw)` helper + `ALLOWED_REGEX_FLAGS` Set constant; a new `.option('--filter-regex-flags <flags>', ...)` declaration; a `filterRegexFlags?: string` field on the action callback typing; a new validation block (orphan-check + parse) placed right before the existing `--filter-regex` apply; a **one-line modification** to the existing `new RegExp(opts.filterRegex)` call to pass `regexFlags` as the second argument; and one new `filterDims.push` for the empty-result message inserted immediately after the existing `regex=` push. **No shared `regex-flags.ts` helper** — ~14 LoC per command × 3 stays inline (Slice 35 / 36 / 34.3 precedent). No participation in the three-way text-mode mutex (the flag modifies `--filter-regex`, not a fourth filter mode). No schema, store, render, or `@cadence/types` change.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), commander for CLI parsing, vitest for tests, `@cadence/testkit`'s `tempRepo`, `pnpm turbo` for the gate.

**Upstream design source:** `docs/superpowers/specs/2026-05-27-cadence-list-filter-regex-flags-design.md` (committed `2cffb82` on `main`).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/core/src/cli/commands/recommendation.ts` | Modify | Add `ALLOWED_REGEX_FLAGS` constant + `parseRegexFlags` helper at module scope; `--filter-regex-flags` option; orphan-check + parse block; one-line change inside the `--filter-regex` apply (`new RegExp(opts.filterRegex, regexFlags)`); filterDims push. ~17 LoC added. |
| `packages/core/src/cli/commands/assumption.ts` | Modify | Same shape. ~17 LoC added. |
| `packages/core/src/cli/commands/decision.ts` | Modify | Same shape. ~17 LoC added. |
| `packages/core/tests/cli/recommendation.test.ts` | Modify (append) | 7 new tests (6 shared ACs + AC-flags-rec-1 duplicate-letter). |
| `packages/core/tests/cli/assumption.test.ts` | Modify (append) | 6 new tests (6 shared ACs). |
| `packages/core/tests/cli/decision.test.ts` | Modify (append) | 6 new tests (6 shared ACs). |
| `docs/reference/commands.md` | Modify | Insert `--filter-regex-flags` row in each of the three list option tables (immediately after the existing `--filter-regex` row); add a short pointer-clause to the existing `--filter-regex` row in each table. |
| `docs/superpowers/specs/2026-05-25-cadence-list-filter-regex-design.md` | Modify (one-line strike) | Strike the `--filter-regex-flags <flags>` bullet in § Follow-On (line 202) with a reference to Slice 37 — per Slice 37 spec's "Predecessor reconciliation". |

**No new files.** No `@cadence/types` schema change. No new helper files.

**Total expected net additions:** ~51 LoC of source (~17 per command × 3) + ~280 LoC of tests + ~9 line edits in `commands.md` (3 added + 3 updated `--filter-regex` rows + 3 updated `--filter-text` rows are NOT in scope this slice) + 1 line edit in Slice 33 spec § Follow-On.

**Note on `--filter-text` row in commands.md:** Slice 36 already updated each `--filter-text` row's mutex clause to enumerate three text-mode flags. Slice 37 does NOT touch those rows again. Only the `--filter-regex` rows get a tiny pointer to the new `--filter-regex-flags` flag.

**Commit shape (Praxis convention, design + plan committed before execution):**
1. (already committed `2cffb82`) `docs: design — --filter-regex-flags on list commands (Praxis Slice 37)`
2. `docs: Slice 37 implementation plan (--filter-regex-flags on list commands)` — committed before Task 1 runs
3. `feat(core): --filter-regex-flags on recommendation/assumption/decision list (Slice 37)` — Tasks 1–3 bundle into one feat commit at Task 4
4. `docs: document --filter-regex-flags + reconcile Slice-33 follow-ref (Slice 37)` — Task 5

This project does **NOT** use the `Co-Authored-By` trailer on feat/docs commits. Verified absent on `2cffb82`. Each new commit body MUST be verified for the same before push (`git show --format=%B HEAD | grep -c Co-Authored-By` should return `0`).

---

## Task 0: Commit this plan

**Files:**
- Modify (staging only): `docs/superpowers/plans/2026-05-27-slice-37-filter-regex-flags.md` (this file, already written)

### Step 0.1: Confirm the working tree state

```bash
git status --porcelain
```

Expected two entries (and nothing else):
- `?? docs/superpowers/plans/2026-05-27-slice-37-filter-regex-flags.md` — this plan file, untracked.
- ` D HANDOFF.md` — tracked deletion, residue from the `/resume` cleanup that moved HANDOFF.md to `HANDOFF.md.resumed-<timestamp>` (matched by gitignore pattern `HANDOFF.md.resumed-*`).

Per the Slice 37 design § Commit Convention, the `D HANDOFF.md` deletion rides along with the first commit of this slice's session — which is the plan commit. Same pattern as the `33cebb1` and `1b0fb34` precedents.

If anything else has been modified (`M `-prefixed entries), STOP and report — execution should not begin from a dirty tree containing unrelated work.

### Step 0.2: Stage and commit the plan + bundled HANDOFF.md deletion

```bash
git add docs/superpowers/plans/2026-05-27-slice-37-filter-regex-flags.md HANDOFF.md
git commit -m "$(cat <<'EOF'
docs: Slice 37 implementation plan (--filter-regex-flags on list commands)

Implementation plan for Slice 37. Six tasks: Tasks 1-3 per-command
(recommendation, assumption, decision) with TDD red-green; Task 4
bundled feat commit; Task 5 docs commit; Task 6 final verify + push.
19 new tests target (rec=7, asn=6, dec=6). @cadence/core test count
1113 -> ~1132.

Also bundles the HANDOFF.md deletion (tracked file moved by this
session's /resume cleanup to gitignored HANDOFF.md.resumed-<timestamp>
archive) — same pattern as the 33cebb1 and 1b0fb34 precedents.

Design source: docs/superpowers/specs/2026-05-27-cadence-list-filter-regex-flags-design.md
EOF
)"
```

### Step 0.3: Verify the plan commit landed clean

```bash
git log -1 --format=%B | grep -c Co-Authored-By
git log -1 --oneline
```

Expected: `0` (no Co-Authored-By trailer) and the top commit reads `<sha> docs: Slice 37 implementation plan (--filter-regex-flags on list commands)`. If the trailer count is non-zero, STOP and amend the commit body to remove it before proceeding.

### Step 0.4: Verify both design and plan commits will ship together when pushed

```bash
git log --oneline origin/main..HEAD
```

Expected: exactly TWO commits ahead of `origin/main`:

```
<sha-plan>   docs: Slice 37 implementation plan (--filter-regex-flags on list commands)
2cffb82      docs: design — --filter-regex-flags on list commands (Praxis Slice 37)
```

Wait — these may both already be on `origin/main` if the prior `/resume` session pushed the `chore: session handoff` commit (`8919544`) which would have carried the design with it. If `git log --oneline origin/main..HEAD` shows only ONE commit (the plan), then the design was already pushed. That's fine — push the plan alone in Task 6, no atomicity concern.

If `origin/main..HEAD` shows BOTH design and plan: push them together in Task 6 (the Praxis convention of "design + plan committed before execution" is satisfied either way).

---

## Task 1: `--filter-regex-flags` on `recommendation list`

**Files:**
- Modify (source): `packages/core/src/cli/commands/recommendation.ts`
- Modify (append tests): `packages/core/tests/cli/recommendation.test.ts`

### Step 1.1: Write the failing happy-path case-insensitive test

Append inside the existing `describe('cadence recommendation', ...)` block at the bottom of `packages/core/tests/cli/recommendation.test.ts`, just before the closing `});` of the describe. The fixture seeds two recs with case-different titles and asserts `--filter-regex '^cycle' --filter-regex-flags 'i'` returns both (case-insensitive `/^cycle/i`).

```typescript
  it('Slice 37 AC-flags-1 (rec): --filter-regex-flags "i" makes --filter-regex case-insensitive', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_rec_flags1' });
    await run(['recommendation', 'add', '--title', 'Cycle planning', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'cycle review', '--summary', 's'], active.root);
    await run(['recommendation', 'add', '--title', 'Other', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-regex', '^cycle', '--filter-regex-flags', 'i', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(2);
    const titles = arr.map((r: { title: string }) => r.title).sort();
    expect(titles).toEqual(['Cycle planning', 'cycle review']);
  });
```

### Step 1.2: Run the build + test, verify FAIL

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- recommendation.test
```

Expected: this single new test fails. Commander rejects `--filter-regex-flags` as an unknown option, so the run exits non-zero and `expect(r.code).toBe(0)` fails.

### Step 1.3: Add the module-scope `ALLOWED_REGEX_FLAGS` constant and `parseRegexFlags` helper

Open `packages/core/src/cli/commands/recommendation.ts`. The file's module-scope helpers (currently `csv` at line 20, `SortDir`/`ParsedSort` at lines 28–29, `parseSortBy` at line 31) live between the import block (ends ~line 18) and the `registerRecommendation(...)` function declaration further down. Add the new helper alongside `parseSortBy`.

Insert this block immediately after the closing `}` of `parseSortBy(...)` (and before the next top-level declaration `REC_SORT_KEYS` or `compareRec` — whichever comes next):

```typescript
const ALLOWED_REGEX_FLAGS = new Set(['i', 'm', 's', 'u']);

function parseRegexFlags(raw: string): { flags: string } | { error: string } {
  if (raw.length === 0) return { error: '--filter-regex-flags requires a non-empty value' };
  const seen = new Set<string>();
  for (const ch of raw) {
    if (!ALLOWED_REGEX_FLAGS.has(ch)) {
      return { error: `invalid flag letter: '${ch}' (allowed: i, m, s, u)` };
    }
    if (seen.has(ch)) {
      return { error: `duplicate flag letter: '${ch}'` };
    }
    seen.add(ch);
  }
  return { flags: raw };
}
```

Place verification check:

```bash
grep -n "^function parseRegexFlags\|^const ALLOWED_REGEX_FLAGS" packages/core/src/cli/commands/recommendation.ts
```

Expected: two matches, both at module scope (line numbers below the imports, above `function registerRecommendation`).

### Step 1.4: Add the `--filter-regex-flags` option declaration

Find the `recommendation list` subcommand registration in `packages/core/src/cli/commands/recommendation.ts`. The current `.option(...)` sequence (currently lines 221–230) reads:

```typescript
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .option('--filter-status <status>', 'Filter to only entries with this status')
    .option('--filter-text <substr>', 'Case-insensitive substring search on title or summary. Mutually exclusive with --filter-text-exact and --filter-regex.')
    .option('--filter-text-exact <str>', 'Case-insensitive whole-field equality match on title or summary. Mutually exclusive with --filter-text and --filter-regex.')
    .option('--filter-regex <pattern>', 'Power-user regex filter on title or summary (always case-sensitive; use character classes like [Cc]ycle for case-insensitive). Mutually exclusive with --filter-text and --filter-text-exact.')
    .option('--filter-converted-to <phaseId>', 'Reverse-lookup filter: only recommendations with convertedToPhaseId equal to <phaseId>. Implies status=converted (Slice 34.4).')
    .option('--sort-by <key>', 'Sort by a single key, optionally with :desc suffix. Allowed keys: created, updated, priority, status, title, leverage, risk, confidence, decay.')
    .option('--reverse', 'Reverse the entry order (after filters, before offset/limit)')
    .option('--offset <n>', 'Skip the first N entries (after filters)')
    .option('--limit <n>', 'Cap output to first N entries (after filters)')
```

Insert a new `.option(...)` line for `--filter-regex-flags` immediately after the existing `--filter-regex` line and before `--filter-converted-to`. Insert exactly:

```typescript
    .option('--filter-regex-flags <flags>', 'RegExp flag letters to apply to --filter-regex. Allowed: i (case-insensitive), m (multiline ^/$), s (dotAll .), u (unicode). Requires --filter-regex.')
```

Do NOT modify the existing `--filter-regex` line's description in source — the cross-reference between flags lives in the docs (Task 5) and inline orphan-check error message (Step 1.5), not in the commander help string. (Slice 37 design § Anti-Scope is silent on this; keeping the source description short matches the Slice 33 baseline.)

Then update the `.action(async (opts: {...}) => {` callback's `opts` typing (currently line 231). The current typing reads:

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterText?: string; filterTextExact?: string; filterRegex?: string; filterConvertedTo?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

Replace with the same typing plus `filterRegexFlags?: string`, inserted in source order (after `filterRegex` and before `filterConvertedTo`):

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterText?: string; filterTextExact?: string; filterRegex?: string; filterRegexFlags?: string; filterConvertedTo?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

### Step 1.5: Insert orphan-check + parse block immediately before the `--filter-regex` apply

Locate the existing `--filter-regex` apply block (currently lines 290–302):

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

Insert this block of orphan-check + parse **immediately before** the existing `--filter-regex` apply block (i.e., after the closing brace of the `--filter-text` apply at line 289 and before `if (opts.filterRegex !== undefined) {` at line 290):

```typescript
        if (opts.filterRegexFlags !== undefined && opts.filterRegex === undefined) {
          process.stderr.write(
            `recommendation list failed: --filter-regex-flags requires --filter-regex to also be set\n`,
          );
          process.exitCode = 1;
          return;
        }
        let regexFlags: string | undefined;
        if (opts.filterRegexFlags !== undefined) {
          const parsed = parseRegexFlags(opts.filterRegexFlags);
          if ('error' in parsed) {
            process.stderr.write(`recommendation list failed: ${parsed.error}\n`);
            process.exitCode = 1;
            return;
          }
          regexFlags = parsed.flags;
        }
```

Order rationale: orphan-check fires first (most specific user mistake — typed flags but forgot the pattern). Parse runs second, returning the first invalid or first duplicate as the error. After this block, `regexFlags` is either `undefined` (no flag set) or a known-good letter string.

### Step 1.6: Change the existing `new RegExp(...)` call to pass `regexFlags`

Inside the same `--filter-regex` apply block (now starting one line lower than 290 because of Step 1.5's insertion), replace the existing `regex = new RegExp(opts.filterRegex);` line with:

```typescript
            regex = new RegExp(opts.filterRegex, regexFlags);
```

The surrounding `try { ... } catch (err) { ... }` is unchanged — the existing SyntaxError catch already covers any RegExp construction error. `regexFlags` is `undefined` when `--filter-regex-flags` is absent, and `new RegExp(pattern, undefined) ≡ new RegExp(pattern)`, so behavior is identical to Slice 33 in that case.

Note on TypeScript: with `exactOptionalPropertyTypes: true`, the `string | undefined` type of `regexFlags` is the correct argument shape for `RegExp`'s `flags?: string` parameter. No `?? ''` fallback needed.

### Step 1.7: Insert the filterDims push immediately after the existing `regex=` push

Locate the existing empty-result filterDims block (currently lines 365–371):

```typescript
          const filterDims: string[] = [];
          if (opts.filterStatus) filterDims.push(`status=${opts.filterStatus}`);
          if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
          if (opts.filterTextExact !== undefined) filterDims.push(`text-exact="${opts.filterTextExact}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.filterConvertedTo !== undefined) filterDims.push(`converted-to="${opts.filterConvertedTo}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
```

Insert a new push line **immediately after** the `regex=` line and before the `converted-to=` line so the regex-and-flags pair stays contiguous:

```typescript
          const filterDims: string[] = [];
          if (opts.filterStatus) filterDims.push(`status=${opts.filterStatus}`);
          if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
          if (opts.filterTextExact !== undefined) filterDims.push(`text-exact="${opts.filterTextExact}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.filterRegexFlags !== undefined) filterDims.push(`regex-flags="${opts.filterRegexFlags}"`);
          if (opts.filterConvertedTo !== undefined) filterDims.push(`converted-to="${opts.filterConvertedTo}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
```

### Step 1.8: Run the build + test, verify the happy-path test now PASSES

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- recommendation.test
```

Expected: all `cadence recommendation` tests pass, including the new Slice 37 AC-flags-1 test from Step 1.1. Test count for this file grew by 1 so far.

### Step 1.9: Append the remaining 6 tests for `recommendation list`

Append each `it(...)` block inside the same `describe('cadence recommendation', ...)`, just before the closing `});`. Append all 6 in one edit. Each is independent and references its AC token in the test name.

AC-flags-2 (multi-flag) requires multi-line summary content to verify both `i` and `s` are applied. Since the `recommendation add` CLI takes `--summary <str>` as a single argv string, the test seeds a placeholder summary then JSON-edits the ledger file to inject a real newline (`'foo\nBAR'`) — same ledger-edit pattern Slice 36 used for its composition tests (AC-exact-9). Without `s`, `/foo.bar/` cannot span a newline (`.` doesn't match newline by default); without `i`, `bar` doesn't match `BAR`. Both flags must apply for the match to succeed.

```typescript
  it('Slice 37 AC-flags-2 (rec): --filter-regex-flags "is" applies both case-insensitive AND dotAll', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_rec_flags2' });
    await run(['recommendation', 'add', '--title', 'Multi', '--summary', 'placeholder'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.recommendations[0].summary = 'foo\nBAR';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['recommendation', 'list', '--filter-regex', 'foo.bar', '--filter-regex-flags', 'is', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('Multi');
  });

  it('Slice 37 AC-flags-3 (rec): orphan use without --filter-regex refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_rec_flags3' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-regex-flags', 'i'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'recommendation list failed: --filter-regex-flags requires --filter-regex to also be set\n',
    );
  });

  it('Slice 37 AC-flags-4 (rec): empty value refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_rec_flags4' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-regex', 'foo', '--filter-regex-flags', ''],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'recommendation list failed: --filter-regex-flags requires a non-empty value\n',
    );
  });

  it('Slice 37 AC-flags-5 (rec): invalid flag letter refuses with exit 1, naming the letter', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_rec_flags5' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-regex', 'foo', '--filter-regex-flags', 'g'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      "recommendation list failed: invalid flag letter: 'g' (allowed: i, m, s, u)\n",
    );
  });

  it('Slice 37 AC-flags-6 (rec): empty result includes both regex="..." AND regex-flags="..." in filterDims', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_rec_flags6' });
    await run(['recommendation', 'add', '--title', 'Cycle planning', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-regex', '^no-such-prefix', '--filter-regex-flags', 'i'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      'No recommendations matching regex="^no-such-prefix", regex-flags="i" recorded.\n',
    );
  });

  it('Slice 37 AC-flags-rec-1: duplicate flag letter refuses with exit 1, naming the letter', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_rec_flags_rec1' });
    await run(['recommendation', 'add', '--title', 'A', '--summary', 's'], active.root);

    const r = await run(
      ['recommendation', 'list', '--filter-regex', 'foo', '--filter-regex-flags', 'ii'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      "recommendation list failed: duplicate flag letter: 'i'\n",
    );
  });
```

Note on AC-flags-5 error string: the message uses single quotes around the letter (`'g'`), so the JavaScript string literal in the assertion uses double quotes (`"..."`) to avoid escaping. Same approach for AC-flags-rec-1.

### Step 1.10: Run all `recommendation.test` tests, verify PASS

```bash
pnpm --filter @cadence/core test -- recommendation.test
```

Expected: all `cadence recommendation` tests pass. Test count for this file grew by **7** (1 happy-path from Step 1.1 + 6 from Step 1.9).

### Step 1.11: Do NOT commit yet

Leave the working tree dirty for now. Task 4 bundles all three commands into a single feat commit per Praxis convention.

```bash
git status --porcelain | head
```

Expected: two files modified — `packages/core/src/cli/commands/recommendation.ts` and `packages/core/tests/cli/recommendation.test.ts`. No other changes.

---

## Task 2: `--filter-regex-flags` on `assumption list`

**Files:**
- Modify (source): `packages/core/src/cli/commands/assumption.ts`
- Modify (append tests): `packages/core/tests/cli/assumption.test.ts`

### Step 2.1: Write the failing happy-path case-insensitive test

Append inside the existing `describe('cadence assumption', ...)` block at the bottom of `packages/core/tests/cli/assumption.test.ts`, just before the closing `});` of the describe.

The fixture seeds two assumptions with case-different text and asserts `--filter-regex '^rate' --filter-regex-flags 'i'` returns both.

`addRecommendation` is already imported at the top of `packages/core/tests/cli/assumption.test.ts` from `../../src/intelligence/store.js` (confirmed in current file head). The canonical minimal seed shape `{ title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea', affectedAreas: [], affectedFiles: [] }` returns a `rec` object exposing `.id`. No new imports needed.

```typescript
  it('Slice 37 AC-flags-1 (asn): --filter-regex-flags "i" makes --filter-regex case-insensitive', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_asn_flags1' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'Rate limit handles bursts'], active.root);
    await run(['assumption', 'add', '--rec', recId, '--text', 'rate limit handles spikes'], active.root);
    await run(['assumption', 'add', '--rec', recId, '--text', 'Other'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-regex', '^rate', '--filter-regex-flags', 'i', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(2);
    const texts = arr.map((a: { text: string }) => a.text).sort();
    expect(texts).toEqual(['Rate limit handles bursts', 'rate limit handles spikes']);
  });
```

### Step 2.2: Run the build + test, verify FAIL

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- assumption.test
```

Expected: this new test fails (commander rejects `--filter-regex-flags`).

### Step 2.3: Add the module-scope `ALLOWED_REGEX_FLAGS` constant and `parseRegexFlags` helper

Open `packages/core/src/cli/commands/assumption.ts`. Locate the module-scope helpers section (the imports end near the top; helpers like `parseSortBy` / `ASN_SORT_KEYS` / `compareAsn` live between imports and the registration function). Insert the same helper as in Task 1.3, alongside `parseSortBy`:

```typescript
const ALLOWED_REGEX_FLAGS = new Set(['i', 'm', 's', 'u']);

function parseRegexFlags(raw: string): { flags: string } | { error: string } {
  if (raw.length === 0) return { error: '--filter-regex-flags requires a non-empty value' };
  const seen = new Set<string>();
  for (const ch of raw) {
    if (!ALLOWED_REGEX_FLAGS.has(ch)) {
      return { error: `invalid flag letter: '${ch}' (allowed: i, m, s, u)` };
    }
    if (seen.has(ch)) {
      return { error: `duplicate flag letter: '${ch}'` };
    }
    seen.add(ch);
  }
  return { flags: raw };
}
```

The helper is identical to the one in `recommendation.ts` — this is intentional duplication per the design's anti-scope decision (no shared `regex-flags.ts` helper across the three commands; factor when a fourth command needs it).

### Step 2.4: Add the `--filter-regex-flags` option declaration

Find the `assumption list` subcommand registration in `packages/core/src/cli/commands/assumption.ts`. The current `.option(...)` sequence (currently lines 143–152) reads:

```typescript
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .option('--filter-status <status>', 'Filter to only entries with this status')
    .option('--filter-rec <recId>', 'Filter to only entries tied to this recommendation')
    .option('--filter-text <substr>', 'Case-insensitive substring search on text. Mutually exclusive with --filter-text-exact and --filter-regex.')
    .option('--filter-text-exact <str>', 'Case-insensitive whole-field equality match on text. Mutually exclusive with --filter-text and --filter-regex.')
    .option('--filter-regex <pattern>', 'Power-user regex filter on text (always case-sensitive; use character classes like [Cc]ycle for case-insensitive). Mutually exclusive with --filter-text and --filter-text-exact.')
    .option('--sort-by <key>', 'Sort by a single key, optionally with :desc suffix. Allowed keys: created, status, text, rec.')
    .option('--reverse', 'Reverse the entry order (after filters, before offset/limit)')
    .option('--offset <n>', 'Skip the first N entries (after filters)')
    .option('--limit <n>', 'Cap output to first N entries (after filters)')
```

Insert a new `.option(...)` line for `--filter-regex-flags` immediately after the existing `--filter-regex` line and before `--sort-by`. Insert exactly:

```typescript
    .option('--filter-regex-flags <flags>', 'RegExp flag letters to apply to --filter-regex. Allowed: i (case-insensitive), m (multiline ^/$), s (dotAll .), u (unicode). Requires --filter-regex.')
```

Then update the `.action(async (opts: {...}) => {` callback's `opts` typing (currently line 153). The current typing reads:

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterRec?: string; filterText?: string; filterTextExact?: string; filterRegex?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

Replace with the same typing plus `filterRegexFlags?: string`, inserted in source order (after `filterRegex` and before `sortBy`):

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterRec?: string; filterText?: string; filterTextExact?: string; filterRegex?: string; filterRegexFlags?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

### Step 2.5: Insert orphan-check + parse block immediately before the `--filter-regex` apply

Locate the existing `--filter-regex` apply block (currently lines 211–223):

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

Insert this block of orphan-check + parse **immediately before** the existing `--filter-regex` apply block (i.e., after the closing brace of the `--filter-text` apply at line 210 and before `if (opts.filterRegex !== undefined) {` at line 211):

```typescript
        if (opts.filterRegexFlags !== undefined && opts.filterRegex === undefined) {
          process.stderr.write(
            `assumption list failed: --filter-regex-flags requires --filter-regex to also be set\n`,
          );
          process.exitCode = 1;
          return;
        }
        let regexFlags: string | undefined;
        if (opts.filterRegexFlags !== undefined) {
          const parsed = parseRegexFlags(opts.filterRegexFlags);
          if ('error' in parsed) {
            process.stderr.write(`assumption list failed: ${parsed.error}\n`);
            process.exitCode = 1;
            return;
          }
          regexFlags = parsed.flags;
        }
```

### Step 2.6: Change the existing `new RegExp(...)` call to pass `regexFlags`

Inside the same `--filter-regex` apply block, replace the existing `regex = new RegExp(opts.filterRegex);` line with:

```typescript
            regex = new RegExp(opts.filterRegex, regexFlags);
```

### Step 2.7: Insert the filterDims push immediately after the existing `regex=` push

Locate the existing empty-result filterDims block (currently lines 279–285):

```typescript
          const filterDims: string[] = [];
          if (opts.filterStatus) filterDims.push(`status=${opts.filterStatus}`);
          if (opts.filterRec) filterDims.push(`rec=${opts.filterRec}`);
          if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
          if (opts.filterTextExact !== undefined) filterDims.push(`text-exact="${opts.filterTextExact}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
```

Insert a new push line **immediately after** the `regex=` line and before the `offset=` line:

```typescript
          const filterDims: string[] = [];
          if (opts.filterStatus) filterDims.push(`status=${opts.filterStatus}`);
          if (opts.filterRec) filterDims.push(`rec=${opts.filterRec}`);
          if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
          if (opts.filterTextExact !== undefined) filterDims.push(`text-exact="${opts.filterTextExact}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.filterRegexFlags !== undefined) filterDims.push(`regex-flags="${opts.filterRegexFlags}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
```

### Step 2.8: Run the build + test, verify the happy-path test now PASSES

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- assumption.test
```

Expected: all `cadence assumption` tests pass.

### Step 2.9: Append the remaining 5 tests for `assumption list`

Append each `it(...)` block inside the same `describe('cadence assumption', ...)`. Five shared ACs (2 through 6) — no duplicate-letter test (per spec: that lives only in rec to avoid 3× redundancy on the parse logic).

Every test uses the same `addRecommendation` seed shape. AC-flags-2 (multi-flag) uses the ledger-edit pattern to inject a real newline into the assumption's `text` field.

```typescript
  it('Slice 37 AC-flags-2 (asn): --filter-regex-flags "is" applies both case-insensitive AND dotAll', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_asn_flags2' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'placeholder'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.assumptions[0].text = 'foo\nBAR';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['assumption', 'list', '--filter-regex', 'foo.bar', '--filter-regex-flags', 'is', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
  });

  it('Slice 37 AC-flags-3 (asn): orphan use without --filter-regex refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_asn_flags3' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'foo'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-regex-flags', 'i'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'assumption list failed: --filter-regex-flags requires --filter-regex to also be set\n',
    );
  });

  it('Slice 37 AC-flags-4 (asn): empty value refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_asn_flags4' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'foo'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-regex', 'foo', '--filter-regex-flags', ''],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'assumption list failed: --filter-regex-flags requires a non-empty value\n',
    );
  });

  it('Slice 37 AC-flags-5 (asn): invalid flag letter refuses with exit 1, naming the letter', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_asn_flags5' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'foo'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-regex', 'foo', '--filter-regex-flags', 'g'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      "assumption list failed: invalid flag letter: 'g' (allowed: i, m, s, u)\n",
    );
  });

  it('Slice 37 AC-flags-6 (asn): empty result includes both regex="..." AND regex-flags="..." in filterDims', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_asn_flags6' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['assumption', 'add', '--rec', recId, '--text', 'Rate limit handles bursts'], active.root);

    const r = await run(
      ['assumption', 'list', '--filter-regex', '^no-such-prefix', '--filter-regex-flags', 'i'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      'No assumptions matching regex="^no-such-prefix", regex-flags="i" recorded.\n',
    );
  });
```

### Step 2.10: Run all `assumption.test` tests, verify PASS

```bash
pnpm --filter @cadence/core test -- assumption.test
```

Expected: all `cadence assumption` tests pass. Test count for this file grew by **6** (1 happy-path + 5 from Step 2.9).

### Step 2.11: Do NOT commit yet

```bash
git status --porcelain | head
```

Expected: four files modified so far (rec.ts, rec.test.ts, asn.ts, asn.test.ts).

---

## Task 3: `--filter-regex-flags` on `decision list`

**Files:**
- Modify (source): `packages/core/src/cli/commands/decision.ts`
- Modify (append tests): `packages/core/tests/cli/decision.test.ts`

### Step 3.1: Write the failing happy-path case-insensitive test

Append inside the existing `describe('cadence decision', ...)` block at the bottom of `packages/core/tests/cli/decision.test.ts`, just before the closing `});`.

`addRecommendation` is already imported at the top of `packages/core/tests/cli/decision.test.ts` from `../../src/intelligence/store.js`. The `decision add` command takes `--title`, `--rationale`, and `--rec`. Use the same canonical minimal seed shape.

```typescript
  it('Slice 37 AC-flags-1 (dec): --filter-regex-flags "i" makes --filter-regex case-insensitive', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_dec_flags1' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'Cycle planning', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--rec', recId, '--title', 'cycle review', '--rationale', 'r'], active.root);
    await run(['decision', 'add', '--rec', recId, '--title', 'Other', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-regex', '^cycle', '--filter-regex-flags', 'i', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(2);
    const titles = arr.map((d: { title: string }) => d.title).sort();
    expect(titles).toEqual(['Cycle planning', 'cycle review']);
  });
```

### Step 3.2: Run the build + test, verify FAIL

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- decision.test
```

Expected: this new test fails.

### Step 3.3: Add the module-scope `ALLOWED_REGEX_FLAGS` constant and `parseRegexFlags` helper

Open `packages/core/src/cli/commands/decision.ts`. Insert the same helper as Tasks 1.3 / 2.3 at module scope, alongside the existing `parseSortBy` / `DEC_SORT_KEYS` helpers:

```typescript
const ALLOWED_REGEX_FLAGS = new Set(['i', 'm', 's', 'u']);

function parseRegexFlags(raw: string): { flags: string } | { error: string } {
  if (raw.length === 0) return { error: '--filter-regex-flags requires a non-empty value' };
  const seen = new Set<string>();
  for (const ch of raw) {
    if (!ALLOWED_REGEX_FLAGS.has(ch)) {
      return { error: `invalid flag letter: '${ch}' (allowed: i, m, s, u)` };
    }
    if (seen.has(ch)) {
      return { error: `duplicate flag letter: '${ch}'` };
    }
    seen.add(ch);
  }
  return { flags: raw };
}
```

### Step 3.4: Add the `--filter-regex-flags` option declaration

Find the `decision list` subcommand registration in `packages/core/src/cli/commands/decision.ts`. The current `.option(...)` sequence (currently lines 189–199) reads:

```typescript
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .option('--filter-status <status>', 'Filter to only entries with this status')
    .option('--filter-rec <recId>', 'Filter to only entries tied to this recommendation')
    .option('--include-untied', 'When combined with --filter-rec, also include decisions with no recommendationId')
    .option('--filter-text <substr>', 'Case-insensitive substring search on title or rationale. Mutually exclusive with --filter-text-exact and --filter-regex.')
    .option('--filter-text-exact <str>', 'Case-insensitive whole-field equality match on title or rationale. Mutually exclusive with --filter-text and --filter-regex.')
    .option('--filter-regex <pattern>', 'Power-user regex filter on title or rationale (always case-sensitive; use character classes like [Cc]ycle for case-insensitive). Mutually exclusive with --filter-text and --filter-text-exact.')
    .option('--sort-by <key>', 'Sort by a single key, optionally with :desc suffix. Allowed keys: decided, status, title, rec.')
    .option('--reverse', 'Reverse the entry order (after filters, before offset/limit)')
    .option('--offset <n>', 'Skip the first N entries (after filters)')
    .option('--limit <n>', 'Cap output to first N entries (after filters)')
```

Insert a new `.option(...)` line for `--filter-regex-flags` immediately after the existing `--filter-regex` line and before `--sort-by`. Insert exactly:

```typescript
    .option('--filter-regex-flags <flags>', 'RegExp flag letters to apply to --filter-regex. Allowed: i (case-insensitive), m (multiline ^/$), s (dotAll .), u (unicode). Requires --filter-regex.')
```

Then update the `.action(async (opts: {...}) => {` callback's `opts` typing (currently line 200). The current typing reads:

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterRec?: string; includeUntied?: boolean; filterText?: string; filterTextExact?: string; filterRegex?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

Replace with the same typing plus `filterRegexFlags?: string`, inserted in source order (after `filterRegex` and before `sortBy`):

```typescript
    .action(async (opts: { format?: string; filterStatus?: string; filterRec?: string; includeUntied?: boolean; filterText?: string; filterTextExact?: string; filterRegex?: string; filterRegexFlags?: string; sortBy?: string; reverse?: boolean; offset?: string; limit?: string }) => {
```

### Step 3.5: Insert orphan-check + parse block immediately before the `--filter-regex` apply

Locate the existing `--filter-regex` apply block (currently lines 268–280):

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

Insert this block of orphan-check + parse **immediately before** the existing `--filter-regex` apply block (i.e., after the closing brace of the `--filter-text` apply at line 267 and before `if (opts.filterRegex !== undefined) {` at line 268):

```typescript
        if (opts.filterRegexFlags !== undefined && opts.filterRegex === undefined) {
          process.stderr.write(
            `decision list failed: --filter-regex-flags requires --filter-regex to also be set\n`,
          );
          process.exitCode = 1;
          return;
        }
        let regexFlags: string | undefined;
        if (opts.filterRegexFlags !== undefined) {
          const parsed = parseRegexFlags(opts.filterRegexFlags);
          if ('error' in parsed) {
            process.stderr.write(`decision list failed: ${parsed.error}\n`);
            process.exitCode = 1;
            return;
          }
          regexFlags = parsed.flags;
        }
```

### Step 3.6: Change the existing `new RegExp(...)` call to pass `regexFlags`

Inside the same `--filter-regex` apply block, replace the existing `regex = new RegExp(opts.filterRegex);` line with:

```typescript
            regex = new RegExp(opts.filterRegex, regexFlags);
```

### Step 3.7: Insert the filterDims push immediately after the existing `regex=` push

Locate the existing empty-result filterDims block (currently lines 340–347):

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

Insert a new push line **immediately after** the `regex=` line and before the `offset=` line:

```typescript
          const filterDims: string[] = [];
          if (opts.filterStatus) filterDims.push(`status=${opts.filterStatus}`);
          if (opts.filterRec) filterDims.push(`rec=${opts.filterRec}`);
          if (opts.filterRec && opts.includeUntied) filterDims.push('untied=incl');
          if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
          if (opts.filterTextExact !== undefined) filterDims.push(`text-exact="${opts.filterTextExact}"`);
          if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
          if (opts.filterRegexFlags !== undefined) filterDims.push(`regex-flags="${opts.filterRegexFlags}"`);
          if (opts.offset !== undefined) filterDims.push(`offset=${opts.offset}`);
```

### Step 3.8: Run the build + test, verify the happy-path test now PASSES

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- decision.test
```

Expected: all `cadence decision` tests pass.

### Step 3.9: Append the remaining 5 tests for `decision list`

Append each `it(...)` block inside the same `describe('cadence decision', ...)`. Five shared ACs (2 through 6) — no duplicate-letter test (per spec). AC-flags-2 uses the ledger-edit pattern to inject a real newline into the decision's `rationale` field (proving the multi-field scope catches the match via rationale; the existing regex apply tests `title` OR `rationale`).

```typescript
  it('Slice 37 AC-flags-2 (dec): --filter-regex-flags "is" applies both case-insensitive AND dotAll', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_dec_flags2' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'Multi', '--rationale', 'placeholder'], active.root);
    const ledgerPath = join(active.root, '.cadence/intelligence/decisions.json');
    const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    ledger.decisions[0].rationale = 'foo\nBAR';
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(ledgerPath, JSON.stringify(ledger, null, 2));

    const r = await run(
      ['decision', 'list', '--filter-regex', 'foo.bar', '--filter-regex-flags', 'is', '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const arr = JSON.parse(r.stdout);
    expect(arr).toHaveLength(1);
    expect(arr[0].title).toBe('Multi');
  });

  it('Slice 37 AC-flags-3 (dec): orphan use without --filter-regex refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_dec_flags3' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-regex-flags', 'i'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'decision list failed: --filter-regex-flags requires --filter-regex to also be set\n',
    );
  });

  it('Slice 37 AC-flags-4 (dec): empty value refuses with exit 1', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_dec_flags4' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-regex', 'foo', '--filter-regex-flags', ''],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'decision list failed: --filter-regex-flags requires a non-empty value\n',
    );
  });

  it('Slice 37 AC-flags-5 (dec): invalid flag letter refuses with exit 1, naming the letter', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_dec_flags5' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'A', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-regex', 'foo', '--filter-regex-flags', 'g'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      "decision list failed: invalid flag letter: 'g' (allowed: i, m, s, u)\n",
    );
  });

  it('Slice 37 AC-flags-6 (dec): empty result includes both regex="..." AND regex-flags="..." in filterDims', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice37_dec_flags6' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const recId = rec.id;
    await run(['decision', 'add', '--rec', recId, '--title', 'Cycle planning', '--rationale', 'r'], active.root);

    const r = await run(
      ['decision', 'list', '--filter-regex', '^no-such-prefix', '--filter-regex-flags', 'i'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      'No decisions matching regex="^no-such-prefix", regex-flags="i" recorded.\n',
    );
  });
```

### Step 3.10: Run all `decision.test` tests, verify PASS

```bash
pnpm --filter @cadence/core test -- decision.test
```

Expected: all `cadence decision` tests pass. Test count for this file grew by **6** (1 happy-path + 5 from Step 3.9).

### Step 3.11: Do NOT commit yet

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

Common failure modes:
- `lint`: probable cause is a missing trailing comma in the inserted option string or in a new error-message template. Prettier-style fixes handle it.
- `typecheck`: probable cause is the `filterRegexFlags?: string` field placed in the wrong order in the `.action((opts: {...}) =>)` typing. Convention is source order: regex → regex-flags → next. If the typing fails because of `regexFlags` being passed to `new RegExp` where commander returns `string | undefined`: verify `exactOptionalPropertyTypes` is satisfied — `let regexFlags: string | undefined;` declared explicitly is correct.
- `test`: a `regex-flags="..."` string in the empty-filterDims message that doesn't match exactly (quote placement). Re-read the expected stderr/stdout in the failing tests carefully.
- If `recommendation list failed: invalid flag letter: 'g' (allowed: i, m, s, u)` test assertion fails: confirm the test uses double-quote string literal (`"..."`) wrapping the single-quoted letter to avoid escaping mistakes.

### Step 4.2: Verify no `Co-Authored-By` was inserted into any work-in-progress source code

```bash
git diff | grep -c Co-Authored-By
```

Expected: `0`. (This is a pre-commit defensive check, not strictly necessary — commit bodies are the load-bearing surface, not source — but cheap insurance.)

### Step 4.3: Sanity-check the diff

```bash
git status --porcelain
git diff --stat
```

Expected: exactly six files affected:
- `packages/core/src/cli/commands/recommendation.ts` (~17 line additions: 14-line parseRegexFlags helper at module scope, 1-line option row, 1-line action typing change, ~15-line orphan+parse block, 1-line RegExp call change, 1-line filterDims push — net ~17 because the RegExp change is a modify not an add)
- `packages/core/src/cli/commands/assumption.ts` (~17 line additions, same shape)
- `packages/core/src/cli/commands/decision.ts` (~17 line additions, same shape)
- `packages/core/tests/cli/recommendation.test.ts` (~110 line additions for 7 new tests)
- `packages/core/tests/cli/assumption.test.ts` (~125 line additions for 6 new tests — slightly larger per-test due to the `addRecommendation` seed boilerplate)
- `packages/core/tests/cli/decision.test.ts` (~125 line additions for 6 new tests)

No other files (no `@cadence/types` change, no docs change yet, no schema, no render). If anything else shows up, STOP and report.

### Step 4.4: Commit the bundled feat

```bash
git add \
  packages/core/src/cli/commands/recommendation.ts \
  packages/core/src/cli/commands/assumption.ts \
  packages/core/src/cli/commands/decision.ts \
  packages/core/tests/cli/recommendation.test.ts \
  packages/core/tests/cli/assumption.test.ts \
  packages/core/tests/cli/decision.test.ts
git commit -m "$(cat <<'EOF'
feat(core): --filter-regex-flags on recommendation/assumption/decision list (Slice 37)

Add `--filter-regex-flags <flags>` companion flag to all three list
commands. Accepts a string of JS RegExp flag letters from the curated
allowlist `{i, m, s, u}`:

  i  case-insensitive
  m  multiline (^/$ match per-line)
  s  dotAll (. matches newline)
  u  unicode

The flag's value is passed verbatim as the second argument to
`new RegExp(pattern, flags)`, mirroring JS RegExp's native second-argument
format. `g` and `y` are rejected (stateful, break repeated `.test()`);
`d` and `v` are rejected (irrelevant for boolean filtering, YAGNI).

Companion to --filter-regex: orphan use refuses with
`--filter-regex-flags requires --filter-regex to also be set`. Does NOT
participate in the three-way text-mode mutex (text / text-exact / regex)
— it's a parameter to --filter-regex, not a fourth filter mode.

Strict validation: empty refuses, duplicate letters refuse, invalid
letters refuse. Each error names the specific letter so operators can
self-correct.

Apply change is one line in each command's existing --filter-regex block:
`new RegExp(opts.filterRegex)` -> `new RegExp(opts.filterRegex, regexFlags)`.
`new RegExp(pattern, undefined)` is equivalent to `new RegExp(pattern)`,
so behavior is unchanged when --filter-regex-flags is absent.

Empty-result filterDims gains a `regex-flags="..."` push immediately
after the existing `regex="..."` push, keeping the regex-and-flags pair
contiguous.

No shared regex-flags.ts helper across the three commands (~14 LoC per
command x 3 stays inline per the design's anti-scope — same call as
Slice 35's no-shared-sort.ts and Slice 36's no-filter-exact.ts).

19 new tests (7 + 6 + 6) covering all ACs. The duplicate-letter parse
test lives only in recommendation.test.ts to avoid 3x redundancy on the
module-local helper.

Design source: docs/superpowers/specs/2026-05-27-cadence-list-filter-regex-flags-design.md
EOF
)"
```

### Step 4.5: Verify the commit body contains zero `Co-Authored-By` instances

```bash
git log -1 --format=%B | grep -c Co-Authored-By
```

Expected: `0`. If non-zero, the commit MUST be amended to remove the trailer before pushing:

```bash
git commit --amend
# (Editor opens — remove the Co-Authored-By line, save, exit)
git log -1 --format=%B | grep -c Co-Authored-By
# Expected: 0
```

### Step 4.6: Confirm the commit landed

```bash
git log -1 --oneline
git status --porcelain
```

Expected: top of log shows `<sha> feat(core): --filter-regex-flags on recommendation/assumption/decision list (Slice 37)`. Working tree clean.

---

## Task 5: Documentation update + Slice 33 follow-on reconciliation

**Files:**
- Modify: `docs/reference/commands.md`
- Modify (one-line strike): `docs/superpowers/specs/2026-05-25-cadence-list-filter-regex-design.md`

### Step 5.1: Inspect the existing list-command option blocks

```bash
grep -nE "filter-regex\b|filter-regex-flags|filter-text-exact" docs/reference/commands.md | head -20
```

Expected: nine matches as of post-Slice-36 (three `filter-text-exact` rows + three `filter-regex` rows + three rows where `filter-regex` shows up in mutex clauses on other rows). The three `--filter-regex <pattern>` rows currently live at approximately lines 617 (rec), 892 (asn), 937 (dec).

For each list subcommand, the relevant rows currently look like:

```
| `--filter-regex <pattern>` | Power-user regex filter on <scope> (always case-sensitive; use character classes like `[Cc]ycle` for case-insensitive). Mutually exclusive with `--filter-text` and `--filter-text-exact`. |
```

(Substituting "title or summary" for rec, "`text`" for asn, "title or rationale" for dec.)

### Step 5.2: Update each of the three list option tables

For each of the three `list` subcommand option tables, do TWO things:

1. Update the existing `--filter-regex` row to mention `--filter-regex-flags` as the way to add case-insensitivity, multiline, or dotAll.
2. Insert a new `--filter-regex-flags` row **immediately after** the existing `--filter-regex` row.

For `recommendation list`:

```markdown
| `--filter-regex <pattern>` | Power-user regex filter on title or summary (always case-sensitive by default; use `--filter-regex-flags` for case-insensitive / multiline / dotAll, or character classes like `[Cc]ycle` for one-off case-insensitivity). Mutually exclusive with `--filter-text` and `--filter-text-exact`. |
| `--filter-regex-flags <flags>` | RegExp flag letters to apply to `--filter-regex`. Allowed: `i` (case-insensitive), `m` (multiline `^/$`), `s` (dotAll `.`), `u` (unicode). Letter-string grammar mirrors JS RegExp's native second argument (`'is'` applies both). Requires `--filter-regex` to also be set (orphan use returns exit 1). Empty value, duplicate letters, and invalid letters all return exit 1 with the specific letter named. (Slice 37) |
```

For `assumption list`:

```markdown
| `--filter-regex <pattern>` | Power-user regex filter on `text` (always case-sensitive by default; use `--filter-regex-flags` for case-insensitive / multiline / dotAll, or character classes like `[Cc]ycle` for one-off case-insensitivity). Mutually exclusive with `--filter-text` and `--filter-text-exact`. |
| `--filter-regex-flags <flags>` | RegExp flag letters to apply to `--filter-regex`. Allowed: `i` (case-insensitive), `m` (multiline `^/$`), `s` (dotAll `.`), `u` (unicode). Letter-string grammar mirrors JS RegExp's native second argument (`'is'` applies both). Requires `--filter-regex` to also be set (orphan use returns exit 1). Empty value, duplicate letters, and invalid letters all return exit 1 with the specific letter named. (Slice 37) |
```

For `decision list`:

```markdown
| `--filter-regex <pattern>` | Power-user regex filter on title or rationale (always case-sensitive by default; use `--filter-regex-flags` for case-insensitive / multiline / dotAll, or character classes like `[Cc]ycle` for one-off case-insensitivity). Mutually exclusive with `--filter-text` and `--filter-text-exact`. |
| `--filter-regex-flags <flags>` | RegExp flag letters to apply to `--filter-regex`. Allowed: `i` (case-insensitive), `m` (multiline `^/$`), `s` (dotAll `.`), `u` (unicode). Letter-string grammar mirrors JS RegExp's native second argument (`'is'` applies both). Requires `--filter-regex` to also be set (orphan use returns exit 1). Empty value, duplicate letters, and invalid letters all return exit 1 with the specific letter named. (Slice 37) |
```

If the actual current `--filter-regex` row differs slightly from the snippets above (e.g., slightly different phrasing), preserve the existing description structure and only:
- Replace the "always case-sensitive; use character classes like `[Cc]ycle` for case-insensitive" clause with the updated wording mentioning `--filter-regex-flags`.
- Add the new `--filter-regex-flags` row right after.

### Step 5.3: Sanity-check the new rows landed and the `--filter-regex` rows were updated

```bash
grep -n "filter-regex-flags" docs/reference/commands.md
grep -cn "use \`--filter-regex-flags\` for case-insensitive" docs/reference/commands.md
```

Expected:
- First grep: at least 3 matches (one new `--filter-regex-flags` row per list subcommand).
- Second grep: exactly 3 (all three `--filter-regex` rows now point to the new flag).

### Step 5.4: Reconcile Slice 33 § Follow-On entry

Open `docs/superpowers/specs/2026-05-25-cadence-list-filter-regex-design.md`. The § Follow-On section's `--filter-regex-flags <flags>` bullet is currently at line 202:

```
- **`--filter-regex-flags <flags>`** (case-insensitive, multiline, dotall): channel for the standard JS regex flag set. If operators frequently want `--filter-regex 'foo' --filter-regex-flags i` instead of `[Ff]oo`, ship it. Cheap.
```

Strike it (Markdown `~~strikethrough~~`) and add a reference to Slice 37 so the historical spec accurately records that the follow-on has shipped:

```
- ~~**`--filter-regex-flags <flags>`** (case-insensitive, multiline, dotall): channel for the standard JS regex flag set. If operators frequently want `--filter-regex 'foo' --filter-regex-flags i` instead of `[Ff]oo`, ship it. Cheap.~~ **Shipped Slice 37** (2026-05-28): see `docs/superpowers/specs/2026-05-27-cadence-list-filter-regex-flags-design.md`.
```

This is the in-place reconciliation pattern called for by the Slice 37 spec § Scope ("strike `--filter-regex-flags` entry from Slice-33 § Follow-On") and § Follow-On ("strike with reference to Slice 37"). It differs from Slice 36's approach of leaving the historical spec untouched — Slice 37 spec explicitly requests the strike-with-reference.

Do NOT modify lines 17, 42, 192, 195 in that spec (those reference `--filter-regex-flags` in the Summary / Anti-Scope / Decisions sections describing Slice 33's own boundary at the time and remain historically accurate).

### Step 5.5: Verify the strike landed correctly

```bash
grep -n "filter-regex-flags" docs/superpowers/specs/2026-05-25-cadence-list-filter-regex-design.md
```

Expected: the existing four matches (lines 17, 42, 192, 195) PLUS the now-struck line 202 and the appended "Shipped Slice 37" reference on the same line. Total: 5 lines now contain `filter-regex-flags`.

### Step 5.6: Run the full turbo gate one more time

```bash
pnpm turbo run lint typecheck test build
```

Expected: **16/16 green**. The docs changes should not affect tests; the CLI-reference drift guard (if any) compares documented flags to command help output — running the gate confirms.

### Step 5.7: Commit the docs

```bash
git add docs/reference/commands.md docs/superpowers/specs/2026-05-25-cadence-list-filter-regex-design.md
git commit -m "$(cat <<'EOF'
docs: document --filter-regex-flags + reconcile Slice-33 follow-ref (Slice 37)

Reference docs for --filter-regex-flags on all three list commands. Each
entry names the curated allowlist (i / m / s / u), letter-string grammar,
orphan-refuse rule, and the strict validation behavior (empty / duplicate
/ invalid letters all refuse with the specific letter named).

Existing --filter-regex rows updated to point at --filter-regex-flags
as the way to opt into case-insensitive / multiline / dotAll, replacing
the older "use character classes like [Cc]ycle" workaround note.

Slice-33 § Follow-On `--filter-regex-flags` bullet (line 202) struck
in-place with a reference to Slice 37's design spec, per Slice 37's
"strike with reference" reconciliation directive. Historical Summary /
Anti-Scope / Decisions references in that spec are unchanged (those
accurately record Slice 33's boundary at the time).
EOF
)"
```

### Step 5.8: Verify the docs commit body contains zero `Co-Authored-By` instances

```bash
git log -1 --format=%B | grep -c Co-Authored-By
```

Expected: `0`. If non-zero, amend to remove before pushing.

### Step 5.9: Confirm the commit landed

```bash
git log -1 --oneline
git status --porcelain
```

Expected: top of log shows `<sha> docs: document --filter-regex-flags + reconcile Slice-33 follow-ref (Slice 37)`. Working tree clean.

---

## Task 6: Final verification + push

### Step 6.1: Run the full turbo gate one more time

```bash
pnpm turbo run lint typecheck test build
```

Expected: **16/16 green**.

### Step 6.2: Confirm the Praxis commit shape (design + plan + feat + docs)

```bash
git log --oneline -5
```

Expected (most recent first):

```
<sha-docs>  docs: document --filter-regex-flags + reconcile Slice-33 follow-ref (Slice 37)
<sha-feat>  feat(core): --filter-regex-flags on recommendation/assumption/decision list (Slice 37)
<sha-plan>  docs: Slice 37 implementation plan (--filter-regex-flags on list commands)
8919544     chore: session handoff — Slice 37 design approved; plan + execution next
2cffb82     docs: design — --filter-regex-flags on list commands (Praxis Slice 37)
```

The plan commit (Task 0) and the design commit (`2cffb82`) bracket the chore-handoff commit (`8919544`) that the prior `/resume` session committed; this is fine — Praxis convention only requires that design AND plan be committed before execution starts, which is satisfied. (The chore-handoff in the middle is a process artifact, not a Praxis-shape violation.)

### Step 6.3: Verify @cadence/core test count grew by 19

```bash
pnpm --filter @cadence/core test 2>&1 | grep -E "Tests.*passed" | tail -1
```

Expected: total passed = 1113 (post-Slice-36 baseline) + 19 (Slice 37) = **1132**.

### Step 6.4: Verify NONE of the four Slice 37 commits carry Co-Authored-By

```bash
git log --format=%B 2cffb82..HEAD | grep -c Co-Authored-By
```

Expected: `0`. (Range scans the design commit's children: plan, feat, docs — the three Slice 37 commits we authored this session.)

If non-zero, identify which commit(s) carry the trailer and amend before pushing. Use:

```bash
for sha in $(git log --format=%H 2cffb82..HEAD); do
  count=$(git show -s --format=%B "$sha" | grep -c Co-Authored-By)
  echo "$sha: $count Co-Authored-By"
done
```

### Step 6.5: Push and confirm CI green

```bash
git push origin main
gh run list --branch main --limit 1
```

Pre-push hook runs the full local gate (`pnpm turbo run lint typecheck test build`); if it fails, fix and retry (do **not** `--no-verify`). After push, CI runs on the self-hosted `cadence-dev` runner (systemd service on the Linux dev box — verify via `sudo /home/thomas/actions-runner/svc.sh status` if locally accessible; otherwise `gh api repos/manehorizons/cadence/actions/runners --jq '.runners[]'`).

```bash
# Poll if needed:
gh run watch
```

Expected: CI run completes green on the self-hosted runner.

### Step 6.6: Sanity-check the runner is still running

```bash
gh api repos/manehorizons/cadence/actions/runners --jq '.runners[] | {name, status, busy}'
```

Expected: the `cadence-dev` runner is `online` and was momentarily `busy: true` during the CI run.

---

## Spec coverage check (self-review)

| Design requirement | Covered by |
|---|---|
| `--filter-regex-flags <flags>` added to `recommendation list` | Task 1.4 option, 1.5 orphan+parse, 1.6 apply change, 1.7 filterDims |
| `--filter-regex-flags <flags>` added to `assumption list` | Task 2.4 option, 2.5 orphan+parse, 2.6 apply change, 2.7 filterDims |
| `--filter-regex-flags <flags>` added to `decision list` | Task 3.4 option, 3.5 orphan+parse, 3.6 apply change, 3.7 filterDims |
| Curated allowlist `{i, m, s, u}` | `ALLOWED_REGEX_FLAGS = new Set(['i', 'm', 's', 'u'])` in Task 1.3 / 2.3 / 3.3 |
| Letter-string grammar mirroring JS RegExp native second arg | `parseRegexFlags` returns the raw string verbatim as `flags`; `new RegExp(pattern, flags)` in Task 1.6 / 2.6 / 3.6 |
| Orphan use refuses with clear error naming the requirement | Task 1.5 / 2.5 / 3.5 orphan-check; verified by AC-flags-3 in each suite |
| Empty value refuses with clear error | `parseRegexFlags` empty check; verified by AC-flags-4 |
| Invalid letter refuses with the specific letter named | `parseRegexFlags` invalid-letter check; verified by AC-flags-5 |
| Duplicate letter refuses with the specific letter named | `parseRegexFlags` duplicate check; verified by AC-flags-rec-1 (rec-only) |
| No participation in three-way text-mode mutex | NO new mutex check inserted in any command — only orphan-check + parse |
| Apply change is one line | `regex = new RegExp(opts.filterRegex, regexFlags);` in Task 1.6 / 2.6 / 3.6 |
| Existing RegExp SyntaxError catch still guards pattern errors | The `try { ... } catch (err) { ... }` block is unchanged; only the inner `new RegExp` call gets the second argument |
| `regex-flags="<value>"` filterDims display, only when flag set | Task 1.7 / 2.7 / 3.7 push uses `if (opts.filterRegexFlags !== undefined)` predicate |
| FilterDims order: regex → regex-flags → next dim | Position of the new push in each command immediately after the existing `regex=` push |
| `new RegExp(pattern, undefined) ≡ new RegExp(pattern)` (absence is transparent) | `let regexFlags: string \| undefined;` defaults to undefined when flag absent; behavior verified by existing Slice 33 tests continuing to pass |
| No shared `regex-flags.ts` helper | No new files; each command has its own ~14 LoC inline `parseRegexFlags` + `ALLOWED_REGEX_FLAGS` constant |
| Module-local `parseRegexFlags(raw): { flags: string } \| { error: string }` | Task 1.3 / 2.3 / 3.3 inserts identical helper at module scope alongside `parseSortBy` |
| No `intelligence audit` change | `intelligence.ts` not in modified files |
| No `milestone list` change | `milestone.ts` not in modified files |
| No `@cadence/types` schema change | `packages/types/` not in modified files |
| No store / render layer change | `intelligence/store.ts` and render files not in modified files |
| Slice-33 § Follow-On `--filter-regex-flags` entry reconciled (strike with reference to Slice 37) | Task 5.4 in-place strike + reference |
| Existing `--filter-regex` description in `commands.md` updated to point at new flag | Task 5.2 description rewrite (replaces the "use character classes" workaround note) |
| Praxis four-commit convention (design + plan + feat + docs) | Design at `2cffb82`; plan committed in Task 0; Task 4 = feat; Task 5 = docs |
| ~17 LoC source per command | Task 4.3 expected diff stat |
| 19 new tests (7 + 6 + 6) | Task 6.3 expected count delta 1113 → 1132 |
| Duplicate-letter test only in `recommendation.test.ts` | Task 1.9 includes AC-flags-rec-1; Tasks 2.9 / 3.9 do not |
| Multi-flag combo verification via dotAll-only content | AC-flags-2 in each suite uses ledger-edit to inject `'foo\nBAR'` then matches `/foo.bar/is` — requires both `i` (BAR vs bar) and `s` (`.` matches `\n`) |
| AC-flags-6 empty-result includes BOTH `regex="..."` and `regex-flags="..."` | Tests assert exact stdout including both filterDims tokens |
| No `Co-Authored-By` trailer on any of the four Slice 37 commits | Task 4.2 / 4.5 / 5.8 / 6.4 verifications; remediation step provided if violation found |
| Behavior matrix row "regex + flags + text" hits existing text-vs-regex mutex | No new test — existing mutex test in Slice 36 already covers this; `--filter-regex-flags` doesn't add to mutex matrix, so combining it with another text-mode flag fires the existing pairwise mutex on the underlying `--filter-regex` |

**Gaps found:** none. Every requirement in the spec maps to a task or step.
