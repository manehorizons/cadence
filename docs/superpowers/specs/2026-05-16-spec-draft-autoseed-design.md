# Design — SPEC→DRAFT auto-seed (`#1b`)

**Date:** 2026-05-16
**Status:** Approved (brainstorming) — pending spec review + implementation plan
**Context:** CADENCE v1.2 feature-expansion, item **#1b** — the content
auto-seed explicitly deferred from #1's minimal v1 (Phase 36.1 brainstorm→spec
stage; see `docs/superpowers/specs/2026-05-16-spec-stage-design.md` §Non-Goals:
"**SPEC→DRAFT content auto-seed** (`draft new` reading the approved SPEC to
pre-fill objective/ACs — manual carry-over in v1; this is the deferred #1b)").
With #1b, v1.2 feature-expansion's only non-parked work is closed (#6✓ #2✓
#1✓ #4✓ #1b✓; #3/#5 parked, "Public release" track deferred).

## Problem

After `cadence spec approve` (the SPEC.md frontmatter flips
`status: PENDING`→`APPROVED`, `state.activeSpec` clears, loop returns to
IDLE), the operator runs `cadence draft new <phase> <num>` and gets the
**empty placeholder** scaffold (`## Objective` = `_(one sentence)_`,
`### AC-1: _(name)_` Given/When/Then placeholders). The just-approved SPEC —
which already holds a reviewed objective and full AC set for the *same*
`<id>` — is ignored. The operator hand-retypes the objective and every AC's
Given/When/Then from the SPEC into the DRAFT. Every dogfood phase that ran
the spec stage (e.g. 36-01, 37-01) paid this transcription tax, with the
usual hand-copy risks: dropped ACs, typos, Given/When/Then drift between the
reviewed SPEC and the DRAFT that is actually built.

cadence-core is host-agnostic / review-only — there is **no in-core
generator** (parked #3/#5 territory). #1b is pure *projection*: cadence
already owns both the approved SPEC and the DRAFT scaffold; it simply
carries the SPEC's objective + ACs forward instead of emitting placeholders.
No LLM, no host involvement.

## Goals

- `cadence draft new <phase> <num>` auto-seeds the DRAFT's `## Objective`
  and `## Acceptance Criteria` from the sibling **same-id** `APPROVED`
  `<id>-SPEC.md`, **losslessly** (incl. each AC's human name).
- Zero behavior change when there is no SPEC, the SPEC is not `APPROVED`,
  or it is unparseable: the scaffold is **byte-identical** to today's
  placeholder template (regression-safe for existing `draft new` /
  draft-parser consumers).
- Non-blocking: a non-`APPROVED`/unparseable sibling SPEC warns and falls
  back to the empty scaffold — `draft new` never refuses because of a SPEC.
- Visible: a seeded scaffold prints a one-line stdout notice (no silent
  magic — the operator must know the DRAFT was pre-filled).
- Additive / host-agnostic: no `state.json`, `config`, or `gates/engine.ts`
  change; no new flag; no new loop position.

## Non-Goals (YAGNI / explicitly out of scope)

- **Title seed** — the DRAFT heading/frontmatter title stays from `--title`
  (default `Untitled`), NOT the SPEC title. (User decision.)
- **SPEC `Constraints` → DRAFT `Boundaries`** — SPEC constraints (design
  constraints) ≠ DRAFT boundaries (DO-NOT scope guards); mapping risks a
  misleading seed. Excluded.
- **Task generation** — a SPEC has no tasks; the DRAFT's `## Tasks` (and
  `## Boundaries`) stay placeholder. Authoring tasks remains the honest
  manual step (cadence does not invent them — host-agnostic anchor).
- **SPEC `Open Questions`** — not a DRAFT section; dropped.
- **`--from-spec <id>` decoupling** — strict same-id only (the 1:1 dogfood
  pattern; matches the #1 deferral text "reads an approved `<id>-SPEC.md`").
- **Overwrite** — `draft new` already refuses (exit 2) if the DRAFT exists;
  seeding only ever runs on a fresh scaffold. No consumption-tracking on the
  SPEC (the same-id 1:1 mapping makes it unnecessary).
- An in-core SPEC/DRAFT generator (parked #3/#5).

## Architecture

A near-trivial projection. Two source touch-points + one shared additive
type field.

### 1. Lossless AC name — additive shared-type change

`SpecZ.acceptanceCriteria` is `z.array(AcceptanceCriterionZ)`, and
`AcceptanceCriterionZ` (`packages/types/src/plan.ts`) is the **shared** AC
shape used by Spec, Draft, and Plan: today `{ id, given, when, then }` —
**no `name`**. `parseSpecMd` (and `draft-parser`) already capture the AC
head name in regex group 2 (`/^### (AC-\d+):\s*(.*)$/`) but discard it
because the type has no slot.

Change: add `name: z.string().default('')` to `AcceptanceCriterionZ`
(additive, back-compat — the 23.2/34.1/35.1/36.1 additive-zod-default
precedent). With `.default('')`, every existing producer that builds
`{id,given,when,then}` items keeps working unchanged (Zod fills
`name: ''`); only `parseSpecMd` is updated to populate `name` from the
already-captured head group. Draft/Plan AC parsing is intentionally left
to default `name: ''` (they don't need it for #1b; out of scope, no
behavior change). Old `<id>-SPEC.md`/`<id>-PLAN.md`/`<id>-DRAFT.md` files
parse identically (missing name → `''`).

### 2. Pure `renderDraftBody` helper (Approach B)

New `packages/core/src/parse/draft-scaffold.ts`, colocated with
`draft-parser.ts`:

```
renderDraftBody(phase: string, id: string, tier: string,
                title: string, spec?: Spec): string
```

Returns the full `DRAFT.md` text (frontmatter + all sections).

- **`spec` undefined → byte-identical to today's inline template.** This is
  a hard contract: the current `const body = \`---\n…\`` literal in
  `draft new` is lifted into this helper verbatim and returned unchanged
  when no spec is supplied. (Regression lock — existing draft-new tests,
  `draft check`, and `draft-parser` round-trips must see exactly today's
  bytes.)
- **`spec` provided →** `## Objective` = `spec.objective`;
  `## Acceptance Criteria` = each `spec.acceptanceCriteria[i]` rendered
  `### <id>: <name>\nGiven <given>\nWhen <when>\nThen <then>` (blank line
  between AC blocks, matching the scaffold/parser format). `## Tasks` and
  `## Boundaries` keep the placeholder text verbatim. Frontmatter/heading
  title = the `title` arg (i.e. `--title`), never the SPEC title.

Pure, no I/O — unit-tested without spawning the CLI (mirrors the
`verify/converge.ts` / parser pattern the codebase already favors).

### 3. `draft new` probe

In the `draft new` action, after the existing `id` derivation and the
`existsSync(DRAFT) → exit 2` guard, before `writeFile`:

1. `specPath = join(cwd, '.cadence', 'phases', phase, \`${id}-SPEC.md\`)`
   (strict same-id; `id` is the existing `${phase.slice(0,2)}-${padded}` —
   identical derivation to `spec new`, so SPEC and DRAFT share `<id>`).
2. If `specPath` does not exist → `renderDraftBody(…, undefined)` (today's
   behavior, **silent**).
3. If it exists: read it; read the frontmatter `status`.
   - `status === 'APPROVED'` → `try { spec = parseSpecMd(raw);
     body = renderDraftBody(…, spec) }` then stdout
     `draft new: seeded objective + <N> AC(s) from approved SPEC <id>`.
     `catch` (malformed SPEC) → stderr
     `draft new: SPEC <id> APPROVED but unparseable (<err>) — scaffolding empty`
     then `renderDraftBody(…, undefined)`.
   - `status !== 'APPROVED'` → stderr
     `draft new: SPEC <id> present but not APPROVED — scaffolding empty`
     then `renderDraftBody(…, undefined)`.
4. `writeFile(path, body)`; the existing state transitions
   (`activePhase`/`activeDraft`/`loopPosition=DRAFT`/`openDrafts`) are
   **unchanged**.

No new flag, no refusal path, no state/config/gate change.

## Error semantics / risk

- **Highest risk:** `renderDraftBody(undefined)` MUST be byte-identical to
  the current inline scaffold literal. The legacy template string IS the
  contract (existing `draft new` tests, `draft check`, `draft-parser`
  round-trips depend on the exact bytes). A dedicated unit test asserts
  `renderDraftBody(p,i,t,title) === <legacy literal>`.
- `parseSpecMd` throw is always caught → warn + empty scaffold; `draft new`
  never breaks or refuses because of a SPEC (the "refuse" option was
  explicitly rejected).
- Additive `name` with `.default('')` → every existing Spec/Draft/Plan file
  and every existing AC producer is back-compat (missing → `''`); no
  behavior change for any current consumer.
- Strict same-id removes any cross-wiring ambiguity (no decoupling flag to
  mis-target).
- No `state.json` / `config` / `gates/engine.ts` change; no new loop
  position; no new anomaly. Smallest-surface item of the milestone.

## Testing

Vitest, in-package.

- **Pure unit** `packages/core/tests/parse/draft-scaffold.test.ts`:
  (a) `renderDraftBody(phase,id,tier,title)` (no spec) **byte-equals the
  legacy scaffold literal** (regression lock); (b) with a 1-AC spec →
  objective + `### AC-1: <name>` Given/When/Then present, Tasks/Boundaries
  still placeholder, title = arg not spec; (c) N-AC spec → all N AC blocks
  rendered in order; (d) AC with empty name → `### AC-1:` (no trailing
  junk).
- **Integration** `packages/core/tests/cli/draft-new-seed.test.ts`
  (spawned-CLI idiom): (e) approved same-id SPEC → DRAFT contains the
  objective + every AC + name; stdout has the `seeded … from approved SPEC`
  line; (f) PENDING sibling SPEC → stderr `present but not APPROVED`,
  DRAFT = empty placeholder; (g) APPROVED-but-unparseable SPEC → stderr
  `unparseable`, DRAFT = empty placeholder; (h) no SPEC → empty placeholder,
  no stderr (unchanged behavior).
- **Back-compat** `packages/types/tests/spec.test.ts` (extend): an
  acceptance criterion without `name` parses with `name === ''`; a
  populated `name` round-trips.
- **Regression:** existing `draft new` / spec-stage / draft-parser tests
  pass **unchanged** (the byte-identical-when-no-spec contract). Run the
  full `pnpm turbo run lint typecheck test build`.

## Acceptance criteria (for the DRAFT)

1. Pure `renderDraftBody(phase,id,tier,title,spec?)` in
   `parse/draft-scaffold.ts`; `spec` undefined → **byte-identical** to the
   pre-#1b inline scaffold; `spec` set → `## Objective` = `spec.objective`,
   `## Acceptance Criteria` = each AC `### <id>: <name>` + Given/When/Then,
   Tasks/Boundaries placeholder, title from the arg.
2. `draft new` seeds from the sibling **same-id** `APPROVED` `<id>-SPEC.md`
   (`parseSpecMd`) and prints `draft new: seeded objective + N AC(s) from
   approved SPEC <id>`.
3. Non-`APPROVED` sibling SPEC → stderr `present but not APPROVED —
   scaffolding empty` + empty scaffold; `APPROVED` but `parseSpecMd` throws
   → stderr `unparseable … — scaffolding empty` + empty scaffold; absent
   SPEC → empty scaffold, silent. `draft new` never refuses due to a SPEC;
   state transitions unchanged in every case.
4. `AcceptanceCriterionZ` gains `name: z.string().default('')` (additive,
   back-compat — old Spec/Draft/Plan files & all existing AC producers →
   `name: ''`, zero behavior change); `parseSpecMd` populates `name` from
   the AC head; no `state.json`/`config`/`gates/engine.ts` change, no new
   flag/loop-position/anomaly.
5. DESIGN (§10 punchlist item + the §4.1/Spec-stage note updated to record
   the auto-seed is now live, #1b no longer deferred), CHANGELOG (Added),
   ROADMAP (#1b ✓ delivered; #1 now fully delivered incl. #1b; v1.2
   feature-expansion non-parked work COMPLETE).

## Affected files

- `packages/types/src/plan.ts` — `AcceptanceCriterionZ += name:
  z.string().default('')`.
- `packages/types/tests/spec.test.ts` (and/or `plan.test.ts`) — AC `name`
  back-compat (absent → `''`; populated round-trips).
- `packages/core/src/parse/spec-parser.ts` — `parseAcceptanceCriteria`
  populates `name` from the existing head group 2.
- `packages/core/src/parse/draft-scaffold.ts` — **new**: pure
  `renderDraftBody` (legacy literal lifted verbatim + the seeded branch).
- `packages/core/src/cli/commands/draft.ts` — `draft new` probes the
  sibling SPEC and delegates body construction to `renderDraftBody`
  (the inline `const body = \`…\`` literal moves into the helper).
- `packages/core/tests/parse/draft-scaffold.test.ts` — **new** (pure unit,
  incl. the byte-identical lock).
- `packages/core/tests/cli/draft-new-seed.test.ts` — **new** (integration
  paths e–h).
- `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md` — docs + #1b ✓.

## Build sequence (for the plan)

1. `packages/types`: `AcceptanceCriterionZ += name` (additive default);
   extend the spec/plan schema test for back-compat; build types.
2. `spec-parser.ts`: capture the AC head name into `name`; build core.
3. `draft-scaffold.ts`: lift the legacy scaffold literal verbatim into pure
   `renderDraftBody`; add the seeded branch; pure unit test incl. the
   **byte-identical-when-no-spec** lock (TDD).
4. `draft.ts`: replace the inline `const body` with the sibling-SPEC probe
   + `renderDraftBody` call (same-id, status check, try/catch, the stdout
   /stderr lines); integration test (paths e–h); re-run the existing
   `draft new` / spec-stage / draft-parser tests — must stay green
   unchanged.
5. Docs: DESIGN §10 item + §4.1/Spec-stage-note update, CHANGELOG Added,
   ROADMAP #1b ✓ (and #1 fully delivered; v1.2 feature-expansion non-parked
   COMPLETE).
6. Full `pnpm turbo run lint typecheck test build` green (the whole
   pre-push hook — 32.2/35.1/36.1 lesson; the byte-identical contract +
   any draft-parser/drift guards are invisible to spec/plan review).
   Dogfood as CADENCE phase `38-spec-draft-autoseed`/`38-01`, tier
   `standard`, `auto×standard` (no gate bootstrap), two-commit convention;
   adds `packages/**` tests → settle **without** `--allow-missing-coverage`.
   Push user-gated; commits under the pseudonymous git identity.
