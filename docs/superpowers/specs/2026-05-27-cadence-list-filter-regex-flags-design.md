# CADENCE `--filter-regex-flags` on list commands — Design

**Date:** 2026-05-27
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 37 (Slice-33 follow-on; companion flag exposing JS RegExp `i/m/s/u` to the existing `--filter-regex`)
**Predecessor slice docs:**
- [`2026-05-25-cadence-list-filter-regex-design.md`](2026-05-25-cadence-list-filter-regex-design.md) (Slice 33 — introduced `--filter-regex` always-case-sensitive; § Follow-On explicitly listed `--filter-regex-flags <flags>` "channel for the standard JS regex flag set. If operators frequently want `--filter-regex 'foo' --filter-regex-flags i` instead of `[Ff]oo`, ship it. Cheap.")
- [`2026-05-27-cadence-list-filter-text-exact-design.md`](2026-05-27-cadence-list-filter-text-exact-design.md) (Slice 36 — sibling separate-flag + empty-refuse precedent; same architectural shape this slice mirrors)
- [`2026-05-27-cadence-list-sort-by-design.md`](2026-05-27-cadence-list-sort-by-design.md) (Slice 35 — sibling per-command-stanza precedent; no shared helper, ~10 LoC duplicated per command)

## Summary

**Slice 37** adds a `--filter-regex-flags <flags>` companion flag to the three list commands (`recommendation list`, `assumption list`, `decision list`). The flag accepts a string of JS RegExp flag letters from the curated allowlist `{i, m, s, u}` and passes them as the second argument to `new RegExp(pattern, flags)`. Closes the case-insensitivity gap that Slice 33 left as a follow-on, sidestepping the V8 limitation that doesn't support inline modifier groups (`(?i)foo`).

- **One new flag** on all three list commands.
- **Companion to `--filter-regex`** — requires `--filter-regex` to also be set; orphan use errors.
- **Curated allowlist `{i, m, s, u}`** — case-insensitive, multiline `^/$`, dotAll `.`, Unicode. Rejects `g/y` (stateful, break repeated `.test()`), `d` (irrelevant for booleans), `v` (Unicode-sets, YAGNI).
- **Letter-string grammar** — `--filter-regex-flags 'is'` mirrors JS RegExp's native second-argument format. What operators type is what flows into `new RegExp(pattern, flags)`.
- **Strict validation** — empty refuses, duplicate letters refuse, invalid letters refuse. Each error names the specific letter.
- **No participation in three-way text-mode mutex** — Slice 36 locked pairwise mutex between `--filter-text` / `--filter-text-exact` / `--filter-regex`; `--filter-regex-flags` is a parameter to `--filter-regex`, not a fourth filter mode, so it doesn't add to the mutex matrix. The orphan-refuse rule covers the "set but no pattern" case.
- **Apply changes one line** in each command's existing `--filter-regex` block: `new RegExp(opts.filterRegex)` → `new RegExp(opts.filterRegex, opts.filterRegexFlags)`. `new RegExp(pattern, undefined)` is equivalent to `new RegExp(pattern)`, so behavior is unchanged when the new flag is absent.
- **Empty-result dim**: `regex-flags="<value>"` — separate from `regex="..."`, emitted only when `--filter-regex-flags` was set.

## Product Boundary

Read only. No writes. No schema change. No store-layer or render-layer change.

## Scope

### In scope

- `packages/core/src/cli/commands/recommendation.ts`: new `--filter-regex-flags` option; orphan-check + per-letter validation; one-line apply change (pass flags to `new RegExp`); filterDims push.
- `packages/core/src/cli/commands/assumption.ts`: same shape.
- `packages/core/src/cli/commands/decision.ts`: same shape.
- Module-local `parseRegexFlags(raw: string): { flags: string } | { error: string }` helper inline in each command file (no shared helper, per anti-scope).
- CLI spawn tests (one block per command).
- `docs/reference/commands.md`: add `--filter-regex-flags` row to each of the three list option tables; tiny append to existing `--filter-regex` rows pointing to the new flag.
- Predecessor reconciliation: strike `--filter-regex-flags` entry from Slice-33 § Follow-On.

### Out of scope

- **Pass-through to RegExp without allowlist**: rejected during brainstorm. `g` and `y` are stateful and silently break repeated `.test()` calls in array filters; principled minimum is the curated allowlist.
- **Blocklist (allow everything except g/y)**: rejected. Adds `d/v` to the surface even though useless for filtering; less defensible than the strict allowlist.
- **Comma-separated grammar** (`'i,s'`): rejected. Diverges from JS RegExp's native second-argument format; adds parser surface (split + dedup) for no benefit.
- **Repeatable flag** (`--filter-regex-flags i --filter-regex-flags s`): rejected. Breaks single-value parity with every other `--filter-*` on these commands.
- **Lenient validation** (silent empty no-op or auto-dedup): rejected. Slice 35 and Slice 36 both refuse-empty; consistency wins.
- **Silent no-op on orphan use**: rejected. Surface user mistakes as errors, not hidden behavior.
- **Grammar overload of `--filter-regex`** (e.g., `--filter-regex 'foo:i'` JS-regex-literal style): rejected. Regex patterns can contain `:` literally; separate flag has zero parse ambiguity. Also: Slice 33's design doc explicitly named `--filter-regex-flags` as the cheap follow-on path.
- **`v` flag** (Unicode-sets, ES2024): rejected. Only differs from `u` for set-notation regex; no operator workflow triggers it today. Cheap follow-on if asked.
- **Shared `regex-flags.ts` helper across the three commands**: anti-scope (see Architecture).
- **Symmetric flag on `intelligence audit`**: out of scope (no `--filter-regex` there either).
- **Symmetric flag on `milestone list`**: out of scope (no list pipeline today, per Slice 35).
- **Schema, store, render layers, loop transitions, `state.json`/`STATE.md`:** untouched.

## Architecture

### MODIFIED files

- `packages/core/src/cli/commands/recommendation.ts` — new option, `parseRegexFlags` helper, orphan-check, apply line change, filterDims push.
- `packages/core/src/cli/commands/assumption.ts` — same shape.
- `packages/core/src/cli/commands/decision.ts` — same shape.
- `packages/core/tests/cli/recommendation.test.ts` — new tests per AC table.
- `packages/core/tests/cli/assumption.test.ts` — same.
- `packages/core/tests/cli/decision.test.ts` — same + one duplicate-letter test.
- `docs/reference/commands.md` — add `--filter-regex-flags` row to each of the three list tables; tiny update on existing `--filter-regex` rows.

### Untouched

- All store helpers / readers.
- `@cadence/types` — no schema change.
- Render layer (terminal + JSON formatters).
- Other CLI commands (`show`, `add`, transitions, `intelligence` subcommands, `cadence spec/draft new`).
- Loop transitions / `state.json` / `STATE.md`.
- CLI-reference drift guard.

### No shared `regex-flags.ts` helper across the three commands

Anti-scope. Each command's `parseRegexFlags` + orphan-check + apply-line-change is ~15 LoC. ~45 LoC of duplication is cheaper than a shim file at the three-command surface — same precedent as Slice 35's no-shared-`sort.ts` decision, Slice 36's no-`filter-exact.ts`, and Slice 34.3's no-`from-rec.ts`. Factor when a fourth command needs regex-flag parsing.

## Implementation Pattern

### CLI option (illustrative; same shape applied to each of the three commands)

```ts
.option(
  '--filter-regex-flags <flags>',
  'RegExp flag letters to apply to --filter-regex. Allowed: i (case-insensitive), m (multiline ^/$), s (dotAll .), u (unicode). Requires --filter-regex.',
)
```

### Parse helper (illustrative; module-local in each command)

```ts
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

Inline in each command file. ~14 LoC per command, repeated three times for symmetry.

### Validation (orphan-check + parse, BEFORE the existing `--filter-regex` apply)

Inserted AFTER the three-way text-mode mutex block (Slice 36's pairwise checks) and BEFORE the existing `--filter-regex` apply:

```ts
if (opts.filterRegexFlags !== undefined && opts.filterRegex === undefined) {
  process.stderr.write(
    `<cmd> list failed: --filter-regex-flags requires --filter-regex to also be set\n`,
  );
  process.exitCode = 1;
  return;
}
let regexFlags: string | undefined;
if (opts.filterRegexFlags !== undefined) {
  const parsed = parseRegexFlags(opts.filterRegexFlags);
  if ('error' in parsed) {
    process.stderr.write(`<cmd> list failed: ${parsed.error}\n`);
    process.exitCode = 1;
    return;
  }
  regexFlags = parsed.flags;
}
```

The orphan-check fires first (most specific user mistake — typed flags but forgot the pattern). Per-letter validation runs second, returning the first invalid or first duplicate as the error. `regexFlags` is then either `undefined` (no flag set) or a known-good letter string.

### Apply change (one-line modification to existing `--filter-regex` block)

The existing `--filter-regex` apply block in each command stays the same shape; only the `new RegExp(...)` call gains a second argument:

```ts
// Before:
regex = new RegExp(opts.filterRegex);

// After:
regex = new RegExp(opts.filterRegex, regexFlags);
```

`new RegExp(pattern, undefined)` is equivalent to `new RegExp(pattern)` (no flags applied), so the change is transparent when `--filter-regex-flags` is absent. The pre-validation above ensures `regexFlags` is always either `undefined` or a known-good letter string by the time it reaches `new RegExp`.

The existing RegExp SyntaxError catch (already there) still guards against pattern-syntax errors like `--filter-regex '['` — pattern errors and flag errors stay separately surfaced.

### Empty-result filterDims

```ts
if (opts.filterRegex !== undefined) filterDims.push(`regex="${opts.filterRegex}"`);
if (opts.filterRegexFlags !== undefined) filterDims.push(`regex-flags="${opts.filterRegexFlags}"`);
```

Order: status → text → text-exact → regex → **regex-flags** → subject-specific (converted-to for rec; rec / untied=incl for asn/dec). New push inserted immediately after the existing `regex=` push, keeping the regex-and-flags pair contiguous. Only emitted when `--filter-regex-flags` was set — operators using just `--filter-regex` see the existing single `regex="..."` dim unchanged.

Example empty-result line: `No decisions matching status=active, regex="^Cycle", regex-flags="i" recorded.`

### Behavior matrix

| Flags | Result |
|---|---|
| (no flags) | all entries |
| `--filter-regex '^Cycle'` | entries where scoped fields match `/^Cycle/` (case-sensitive, unchanged from Slice 33) |
| `--filter-regex '^cycle' --filter-regex-flags 'i'` | entries where scoped fields match `/^cycle/i` (case-insensitive) |
| `--filter-regex 'foo.*bar' --filter-regex-flags 'is'` | entries where scoped fields match `/foo.*bar/is` (case-insensitive + dotAll across newlines) |
| `--filter-regex-flags 'i'` (NO `--filter-regex`) | exit 1 + stderr `--filter-regex-flags requires --filter-regex to also be set` |
| `--filter-regex 'foo' --filter-regex-flags ''` | exit 1 + stderr `--filter-regex-flags requires a non-empty value` |
| `--filter-regex 'foo' --filter-regex-flags 'g'` | exit 1 + stderr `invalid flag letter: 'g' (allowed: i, m, s, u)` |
| `--filter-regex 'foo' --filter-regex-flags 'gi'` | exit 1 + stderr `invalid flag letter: 'g' (allowed: i, m, s, u)` (first invalid wins) |
| `--filter-regex 'foo' --filter-regex-flags 'ii'` | exit 1 + stderr `duplicate flag letter: 'i'` |
| `--filter-regex 'foo' --filter-regex-flags 'i' --filter-text 'bar'` | exit 1 + stderr `cannot combine --filter-text and --filter-regex` (existing mutex still fires) |
| `--filter-regex 'foo' --filter-regex-flags 'i' --sort-by created` | regex-with-flags filter then sort (composes) |

## Acceptance Criteria

Per-command shared ACs (applied to each of the three commands):

| AC | Statement | Linked test |
|---|---|---|
| AC-flags-1 | `<cmd> list --filter-regex '<pattern>' --filter-regex-flags 'i'` returns entries that match case-insensitively where without the flag they wouldn't. | CLI test |
| AC-flags-2 | Multi-flag value: `<cmd> list --filter-regex '<pattern>' --filter-regex-flags 'is'` compiles with both `i` and `s` (verified by matching dotAll-only content). | CLI test |
| AC-flags-3 | Orphan use: `--filter-regex-flags 'i'` without `--filter-regex` → exit 1 + stderr `--filter-regex-flags requires --filter-regex to also be set`. No stdout. | CLI test |
| AC-flags-4 | Empty value: `--filter-regex 'foo' --filter-regex-flags ''` → exit 1 + stderr `--filter-regex-flags requires a non-empty value`. No stdout. | CLI test |
| AC-flags-5 | Invalid letter: `--filter-regex 'foo' --filter-regex-flags 'g'` → exit 1 + stderr `invalid flag letter: 'g' (allowed: i, m, s, u)`. No stdout. | CLI test |
| AC-flags-6 | Empty result with `--filter-regex-flags` set → message includes both `regex="<pattern>"` AND `regex-flags="<value>"` in filterDims. | CLI test |

Single-command shared AC (only on `recommendation list` to avoid 3× redundancy on the parse logic):

| AC | Statement | Linked test |
|---|---|---|
| AC-flags-rec-1 | Duplicate letters: `--filter-regex 'foo' --filter-regex-flags 'ii'` → exit 1 + stderr `duplicate flag letter: 'i'`. No stdout. | CLI test |

Guard ACs (apply once across the slice):

| AC | Statement | Linked test |
|---|---|---|
| AC-flags-doc-1 | `docs/reference/commands.md` documents `--filter-regex-flags` under each of the three list subcommands. Existing `--filter-regex` rows updated with a pointer to the new flag. | docs review |
| AC-flags-doc-2 | CLI-reference drift guard UNCHANGED in behavior. | drift-guard test |
| AC-flags-store-1 | Store, render, schema, `intelligence audit`, and `milestone list` layers UNCHANGED. | grep / existing tests |
| AC-flags-compat-1 | Pre-existing `--filter-regex` tests continue to pass unchanged. Without `--filter-regex-flags`, RegExp is constructed identically to Slice 33's behavior. | existing tests |
| AC-flags-gate-1 | Full turbo gate green (16/16). | done-bar |

## Testing

- **CLI spawn tests** (append to existing test file per command), referencing AC tokens:
  - `packages/core/tests/cli/recommendation.test.ts` — shared ACs 1–6 + AC-flags-rec-1 (7 tests).
  - `packages/core/tests/cli/assumption.test.ts` — shared ACs 1–6 (6 tests).
  - `packages/core/tests/cli/decision.test.ts` — shared ACs 1–6 (6 tests).
- Expected test count delta: **+19 new tests** across the three files. `@cadence/core` moves from 1113 → ~1132.
- **Existing tests** continue to pass unchanged (the `--filter-regex-flags undefined` path is the identity behavior — `new RegExp(pattern, undefined)` ≡ `new RegExp(pattern)`).
- **Done-bar**: full `pnpm turbo run lint typecheck test build` green (16/16).

## Commit Convention

Following the Slice-35 / Slice-36 precedent (design + plan + feat + docs):

```
docs: design — --filter-regex-flags on list commands (Praxis Slice 37)
docs: Slice 37 implementation plan (--filter-regex-flags on list commands)
feat(core): --filter-regex-flags on recommendation/assumption/decision list (Slice 37)
docs: document --filter-regex-flags + reconcile Slice-33 follow-ref (Slice 37)
```

Up to four commits. (The first is this design doc; the plan doc is its own commit per Praxis convention; feat and docs are the final two.) The HANDOFF.md deletion currently in worktree as `D HANDOFF.md` (residue from `/resume`) rides along with commit 1 — same pattern as `33cebb1` and `1b0fb34` precedents.

**Process note from the Slice 36 holistic review:** This project does NOT use the `Co-Authored-By` trailer on feat/docs commits. Verify each commit body before push — the `1b0fb34` design commit accidentally carried one last session.

## Success Criteria

1. All shared + per-command + guard ACs pass.
2. Full turbo gate green (16/16).
3. Slice-33 `§ Follow-On` `--filter-regex-flags` entry reconciled (strike with reference to Slice 37).
4. No `state.json` / `STATE.md` / loop transition / store / render / schema touched.
5. CLI-reference drift guard UNCHANGED. `docs/reference/commands.md` extended under each list subcommand; existing `--filter-regex` rows lightly updated to point at the new flag.
6. `intelligence audit`, `milestone list`, and all transition commands UNCHANGED.
7. `@cadence/core` test count moves from 1113 → ~1132 (≈ 19 new tests).
8. Branch HEAD pushes clean; CI on self-hosted runner green.
9. No `Co-Authored-By` trailer on any of the four Slice 37 commits.

## Decision Log

1. **Curated allowlist `{i, m, s, u}` over pass-through to RegExp.** Letting RegExp validate would mean `--filter-regex-flags 'g'` compiles successfully but breaks repeated `.test()` calls silently (global regex with `.test()` advances `lastIndex`, returning false on alternate calls). `y` (sticky) has similar trap behavior. `d` (hasIndices) is irrelevant for booleans. `v` (Unicode-sets) is YAGNI today. The curated four are the principled minimum: `i` is the headline use case, `m`/`s` are useful on multi-line `rationale`/`summary` fields, `u` ensures proper Unicode handling.
2. **Letter-string grammar over comma-separated or repeatable.** Mirrors JS RegExp's native second-argument format verbatim — what operators see is what gets passed to `new RegExp(pattern, flags)`. Comma-separated adds parser noise (split + dedup) for no benefit. Repeatable breaks single-value parity with every other `--filter-*` on these commands.
3. **Separate companion flag over grammar overload of `--filter-regex`.** Grammar suffix (e.g., `--filter-regex 'foo:i'`) needs escaping because regex patterns can contain `:` literally. Separate flag has zero parse ambiguity and is the path Slice 33's design doc explicitly named in its § Follow-On. Same precedent as Slice 35 / 36's separate-flag decisions.
4. **Orphan use refuses with clear error.** Silent no-op would hide the most likely user mistake (typed flags but forgot or misnamed the pattern). Slice 35 (`--sort-by ''`) and Slice 36 (`--filter-text-exact ''`) both established surface-mistakes-as-errors as the project posture; this slice inherits that.
5. **Strict validation: empty refuses, duplicates refuse, invalid letters refuse.** Each error names the specific letter so operators can self-correct. Lenient (silent dedup, accept empty as no-op) was rejected — diverges from Slice 35/36 precedent.
6. **No participation in three-way text-mode mutex.** `--filter-regex-flags` modifies `--filter-regex` rather than being a fourth filter mode. The existing pairwise mutex (text / text-exact / regex) prevents combining `--filter-regex` with the other two text-mode flags; flags ride along transitively. Adding `--filter-regex-flags` to the mutex matrix would be misleading — operators would expect `cannot combine --filter-regex-flags with --filter-text`, but the right semantics is "flags do nothing without the pattern, and the pattern already conflicts with text."
7. **Apply change is one line.** `new RegExp(opts.filterRegex)` → `new RegExp(opts.filterRegex, regexFlags)`. Pre-validation guarantees `regexFlags` is `undefined` or known-good. `new RegExp(pattern, undefined)` ≡ `new RegExp(pattern)`, so absence is transparent. Minimum-surface change.
8. **No shared `regex-flags.ts` helper across the three commands.** ~14 LoC per command × 3 = ~42 LoC duplicated. Lower friction than a shim file. Same anti-scope call as Slice 35's no-`sort.ts`, Slice 36's no-`filter-exact.ts`, and Slice 34.3's no-`from-rec.ts`. Factor when a fourth command needs regex-flag parsing.
9. **`regex-flags="..."` filterDims as a separate dim from `regex="..."`.** Combined notation (`regex="<pattern>"/<flags>`) was considered but adds a code conditional and looks unusual for a CLI diagnostic. Separate dim parallels Slice 36's `text-exact="..."` separation from `text="..."` and `regex="..."`. Only emitted when the flag was set, so operators using just `--filter-regex` see no change.
10. **Symmetric across all three list commands.** Slice 25 (`--filter-text`), Slice 33 (`--filter-regex`), Slice 36 (`--filter-text-exact`) all shipped symmetrically on all three; Slice 37 mirrors. No asymmetry temptation.
11. **No-Co-Authored-By trailer.** Verified absence before each Slice 37 commit. Last session's design commit (`1b0fb34`) accidentally included one; this slice corrects the process.
12. **`v` flag deferred.** ES2024's `v` flag (Unicode-sets) extends `u` for set-notation regex. No operator workflow triggers it today; `u` covers the realistic Unicode need. Cheap follow-on if asked.

## Follow-On

- **`v` flag** (Unicode-sets): add to the allowlist if operators ship set-notation regex patterns and want the ES2024 semantics.
- **`d` flag** (hasIndices) for richer diagnostics: would let `intelligence audit` or `decision graph` highlight match positions in rendered output. Out-of-scope for filter-only `.test()` usage today.
- **`--filter-kind` on `intelligence audit`**: still on the Praxis polish list. Independent.
- **Graph viewer optimization** (Slice 29 follow-on): still on the Praxis polish list. Independent.
- **Reconcile Slice-33 § Follow-On `--filter-regex-flags` entry** (strike with reference to Slice 37) in the docs commit.
