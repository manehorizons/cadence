---
phase: 94-config-edit-core
id: 94-94
tier: complex
status: PENDING
---

# 94-94 — config edit pure core — field registry, parse, assemble/diff/validate, render, wizard

## Objective

Build the pure, I/O-free core of `cadence config edit` (slice C): a curated editable-field
registry, choice parsing, config assembly/diff/validation, prompt rendering, and an
injectable `runWizard` orchestrator — fully unit-tested via scripted callbacks.

## Acceptance Criteria

### AC-1: editable-field registry
Given the `config-edit/fields.ts` module
When the registry is read
Then it holds exactly the curated 5 fields (profile, loopEnforcement, acDiscipline,
commitCadence, verifier) each with non-empty label/help and ≥2 choices, and each field's
`current()` returns the active value from a config (including nested `verifier.provider`).

### AC-2: field resolution + did-you-mean
Given `resolveField`/`nearestField`
When a canonical name, the `enforcement` alias, or mixed casing is passed
Then `resolveField` returns the right field (null for unknown), and `nearestField` suggests
a close miss only.

### AC-3: choice parsing + re-prompt
Given `parseChoice` and the wizard loop
When input is a valid index, empty, or invalid
Then a valid index yields `{value}`, empty yields `{keep}`, invalid yields `{error}`, and the
wizard re-prompts the same field on an error before advancing.

### AC-4: lifted setPath/coerce shared with config set
Given the lifted `setPath`/`coerce` in `config-edit/apply.ts`
When `cadence config set` is rewired to import them
Then `config get`/`config set` behave exactly as before (regression tests green) and no inline
copy remains in `config.ts`.

### AC-5: assemble + diff
Given `assembleConfig`/`diffConfig`
When an answer map is applied
Then `assembleConfig` returns a non-mutating clone with the dotted answers set, and
`diffConfig` lists only the changed curated keys as `{key, from, to}`.

### AC-6: validate names the offending field
Given `validateCandidate`
When a candidate is valid or invalid
Then a valid candidate returns `{ok:true, config}` and an invalid one returns
`{ok:false, field, message}` naming the offending field.

### AC-7: pure prompt rendering
Given `renderPrompt`/`renderChanges`
When rendering a field or a change list
Then `renderPrompt` shows the label, numbered choices, and marks the current value, and
`renderChanges` shows each `key  from → to`.

### AC-8: injectable wizard orchestrator
Given `runWizard(config, fields, io, {ask, confirm})`
When driven with scripted `ask`/`confirm`
Then a confirmed change returns `{status:'apply', config, changes}`; all-keep or decline
returns `{status:'noop'}` (decline does not re-write; all-keep never calls confirm); an
invalid assembled value returns `{status:'invalid', field, message}`; and a narrowed field
list walks only those fields. No real I/O occurs.

## Tasks

### T1: Field registry
- files: `packages/core/src/config-edit/fields.ts`, `packages/core/tests/config-edit/fields.test.ts`
- action: Per plan Task 1 — `EditableField`/`FieldChoice` types, `EDITABLE_FIELDS` (curated 5), `FIELD_ALIASES`, `resolveField`, `nearestField` (Levenshtein, mirrors explain.ts).
- verify: `pnpm --filter @manehorizons/cadence-core test -- config-edit/fields.test.ts` green.
- done: AC-1, AC-2

### T2: Choice parsing
- files: `packages/core/src/config-edit/parse.ts`, `packages/core/tests/config-edit/parse.test.ts`
- action: Per plan Task 2 — `parseChoice(input, field): {value}|{keep}|{error}`.
- verify: `pnpm --filter @manehorizons/cadence-core test -- config-edit/parse.test.ts` green.
- done: AC-3

### T3: Assemble / diff / validate + lifted helpers
- files: `packages/core/src/config-edit/apply.ts`, `packages/core/tests/config-edit/apply.test.ts`
- action: Per plan Task 3 — lifted `setPath`/`getPath`/`coerce`; `assembleConfig`, `diffConfig` (+`ConfigChange`), `validateCandidate` (+`ValidationResult`).
- verify: `pnpm --filter @manehorizons/cadence-core test -- config-edit/apply.test.ts` green.
- done: AC-5, AC-6

### T4: Re-point config set at shared helpers
- files: `packages/core/src/cli/commands/config.ts`
- action: Per plan Task 4 — delete inline `getPath`/`setPath`/`coerce`, import from `config-edit/apply.js`; leave `get`/`set` bodies otherwise unchanged.
- verify: `pnpm --filter @manehorizons/cadence-core test -- cli/config.test.ts` green; `typecheck` clean; no inline copy remains.
- done: AC-4

### T5: Pure prompt rendering
- files: `packages/core/src/config-edit/render.ts`, `packages/core/tests/config-edit/render.test.ts`
- action: Per plan Task 5 — `renderPrompt(field, config)`, `renderChanges(changes)`.
- verify: `pnpm --filter @manehorizons/cadence-core test -- config-edit/render.test.ts` green.
- done: AC-7

### T6: Wizard orchestrator
- files: `packages/core/src/config-edit/wizard.ts`, `packages/core/tests/config-edit/wizard.test.ts`
- action: Per plan Task 6 — `runWizard(config, fields, io, {ask, confirm})` → `WizardResult`; `Ask`/`Confirm` types; re-prompt loop via `parseChoice`; assemble→validate→diff→confirm.
- verify: `pnpm --filter @manehorizons/cadence-core test -- config-edit/wizard.test.ts` green; full `test`+`typecheck`+`lint` green.
- done: AC-8

## Boundaries

- DO NOT add any runtime dependency (no `@inquirer/*`); the readline glue is phase C2.
- DO NOT do real I/O in the `config-edit/` modules — no readline, no `process`, no fs. The
  wizard takes injected `ask`/`confirm`.
- DO NOT import concept/help text from `cli/` into the pure core (no dependency inversion);
  author field help locally in `fields.ts`.
- DO NOT change gate semantics, the config schema, or `config set`'s observable behavior.
- DO NOT touch `config-explain/` (slice A) — it is reused as-is in phase C2, not here.
