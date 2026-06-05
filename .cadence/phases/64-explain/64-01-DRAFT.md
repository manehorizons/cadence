---
phase: 64-explain
id: 64-01
tier: standard
status: PENDING
---

# 64-01 — cadence explain <concept> — in-CLI concept help

## Objective

Add a `cadence explain [concept]` command that prints curated, terminal-sized
explanations of CADENCE's core concepts (loop, gates, tiers, profiles) from
content embedded in the binary — so users learn the model without leaving the
terminal or depending on the `docs/` tree being shipped.

## Acceptance Criteria

### AC-1: Named concept prints its explanation
Given a registered concept name (`loop`, `gates`, `tiers`, or `profiles`)
When the user runs `cadence explain <concept>`
Then the command prints that concept's curated explanation to stdout and exits 0.

### AC-2: Bare invocation lists available concepts
Given no concept argument
When the user runs `cadence explain`
Then the command prints the available concept names each with a one-line blurb,
and exits 0 (a discovery affordance, not an error).

### AC-3: Unknown concept lists concepts with a did-you-mean nudge
Given an unrecognized concept argument (e.g. `gatez`)
When the user runs `cadence explain gatez`
Then the command prints a "no such concept" line plus the available-concept list
(and a nearest-match "did you mean `gates`?" suggestion when one is close), and
exits non-zero.

### AC-4: Aliases and case are normalized
Given an alias or differently-cased name (`gate`, `Profiles`, `TIER`)
When the user runs `cadence explain <alias>`
Then the command resolves it to the canonical concept and prints that
explanation (e.g. `gate` → `gates`, `profile` → `profiles`, `tier` → `tiers`).

### AC-5: Every canonical concept is covered (drift guard)
Given the registry of canonical concepts the command advertises in its list
When the coverage test enumerates them
Then each one returns non-empty explanation body text — so a concept can never be
listed but left without content (mirrors the `commands.md` drift guard).

## Tasks

### T1: Write failing tests for the explain command
- files: `packages/core/tests/cli/explain.test.ts`
- action: Drive the command via the testkit CLI harness (see `tutorial.test.ts`
  for the pattern). Cover AC-1 (each of the four concepts prints body text),
  AC-2 (bare list + blurbs, exit 0), AC-3 (unknown → list + nudge, non-zero
  exit), AC-4 (alias + case normalization), AC-5 (iterate the registry and
  assert non-empty bodies). Reference each `AC-N` token in the test text for the
  test-coverage gate.
- verify: `pnpm --filter @manehorizons/cadence-core test -- explain.test.ts` —
  fails (command not yet registered).
- done: AC-1, AC-2, AC-3, AC-4, AC-5

### T2: Implement the explain command module
- files: `packages/core/src/cli/commands/explain.ts`
- action: Export `registerExplainCommand(program)`. Define a `CONCEPTS` registry
  (canonical name → `{ blurb, body }`) with curated content for `loop`, `gates`,
  `tiers`, `profiles` distilled from `docs/concepts.md` (the loop positions; the
  13-gate universe / always-fire + delta bands; the three tier scopes; the three
  profiles). Add an alias map and case-insensitive lookup. Bare invocation →
  list; unknown → list + nearest-match suggestion (simple Levenshtein/startsWith)
  on stderr, non-zero exit. Route output through the shared `CommandIO`/
  `processIO` seam used by sibling commands so tests can capture it.
- verify: `pnpm --filter @manehorizons/cadence-core test -- explain.test.ts` passes.
- done: AC-1, AC-2, AC-3, AC-4

### T3: Register the command
- files: `packages/core/src/cli/register.ts`
- action: Import and call `registerExplainCommand(program)` alongside the others.
- verify: `node packages/core/bin/cadence.cjs explain loop` prints the loop
  explanation; `cadence explain` lists concepts.
- done: AC-1, AC-2

### T4: Document `explain` in the CLI reference
- files: `docs/reference/commands.md`
- action: Add `explain` inside the `<!-- cadence:commands:start/end -->` marker
  block and a `### explain` section (usage, the concept list, behavior, exit
  codes) in the same style as `### tutorial`. Required by the
  `cli-reference.test.ts` drift guard.
- verify: `pnpm --filter @manehorizons/cadence-core test -- cli-reference.test.ts`
  passes.
- done: AC-1

## Boundaries

- DO NOT read `docs/` (or any file) at runtime — concept content is embedded.
- DO NOT touch the gate engine, presets, or any other command's behavior.
- DO NOT bump any package version — phase 64 rides the next release bundle.
- DO NOT add new runtime dependencies; nearest-match can be a tiny local helper.
