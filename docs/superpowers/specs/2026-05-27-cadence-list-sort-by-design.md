# CADENCE `--sort-by` on list commands — Design

**Date:** 2026-05-27
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 35 (first post-34.x Praxis polish; "biggest remaining list-shaping item" per Slice-27 follow-on)
**Predecessor slice docs:**
- [`2026-05-21-cadence-list-reverse-design.md`](2026-05-21-cadence-list-reverse-design.md) (Slice 27 — § Follow-On listed `--sort-by <field>` "stable sort with multi-key support")
- [`2026-05-21-cadence-list-offset-design.md`](2026-05-21-cadence-list-offset-design.md) (Slice 26 — § Follow-On listed `--sort-by`)
- [`2026-05-20-cadence-list-limit-design.md`](2026-05-20-cadence-list-limit-design.md) (Slice 24 — § Follow-On listed `--sort-by`)
- [`2026-05-25-cadence-list-filter-regex-design.md`](2026-05-25-cadence-list-filter-regex-design.md) (Slice 33 — § Follow-On listed `--sort-by`)
- [`2026-05-25-cadence-decision-list-include-untied-design.md`](2026-05-25-cadence-decision-list-include-untied-design.md) (Slice 32 — § Follow-On listed `--sort-by`)
- [`2026-05-21-cadence-decision-supersededby-design.md`](2026-05-21-cadence-decision-supersededby-design.md) (Slice 28 — § Follow-On listed `--sort-by`)
- [`2026-05-25-cadence-decision-supersedes-backfill-design.md`](2026-05-25-cadence-decision-supersedes-backfill-design.md) (Slice 31 — § Follow-On listed `--sort-by`)

## Summary

**Slice 35** adds a `--sort-by <key>[:desc]` flag to the three list commands (`recommendation list`, `assumption list`, `decision list`). Sort sits between the existing filter stages and `--reverse` in the list pipeline. Each command exposes a curated key menu; enum-valued keys sort by Zod declaration order (not alphabetical). Stable sort means equal-key entries preserve insertion order automatically.

- **One new flag** on all three list commands.
- **Single key with optional `:desc` suffix.** Examples: `--sort-by created`, `--sort-by priority:desc`. No multi-key syntax in this slice.
- **Default direction = ascending.** `:desc` flips. `:asc` is accepted but redundant (no warning).
- **Per-command key menu** (17 keys total): `recommendation` 9, `assumption` 4, `decision` 4. Short aliases (`leverage` → `leverageScore`, `decay` → `decayState`, `rec` → `recommendationId`) for ergonomics.
- **Pipeline placement:** filter-status → filter-text/regex → filter-rec/converted-to → **sort** → reverse → offset → limit.
- **Composes with `--reverse`.** Not mutex. `--sort-by created --reverse` ≡ `--sort-by created:desc` (compose: sort then reverse). The `:desc` form is canonical.
- **Comparator rules** (per key type):
  - Timestamp (`created`, `updated`, `decided`) → ISO-8601 string compare (lexicographic = chronological for `datetime({offset: true})`).
  - Enum (`priority`, `status`, `decay`) → index in Zod enum declaration order.
  - Numeric (`leverage`, `risk`, `confidence`) → arithmetic difference.
  - Text (`title`, `text`) → JS default string compare (case-sensitive, locale-insensitive).
  - Reference (`rec`, optional on decision) → string compare; `undefined` sorts last in asc / first in desc.
- **Tie-break:** stable sort (V8/Node 20+) preserves insertion order naturally — no explicit tie-break logic.
- **Empty-result filterDims unchanged.** Sort is an ordering, not a narrowing — does not append a dim.

## Product Boundary

Read-only. No writes. No schema change. No store-layer or render-layer change.

## Scope

### In scope

- `packages/core/src/cli/commands/recommendation.ts`: new `--sort-by` option; key/direction parsing; comparator dispatch by key type; insertion into pipeline between `--filter-converted-to` and `--reverse`.
- `packages/core/src/cli/commands/assumption.ts`: same shape.
- `packages/core/src/cli/commands/decision.ts`: same shape.
- New CLI tests per AC table (≈ 33 across the three test files).
- `docs/reference/commands.md` documentation under each `list` subcommand.
- Predecessor reconciliation: strike `--sort-by` entries from Slice-24/25/26/27/28/31/32/33 § Follow-On.

### Out of scope

- **Multi-key sort** (`--sort-by priority:desc,created`): deferred. Single-key + stable tie-break covers the realistic operator surface. Comma-separated syntax is a clean follow-on if requested.
- **`--sort-dir <asc|desc>` separate flag:** rejected. `:desc` suffix is more compact and matches Praxis convention.
- **`readiness` as a sortable key** on rec list: deferred. Adds a fifth enum field; ship without and add when an operator triggers.
- **`milestone list --sort-by`:** out of scope. That command has no filter pipeline today; adding sort alone there would be asymmetric and require giving it a list pipeline first.
- **Locale-aware text sort** (`Intl.Collator`): defer. JS default `<` comparator is consistent with the existing case-sensitive `--filter-regex` behavior — operators get predictable, locale-independent ordering.
- **Sort on `intelligence audit`:** out of scope. Audit output is structured/categorized, not a flat entry list.
- **Schema, store, render layers, loop transitions, `state.json`/`STATE.md`:** untouched.

## Architecture

### MODIFIED files

- `packages/core/src/cli/commands/recommendation.ts` — new option, parse helper, comparator dispatch, pipeline insertion.
- `packages/core/src/cli/commands/assumption.ts` — same shape.
- `packages/core/src/cli/commands/decision.ts` — same shape.
- `packages/core/tests/cli/recommendation.test.ts` — new tests per AC table.
- `packages/core/tests/cli/assumption.test.ts` — same.
- `packages/core/tests/cli/decision.test.ts` — same.
- `docs/reference/commands.md` — extend each `list` options table with `--sort-by`.

### Untouched

- All store helpers / readers.
- `@cadence/types` — no schema change.
- Render layer (terminal + JSON formatters).
- Other CLI commands (`show`, transitions, `intelligence` subcommands, `cadence spec/draft new`).
- Loop transitions / `state.json` / `STATE.md`.
- CLI-reference drift guard.

### No shared `sort.ts` helper across the three commands

Anti-scope. Each command's sort block is ~15 LoC (key alias map + comparator dispatch + apply). ~45 LoC of duplication is cheaper than a shim file at the three-command surface — same call as Slice 34.3's no-`from-rec.ts` decision. Factor when a fourth command needs sort.

## Per-command key menu

### `recommendation list`

| Key | Type | Sort target (Recommendation field) |
|---|---|---|
| `created` | timestamp | `createdAt` |
| `updated` | timestamp | `updatedAt` |
| `priority` | enum | `priority` (low < medium < high < critical) |
| `status` | enum | `status` (candidate < accepted < deferred < rejected < converted) |
| `title` | text | `title` |
| `leverage` | numeric | `leverageScore` (0–10) |
| `risk` | numeric | `riskScore` (0–10) |
| `confidence` | numeric | `confidence` (0–1) |
| `decay` | enum | `decayState` (fresh < aging < stale < superseded < contradicted < needs-revalidation) |

### `assumption list`

| Key | Type | Sort target (Assumption field) |
|---|---|---|
| `created` | timestamp | `createdAt` |
| `status` | enum | `status` (open < validated < rejected) |
| `text` | text | `text` |
| `rec` | reference | `recommendationId` |

### `decision list`

| Key | Type | Sort target (IntelligenceDecision field) |
|---|---|---|
| `decided` | timestamp | `decidedAt` |
| `status` | enum | `status` (active < superseded < rescinded) |
| `title` | text | `title` |
| `rec` | reference (optional) | `recommendationId` (may be undefined for untied decisions; sorts last in asc) |

## Implementation Pattern

### CLI option

```ts
.option('--sort-by <key>', 'Sort by a single key, optionally suffixed with :desc. See --help for allowed keys.')
```

Help text on `--help` lists the allowed keys per command, e.g. for rec:
`allowed: created, updated, priority, status, title, leverage, risk, confidence, decay`

### Parse helper (illustrative)

```ts
type SortDir = 'asc' | 'desc';
type ParsedSort = { key: string; dir: SortDir };

function parseSortBy(raw: string): ParsedSort | { error: string } {
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
```

### Comparator dispatch (per-command, illustrative — recommendation)

```ts
const REC_ENUMS = {
  priority: RecommendationPriorityZ.options,
  status: RecommendationStatusZ.options,
  decay: RecommendationDecayStateZ.options,
} as const;

const REC_SORT_KEYS = new Set([
  'created', 'updated', 'priority', 'status', 'title',
  'leverage', 'risk', 'confidence', 'decay',
]);

function compareRec(a: Recommendation, b: Recommendation, key: string): number {
  switch (key) {
    case 'created':    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    case 'updated':    return a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
    case 'title':      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
    case 'leverage':   return a.leverageScore - b.leverageScore;
    case 'risk':       return a.riskScore - b.riskScore;
    case 'confidence': return a.confidence - b.confidence;
    case 'priority':   return REC_ENUMS.priority.indexOf(a.priority) - REC_ENUMS.priority.indexOf(b.priority);
    case 'status':     return REC_ENUMS.status.indexOf(a.status) - REC_ENUMS.status.indexOf(b.status);
    case 'decay':      return REC_ENUMS.decay.indexOf(a.decayState) - REC_ENUMS.decay.indexOf(b.decayState);
    default: return 0; // unreachable (validated upstream)
  }
}
```

### Pipeline insertion

```ts
// Inside the action handler, between filterConvertedTo and --reverse:

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
  const cmp = (a: Recommendation, b: Recommendation) => compareRec(a, b, parsed.key);
  entries = entries.slice().sort(parsed.dir === 'desc' ? (a, b) => -cmp(a, b) : cmp);
}

// existing --reverse / --offset / --limit blocks follow unchanged
```

Assumption and decision use the same shape with their own key sets and comparator. Decision's `rec` case handles `undefined`:

```ts
case 'rec': {
  const aHas = a.recommendationId !== undefined;
  const bHas = b.recommendationId !== undefined;
  if (!aHas && !bHas) return 0;
  if (!aHas) return 1;   // a undefined → after b
  if (!bHas) return -1;  // b undefined → after a
  return a.recommendationId! < b.recommendationId! ? -1
       : a.recommendationId! > b.recommendationId! ? 1 : 0;
}
```

Sorting `:desc` then negates the result, which puts `undefined` first — the rule advertised in Section 2.

### Behavior matrix

| Invocation | Result |
|---|---|
| (no `--sort-by`) | insertion order (current behavior) |
| `--sort-by created` | oldest → newest |
| `--sort-by created:desc` | newest → oldest |
| `--sort-by created --reverse` | newest → oldest (compose; same as `:desc`) |
| `--sort-by created:desc --reverse` | oldest → newest (double-flip; legal but redundant) |
| `--sort-by priority` (rec) | low, medium, high, critical |
| `--sort-by priority:desc` (rec) | critical, high, medium, low |
| `--sort-by leverage:desc` (rec) | highest leverageScore first |
| `--sort-by rec` (decision, untied present) | tied entries sorted by recommendationId, untied last |
| `--sort-by rec:desc` (decision, untied present) | untied first, then tied entries reverse-sorted by recommendationId |
| `--sort-by foo` | exit 1 + stderr `invalid sort key: foo (allowed: ...)` |
| `--sort-by priority:xyz` | exit 1 + stderr `invalid sort direction: 'xyz' (use 'asc' or 'desc')` |
| `--sort-by ''` or `--sort-by :desc` | exit 1 + stderr `--sort-by requires a key` |
| `--sort-by created` + `--filter-status accepted` | sort applied to filtered subset only |

## Acceptance Criteria

Per-command shared ACs (applied to each of the three commands):

| AC | Statement | Linked test |
|---|---|---|
| AC-sort-1 | `<cmd> list --sort-by <ts-key>` returns entries by timestamp ascending. | CLI test |
| AC-sort-2 | `<cmd> list --sort-by <ts-key>:desc` returns entries by timestamp descending. | CLI test |
| AC-sort-3 | `<cmd> list --sort-by <enum-key>` orders by Zod enum declaration index (not alphabetical). | CLI test |
| AC-sort-4 | Stable tie-break: equal-key entries preserve insertion order. | CLI test |
| AC-sort-5 | Sort applies after filters: `--filter-status X --sort-by created` sorts only the filtered subset. | CLI test |
| AC-sort-6 | `--sort-by <key> --reverse` produces the same output as `--sort-by <key>:desc`. | CLI test |
| AC-sort-7 | `--sort-by` composes with `--offset` and `--limit`: pagination applies to sorted output. | CLI test |
| AC-sort-8 | `--format json --sort-by <key>` emits the JSON array in sorted order. | CLI test |
| AC-sort-9 | Invalid key (e.g. `--sort-by foo`) → exit 1 + stderr `invalid sort key: foo (allowed: ...)`. No stdout. | CLI test |
| AC-sort-10 | Malformed direction (e.g. `--sort-by created:xyz`) → exit 1 + stderr `invalid sort direction: 'xyz' (use 'asc' or 'desc')`. No stdout. | CLI test |

Recommendation-specific ACs:

| AC | Statement | Linked test |
|---|---|---|
| AC-sort-rec-1 | `recommendation list --sort-by leverage` returns entries by `leverageScore` ascending (numeric compare, not lexicographic). | CLI test |
| AC-sort-rec-2 | `recommendation list --sort-by decay` orders fresh < aging < stale < superseded < contradicted < needs-revalidation. | CLI test |

Decision-specific AC:

| AC | Statement | Linked test |
|---|---|---|
| AC-sort-dec-1 | `decision list --sort-by rec` puts `recommendationId !== undefined` entries first (by id asc), untied last. `:desc` puts untied first. | CLI test |

Guard ACs (apply once across the slice):

| AC | Statement | Linked test |
|---|---|---|
| AC-sort-doc-1 | `docs/reference/commands.md` documents `--sort-by` under each of the three list subcommands with the allowed key set. | docs review |
| AC-sort-doc-2 | CLI-reference drift guard UNCHANGED in behavior. | drift-guard test |
| AC-sort-store-1 | Store, render, schema, and `intelligence audit` layers UNCHANGED. | grep / existing tests |
| AC-sort-gate-1 | Full turbo gate green (16/16). | done-bar |

## Testing

- **CLI spawn tests** (one block per command), referencing AC tokens:
  - `packages/core/tests/cli/recommendation.test.ts` — shared ACs 1–10 + AC-sort-rec-1, AC-sort-rec-2.
  - `packages/core/tests/cli/assumption.test.ts` — shared ACs 1–10.
  - `packages/core/tests/cli/decision.test.ts` — shared ACs 1–10 + AC-sort-dec-1.
- Each AC keeps its own test for clarity (no parameterized rounds). Expected test count delta: **~33 new tests** across the three files.
- **Existing tests** continue to pass unchanged (the `--sort-by undefined` path is the identity transform).
- **Done-bar:** full `pnpm turbo run lint typecheck test build` green (16/16).

## Commit Convention

Following the Slice-34.x precedent (plan-doc + feat + docs):

```
docs: design — --sort-by on list commands (Praxis Slice 35)
docs: Slice 35 implementation plan (--sort-by on list commands)
feat(core): --sort-by on recommendation/assumption/decision list (Slice 35)
docs: document --sort-by + reconcile Slice-24/25/26/27/28/31/32/33 follow-refs (Slice 35)
```

Up to four commits. (The first is this design doc; the plan doc is its own commit per Praxis convention; feat and docs are the final two.)

## Success Criteria

1. All shared + per-command + guard ACs pass.
2. Full turbo gate green (16/16).
3. Slice-24/25/26/27/28/31/32/33 § Follow-On `--sort-by` entries reconciled (strike them in those docs).
4. No `state.json` / `STATE.md` / loop transition / store / render / schema touched.
5. CLI-reference drift guard UNCHANGED. `docs/reference/commands.md` extended under each list subcommand.
6. `intelligence audit`, `milestone list`, and all transition commands UNCHANGED.
7. `@cadence/core` test count moves from 1048 → ~1081 (≈ 33 new tests).
8. Branch HEAD pushes clean; CI on self-hosted runner green.

## Decision Log

1. **Single-key syntax with `:desc` suffix.** Multi-key (`priority:desc,created`) was the original Slice-27-follow-on description but adds parser + test surface without a triggering use case. Stable sort + single primary key + insertion-order tie-break covers the realistic operator workflow ("sort by status, breaking ties by when I logged it"). Comma-separated multi-key is a clean follow-on if asked.
2. **`:desc` suffix, not `--sort-dir` separate flag.** Matches the compact Praxis flag style (`--filter-status`, `--filter-text`, `--reverse`). Single-flag invocation is more discoverable in `--help`.
3. **Default direction = ascending across all key types.** Even where descending feels more natural (priority — critical first; leverage — highest first), defaulting to asc is the only rule that's uniform across types. Operators wanting "highest first" type `:desc` once and remember. Mixed defaults per key would surprise.
4. **Enum sort = Zod declaration order, not alphabetical.** The Zod `z.enum([...])` declaration order in `intelligence.ts` already encodes the natural ordering for every enum we sort on (priority low-to-critical, status by lifecycle, decay by health). Alphabetical sort would be useless (`accepted < candidate` is meaningless for status). Using `z.enum.options.indexOf(value)` makes this a one-line comparator with no per-field collation table.
5. **Compose with `--reverse`, not mutex.** `--sort-by created --reverse` and `--sort-by created:desc` produce identical output; refusing one would be friction for operators who already know `--reverse`. The pipeline (filter → sort → reverse → offset → limit) keeps `--reverse`'s docstring accurate without rewording.
6. **Stable sort relies on V8 native behavior, no explicit tie-break.** Node 20+ ships V8 with stable `Array.prototype.sort`. The CADENCE `.cadence/config.json` and `package.json` already pin Node ≥20. Adding an explicit `(a, b) => idA - idB` tie-break would be dead code.
7. **Short key aliases (`leverage`/`risk`/`confidence`/`decay`/`rec`).** Typing `leverageScore` or `recommendationId` on the CLI is friction. The alias map is one-shot at parse time, the JSON output still uses the canonical field names (sort is presentation-only).
8. **`undefined` sorts last in asc / first in desc.** Only `recommendationId` on `IntelligenceDecision` admits undefined (untied decisions; Slice 28 design). "Last in asc" is the intuitive read for "least specified value comes after specified ones." The `:desc` flip is the natural inverse. Same rule applied uniformly avoids per-key undefined-handling decisions.
9. **No shared `sort.ts` helper across the three commands.** ~15 LoC per command × 3 = ~45 LoC duplicated. Lower friction than introducing a shim file the test surface would have to mirror. Same anti-scope call as Slice 34.3's no-`from-rec.ts` decision. Factor when a fourth command needs sort.
10. **Sort applies once, after filters, before reverse.** Stage placement is non-negotiable: filtering before sort is asymptotically cheaper (sort on a smaller set), and reverse-after-sort lets `--reverse` keep its prior contract ("reverse the entry order after filters") without a special case. `--offset`/`--limit` apply last so pagination operates on the final order operators see.
11. **`milestone list` excluded.** That command emits all milestones with `--json` only — no filter pipeline, no `--reverse`, no `--offset`/`--limit`. Adding `--sort-by` alone there would be asymmetric. A future slice giving milestone list a full list pipeline can include sort.
12. **`readiness` deferred from rec keys.** Fifth enum on rec list would push the rec menu to 10 keys and add another set of tests. Operators searching for "ready" recommendations have `--filter-status` (which captures the active-lifecycle subset) — `readiness` sort isn't pulling weight yet. Cheap follow-on if requested.

## Follow-On

- **Multi-key sort** (`--sort-by status,created:desc`): clean comma-split extension if real operator workflows want secondary keys beyond what insertion-order tie-break provides.
- **`readiness` as a sortable key** on rec list: add when an operator triggers.
- **`--sort-by` on `milestone list`** — requires giving milestone list a filter/reverse/offset/limit pipeline first (its own slice's worth of design).
- **`--sort-by` on `intelligence audit` finding list output** — different shape (categorized output, not flat list); separate concern.
- **Locale-aware text sort** (`Intl.Collator`) — if operators ship multilingual titles and want natural locale order. Default JS compare is locale-independent (predictable).
- **Reconcile Slice-24/25/26/27/28/31/32/33 § Follow-On `--sort-by` entries** in the docs commit (strike-through with reference to Slice 35).
