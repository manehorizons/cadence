---
phase: 53-cadence-scout
id: 53-01
tier: standard
status: PENDING
---

# 53-01 — Add /cadence-scout host slash command (ideation dialogue → Praxis recs)

## Objective

Add a twelfth Claude Code slash command, `/cadence-scout`, installed by
`cadence-host-claude-code`: a host-side divergent→convergent ideation dialogue
that lands survivors as Praxis recommendations via the existing
`cadence recommendation add` CLI. Zero core-engine change — no new gate, loop
position, record type, or `cadence-types` change. (Design: Option A in
`docs/superpowers/specs/2026-06-02-cadence-scout-design.md`.)

## Acceptance Criteria

### AC-1: scout installs as the twelfth managed command
Given a fresh `.claude/commands/` install
When `installCommands(root)` runs
Then `cadence-scout.md` is written alongside the existing 11 (12 total), tagged
with the `<!-- managed-by: cadence -->` marker.

### AC-2: the scout body encodes the dialogue contract
Given the rendered `cadence-scout.md`
When its content is read
Then it orients via an auto-run `!cadence recommend`, instructs the
divergent→convergent dialogue (generate candidates → triage with the user), and
lands each survivor via `cadence recommendation add` with an inline provenance
`--evidence` note. It never transitions loop state / runs a gate.

### AC-3: scout carries valid frontmatter + respects user-override idempotency
Given the rendered file and the existing install idempotency rules
When read / re-installed over a user-customized `cadence-scout.md`
Then scout has frontmatter (`description`, `argument-hint`, `allowed-tools:
Bash(cadence:*), Read`); and a marker-less user override survives re-install
(no regression to the existing idempotency contract).

### AC-4: docs announce scout and its Praxis hand-off
Given `docs/concepts.md` and `docs/reference/commands.md`
When the host-command material is read
Then both mention `/cadence-scout` and that it feeds the Praxis rec ledger
(rather than driving the loop directly).

## Tasks

### T1: Extend renderer + register the scout spec
- files: `packages/host-claude-code/src/install-commands.ts`
- action: Add an optional `body?: string` to `CommandSpec`; in `renderFile`,
  render `body` (the dialogue prompt) after the `!`-orient line when present.
  Add the `cadence-scout` spec: `cli: 'recommend'` (orient auto-run),
  `argumentHint: '[topic]'`, and a `body` carrying the orient→diverge→converge→
  land→hand-back contract, landing survivors with `cadence recommendation add`
  + a provenance `--evidence` note.
- verify: `pnpm --filter @manehorizons/cadence-host-claude-code typecheck` + tests
- done: AC-1, AC-2, AC-3

### T2: Tests (TDD — write first, watch fail)
- files: `packages/host-claude-code/tests/install-commands.test.ts`
- action: Update the directory-listing test to 12 entries (+`cadence-scout.md`);
  add a scout test asserting the orient line (`!cadence recommend`), the
  dialogue-contract phrases, the `cadence recommendation add` land step, and
  frontmatter/marker. Add an AC-4 doc-contract test reading `docs/concepts.md`
  + `docs/reference/commands.md` for the `/cadence-scout` mention.
- verify: `pnpm --filter @manehorizons/cadence-host-claude-code test`
- done: AC-1, AC-2, AC-3, AC-4

### T3: Docs
- files: `docs/concepts.md`, `docs/reference/commands.md`
- action: Add a `/cadence-scout` line in the host-commands material of each —
  what it does (ideation dialogue) and that it lands recs in Praxis, never
  drives the loop.
- verify: grep shows `/cadence-scout` in both docs
- done: AC-4

## Boundaries

- DO NOT add a `cadence scout` core CLI subcommand, a new gate, a new loop
  position, or a new ledger record type. Scout reuses `recommendation add` /
  `recommend` as-is.
- DO NOT change `cadence-types` or any `packages/core` source.
- DO NOT alter the existing 11 commands' specs or the user-override idempotency
  logic beyond the additive `body` field.
