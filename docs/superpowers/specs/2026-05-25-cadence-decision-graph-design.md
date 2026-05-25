# CADENCE `cadence decision graph <id>` — Design

**Date:** 2026-05-25
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 29 (Slice-28 follow-on; ASCII chain viewer over the `supersededBy` graph introduced in Slice 28)
**Predecessor slice docs:**
- [`2026-05-21-cadence-decision-supersededby-design.md`](2026-05-21-cadence-decision-supersededby-design.md) (Slice 28 — `§ Follow-On` listed `cadence decision graph <id>`)

## Summary

**Slice 29** adds a new `cadence decision graph <id>` subcommand that prints the supersession lineage of a decision: ancestors (decisions whose `supersededBy === <id>`, walked transitively as a tree) and descendants (the linear forward chain reached by following `supersededBy` hop-by-hop). Pure read; no writes. Terminal output uses CADENCE's existing markdown-bullet vocabulary in two sections (`## Supersedes` / `## Superseded by`); `--format json` emits a structured envelope with nested ancestors + flat descendants. Cycles in persisted data (manual JSON edits) are tolerated via a `seen`-set safety belt — the walker truncates and marks the offending node `(cycle)`. Broken forward links render `(not found)` per Slice-28/16 convention. Slice 28's `walkSupersededByChain` helper stays module-private (its `forbid`-parameter contract is shaped for cycle-refusal, not enumerate-and-emit); this slice uses its own inline forward walk and a sibling `walkAncestorTree` helper, both with shared `seen` sets.

- **New subcommand.** `cadence decision graph <id>` joins `add | show | list | supersede | rescind | reactivate`. No new top-level command — CLI-reference drift guard UNCHANGED.
- **Two-section terminal output.** `## Supersedes` (ancestors, indented bullets, transitive tree) + `## Superseded by` (descendants, arrow chain starting from `<id>`). Empty sections print `(none)`.
- **Ancestors walk is transitive and branching.** Each ancestor is a decision whose `supersededBy` points to the current node; the walker recurses with a shared `seen` set.
- **Descendants walk is transitive and linear.** Inline `while (cursor)` loop following `supersededBy` hop-by-hop with its own `seen` set; emits `cycle` and `missingId` markers (which Slice-28's `walkSupersededByChain` doesn't, by design). `store.ts` stays byte-equal to Slice 28.
- **JSON envelope.** Nested ancestors tree + flat descendants array, both carrying full `IntelligenceDecision` entities. Cycle nodes carry `cycle: true`; broken forward links carry `missingId: <id>` (no `decision` field).
- **No writes.** Pure read over `decisions.json`.

## Product Boundary

Read only. No writes to any artifact.

## Scope

### In scope

- `@cadence/types`: new `DecisionAncestor` + `DecisionDescendant` + `DecisionGraph` types co-located with `IntelligenceDecisionZ` in `packages/types/src/intelligence.ts` (or a sibling export). Pure data shapes; no Zod schemas needed (these are output types, not persisted).
- `packages/core/src/intelligence/graph-decision.ts` (new): `buildDecisionGraph(ledger, id): DecisionGraph` — pure builder. Walks forward via an inline `while (cursor)` loop with `seen`-set cycle detection; walks backward via a new internal `walkAncestorTree` helper that does inverse-supersededBy lookup with its own shared `seen` set. Both walkers tolerate pre-existing cycles by marking the revisited node `cycle: true` and stopping.
- `packages/core/src/intelligence/render-decision-graph.ts` (new): `renderDecisionGraph(graph): string` — pure renderer. Emits the two-section markdown.
- `packages/core/src/cli/commands/decision.ts`: new `graph <id>` subcommand registered alongside existing subcommands. Mirrors `show` handler shape (read ledger → call builder → format).
- CHANGELOG entry under `### Added` (per Slice-28 precedent).
- Predecessor reconciliation: strike `cadence decision graph <id>` from Slice-28 `§ Follow-On`.
- Tests per ACs.

### Out of scope

- `intelligence audit` integrity dim for stale `supersededBy` refs (handoff candidate #3 — separate slice).
- Bidirectional `Decision.supersedes: dec-X[]` derived backfill (handoff candidate #4 — separate slice).
- `--max-depth N` flag (YAGNI for v1; revisit if real chains get long).
- `--reverse` flag (semantically meaningless — direction is intrinsic to each section).
- Updating `docs/reference/commands.md` (pre-existing drift, untouched per Slice-28 precedent).
- `recommendation graph` / `assumption graph` symmetry (those subjects don't have supersession links).
- `decision show --graph` flag (deliberately a separate subcommand; `show` is the deep-dive single-record view, `graph` is the chain view — distinct purposes).
- Any change to the loop, `state.json`, `STATE.md`, or `cadence spec new` paths.

## Architecture

### MODIFIED files

- `packages/types/src/intelligence.ts` — new output types (`DecisionAncestor`, `DecisionDescendant`, `DecisionGraph`).
- `packages/core/src/cli/commands/decision.ts` — new `graph <id>` subcommand registered.

### NEW files

- `packages/core/src/intelligence/graph-decision.ts` — `buildDecisionGraph` pure builder.
- `packages/core/src/intelligence/render-decision-graph.ts` — `renderDecisionGraph` pure renderer.
- `packages/core/tests/intelligence/graph-decision.test.ts` — builder unit tests.
- `packages/core/tests/intelligence/render-decision-graph.test.ts` — renderer unit tests.
- `packages/core/tests/cli/decision-graph.test.ts` — CLI spawn tests.

### Untouched

- All other ledger schemas (recommendation/evidence/assumption/milestone).
- `applyDecisionTransition` / `runDecisionTransition` (Slice-28 surface unchanged).
- `render-decision.ts` / `render-decision-detail.ts` (existing surfaces unchanged).
- `intelligence reconcile` (graph is a read-only viewer; no MD regeneration involved).
- `docs/reference/commands.md` (drift acknowledged; Slice-28 precedent honored).
- CLI-reference drift guard test (graph is sub-subcommand of `decision`, not a top-level command).

## Implementation Pattern

### Data shapes

```ts
// packages/types/src/intelligence.ts (appended)

export type DecisionAncestor = {
  decision: IntelligenceDecision;
  ancestors: DecisionAncestor[]; // empty if cycle-truncated or natural leaf
  cycle?: true;                  // present only when walker truncated here on revisit
};

export type DecisionDescendant =
  | { decision: IntelligenceDecision; cycle?: true }
  | { missingId: string };       // forward link points to non-existent id

export type DecisionGraph = {
  decision: IntelligenceDecision;
  ancestors: DecisionAncestor[];
  descendants: DecisionDescendant[];
};
```

`cycle: true` is set, never `false` (exact-optional, matches Slice 28).

### Builder: `buildDecisionGraph`

```ts
// packages/core/src/intelligence/graph-decision.ts

import type {
  DecisionAncestor,
  DecisionDescendant,
  DecisionGraph,
  IntelligenceDecision,
  IntelligenceDecisionLedger,
} from '@cadence/types';
function walkAncestorTree(
  ledger: IntelligenceDecisionLedger,
  currentId: string,
  seen: Set<string>,
): DecisionAncestor[] {
  // Direct inverse-supersededBy lookup
  const direct = ledger.decisions.filter((d) => d.supersededBy === currentId);
  const out: DecisionAncestor[] = [];
  for (const d of direct) {
    if (seen.has(d.id)) {
      out.push({ decision: d, ancestors: [], cycle: true });
      continue;
    }
    const nextSeen = new Set(seen);
    nextSeen.add(d.id);
    out.push({
      decision: d,
      ancestors: walkAncestorTree(ledger, d.id, nextSeen),
    });
  }
  return out;
}

export function buildDecisionGraph(
  ledger: IntelligenceDecisionLedger,
  id: string,
): { ok: true; graph: DecisionGraph } | { ok: false; error: string } {
  const root = ledger.decisions.find((d) => d.id === id);
  if (!root) return { ok: false, error: `decision ${id} not found` };

  // Forward (descendants): linear chain via inline walk.
  // Why not the Slice-28 helper? `walkSupersededByChain` is shaped for cycle-REFUSAL
  // (it returns `ok: false` when the chain would hit a forbidden id) and stops silently
  // on missing-id. Here we need to EMIT both signals to the consumer; inline is honest.
  const descendants: DecisionDescendant[] = [];
  let cursor: string | undefined = root.supersededBy;
  const seen = new Set<string>([root.id]);
  while (cursor) {
    if (seen.has(cursor)) {
      // cycle: the next node IS already on the path. Find the entity (it exists,
      // since cycles imply revisiting a real ledger entry) and emit it with cycle: true.
      const node = ledger.decisions.find((d) => d.id === cursor);
      if (node) descendants.push({ decision: node, cycle: true });
      break;
    }
    const node = ledger.decisions.find((d) => d.id === cursor);
    if (!node) {
      descendants.push({ missingId: cursor });
      break;
    }
    descendants.push({ decision: node });
    seen.add(cursor);
    cursor = node.supersededBy;
  }

  // Backward (ancestors): transitive tree.
  const ancestors = walkAncestorTree(ledger, root.id, new Set([root.id]));

  return { ok: true, graph: { decision: root, ancestors, descendants } };
}
```

### Renderer: `renderDecisionGraph`

```ts
// packages/core/src/intelligence/render-decision-graph.ts

import type {
  DecisionAncestor,
  DecisionDescendant,
  DecisionGraph,
} from '@cadence/types';

function renderAncestorBullets(nodes: DecisionAncestor[], depth: number): string[] {
  const lines: string[] = [];
  const indent = '  '.repeat(depth);
  for (const n of nodes) {
    if (n.cycle) {
      lines.push(`${indent}- ${n.decision.id} (cycle)`);
      continue;
    }
    lines.push(`${indent}- ${n.decision.id} — ${n.decision.title} (${n.decision.status})`);
    lines.push(...renderAncestorBullets(n.ancestors, depth + 1));
  }
  return lines;
}

function renderDescendantsChain(rootId: string, descendants: DecisionDescendant[]): string {
  if (descendants.length === 0) return '(none)';
  const parts: string[] = [rootId];
  for (const d of descendants) {
    if ('missingId' in d) {
      parts.push(`${d.missingId} (not found)`);
      break;
    }
    if (d.cycle) {
      parts.push(`${d.decision.id} (cycle)`);
      break;
    }
    parts.push(d.decision.id);
  }
  return parts.join(' → ');
}

export function renderDecisionGraph(graph: DecisionGraph): string {
  const { decision, ancestors, descendants } = graph;
  const lines: string[] = [];
  lines.push(`# ${decision.id} — ${decision.title} (${decision.status})`);
  lines.push('');
  lines.push('## Supersedes');
  if (ancestors.length === 0) {
    lines.push('(none)');
  } else {
    lines.push(...renderAncestorBullets(ancestors, 0));
  }
  lines.push('');
  lines.push('## Superseded by');
  lines.push(renderDescendantsChain(decision.id, descendants));
  lines.push('');
  return lines.join('\n');
}
```

### CLI

```ts
// packages/core/src/cli/commands/decision.ts (registration appended)

cmd
  .command('graph <id>')
  .description('Show the supersession chain (ancestors + descendants) for a decision')
  .option('--format <format>', 'Output format: terminal | json', 'terminal')
  .action(async (id: string, opts: { format?: string }) => {
    try {
      const format = opts.format ?? 'terminal';
      if (format !== 'terminal' && format !== 'json') {
        process.stderr.write(`decision graph failed: unsupported format: ${format}\n`);
        process.exitCode = 1;
        return;
      }
      const decLedger = await readIntelligenceDecisionLedger(process.cwd());
      const res = buildDecisionGraph(decLedger, id);
      if (!res.ok) {
        process.stderr.write(`decision graph failed: ${res.error}\n`);
        process.exitCode = 1;
        return;
      }
      if (format === 'json') {
        process.stdout.write(JSON.stringify(res.graph, null, 2) + '\n');
        return;
      }
      const md = renderDecisionGraph(res.graph);
      process.stdout.write(md);
      if (!md.endsWith('\n')) process.stdout.write('\n');
    } catch (err) {
      process.stderr.write(
        `decision graph failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exitCode = 1;
    }
  });
```

Mirrors the `show` handler structure exactly: read ledger → call pure builder → format. No new error-handling shape, no new I/O pattern.

### Terminal output examples

Isolated decision (no links):

```
# dec-A — only decision (active)

## Supersedes
(none)

## Superseded by
(none)
```

Forward chain only:

```
# dec-C — title (superseded)

## Supersedes
(none)

## Superseded by
dec-C → dec-F → dec-K
```

Branching ancestors (transitive):

```
# dec-C — title (active)

## Supersedes
- dec-X — second attempt (superseded)
  - dec-A — original idea (rescinded)
  - dec-B — parallel attempt (rescinded)
- dec-Y — direct replacement (superseded)

## Superseded by
dec-C → dec-F → dec-K
```

Ancestor cycle (manually injected):

```
## Supersedes
- dec-X — entry (superseded)
  - dec-Y — middle (superseded)
    - dec-X (cycle)
```

Broken forward link:

```
## Superseded by
dec-C → dec-F → dec-Z (not found)
```

## Acceptance Criteria

| AC | Statement | Linked test |
|---|---|---|
| AC-1 | `cadence decision graph <id>` (default `--format terminal`) on an isolated decision → prints `# <id> — <title> (<status>)` + `## Supersedes\n(none)` + `## Superseded by\n(none)`. Exit 0. | CLI tests |
| AC-2 | `<id>` not in ledger → exit 1 + `decision graph failed: decision <id> not found` on stderr; no stdout. | CLI tests |
| AC-3 | Linear forward chain (D1→D2→D3, run on D1) → `## Superseded by` line reads `D1 → D2 → D3`. | render + CLI tests |
| AC-4 | Direct backward only (D1→D2, D3→D2, run on D2) → `## Supersedes` lists `- D1 — …` + `- D3 — …` at depth 0 (no indentation). | render + CLI tests |
| AC-5 | Transitive backward (D1→D2→D3, D4→D2, run on D3) → `## Supersedes` shows `- D2 — …` with two-space-indented children `- D1 — …` and `- D4 — …`. | render + CLI tests |
| AC-6 | Backward cycle (D1.supersededBy=D2, D2.supersededBy=D1, run on D1) → `## Supersedes` shows `- D2 — … (superseded)` at depth 0 with `- D1 (cycle)` indented at depth 1 (D1 is the revisited node, not D2). No infinite loop. | builder + render tests |
| AC-7 | Forward cycle (same data, run on D1, forward direction) → `## Superseded by` reads `D1 → D2 → D1 (cycle)` and stops. | builder + render tests |
| AC-8 | Broken forward link (D1.supersededBy=D9, D9 not in ledger, run on D1) → `## Superseded by` reads `D1 → D9 (not found)`. Walk stops. | render + CLI tests |
| AC-9 | `--format json` envelope shape: `{ decision: <full entity>, ancestors: [{ decision, ancestors, cycle?: true }, …], descendants: [{ decision, cycle?: true } \| { missingId }, …] }`. Nested ancestors, flat descendants. | CLI tests |
| AC-10 | JSON `cycle: true` present only on the node where the walker truncated (exact-optional; never `cycle: false`). | builder tests |
| AC-11 | JSON `missingId` discriminates broken forward links from cycle-truncated ones (cycle keeps a full `decision` field; missing does not). | builder + CLI tests |
| AC-12 | Invalid `--format` value → exit 1 + `decision graph failed: unsupported format: <value>`. | CLI tests |
| AC-13 | `docs/reference/commands.md` UNCHANGED. Phase-31.1 drift guard UNCHANGED. Slice-28 `store.ts` surface (including module-private `walkSupersededByChain`) UNCHANGED. | `tests/docs/cli-reference.test.ts` + `store.test.ts` |
| AC-14 | Slice-28 `§ Follow-On` `cadence decision graph <id>` entry struck and annotated as shipped Slice 29. | manual grep / docs commit |

## Testing

- **Pure unit tests on `buildDecisionGraph`** (`packages/core/tests/intelligence/graph-decision.test.ts`, new):
  - Isolated decision → empty ancestors + empty descendants
  - Linear forward chain
  - Direct-only backward (one hop)
  - Transitive backward tree (multi-hop, branching)
  - Backward cycle → cycle marker on revisited node, walk stops
  - Forward cycle → cycle marker on revisited node, walk stops
  - Broken forward link → missingId marker, walk stops
  - Missing root id → `{ ok: false, error: 'decision <id> not found' }`
  - Fixtures = in-memory `IntelligenceDecisionLedger` objects; no disk.
- **Pure unit tests on `renderDecisionGraph`** (`packages/core/tests/intelligence/render-decision-graph.test.ts`, new):
  - Each of the above cases renders correctly
  - Empty sections render `(none)`
  - Indentation depth (two spaces per level)
  - Status annotation in headers and bullets
  - Arrow-chain format starts from `<id>`
  - `(cycle)` and `(not found)` markers
- **CLI spawn tests** (`packages/core/tests/cli/decision-graph.test.ts`, new):
  - Happy path (terminal mode) with mixed ancestors + descendants
  - Missing root id → exit 1 + stderr message
  - Invalid `--format` → exit 1 + stderr message
  - `--format json` envelope shape
  - Built CLI required (per Slice-26 gotcha: build → test).
- **Existing tests unchanged**: `packages/core/tests/intelligence/store.test.ts` (Slice 28 coverage; verifies AC-13 — store.ts surface untouched).
- **Done-bar**: full `pnpm turbo run lint typecheck test build` green (16/16).

## Commit Convention

```
docs: design — decision graph viewer (Praxis Slice 29)
feat(core): decision graph viewer (Slice 29)
docs: document decision graph + reconcile Slice-28 follow-ref (Slice 29)
```

Three commits, per Praxis convention.

## Success Criteria

1. All 14 ACs pass.
2. Full turbo gate green (16/16).
3. Slice-28 `§ Follow-On` `cadence decision graph <id>` entry reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. CLI-reference drift guard UNCHANGED.
6. Slice-28 `store.ts` surface UNCHANGED (no `export` promotion, no signature change).
7. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **New subcommand, not a flag on `show`.** `show` is the single-record deep-dive ("everything about THIS decision"); `graph` is the lineage view ("how does THIS connect to others"). Conflating them via `--graph` would muddle two distinct mental models and bloat `show`'s envelope. Separate subcommand keeps each one focused.
2. **Two sections, not a tree drawing.** ASCII tree characters (`└─`, `├─`) appear nowhere else in CADENCE renderers; introducing them here would create a one-off convention. The two-section bulleted format reuses the exact vocabulary `DECISIONS.md` and `decision show` already speak. Honest about the data asymmetry: ancestors can branch (bullet list with indentation), descendants are strictly linear (arrow chain).
3. **Transitive ancestor walk (not direct-only).** The operator question is "what's the lineage of this decision" — answered better by one command showing the whole tree than by requiring the operator to manually walk hop-by-hop. The `seen`-set safety belt (already proven in Slice 28) makes transitive cheap and cycle-safe.
4. **Nested ancestors JSON, flat descendants JSON.** Mirrors the data shape: ancestors are a tree, descendants are a chain. Consumers that want a flat ancestor list can `.flat(Infinity)` themselves; consumers that want the tree get it for free. Lying via flat would force every consumer to re-derive structure from `supersededBy` fields.
5. **Forward walk inline, not via Slice-28's `walkSupersededByChain`.** The helper is shaped for cycle *refusal* — it takes a `forbid` id and returns `{ ok: false }` when the chain reaches it; it also stops silently on missing-id. Slice 29 needs the opposite: *emit* cycle and missing-id signals to the consumer for rendering. Forcing the helper to do both would warp its surface and risk breaking Slice 28's existing call site. The inline walk is ~12 lines, self-contained, and keeps `store.ts` byte-equal to its Slice-28 state.
6. **`cycle: true` on the truncated-at node; `missingId` only on broken forward links.** Cycle keeps a `decision` field (the entity exists, just already visited); missing drops `decision` because we have no entity to attach. This makes the JSON shape self-describing — consumers branch on `'missingId' in d` for descendants and `n.cycle` for ancestors.
7. **No `--max-depth` flag.** YAGNI. Real chains are short (most decisions have 0–2 supersession links). The `seen` set already prevents runaway. Adding the flag would introduce a knob with no current use case.
8. **No `--reverse` flag.** Semantically meaningless — direction is intrinsic to each section (ancestors go backward, descendants go forward). `--reverse` on `list` reverses *order*, not *direction*; here there's no order to reverse.
9. **`docs/reference/commands.md` UNCHANGED.** Pre-existing drift from Slice 13 onward (the `decision` section still lists only `add` and `list`). Per Slice-28 precedent, the per-slice docs commit updates CHANGELOG and follow-on references; `commands.md` reconciliation is a separate concern. Acknowledged in `§ Follow-On` of this design.
10. **`recommendation` and `assumption` have no `graph` symmetry.** Those subjects don't carry supersession links — no chain to walk. Symmetry would be cargo-cult.
11. **No `intelligence audit` integration this slice.** A future audit dimension can flag stale `supersededBy` refs (referent deleted) and superseded-without-`supersededBy` soft hints (handoff candidate #3). The graph viewer surfaces the same drift signals visually (`(not found)`) but doesn't *enumerate* them — that's audit's job.

## Follow-On

- **`intelligence audit` integrity dim for `supersededBy`** — stale references + superseded-without-link soft hints. Reuses `walkSupersededByChain`.
- **Bidirectional `Decision.supersedes: dec-X[]` derived backfill** — mirror Slice 11's `assumptionIds`/`decisionIds` pattern; would let `decision show` surface the inverse link without re-walking the ledger.
- **`docs/reference/commands.md` reconciliation** — sweep the entire `decision` subcommand table (Slice 13/16/26/27/28/29 cumulative drift).
- **Rec↔phase linkage** — biggest remaining scope (handoff candidate #1; needs upstream design).
- **Bulk transitions** (`cadence assumption validate --all-rec <recId>`).
- **`--sort-by <field>`** stable sort with multi-key.
- **`--filter-regex <pattern>`** / **`--filter-text-exact`**.
- **`--include-untied`** on decision list.
