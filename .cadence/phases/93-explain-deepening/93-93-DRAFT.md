---
phase: 93-explain-deepening
id: 93-93
tier: standard
status: PENDING
---

# 93-93 — deepen cadence explain — concept connections + config concept + cross-links

## Objective

Turn `cadence explain`'s four standalone concepts into a connected graph — add an
explicit profile × tier → gate-set connection, a fifth `config` concept that bridges
to `cadence config explain`, and reciprocal cross-links — so a reader learns the model,
not four flashcards.

## Acceptance Criteria

### AC-1: a `config` concept is advertised and explainable
Given the embedded concept registry
When a user runs `cadence explain config` (or the alias `configuration`)
Then it prints a non-empty body that names `cadence config explain` as the way to see
their own active config, and the bare `cadence explain` list includes `config`.

### AC-2: the profile × tier → gate-set connection is taught
Given the `profiles`, `tiers`, and `gates` concept bodies
When a user reads any of them
Then the prose states that profile (involvement) combined with tier (size) selects the
effective gate set, and points to `cadence config explain` for the concrete set computed
from the reader's own config.

### AC-3: concepts cross-link reciprocally into a graph, not a list
Given any concept body
When a user reads it
Then it ends with a "See also" line naming related concepts, and every concept is
reachable from at least one other concept's cross-links (no orphan node).

### AC-4: the coverage + connection guards hold
Given the explain test suite
When it runs
Then every advertised concept (now five) has non-empty blurb + body (AC-5 drift guard),
`config` resolves via its alias and casing, an unknown concept still yields a
did-you-mean nudge, and a new assertion verifies the profile × tier → gate-set
connection prose is present.

## Tasks

### T1: Add the `config` concept + alias to the registry
- files: `packages/core/src/cli/commands/explain.ts`
- action: Add a `config` entry to `CONCEPTS` (blurb + body) describing CADENCE's
  configuration surface at a high level and pointing the reader at `cadence config explain`
  (curated active-config view) and `cadence config explain <field>` / `--all` for detail;
  add `configuration` (and `cfg`) → `config` to `ALIASES`. Update the command's
  `[concept]` argument help and description to mention `config`.
- verify: `node packages/core/bin/cadence.cjs explain` lists `config`; `... explain config`
  and `... explain configuration` both print the body.
- done: AC-1

### T2: Wire the profile × tier → gate-set connection + reciprocal cross-links
- files: `packages/core/src/cli/commands/explain.ts`
- action: Enrich the `profiles`, `tiers`, and `gates` bodies with explicit prose that
  profile (user-involvement axis) × tier (phase-size axis) selects the effective gate set,
  and that `cadence config explain` shows the concrete set for the reader's own config.
  Ensure every concept's "See also" line cross-links related concepts so the five form a
  connected graph (loop ↔ gates/tiers/profiles; gates/tiers/profiles ↔ each other; config
  ↔ profiles/gates).
- verify: each of `loop|gates|tiers|profiles|config` body contains a "See also" line; the
  gate-set connection appears in the `gates`/`profiles`/`tiers` prose.
- done: AC-2, AC-3

### T3: Extend the explain test suite for the new concept + connection
- files: `packages/core/tests/cli/explain.test.ts`
- action: Add `config` to the `CANONICAL` list and a distinctive matcher for it (mentions
  `config explain`); add an AC-1-style print assertion for `config`; add an alias/casing
  case for `configuration`/`Config`; add a new assertion that the profile × tier → gate-set
  connection prose is present in at least one of `profiles`/`tiers`/`gates`. AC-5's
  registry-wide non-empty guard already covers the new concept — keep it.
- verify: `pnpm --filter @manehorizons/cadence-core test -- cli/explain.test.ts` green.
- done: AC-4

### T4: Sync docs to the deepened concept set
- files: `docs/reference/commands.md`
- action: Update the `### explain` section's `[concept]` argument row and behavior prose to
  list `config` as a concept and note that concepts cross-link (profile × tier → gate set,
  with `cadence config explain` for the reader's concrete set). Keep the AC-5 coverage-guard
  note accurate.
- verify: `grep -n "config" docs/reference/commands.md` shows the updated explain section;
  prose matches the registry.
- done: AC-1

## Boundaries

- DO NOT make `cadence-core` import concept text from another layer or invert the
  pure-core → cli dependency; the embedded registry stays the source of truth in
  `explain.ts` (the phase-91 `config-explain` renderer authored its own one-liners
  precisely to avoid this — leave that deviation as-is, do not try to unify it here).
- DO NOT change gate semantics, the config schema, or `cadence config explain`'s behavior;
  this is concept *prose* only.
- DO NOT touch `config-explain/` or `config.ts` — slice B is `explain` deepening, not
  config tooling.
- Keep content **embedded** (no runtime file reads); preserve the AC-5 non-empty guard.
