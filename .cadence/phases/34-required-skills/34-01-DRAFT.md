---
phase: 34-required-skills
id: 34-01
tier: standard
---

# 34-01 — required-skill enforcement gate

## Objective

A phase declares skills it must invoke (`requiredSkills` ∪ `config.skillAudit.required`); `settle run` refuses on shortfall with `--allow-skill-audit-miss` bypass + unconditional `skill-audit-miss` anomaly — closing ROADMAP open-question 23.4.

## Acceptance Criteria

### AC-1: declaration union written to state
Given no declaration mechanism for required skills
When DRAFT `requiredSkills` and/or `config.skillAudit.required` are set
Then they parse (comma/bracket/quote-tolerant; absent→undefined/default `[]`), the deduped union is written to `state.skillAudit.required`, and `Summary.skillAudit.required` is truthful (was always `[]`).

### AC-2: pure match helper
Given invoked entries may be plugin/namespace-qualified
When `satisfies(req, invoked)` runs
Then it is true iff exact OR `inv` ends with `:req`, case-sensitive, no loose-substring; `missingSkills` returns only unsatisfied; unit-tested.

### AC-3: settle refuses + bypass
Given a non-empty effective required set and telemetry on
When `settle run` finds a shortfall
Then it emits `skill-audit-miss` (severity error, context {required,invoked,missing}) and exits 1, unless `--allow-skill-audit-miss` → warn anomaly `bypassed:true` and proceeds.

### AC-4: inert + no false-refuse
Given the gate
When effective required is empty → inert pass (no anomaly, no behavior change); when non-empty but `telemetry.skillInvocations` false (or config load failed) → warn anomaly `unenforceable:true`/skip + exit 0 (never false-refuse).

### AC-5: schema bump + unconditional emission
Given the anomaly system
When the gate ships
Then `AnomalyTypeZ` gains `skill-audit-miss` (additive/back-compat old config/draft/state); no `gates/engine.ts` matrix change; emission is unconditional (NOT `anomaly-notify`-gated) — verified by a strict-profile fixture.

### AC-6: docs + ROADMAP 23.4 closed
Given the delivery
When docs update
Then DESIGN (§10 item 35 + §4.1 note), CHANGELOG (Added incl. AnomalyType bump), ROADMAP (23.4 closed at all 3 sites + sequenced v1.2 feature-expansion #2→#1→#4, #3/#5 parked) reflect it.

## Tasks

### T1: type changes
- files: `packages/types/src/anomaly.ts`, `packages/types/src/config.ts`, `packages/types/src/plan.ts`, `packages/types/tests/config.test.ts`, `packages/types/tests/plan.test.ts`
- action: `AnomalyTypeZ += 'skill-audit-miss'`; `config.skillAudit.required` (default []); `DraftZ.requiredSkills?`; back-compat schema tests
- verify: `pnpm -C packages/types test && pnpm -C packages/types build`
- done: AC-1, AC-5

### T2: skill-match pure helper
- files: `packages/core/src/verify/skill-match.ts`, `packages/core/tests/verify/skill-match.test.ts`
- action: TDD `satisfies()` (exact OR `:`-suffix, case-sensitive) + `missingSkills()`
- verify: `pnpm -C packages/core test -- run verify/skill-match` green (6)
- done: AC-2

### T3: frontmatter parse
- files: `packages/core/src/parse/draft-parser.ts`, `packages/core/tests/parse/draft-parser-required-skills.test.ts`
- action: `parseSkillList` (comma/bracket/quote tolerant) + optional spread mirroring `fm.profile`
- verify: `pnpm -C packages/core test -- run parse` green
- done: AC-1

### T4: emit helper + settle wiring + integration
- files: `packages/core/src/notify/skill-audit.ts`, `packages/core/src/cli/commands/settle.ts`, `packages/core/tests/cli/settle-skill-audit.test.ts`
- action: `emitSkillAuditMiss` (unconditional, no-throw); settle flag `--allow-skill-audit-miss` + opts-type member + null-safe resolve/check/emit/state-write
- verify: 6 paths a–f + strict-profile lock green isolated
- done: AC-3, AC-4, AC-5

### T5: docs + ROADMAP
- files: `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`
- action: DESIGN §10 item 35 + §4.1 note; CHANGELOG Added; ROADMAP 23.4 closed (3 sites) + v1.2 feature-expansion section
- verify: `git diff --stat` only the 3 docs; ROADMAP 3 sites + new section present
- done: AC-6

### T6: full gate + two-commit settle
- files: `DESIGN.md`
- action: full `pnpm turbo run lint typecheck test build` (no `--allow-missing-coverage`); substantive commit; `settle run --auto`; settle commit
- verify: 16/16 green; loop IDLE after settle; feat+settle pair
- done: AC-6

## Boundaries

- DO NOT add `requiredSkills` frontmatter to THIS draft (effective-empty ⇒ the new check is inert for its own settle — avoid bootstrapping a brand-new gate against itself).
- DO NOT add a `gates/engine.ts` DELTAS/matrix cell (declaration = opt-in).
- DO NOT gate `skill-audit-miss` emission on `anomaly-notify` (unconditional by design — strict cells lack it).
- DO NOT use `--allow-missing-coverage` at settle (this phase adds packages/** tests; coverage gate must pass).
- DO NOT `git commit` per task (two-commit convention); DO NOT `git push` (user-gated). DO NOT touch `graphify-out/`.
