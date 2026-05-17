---
phase: 38-spec-draft-autoseed
id: 38-01
tier: standard
status: PENDING
---

# 38-01 — SPEC→DRAFT auto-seed

## Objective

`cadence draft new <phase> <num>` auto-seeds the new DRAFT's Objective + Acceptance Criteria (lossless, incl. each AC's name) from the sibling same-id `APPROVED` `<id>-SPEC.md` via a pure `renderDraftBody`; byte-identical legacy scaffold + warn-fallback when no/non-APPROVED/unparseable SPEC; never refuses; additive only.

## Acceptance Criteria

### AC-1: pure renderDraftBody + frontmatterStatus
Given a new pure module `parse/draft-scaffold.ts`
When `renderDraftBody(phase,id,tier,title,spec?)` is called with no `spec`
Then it returns a string byte-identical to the pre-#1b inline scaffold; with a `spec` it seeds `## Objective` = `spec.objective` and `## Acceptance Criteria` = each `### <id>: <name>` + Given/When/Then, Tasks/Boundaries placeholder, title from the arg; and `frontmatterStatus(raw)` returns the frontmatter status (undefined if none)

### AC-2: draft new seeds from the sibling approved SPEC
Given a sibling same-id `<id>-SPEC.md` with frontmatter `status: APPROVED`
When `cadence draft new <phase> <num>` runs
Then the DRAFT is seeded with the SPEC's Objective + all ACs (id/name/GWT) and stdout prints `draft new: seeded objective + N AC(s) from approved SPEC <id>`

### AC-3: non-approved / unparseable / absent fallback
Given a sibling SPEC that is not `APPROVED`, or `APPROVED` but unparseable, or absent
When `cadence draft new` runs
Then a non-`APPROVED` SPEC warns `present but not APPROVED`, an unparseable `APPROVED` SPEC warns `APPROVED but unparseable`, an absent SPEC is silent, all produce the empty placeholder scaffold, `draft new` never refuses, and state transitions are unchanged

### AC-4: additive shared-type name, no other surface
Given the shared `AcceptanceCriterionZ`
When `name: z.string().default('')` is added and `spec-parser` populates it from the AC head
Then every existing Spec/Draft/Plan producer/consumer stays back-compat with `name` empty, only the one exact-`.toEqual` `spec-parser.test.ts` expectation changes, and there is no `state.json`/`config`/`gates/engine.ts` change and no new flag/loop-position/anomaly

### AC-5: docs + roadmap
Given the feature is implemented
When documentation is updated
Then DESIGN.md gains a §10 punchlist item and its §4.1 Spec-stage note is updated, CHANGELOG.md gains an Added entry, and `.cadence/ROADMAP.md` marks #1b delivered Phase 38.1 with sequence `#6 #2 #1 #4 #1b` complete bar parked items

## Tasks

### T1: additive AcceptanceCriterionZ.name + spec.test back-compat
- files: `packages/types/src/plan.ts`, `packages/types/tests/spec.test.ts`
- action: add `name: z.string().default('')` after `id` in `AcceptanceCriterionZ`; add two AC-4-named back-compat cases to `spec.test.ts` (absent name defaults empty; populated round-trips)
- verify: `pnpm -C packages/types test && pnpm -C packages/types build`
- done: AC-4

### T2: spec-parser populates name + update the one existing test
- files: `packages/core/src/parse/spec-parser.ts`, `packages/core/tests/parse/spec-parser.test.ts`
- action: capture the AC head group 2 into `name` in `parseAcceptanceCriteria`; update the one exact `.toEqual` AC expectation to include `name`
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run parse/spec-parser`
- done: AC-4

### T3: pure renderDraftBody + frontmatterStatus (TDD + byte-identical lock)
- files: `packages/core/src/parse/draft-scaffold.ts`, `packages/core/tests/parse/draft-scaffold.test.ts`
- action: create the pure module (legacy scaffold lifted verbatim for no-spec; seeded branch; frontmatterStatus); TDD with the byte-identical lock + seed/empty-name/multi-AC + frontmatterStatus cases
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run parse/draft-scaffold`
- done: AC-1

### T4: wire draft new probe + integration + regression
- files: `packages/core/src/cli/commands/draft.ts`, `packages/core/tests/cli/draft-new-seed.test.ts`
- action: add 2 imports; replace the inline body line with the sibling-SPEC probe delegating to renderDraftBody (approved/PENDING/unparseable/absent); add 4-path spawned-CLI integration test; re-run existing draft-parser + draft tests unchanged
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run cli/draft-new-seed parse/draft-scaffold parse/spec-parser parse/draft-parser cli/draft`
- done: AC-2, AC-3

### T5: docs + ROADMAP
- files: `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`
- action: DESIGN §10 punchlist item + §4.1 Spec-stage note update; CHANGELOG Added; ROADMAP #1b delivered + sequence complete
- verify: `git diff --stat -- DESIGN.md CHANGELOG.md .cadence/ROADMAP.md`
- done: AC-5

### T6: full gate + two-commit settle
- files: `DESIGN.md`
- action: run the full `pnpm turbo run lint typecheck test build` gate, substantive feat commit, `settle run --auto`, settle commit
- verify: full gate 16/16 green; Settled 38-01; loop IDLE
- done: AC-1, AC-2, AC-3, AC-4, AC-5

## Boundaries

- DO NOT modify `packages/core/src/parse/draft-parser.ts` — same shape but deliberately unchanged (its ACs get empty `name` via the Zod default; a true no-op).
- DO NOT modify `packages/types/src/spec.ts` — `SpecZ.acceptanceCriteria` inherits the field via `z.array(AcceptanceCriterionZ)`.
- DO NOT change `state.json`, `config`, or `gates/engine.ts`; no new flag, loop position, or anomaly type.
- DO NOT seed the title (stays from `--title`), SPEC Constraints into Boundaries, Tasks, or Open Questions — Objective + ACs only.
- DO NOT add a `--from-spec` decoupling flag — strict same-id only.
- DO NOT break the byte-identical contract: `renderDraftBody` with no spec MUST equal the pre-#1b inline scaffold exactly.
- DO NOT edit existing draft-parser / plan.test / draft-command tests — only `spec-parser.test.ts`'s one exact-`.toEqual` line changes.
- DO NOT add `profile:` or `requiredSkills:` frontmatter to this DRAFT (`38-01` is auto×standard by design).
