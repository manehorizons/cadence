# Design — Required-skill enforcement gate (`skillAudit.required`)

**Date:** 2026-05-16
**Status:** Approved (brainstorming) — pending spec review + implementation plan
**Context:** CADENCE v1.2 feature expansion, item #6 of the expansion survey
(`docs/superpowers/2026-05-16-cadence-expansion-survey.md`). Picked first
because it is the smallest, fully independent candidate and it **closes the
pre-existing ROADMAP 23.4 deferred open question**, whose verbatim text is:
"23.4 — `state.skillAudit.required[]` semantics: who populates it? Config?
Per-phase frontmatter? Defer to a follow-up phase if the answer isn't obvious
at 23.4-DRAFT time." (The `skill-audit-miss` anomaly + settle-enforcement is
**this design's resolution**, not part of the original question text — 23.4
asked only the populates-it/where question; 23.4's own AC-2 floated an
anomaly-at-SessionStop idea, which this design supersedes with a settle-time
check.) This is that follow-up.

## Problem

Phase 23.4 wired `state.skillAudit.invoked[]` (populated by `handleSkillInvoke`,
`packages/core/src/hooks/handlers.ts`, from `ctx.raw.skill`, gated by
`config.telemetry.skillInvocations`, dedup + FIFO-100). The `ctx.raw.skill`
signal itself is extracted by Phase 23.4's `packages/host-claude-code/src/event-map.ts`
`extractPayload` — **prior-phase territory, not touched by this phase**; #6
consumes `invoked` as already-populated and adds only the `required` side. The sibling field
`state.skillAudit.required[]` exists in the schema (`packages/types/src/state.ts`,
`emptyState` → `{ required: [], invoked: [] }`) and is copied into
`Summary.skillAudit` at settle (`packages/core/src/cli/commands/settle.ts`) —
but **nothing ever populates `required` and nothing enforces it**. It is dead.

There is no way for a phase to declare "this work must invoke skill X" and have
the loop hold it to that. The superpowers workflow's "if a skill applies you
MUST use it" discipline has no cadence-native equivalent.

## Goals

- Let a phase declare required skills, resolved from **two sources** (union):
  per-phase DRAFT frontmatter `requiredSkills` and an optional project-wide
  `config.skillAudit.required` baseline. DRAFT adds to config — same override
  spirit as `profile`.
- Make the existing inert `state.skillAudit.required` / `Summary.skillAudit.required`
  truthful (write the resolved effective set).
- Enforce at `settle run`: a shortfall emits a new `skill-audit-miss` anomaly
  **and** refuses settle, bypassable with `--allow-skill-audit-miss`.
- Be a no-op unless a phase opts in (declaring skills *is* the opt-in) — **no
  gate-matrix change**.
- Never false-refuse: if telemetry that feeds `invoked` is disabled, skip
  enforcement with a warning rather than refuse on unverifiable state.
- Fully backward-compatible (absent fields, pre-existing state.json).
- Close ROADMAP open question 23.4 and record the sequenced v1.2 backlog.

## Non-Goals (YAGNI)

Per-task skill requirements; ordering/sequence constraints between skills;
"at least N times" counts (presence only); a gate-matrix cell or
profile×tier wiring (opt-in is by declaration, not by cell); auto-invoking
missing skills; SessionStop-time enforcement (settle is the single
enforcement point — simpler than a second hook site, and matches every other
cadence gate). Survey items #1/#2/#3/#4/#5 are out of scope (backlog).

## Architecture

### Declaration (two sources, unioned)

- **`packages/types/src/plan.ts`** — `DraftZ` gains
  `requiredSkills: z.array(z.string()).optional()`. Parsed from DRAFT
  frontmatter. Absent ⇒ treated as `[]`.
- **`packages/types/src/config.ts`** — new block
  `skillAudit: z.object({ required: z.array(z.string()) })`; `defaultConfig`
  and presets get `skillAudit: { required: [] }`. (Distinct from
  `telemetry.skillInvocations`, which stays the populate-`invoked` switch.)
- **`packages/core/src/parse/draft-parser.ts`** — parse the optional
  `requiredSkills` frontmatter list (mirror how existing optional frontmatter
  like `profile` is parsed; missing key ⇒ omit/`[]`).

**Effective required set** = `unique([...config.skillAudit.required,
...(draft.requiredSkills ?? [])])`, computed at settle. Written into
`state.skillAudit.required` immediately before the `Summary` is assembled, so
`Summary.skillAudit.required` (today always `[]`) becomes the truthful
resolved set. (Backward-compat: `config.skillAudit` absent in an old
config.json ⇒ Zod default `{ required: [] }`; `requiredSkills` absent in an
old DRAFT ⇒ `[]`; old state.json `skillAudit.required` simply gets
overwritten with the resolved set at settle as today.)

### Match rule (pure helper)

New pure function (e.g. `packages/core/src/verify/skill-match.ts` or a
util module — implementer picks the lightest home consistent with existing
layout), unit-tested:

```
satisfies(req: string, invoked: string[]): boolean
  // true iff some inv in invoked where inv === req OR inv.endsWith(`:${req}`)
```

Rationale: `invoked` records raw `ctx.raw.skill` strings, which are often
plugin/namespace-qualified (`superpowers:brainstorming`, `caveman:caveman`),
while a human writes `requiredSkills: [brainstorming]`. Exact-or-namespace-
suffix match tolerates the prefix without loose substring false-positives.
Case-sensitive (skill ids are). `missing = required.filter(r => !satisfies(r, invoked))`.

### Enforcement (`settle run`)

A dedicated check inside the settle command — **not** a `Gate` union member
and **not** in `gates/engine.ts` `DELTAS`. It runs every settle, in this
order:

1. Resolve effective `required` (above). If empty ⇒ **inert pass** (the
   common case; zero behavior change for phases that declare nothing).
2. Else if `config.telemetry.skillInvocations === false` ⇒ `invoked` is never
   populated, so enforcement is unverifiable. Emit a **non-blocking warn**
   (an `skill-audit-miss` anomaly with `severity: 'warn'` and
   `context.unenforceable: true`) and **pass** (exit 0). Never refuse on
   unverifiable state.
3. Else compute `missing`. If `missing` is empty ⇒ pass. If non-empty ⇒
   emit a `skill-audit-miss` anomaly (`severity: 'error'`,
   `context: { required, invoked, missing }`) and **refuse settle (exit 1)**,
   **unless `--allow-skill-audit-miss`** is passed — then downgrade the
   emitted anomaly to `severity: 'warn'` with `context.bypassed: true` and
   continue.
4. Resolved `required` is written to `state.skillAudit.required` regardless of
   pass/refuse so the SUMMARY (when settle proceeds) and state reflect intent.

`--allow-skill-audit-miss` is a new flag on `settle run`, parallel to
`--allow-code-review-failure` / `--allow-security-audit-failure`.

### Schema bump — `AnomalyTypeZ`

`packages/types/src/anomaly.ts` — add `'skill-audit-miss'` to the
`AnomalyTypeZ` enum. This is the established additive-schema-bump pattern
(Phase 23.2 `coherence-warn`, 23.3 `loop-violation`); legacy anomaly-log
entries are operational state, not durable data. Documented in CHANGELOG.

### Anomaly emission — UNCONDITIONAL (deliberate divergence from precedent)

Emit `skill-audit-miss` through the same notifier **transport** the other
settle-side anomalies use (`selectNotifier` + the configured notify wiring),
but **NOT gated on the `anomaly-notify` gate**. This is a deliberate,
called-out divergence from `loop-violation` / `code-review-high`, which both
short-circuit when `'anomaly-notify' ∉ gateSet.gates`
(`notify/loop-violation.ts` early-return; the `settle.ts` `emitCodeReviewHigh`
guard). The `anomaly-notify` gate is **absent from every `strict` cell**
(`gates/engine.ts` `DELTAS` — strict cells never include it). Reusing that
guard here would mean a `strict`-profile phase that fails the skill
requirement **refuses settle with no audit trail at all** — directly
undercutting this feature's "auditable, opt-in by declaration, independent of
the gate matrix" purpose.

Therefore `skill-audit-miss` emission is **unconditional**: it fires on the
shortfall / unenforceable / bypass paths regardless of profile or tier,
through whatever notifier is configured, best-effort and no-throw (a missing
or failing notifier never changes the settle exit code — refusal is computed
independently of whether the anomaly write succeeded, exactly as the other
anomaly types already guarantee). Emission is profile-independent by design;
the integration tests therefore need not (and do not) pin a profile to assert
emission.

### Docs / ROADMAP

- `DESIGN.md` — §4.1 note that `required-skill` enforcement ships (settle-time,
  declaration-opt-in, not a matrix cell); §10 punchlist item 35.
- `CHANGELOG.md` `## [Unreleased] → ### Added` — the gate; and note the
  `AnomalyTypeZ` additive bump under a Changed/Added line.
- `.cadence/ROADMAP.md` — (a) mark open question **23.4 closed at BOTH
  sites**: the "Open questions" entry (the `23.4 — state.skillAudit.required[]
  semantics: who populates it? Config? Per-phase frontmatter? …` line) **and**
  the "Deferred open questions. 23.1, 23.4, 24.3, 26.2" reference in the
  Deferred-to-v1.2+ list (remove `23.4` from that enumeration / annotate it
  resolved). Resolution recorded: DRAFT frontmatter ∪ config baseline,
  settle-enforced, `skill-audit-miss` anomaly. (The skill-audit-miss-anomaly
  framing is this design's resolution, not verbatim ROADMAP text — the
  original 23.4 question only asked the populates-it/where question.) Also
  annotate the third incidental `(23.1 / 23.4 / 24.3 / 26.2)` mention in the
  v1.1 milestone-status prose so no stale-looking `23.4` reference remains
  repo-wide (cosmetic but cheap; one parenthetical "23.4 resolved — see v1.2
  feature-expansion").;
  (b) add a **v1.2 feature-expansion** section referencing the survey: #6
  delivered, then sequenced backlog **#2 (convergence primitive) → #1 (spec
  stage) → #4 (auto-remediation = 2nd attach-point of #2's engine)**, and
  **#3 (subagent exec) / #5 (research stage) parked** with the explicit
  caveat "revisit only if the host-agnostic engine anchor is reconsidered".

## Error semantics / risk

- Inert-by-default: phases declaring nothing are 100% unaffected — zero
  blast radius for the dogfood loop's own phases unless they opt in.
- No false-refuse: telemetry-off path skips with a warn, never blocks.
- Bypass parity: `--allow-skill-audit-miss` mirrors existing
  `--allow-*-failure` flags; bypass still records the miss (warn anomaly +
  `bypassed:true`) so it is auditable.
- Additive schema only; no field removed/renamed; old config/draft/state
  load unchanged.
- No `gates/engine.ts` matrix edit ⇒ no risk of perturbing the existing
  profile×tier cells or other gates.

## Testing

Vitest, in-package (`packages/**`) so the `test-coverage` gate links each AC:

- `skill-match` pure unit: exact match; namespace-suffix match
  (`brainstorming` ↔ `superpowers:brainstorming`); non-match; empty invoked;
  case sensitivity.
- config schema: `skillAudit.required` default `[]`; accepts a list;
  back-compat parse of a config.json lacking `skillAudit`.
- DRAFT parse: `requiredSkills` present → list; absent → `[]`.
- settle (spawned-CLI integration, per the project idiom): (a) effective
  empty ⇒ settle proceeds, no anomaly; (b) required satisfied ⇒ proceeds;
  (c) required shortfall ⇒ exit 1 + `skill-audit-miss` error anomaly;
  (d) shortfall + `--allow-skill-audit-miss` ⇒ proceeds, warn anomaly with
  `bypassed:true`; (e) shortfall but `telemetry.skillInvocations:false` ⇒
  proceeds, warn anomaly `unenforceable:true`, exit 0; (f) `Summary.skillAudit.required`
  equals the resolved union. Use `tempRepo` + the file notify transport
  (absolute `notify.file` path per the known fixture gotcha) to assert
  emitted anomalies. Emission is **unconditional/profile-independent** (per
  the Anomaly-emission section) — fixtures need not pin a profile to observe
  `skill-audit-miss`; a `strict`-profile fixture asserting emission-still-fires
  is worth one explicit case to lock the divergence-from-precedent.

## Acceptance criteria (for the DRAFT)

1. `DraftZ.requiredSkills?` parsed from frontmatter; `config.skillAudit.required`
   schema + default `[]`; effective = `unique(config ∪ draft)` written to
   `state.skillAudit.required` (so `Summary.skillAudit.required` is truthful).
2. Pure `satisfies` helper: exact OR `endsWith(':'+req)`, case-sensitive;
   unit-tested incl. namespace-prefixed invoked entries.
3. `settle run` refuses (exit 1) + emits `skill-audit-miss` (severity error,
   context {required,invoked,missing}) on shortfall; `--allow-skill-audit-miss`
   downgrades to warn + `bypassed:true` and proceeds.
4. Effective-empty ⇒ inert pass (no anomaly, no behavior change);
   `telemetry.skillInvocations:false` with non-empty required ⇒ warn anomaly
   `unenforceable:true` + pass (no false-refuse).
5. `AnomalyTypeZ` gains `skill-audit-miss`; additive/back-compat for old
   config/draft/state; no `gates/engine.ts` matrix change.
6. DESIGN (§4.1 + §10 item 35), CHANGELOG (Added + AnomalyType bump),
   ROADMAP (23.4 closed + sequenced v1.2 backlog #2→#1→#4, #3/#5 caveated).

## Affected files

- `packages/types/src/plan.ts` — `DraftZ.requiredSkills?`.
- `packages/types/src/config.ts` — `skillAudit.required` + default/presets.
- `packages/types/src/anomaly.ts` — `AnomalyTypeZ += 'skill-audit-miss'`.
- `packages/core/src/parse/draft-parser.ts` — parse `requiredSkills`.
- `packages/core/src/verify/skill-match.ts` (new) — `satisfies` helper.
- `packages/core/src/cli/commands/settle.ts` — resolve effective required,
  the check, `--allow-skill-audit-miss` flag, write
  `state.skillAudit.required`, emit anomaly.
- `packages/core/tests/**` — skill-match unit; config/draft schema;
  settle integration (6 paths a–f, incl. the strict-profile emission-still-fires lock).
- `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md` — docs + 23.4 close +
  v1.2 backlog.

## Build sequence (for the plan)

1. `packages/types`: `DraftZ.requiredSkills?`, `config.skillAudit`, default,
   `AnomalyTypeZ` bump; `pnpm -C packages/types build`.
2. `skill-match.ts` + unit tests (TDD-able pure fn).
3. `draft-parser.ts` parse + test.
4. `settle.ts` resolve+check+flag+emit+state-write; settle integration tests
   (6 paths a–f per the Testing section).
5. Docs: DESIGN §4.1/§10, CHANGELOG, ROADMAP (23.4 closed + v1.2 backlog).
6. Full `pnpm turbo run lint typecheck test build` green; dogfood as CADENCE
   phase `34-required-skills`/`34-01`, tier `standard`, two-commit
   convention, settle (this phase DOES add `packages/**` tests so
   `--allow-missing-coverage` is NOT needed — the test-coverage gate should
   pass normally). Push user-gated. (Future commits land under the
   pseudonymous git identity the user set repo-locally — unrelated to this
   feature, just noting the session context.)
