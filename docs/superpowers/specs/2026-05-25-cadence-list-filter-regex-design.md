# CADENCE `--filter-regex` on list commands — Design

**Date:** 2026-05-25
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 33 (Slice-25 follow-on; power-user regex variant of the existing `--filter-text`)
**Predecessor slice docs:**
- [`2026-05-20-cadence-list-filter-text-design.md`](2026-05-20-cadence-list-filter-text-design.md) (Slice 25 — introduced `--filter-text` case-insensitive substring; § Follow-On listed `--filter-regex <pattern>` for power users)
- [`2026-05-21-cadence-list-reverse-design.md`](2026-05-21-cadence-list-reverse-design.md) (Slice 27 — final pagination slice; § Follow-On also listed `--filter-regex`)

## Summary

**Slice 33** adds a new `--filter-regex <pattern>` flag to all three list commands (`recommendation list`, `assumption list`, `decision list`). The pattern is compiled as a JavaScript `RegExp` and tested via `.test()` against the same multi-field text scope `--filter-text` searches (per-subject: rec → title + summary; assumption → text; decision → title + rationale). Power-user variant: always case-sensitive (Node's V8 regex engine does not support inline modifier groups like `(?i)` or `(?i:...)` — TC39 regexp-modifiers is Stage 3, not yet shipped). Operators wanting case-insensitive matching use character classes (`[Cc]ycle`). Mutually exclusive with `--filter-text`. Invalid patterns refuse with exit 1.

- **One new flag** on all three list commands.
- **Multi-field scope** matches `--filter-text` per subject — same fields, different match algorithm.
- **Always case-sensitive.** No inline-flag support in V8 today. Operators use character classes (`[Cc]ycle`) for one-off insensitivity; a future `--filter-regex-flags <flags>` channel is a clean follow-on if real use cases warrant.
- **Mutually exclusive with `--filter-text`**: both set → exit 1 + stderr `cannot combine --filter-text and --filter-regex`.
- **Invalid pattern**: exit 1 + stderr `invalid regex: <message>` (preserving Node's `SyntaxError` message).
- **Apply order**: same stage as `--filter-text` (status → rec → text-or-regex → reverse → offset → limit).
- **Empty-result dim**: `regex="<pattern>"` (parallel to `text="<substr>"`).

## Product Boundary

Read only. No writes.

## Scope

### In scope

- `packages/core/src/cli/commands/recommendation.ts`: new `--filter-regex` option; mutual-exclusion check; pattern compile + apply; filterDims push.
- `packages/core/src/cli/commands/assumption.ts`: same.
- `packages/core/src/cli/commands/decision.ts`: same.
- CLI spawn tests (one per command).
- CHANGELOG entry.
- Predecessor reconciliation: strike `--filter-regex` entries from Slice-25 and Slice-27 § Follow-On.

### Out of scope

- **`--filter-text-exact`** (case-sensitive substring): separate slice if needed. `--filter-regex` with a literal pattern (e.g., `^Cycle detection$` or just `Cycle detection`) covers the same use case for power users.
- **Per-field selection** (`--filter-text-in title,text`): not in scope. If operators want title-only or body-only, anchor the regex (e.g., `^My title$`) — but the multi-field scope is the consistent default.
- **Regex options object** (e.g., `--filter-regex-flags i`): defer. Inline `(?i)` is the standard JavaScript regex idiom; no need to bolt on a flags channel.
- **Multi-regex composition** (`--filter-regex p1 --filter-regex p2`): defer. AND-composition would be `(?=p1)(?=p2)` lookaheads (verbose but available to power users).
- **Symmetric flag on `intelligence audit`** (which doesn't have `--filter-text` either).
- Any change to the loop, `state.json`, `STATE.md`, or other commands.

## Architecture

### MODIFIED files

- `packages/core/src/cli/commands/recommendation.ts` — new option, mutual-exclusion check, compile/match logic, filterDims push.
- `packages/core/src/cli/commands/assumption.ts` — same shape.
- `packages/core/src/cli/commands/decision.ts` — same shape.
- `packages/core/tests/cli/recommendation.test.ts` (or new sibling) — new test cases.
- `packages/core/tests/cli/assumption.test.ts` — same.
- `packages/core/tests/cli/decision.test.ts` — same.

### Untouched

- Store layer.
- Render layer.
- Other commands (`show`, `add`, transitions, intelligence subcommands).
- Schema.
- `docs/reference/commands.md` (drift parked per Slice-28 precedent).
- CLI-reference drift guard.

## Implementation Pattern

### CLI option + validation (illustrative; same shape applied to each of the three commands)

```ts
.option('--filter-regex <pattern>', 'Power-user regex filter (case-sensitive; use (?i) inline for insensitive). Mutually exclusive with --filter-text.')
```

```ts
// Inside the action handler, BEFORE the existing --filter-text block:
if (opts.filterText !== undefined && opts.filterRegex !== undefined) {
  process.stderr.write(
    `<cmd> list failed: cannot combine --filter-text and --filter-regex\n`,
  );
  process.exitCode = 1;
  return;
}

let regex: RegExp | null = null;
if (opts.filterRegex !== undefined) {
  try {
    regex = new RegExp(opts.filterRegex);
  } catch (err) {
    process.stderr.write(
      `<cmd> list failed: invalid regex: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
    return;
  }
}
```

### Apply (per-subject text scope)

The match scope per subject mirrors `--filter-text`:

```ts
// decision.ts
if (regex) {
  entries = entries.filter((d) => regex.test(d.title) || regex.test(d.rationale));
}

// assumption.ts
if (regex) {
  entries = entries.filter((a) => regex.test(a.text));
}

// recommendation.ts
if (regex) {
  entries = entries.filter(
    (r) => regex.test(r.title) || regex.test(r.summary),
  );
}
```

The `regex` and `--filter-text` branches occupy the same pipeline stage (after `--filter-rec`, before `--reverse`). Only one runs per invocation (mutual-exclusion enforced above).

### Empty-result filterDims

```ts
if (opts.filterText !== undefined) filterDims.push(`text="${opts.filterText}"`);
if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
```

Quotes match the existing `text="..."` style. The empty-result message reads e.g. `No decisions matching status=active, regex="^auth" recorded.`

### Behavior matrix

| Flags | Result |
|---|---|
| (no flags) | all entries |
| `--filter-text Foo` | entries where text scope matches `Foo` (case-insensitive substring) |
| `--filter-regex ^Foo` | entries where text scope matches `/^Foo/` (case-sensitive) |
| `--filter-regex '[Ff]oo'` | entries where text scope matches `Foo` or `foo` (char-class workaround for case-insensitive) |
| `--filter-text Foo --filter-regex Bar` | exit 1 + stderr (mutually exclusive) |
| `--filter-regex '['` | exit 1 + stderr (invalid regex) |

## Acceptance Criteria

| AC | Statement | Linked test |
|---|---|---|
| AC-1 | `decision list --filter-regex '^Cycle'` returns only decisions whose title or rationale starts with `Cycle`. Case-sensitive (no JS regex inline-flag support). | CLI test |
| AC-2 | `decision list --filter-regex '[Cc]ycle'` (char-class workaround) returns case-insensitive matches. | CLI test |
| AC-3 | `assumption list --filter-regex 'race condition'` returns assumptions whose `text` field matches the pattern. | CLI test |
| AC-4 | `recommendation list --filter-regex '^Add'` returns recs whose title or summary matches. | CLI test |
| AC-5 | `--filter-text X --filter-regex Y` → exit 1 + stderr `<cmd> list failed: cannot combine --filter-text and --filter-regex`. No stdout. | CLI test |
| AC-6 | Invalid pattern (e.g., `[`) → exit 1 + stderr containing `invalid regex:`. No stdout. | CLI test |
| AC-7 | `--filter-regex` composes with `--filter-status`, `--filter-rec`, `--reverse`, `--offset`, `--limit`, `--format json`. | CLI test (1 composition example) |
| AC-8 | Empty result with `--filter-regex` set → message includes `regex="<pattern>"` in filterDims. | CLI test |
| AC-9 | Apply order: `regex` runs at the same pipeline stage as `--filter-text` (after `--filter-rec`, before `--reverse`). | CLI test (composition above already verifies) |
| AC-10 | CLI-reference drift guard UNCHANGED. `docs/reference/commands.md` UNCHANGED. Store and render UNCHANGED. | drift-guard test |
| AC-11 | Full turbo gate green (16/16). | done-bar |

## Testing

- **CLI spawn tests** (one per command):
  - `packages/core/tests/cli/decision.test.ts`: AC-1, AC-2, AC-5, AC-6, AC-7, AC-8.
  - `packages/core/tests/cli/assumption.test.ts`: AC-3 (regex match on text).
  - `packages/core/tests/cli/recommendation.test.ts`: AC-4 (regex match on title/summary).
- **Existing tests** continue to pass (AC-10).
- **Done-bar**: full `pnpm turbo run lint typecheck test build` green (16/16).

## Commit Convention

```
docs: design — --filter-regex on list commands (Praxis Slice 33)
feat(core): --filter-regex on recommendation/assumption/decision list (Slice 33)
docs: document --filter-regex + reconcile Slice-25/27 follow-refs (Slice 33)
```

Three commits, per Praxis convention.

## Success Criteria

1. All 11 ACs pass.
2. Full turbo gate green (16/16).
3. Slice-25 + Slice-27 `§ Follow-On` `--filter-regex` entries reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. CLI-reference drift guard UNCHANGED. `docs/reference/commands.md` UNCHANGED.
6. Schema, store, render layers UNCHANGED.
7. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **Mutually exclusive with `--filter-text`.** Both flags occupy the same pipeline stage and same semantic slot (text search). Allowing both would require an AND/OR convention that isn't obvious. Refusing the combination keeps the invocation clear; power users who need composition can express it via lookaheads in the regex itself (`(?=p1)(?=p2)`).
2. **Always case-sensitive (no inline-flag channel).** Node's V8 regex engine does not support inline modifier groups: neither `(?i)foo` (PCRE-style applies-to-rest) nor `(?i:foo)` (TC39 regexp-modifiers, Stage 3) compiles today. Confirmed against Node 20.20. Adding case-insensitivity via a flags channel (`--filter-regex-flags`) is out of scope for this slice — would double the invocation surface for one use case. Operators wanting case-insensitive matching today use character classes (`[Cc]ycle`, `[Ff]oo`); the design names this as a clean follow-on slice if real use cases warrant a flags channel.
3. **Multi-field scope matches `--filter-text`.** Each subject's text scope is the same fields the existing substring filter searches. Operators reaching for `--filter-regex` typically want the same scope but a different match algorithm. Anchor in the pattern for narrower scope (`^...$`).
4. **Invalid pattern refuses, doesn't fallback.** Silently treating an invalid pattern as a no-op or as literal-text would be surprising. Operators get an immediate signal.
5. **No `--filter-regex-flags` option channel.** Inline `(?i)`, `(?m)`, `(?s)` cover the common cases. Adding a flags channel doubles the invocation surface for marginal gain.
6. **`regex="..."` filterDims quoting.** Mirrors the existing `text="..."` shape. Operators reading the empty-result diagnostic see the same vocabulary.
7. **Symmetric across all three list commands.** Slice-25 introduced `--filter-text` on all three; Slice 33 mirrors that surface symmetrically. No asymmetry temptation.
8. **No `intelligence audit --filter-regex`.** Audit doesn't have `--filter-text` either — the audit output is structured (kind-based), not text-search-friendly. Separate concern; would need its own slice if/when asked.

## Follow-On

- ~~**`--filter-regex-flags <flags>`** (case-insensitive, multiline, dotall): channel for the standard JS regex flag set. If operators frequently want `--filter-regex 'foo' --filter-regex-flags i` instead of `[Ff]oo`, ship it. Cheap.~~ **Shipped Slice 37** (2026-05-28): see `docs/superpowers/specs/2026-05-27-cadence-list-filter-regex-flags-design.md`.
- **`--filter-text-exact`** (case-sensitive substring): cheap if asked. Today: `--filter-regex '\\bFoo\\b'` or `'^Foo$'` covers it.
- **`--filter-text-in <field-list>`** (per-field selection): if operators want title-only.
- **`--sort-by <field>`** stable sort with multi-key (Slice 27 follow-on; biggest remaining list-shaping item).
- **Bulk transitions** (`cadence assumption validate --all-rec <recId>`).
- **`--filter-kind <kind>` on `intelligence audit`** (Slice 30 follow-on).
- **Slice-29 graph viewer optimization** — use `supersedes[]` directly (Slice 31 follow-on).
- **Rec↔phase linkage** — biggest remaining scope (handoff candidate #1).
