# CADENCE `--filter-text-exact` on list commands — Design

**Date:** 2026-05-27
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 36 (Slice-33 follow-on; case-insensitive whole-field equality variant of `--filter-text`)
**Predecessor slice docs:**
- [`2026-05-25-cadence-list-filter-regex-design.md`](2026-05-25-cadence-list-filter-regex-design.md) (Slice 33 — § Follow-On listed `--filter-text-exact` "cheap if asked; today: `--filter-regex '^Foo$'` covers it")
- [`2026-05-20-cadence-list-filter-text-design.md`](2026-05-20-cadence-list-filter-text-design.md) (Slice 25 — introduced `--filter-text` case-insensitive substring; same scope and per-subject field set Slice 36 reuses)
- [`2026-05-27-cadence-list-sort-by-design.md`](2026-05-27-cadence-list-sort-by-design.md) (Slice 35 — sibling per-command-stanza precedent; no shared helper, ~10 LoC duplicated per command)

## Summary

**Slice 36** adds a `--filter-text-exact <str>` flag to the three list commands (`recommendation list`, `assumption list`, `decision list`). The literal is compared with case-insensitive **whole-field equality** against the same per-subject text scope `--filter-text` searches (rec → title + summary; asn → text; dec → title + rationale). Adds a third discrete text-mode filter alongside `--filter-text` (case-insensitive substring) and `--filter-regex` (case-sensitive regex). All three are pairwise mutually exclusive.

- **One new flag** on all three list commands.
- **Whole-field equality**, case-insensitive. `--filter-text-exact 'Adopt token bucket'` matches a rec whose title is exactly `Adopt token bucket` (any case); does NOT match `Adopt token bucket strategy`.
- **Multi-field scope matches `--filter-text` per subject** — ANY scoped field equal to the literal matches.
- **All three text-mode filters pairwise mutex.** Combinations refuse: `cannot combine --filter-text-exact with --filter-text` / `cannot combine --filter-text-exact with --filter-regex`. Existing `--filter-text` vs `--filter-regex` check is unchanged.
- **Single value.** Repeated flag uses commander last-wins (no array semantics). Operators wanting "title is one of {A, B}" use `--filter-regex '^(A|B)$'`.
- **Empty literal refuses.** `--filter-text-exact ''` → exit 1 + stderr `<cmd> list failed: --filter-text-exact requires a non-empty value`. Matches Slice 35's `--sort-by` empty-rejection precedent.
- **No trim.** Whitespace in the literal is significant — `--filter-text-exact ' foo '` searches for the seven-character literal `' foo '`.
- **Apply order**: same pipeline stage as `--filter-text` / `--filter-regex` (after `--filter-status`, before subject-specific filters and `--sort-by`).
- **Empty-result dim**: `text-exact="<value>"` (parallel to `text="..."` and `regex="..."`).

## Product Boundary

Read only. No writes. No schema change. No store-layer or render-layer change.

## Scope

### In scope

- `packages/core/src/cli/commands/recommendation.ts`: new `--filter-text-exact` option; pairwise mutual-exclusion checks (vs `--filter-text` and vs `--filter-regex`); empty-literal refuse; apply (title|summary equality); filterDims push.
- `packages/core/src/cli/commands/assumption.ts`: same shape; apply scope is `text` only.
- `packages/core/src/cli/commands/decision.ts`: same shape; apply scope is `title|rationale`.
- CLI spawn tests (one block per command).
- `docs/reference/commands.md`: add `--filter-text-exact` row to each of the three list option tables and update the mutex notes on the existing `--filter-text` and `--filter-regex` rows to mention the new flag.
- Predecessor reconciliation: strike `--filter-text-exact` entry from Slice-33 § Follow-On.

### Out of scope

- **Whole-word match** (`\bfoo\b`-style boundaries): rejected during brainstorm. Whole-field equality covers the requested intent; whole-word is `--filter-regex '\bfoo\b'` for power users.
- **Case-sensitive substring** (the third candidate "exact" reading): rejected during brainstorm. `--filter-regex 'foo'` already covers it.
- **Mode flag** (`--filter-text-mode <substring|exact>`): rejected. Context-dependent boolean; YAGNI for prefix/suffix modes.
- **Colon-suffix grammar** (`--filter-text 'foo:exact'`): rejected. Mixes literal value with mode flag; ambiguity when the literal contains `:exact`; semantics differ from Slice 35's enum-key `:desc` (which modifies an enum choice, not parse semantics of arbitrary text).
- **Multi-value semantics** (`--filter-text-exact a --filter-text-exact b` → OR): rejected. Single-value parity with all existing filters; `--filter-regex '^(a|b)$'` covers OR-of-equalities.
- **Per-field scope selection** (`--filter-text-exact-in title`): out of scope. Same multi-field scope as `--filter-text`; anchor regex (`--filter-regex '^My title$'`) covers title-only equality.
- **Shared `filter-exact.ts` helper across the three commands**: anti-scope (see Architecture).
- **Symmetric flag on `intelligence audit`**: out of scope (that command has no `--filter-text` either).
- **Symmetric flag on `milestone list`**: out of scope (no list pipeline today, per Slice 35).
- **Schema, store, render layers, loop transitions, `state.json`/`STATE.md`:** untouched.

## Architecture

### MODIFIED files

- `packages/core/src/cli/commands/recommendation.ts` — new option, pairwise mutex check, empty-literal refuse, equality match, filterDims push.
- `packages/core/src/cli/commands/assumption.ts` — same shape.
- `packages/core/src/cli/commands/decision.ts` — same shape.
- `packages/core/tests/cli/recommendation.test.ts` — new tests per AC table.
- `packages/core/tests/cli/assumption.test.ts` — same.
- `packages/core/tests/cli/decision.test.ts` — same.
- `docs/reference/commands.md` — add `--filter-text-exact` row to each of the three list tables; update mutex notes on `--filter-text` and `--filter-regex` rows.

### Untouched

- All store helpers / readers.
- `@cadence/types` — no schema change.
- Render layer (terminal + JSON formatters).
- Other CLI commands (`show`, `add`, transitions, `intelligence` subcommands, `cadence spec/draft new`).
- Loop transitions / `state.json` / `STATE.md`.
- CLI-reference drift guard.

### No shared `filter-exact.ts` helper across the three commands

Anti-scope. Each command's exact-filter block is ~10 LoC (validation + filter + filterDims push). ~30 LoC of duplication is cheaper than a shim file at the three-command surface — same precedent as Slice 35's no-shared-`sort.ts` decision and Slice 34.3's no-`from-rec.ts` decision. Factor when a fourth command needs equality filtering.

## Implementation Pattern

### CLI option (illustrative; same shape applied to each of the three commands)

```ts
.option(
  '--filter-text-exact <str>',
  'Case-insensitive whole-field equality match on <fields>. Mutually exclusive with --filter-text and --filter-regex.',
)
```

`<fields>` per command:
- recommendation: `title or summary`
- assumption: `text`
- decision: `title or rationale`

### Validation (pairwise mutex + empty refuse, BEFORE the existing checks)

```ts
// Inside the action handler, BEFORE the existing --filter-text vs --filter-regex check:
if (opts.filterTextExact !== undefined && opts.filterTextExact === '') {
  process.stderr.write(
    `<cmd> list failed: --filter-text-exact requires a non-empty value\n`,
  );
  process.exitCode = 1;
  return;
}
if (opts.filterTextExact !== undefined && opts.filterText !== undefined) {
  process.stderr.write(
    `<cmd> list failed: cannot combine --filter-text-exact with --filter-text\n`,
  );
  process.exitCode = 1;
  return;
}
if (opts.filterTextExact !== undefined && opts.filterRegex !== undefined) {
  process.stderr.write(
    `<cmd> list failed: cannot combine --filter-text-exact with --filter-regex\n`,
  );
  process.exitCode = 1;
  return;
}
// Existing --filter-text vs --filter-regex check unchanged below this block.
```

Check order matters: empty-refuse before mutex. If a user passes `--filter-text-exact '' --filter-text 'foo'`, they get the empty-value error (most specific), not the mutex error.

### Apply (per-subject text scope)

The match scope per subject mirrors `--filter-text`:

```ts
// recommendation.ts
if (opts.filterTextExact !== undefined) {
  const needle = opts.filterTextExact.toLowerCase();
  entries = entries.filter(
    (r) =>
      r.title.toLowerCase() === needle ||
      r.summary.toLowerCase() === needle,
  );
}

// assumption.ts
if (opts.filterTextExact !== undefined) {
  const needle = opts.filterTextExact.toLowerCase();
  entries = entries.filter((a) => a.text.toLowerCase() === needle);
}

// decision.ts
if (opts.filterTextExact !== undefined) {
  const needle = opts.filterTextExact.toLowerCase();
  entries = entries.filter(
    (d) =>
      d.title.toLowerCase() === needle ||
      d.rationale.toLowerCase() === needle,
  );
}
```

Pipeline placement: between the existing `--filter-text` / `--filter-regex` block and `--filter-converted-to` / `--filter-rec` block. Only one of the three text-mode filters runs per invocation (pairwise mutex enforced above).

### Empty-result filterDims

```ts
if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
if (opts.filterTextExact !== undefined) filterDims.push(`text-exact="${opts.filterTextExact}"`);
if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
```

Order: status → text → text-exact → regex → subject-specific (converted-to, rec). Keeps the three text-mode dims contiguous. Quotes match the existing `text="..."` / `regex="..."` style. Example empty-result line: `No decisions matching status=accepted, text-exact="Adopt token bucket" recorded.`

### Behavior matrix

| Flags | Result |
|---|---|
| (no flags) | all entries |
| `--filter-text Foo` | entries where any scoped field contains `Foo` (case-insensitive substring) |
| `--filter-text-exact Foo` | entries where any scoped field equals `Foo` (case-insensitive) |
| `--filter-text-exact 'Adopt Token Bucket'` matches title `'adopt token bucket'` | ✓ matches (case-insensitive equality) |
| `--filter-text-exact 'Adopt token bucket'` against title `'Adopt token bucket strategy'` | ✗ no match (equality, not substring) |
| `--filter-text-exact ' foo '` against title `'foo'` | ✗ no match (no trim) |
| `--filter-text-exact ''` | exit 1 + stderr `requires a non-empty value` |
| `--filter-text-exact Foo --filter-text Bar` | exit 1 + stderr `cannot combine --filter-text-exact with --filter-text` |
| `--filter-text-exact Foo --filter-regex Bar` | exit 1 + stderr `cannot combine --filter-text-exact with --filter-regex` |
| `--filter-text-exact A --filter-text-exact B` | `B` wins (commander last-value), no error |
| `--filter-text-exact Foo --sort-by created` | equality filter then sort (composes) |

## Acceptance Criteria

Per-command shared ACs (applied to each of the three commands):

| AC | Statement | Linked test |
|---|---|---|
| AC-exact-1 | `<cmd> list --filter-text-exact 'X'` returns only entries whose scoped field equals `X` exactly. Same casing as fixture matches. | CLI test |
| AC-exact-2 | Case-insensitive: `<cmd> list --filter-text-exact 'X'` matches a fixture with field `'x'` (different case). | CLI test |
| AC-exact-3 | Equality, not substring: `<cmd> list --filter-text-exact 'foo'` does NOT match a fixture with field `'foo bar'`. | CLI test |
| AC-exact-4 | Empty literal: `<cmd> list --filter-text-exact ''` → exit 1 + stderr `--filter-text-exact requires a non-empty value`. No stdout. | CLI test |
| AC-exact-5 | Mutex with `--filter-text`: combining both → exit 1 + stderr `cannot combine --filter-text-exact with --filter-text`. No stdout. | CLI test |
| AC-exact-6 | Mutex with `--filter-regex`: combining both → exit 1 + stderr `cannot combine --filter-text-exact with --filter-regex`. No stdout. | CLI test |
| AC-exact-7 | No trim: `<cmd> list --filter-text-exact ' foo '` (with surrounding spaces) does NOT match a fixture with field `'foo'`. | CLI test |
| AC-exact-8 | Empty result with `--filter-text-exact` set → message includes `text-exact="<value>"` in filterDims. | CLI test |
| AC-exact-9 | Composes with other filters and `--sort-by`: `--filter-text-exact 'X' --filter-status <S> --sort-by created` applies equality + status filter + sort. | CLI test |
| AC-exact-10 | `--format json --filter-text-exact 'X'` emits the JSON array of matched entries. | CLI test |

Per-subject multi-field ACs (recommendation + decision; assumption has single field):

| AC | Statement | Linked test |
|---|---|---|
| AC-exact-rec-1 | `recommendation list --filter-text-exact 'X'` matches when only the `summary` field (not `title`) equals `X`. Proves multi-field ANY-of scope. | CLI test |
| AC-exact-dec-1 | `decision list --filter-text-exact 'X'` matches when only the `rationale` field (not `title`) equals `X`. Proves multi-field ANY-of scope. | CLI test |

Guard ACs (apply once across the slice):

| AC | Statement | Linked test |
|---|---|---|
| AC-exact-doc-1 | `docs/reference/commands.md` documents `--filter-text-exact` under each of the three list subcommands. Mutex notes on existing `--filter-text` and `--filter-regex` rows updated to include the new flag. | docs review |
| AC-exact-doc-2 | CLI-reference drift guard UNCHANGED in behavior. | drift-guard test |
| AC-exact-store-1 | Store, render, schema, `intelligence audit`, and `milestone list` layers UNCHANGED. | grep / existing tests |
| AC-exact-gate-1 | Full turbo gate green (16/16). | done-bar |

## Testing

- **CLI spawn tests** (append to existing test file per command), referencing AC tokens:
  - `packages/core/tests/cli/recommendation.test.ts` — shared ACs 1–10 + AC-exact-rec-1 (11 tests).
  - `packages/core/tests/cli/assumption.test.ts` — shared ACs 1–10 (10 tests).
  - `packages/core/tests/cli/decision.test.ts` — shared ACs 1–10 + AC-exact-dec-1 (11 tests).
- Expected test count delta: **~32 new tests** across the three files. `@cadence/core` moves from 1081 → ~1113.
- **Existing tests** continue to pass unchanged (the `--filter-text-exact undefined` path is the identity transform).
- **Done-bar**: full `pnpm turbo run lint typecheck test build` green (16/16).

## Commit Convention

Following the Slice-35 precedent (design + plan + feat + docs):

```
docs: design — --filter-text-exact on list commands (Praxis Slice 36)
docs: Slice 36 implementation plan (--filter-text-exact on list commands)
feat(core): --filter-text-exact on recommendation/assumption/decision list (Slice 36)
docs: document --filter-text-exact + reconcile Slice-33 follow-ref (Slice 36)
```

Up to four commits. (The first is this design doc; the plan doc is its own commit per Praxis convention; feat and docs are the final two.) The HANDOFF.md deletion currently in worktree as `D HANDOFF.md` (residue from `/resume`) rides along with commit 1 — same pattern as `33cebb1` in the prior session.

## Success Criteria

1. All shared + per-subject + guard ACs pass.
2. Full turbo gate green (16/16).
3. Slice-33 `§ Follow-On` `--filter-text-exact` entry reconciled (strike with reference to Slice 36).
4. No `state.json` / `STATE.md` / loop transition / store / render / schema touched.
5. CLI-reference drift guard UNCHANGED. `docs/reference/commands.md` extended under each list subcommand; mutex notes on existing rows updated.
6. `intelligence audit`, `milestone list`, and all transition commands UNCHANGED.
7. `@cadence/core` test count moves from 1081 → ~1113 (≈ 32 new tests).
8. Branch HEAD pushes clean; CI on self-hosted runner green.

## Decision Log

1. **Whole-field equality, case-insensitive.** "Exact" admits three readings — whole-field equality, whole-word match, case-sensitive substring. Whole-field equality is the most common reading in CLI tooling and the one the brainstorm confirmed. Case-insensitivity preserves the existing `--filter-text` posture; users wanting case-sensitive equality fall back to `--filter-regex '^Foo$'`.
2. **Separate flag, not a colon-suffix grammar.** Slice 35 introduced `--sort-by <key>[:desc]` with a `:` suffix, which superficially suggests `--filter-text 'foo:exact'`. Rejected: `:desc` modifies an enum-valued *key choice* from a curated menu, while `:exact` would change *parse semantics* of arbitrary text — including text that might literally contain `:exact`. A separate flag has no escaping ambiguity and mirrors the existing `--filter-text` / `--filter-regex` discrete-mode pattern (also Slice 33's call against `--filter-text --regex`).
3. **All three text-mode filters pairwise mutex.** The existing `--filter-text` vs `--filter-regex` rule is symmetric; adding a third asymmetric rule (e.g., compose vs regex but mutex vs text) has no use case. AND-composing two text filters reduces to either empty result or the same as the stricter one — not useful in practice.
4. **Single value, no array semantics.** Commander default last-wins matches every other filter on these commands (`--filter-status`, `--filter-text`, `--filter-regex`, `--filter-rec`, `--filter-converted-to`). Operators wanting OR-of-equalities use `--filter-regex '^(A|B)$'` — covers the same surface without a per-flag exception.
5. **Multi-field ANY-of scope matches `--filter-text`.** Symmetric with the existing flag's scope. For `recommendation` and `decision`, equality against `summary` / `rationale` is uncommonly useful in practice (long-form prose), but symmetry is cheaper than the asymmetric "title-only for exact" rule it would replace. Operators who want title-only use `--filter-regex '^My title$'`.
6. **No trim.** Whitespace in the literal is significant. `--filter-text-exact ' foo '` searches for the seven-character literal; if the user intended `'foo'`, they would have typed it. No trim means no surprise.
7. **Empty literal refuses, not match-everything or match-nothing.** Match-everything would mean `--filter-text-exact ''` is a silent no-op (confusing). Match-nothing would mean it silently empties the result list (also confusing — likely a typo). Refusing with a clear error matches Slice 35's `--sort-by ''` precedent and gives operators an immediate signal.
8. **No shared `filter-exact.ts` helper across the three commands.** ~10 LoC per command × 3 = ~30 LoC duplicated. Lower friction than a shim file. Same anti-scope call as Slice 35's no-`sort.ts` decision and Slice 34.3's no-`from-rec.ts` decision. Factor when a fourth command needs equality filtering.
9. **`text-exact="..."` filterDims quoting.** Mirrors the existing `text="..."` / `regex="..."` shape; operators reading the empty-result diagnostic see the same vocabulary across all three text-mode filters.
10. **Pipeline stage: same as `--filter-text` / `--filter-regex`.** All three text-mode filters occupy the same semantic slot; pairwise mutex enforces that at most one runs. No ambiguity about stage order. `--filter-text-exact` evaluates after `--filter-status` and before subject-specific filters and `--sort-by`, matching the existing flow.
11. **Symmetric across all three list commands.** Slice 25 (`--filter-text`) and Slice 33 (`--filter-regex`) ship symmetrically on all three; Slice 36 mirrors that surface. No asymmetry temptation.
12. **No `--filter-text-exact-in <field-list>` per-field scope.** Same call as Slice 33's no-`--filter-text-in`. Operators who want title-only equality use `--filter-regex '^X$'`.

## Follow-On

- **`--filter-text-exact-in <field-list>`**: per-field scope on equality (title-only, summary-only, etc.). Cheap if asked; today the multi-field ANY-of scope is the consistent default.
- **`--filter-text-exact` multi-value (OR-of-equalities)**: ship as a repeatable flag if real operator workflows want "title is one of {A, B, C}". Today `--filter-regex '^(A|B|C)$'` covers it.
- **`--filter-regex-flags <flags>`** (case-insensitive, multiline, dotall): channel for the standard JS regex flag set. Still on the Praxis polish list (per the handoff's open-items section). Independent of this slice.
- **`--filter-kind` on `intelligence audit`**: still on the Praxis polish list. Independent.
- **Graph viewer optimization** (Slice 29 follow-on): still on the Praxis polish list. Independent.
- **Reconcile Slice-33 § Follow-On `--filter-text-exact` entry** (strike with reference to Slice 36) in the docs commit.
