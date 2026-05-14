---
phase: 13-profile-system
id: 13-01
tier: standard
status: PENDING
---

# 13-01 — profile system foundation

## Objective

Land the user-involvement profile system (`strict` / `standard` / `auto`) and a gate-firing engine that, given (tier × profile), returns the set of gates that must run. This phase wires the foundation; later phases (14–17) hook real gate implementations into it.

## Acceptance Criteria

### AC-1: profile in config + DRAFT frontmatter
Given a project initialized with CADENCE
When `.cadence/config.json` is inspected
Then it carries a `profile` field of type `strict | standard | auto` (default `auto`), validated by `CadenceConfigZ`. DRAFT frontmatter accepts an optional `profile:` override — when present, the per-phase value wins; when absent, the project default applies.

### AC-2: tier inference + override
Given a DRAFT.md is parsed
When the parser runs
Then `tier` is read from frontmatter (`quick-fix | standard | complex`, default `standard`); an AI-proposed tier is permitted (no enforcement here), and the value is exposed on the parsed `Draft` type.

### AC-3: gate-firing engine returns the matrix-defined gate set
Given functions `effectiveProfile(state, draft)` and `gatesFor(tier, profile)`
When called with any (tier × profile) combination
Then they return a typed `GateSet` whose members are the exact deltas from DESIGN.md Section 4.2 (plus the always-fire free gates), and reject unknown tier/profile values at parse time via Zod.

### AC-4: soft cap on `auto × complex` surfaces
Given profile=`auto` and tier=`complex` on a phase
When the CLI computes `gatesFor`
Then the result includes a `softCap: true` marker; commands that gate on it (later phases) refuse without the explicit `--allow-auto-complex` flag. This phase ships only the marker; refusal logic lives where each gate fires.

### AC-5: per-command profile/tier visibility
Given any CADENCE CLI subcommand
When run in a CADENCE-managed repo
Then `cadence status` reports the active profile + tier on its own header line; `cadence config get profile` / `set profile <strict|standard|auto>` round-trip through `.cadence/config.json`.

### AC-6: backward compatibility
Given existing `.cadence/config.json` and DRAFT.md files that pre-date this phase (no `profile:` field anywhere)
When CADENCE reads them
Then they parse cleanly with defaults applied (`profile=auto`, `tier=standard`), no migration prompt, no breaking error. All 196 existing tests continue to pass.

## Tasks

### T1: Zod types for profile + GateSet
- files: `packages/types/src/profile.ts` (new), `packages/types/src/config.ts`, `packages/types/src/index.ts`, `packages/types/tests/profile.test.ts` (new), `packages/types/tests/config.test.ts`
- action: Add `ProfileZ = z.enum(['strict','standard','auto'])`. Add `TierZ` if not already present (`quick-fix | standard | complex`). Define a `Gate` enum covering every gate name from DESIGN.md Section 4.1 (e.g. `'coherence-check'`, `'test-coverage'`, `'draft-read'`, `'approve'`, `'anomaly-notify'`, `'per-task-verify'`, `'code-review'`, `'plan-review'`, `'security-audit'`, `'deep-verify'`, `'interactive-verdict'`). Define `GateSetZ = z.object({ gates: z.array(GateZ), softCap: z.boolean() })`. Extend `CadenceConfigZ` with `profile: ProfileZ.default('auto')`. Tests cover parse + reject + default fallback.
- verify: vitest green; existing config tests still pass with defaults.
- done: AC-1, AC-3, AC-6

### T2: DRAFT frontmatter `profile:` override + parser
- files: `packages/core/src/parse/draft-parser.ts`, `packages/core/src/parse/draft-parser.test.ts` (or wherever DRAFT tests live), `packages/types/src/plan.ts` (if `Draft` schema needs the field)
- action: Extend the `Draft` schema with optional `profile?: Profile`. Update the YAML-ish frontmatter parser to read `profile:` when present. Add round-trip tests: absent (no field on parsed object), `profile: strict`, `profile: invalid-value` (parser rejects).
- verify: vitest green; coherence check still works on existing DRAFTs (which have no `profile:`).
- done: AC-1

### T3: gate-firing engine
- files: `packages/core/src/gates/engine.ts` (new), `packages/core/tests/gates/engine.test.ts` (new)
- action: Implement `effectiveProfile(state, draft): Profile` (draft frontmatter wins over config). Implement pure `gatesFor(tier, profile): GateSet` returning the exact deltas from DESIGN.md Section 4.2: always-fire gates + per-cell additions. Set `softCap: true` only for `(complex, auto)`. Table-driven; one test per cell (3 × 3 = 9 cases) plus boundary cases.
- verify: vitest green; cell results match DESIGN.md Section 4.2 exactly.
- done: AC-2, AC-3, AC-4

### T4: `cadence status` shows profile + tier
- files: `packages/core/src/status.ts`, `packages/core/tests/status.test.ts`
- action: Add `profile` and `tier` to the gathered `StatusReport` (already has `tier`; add `profile` derived via `effectiveProfile`). Render a new header line: `profile: auto`. JSON output adds the field. Tests for IDLE + BUILD + interaction with explicit override in DRAFT frontmatter.
- verify: vitest green; snapshot/regex assertions on the new header line.
- done: AC-5

### T5: `cadence config get/set profile` round-trip
- files: `packages/core/src/cli/commands/config.ts`, `packages/core/tests/cli/config.test.ts`
- action: Wire `cadence config get profile` (prints current value) and `cadence config set profile <strict|standard|auto>` (writes through `CadenceConfigZ`, atomic write). Reject invalid values with non-zero exit + clear stderr. Tests cover both verbs + invalid value rejection.
- verify: vitest green; reading after writing returns the written value.
- done: AC-5, AC-6

### T6: backward-compat smoke + suite green
- files: (no edits; verification only)
- action: Run `pnpm turbo run test` against the full suite. Verify 196 → ~210+ tests (gains from T1–T5 additions). Spot-check that an old DRAFT with no `profile:` field still parses + coherence-checks. Spot-check that an old `.cadence/config.json` (no `profile` field) still loads with `auto` default.
- verify: full suite green; manual smoke against the keel-now-cadence repo.
- done: AC-6

## Boundaries

- DO NOT implement any actual gate behavior in this phase. T1–T5 stand up the *plumbing*; gates fire in Phases 14–17.
- DO NOT change `settle --auto` semantics here (Phase 14 owns that).
- DO NOT enforce the soft cap in this phase — just expose the `softCap` marker so later phases can read it.
- DO NOT auto-prompt the user on `cadence init` to pick a profile — default to `auto` silently. UX prompts can come later.
- DO NOT touch the cadence-dashboard sibling project — it's a consumer; profile/tier are upstream-only concerns.
- DO NOT migrate existing `.cadence/config.json` files. Defaults handle the missing field cleanly per AC-6.
