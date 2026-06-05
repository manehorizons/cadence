---
phase: 59-brief-resume
id: 59-01
tier: standard
status: PENDING
---

# 59-01 — Drift-decides brief/full resume output

## Objective

Make `cadence resume` cheap by default — emit a brief payload (key sections, no live-context recompute) when live state matches the handoff doc, and the full doc + context only when state has drifted or the caller forces it.

## Acceptance Criteria

### AC-21: Brief extraction keeps actionable sections, drops heavy ones
Given a rendered SESSION doc with TL;DR / State / CADENCE context / What landed / Carry-forward gotchas / Next action sections
When it is reduced to brief form
Then the output retains TL;DR, State on handoff, Carry-forward gotchas, and Next action, and omits the CADENCE context block and the What-landed narrative.

### AC-22: Resume auto-promotes to full output on drift
Given a handoff doc whose `loop_position` differs from live `state.loopPosition`
When `cadence resume` runs with no mode override
Then it emits full output (whole doc + a freshly recomputed `runContext` packet) and reports `mode: "full"` with a non-null `drift`.

### AC-23: Explicit mode overrides the drift heuristic
Given no drift between doc and live state
When the caller passes `--full` (or `{ mode: 'full' }`)
Then full output is produced anyway; and passing `--brief` forces brief output (null context) even under drift.

### AC-27: Brief extraction degrades safely on pre-1.5 / hand-authored docs
Given a doc lacking a `## Next action` anchor
When reduced to brief form
Then a `## Quick resume commands` section is kept when present, and if none of the known brief anchors exist the full content is returned unchanged (never an empty resume).

### AC-28: Stash ref survives brief output
Given a doc with a `Stashed as: <ref>` line under `## Carry-forward gotchas`
When reduced to brief form
Then that line is preserved (so `/resume` stash-restore still works).

### AC-29: CLI defaults to brief with a full-mode pointer
Given a handoff exists and live state has not drifted
When `cadence resume` runs with no flags
Then it prints the brief sections plus a pointer advertising `cadence resume --full`, and omits the CADENCE context block.

### AC-32: `--json` carries mode; context is nullable in brief
Given a handoff exists
When `cadence resume --json` runs in brief mode
Then the payload has `mode: "brief"` and `context: null`; and `cadence resume --json --full` has `mode: "full"` with a populated `context`.

### AC-33: ResumeResult schema accepts brief/null-context and requires mode
Given the `ResumeResultZ` schema
When validating a found result
Then `context` may be null, `mode` is a required `'brief' | 'full'` enum, and a found result missing `mode` is rejected.

## Tasks

### T1: Extend the ResumeResult type
- files: `packages/types/src/handoff.ts`, `packages/types/tests/handoff.test.ts`
- action: add `mode: z.enum(['brief','full'])` and make `context` nullable on the `found: true` variant of `ResumeResultZ`.
- verify: schema test accepts brief+null-context, rejects found-without-mode; `pnpm --filter @manehorizons/cadence-types build`.
- done: AC-33

### T2: Pure brief-section extractor
- files: `packages/core/src/handoff/brief.ts` (new), `packages/core/tests/handoff/brief.test.ts` (new)
- action: `extractBriefSections(content, prefixes?)` keeps H2 sections whose header starts with a brief prefix (prefix match handles decorative headers); returns full content when none match.
- verify: unit tests for keep/drop, stash preservation, Quick-resume fallback, full-content fallback.
- done: AC-21, AC-27, AC-28

### T3: Drift-decides mode in runResume
- files: `packages/core/src/handoff/run-resume.ts`, `packages/core/tests/handoff/run-resume.test.ts`
- action: add `ResumeOptions { mode? }`; resolve `mode = opts.mode ?? (drift ? 'full' : 'brief')`; brief skips `runContext` (context null) and runs doc through `extractBriefSections`; full keeps today's behavior. Update existing AC-19 to force full.
- verify: brief-default/no-context, drift→full, explicit override tests; `pnpm --filter @manehorizons/cadence-core typecheck`.
- done: AC-21, AC-22, AC-23

### T4: CLI `--full` / `--brief` flags + pointer line
- files: `packages/core/src/cli/commands/resume.ts`, `packages/core/tests/cli/resume.test.ts`
- action: add `--full`/`--brief` options, pass `mode` through, print a brief-mode pointer line; `--json` emits `mode`. Update existing AC-25/AC-26 to force full.
- verify: brief-default+pointer test, `--json` mode/null-context test; build then run CLI tests.
- done: AC-29, AC-32

### T5: Full gate + changeset
- files: `.changeset/resume-brief-mode.md` (new)
- action: run `pnpm turbo run lint typecheck test build`; write a minor changeset for `core` + `types`.
- verify: full pipeline green.
- done: (gate task — no new AC)

### T6: Resume skill co-evolution (global file — not committed here)
- files: `~/.claude/skills/resume/SKILL.md` (global, out of repo scope)
- action: update Phase 0 step 8 to reflect brief-default + `--full` escape hatch.
- verify: manual; not test-gated.
- done: (out-of-repo — no AC)

## Boundaries

- DO NOT touch `.cadence/state.json` by hand or `git restore` it — loop transitions are live (telemetry-drift hazard).
- DO NOT alter the handoff *writer* (`run-handoff.ts` / `render-session.ts`) — this phase is read-side only; brief mode bounds what is surfaced regardless of doc size.
- DO NOT implement Surface A's SKILL.md progressive-disclosure split (separate, non-repo work); only the T6 co-evolution note.
- DO NOT sweep unrelated pre-existing uncommitted files into feature commits — stage only the specific paths each task names.
