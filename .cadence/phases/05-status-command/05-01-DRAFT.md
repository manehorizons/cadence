---
phase: 05-status-command
id: 05-01
tier: standard
status: PENDING
---

# 05-01 — keel status — single-screen phase context

## Objective

Add a read-only `keel status` CLI command that renders current loop
state, active draft details, per-task status, AC progression, and
recommended next action in one human-readable view.

## Acceptance Criteria

### AC-1: status command exists and is read-only
Given any `.keel/` workspace
When `keel status` runs
Then it prints loop context to stdout and never mutates state.json,
PROGRESS.json, or any other file. Exit code 0 on success.

### AC-2: idle workspace prints a useful idle banner
Given `loopPosition === 'IDLE'` (just-initialized or freshly settled)
When `keel status` runs
Then it prints the project name, "IDLE", and the next-action hint
("draft new <phase> <num> --title=…") — no fake task table.

### AC-3: BUILD shows draft + tasks + ACs
Given the workspace is in BUILD with an active draft (e.g. 04-01)
When `keel status` runs
Then output includes:
  - project name, active phase, draft id, tier, loop position
  - the draft title (parsed from DRAFT.md frontmatter / first H1)
  - each task with status (PENDING/IN_PROGRESS/DONE/FAIL/BLOCKED/ESCALATED)
    plus the AC ids it satisfies
  - each AC with a derived state: pass (all linked tasks DONE), blocked
    (any FAIL/BLOCKED), or pending (otherwise)
  - the next-action line (same string `keel progress` already produces)

### AC-4: tolerates missing PROGRESS.json
Given an active draft but no PROGRESS.json yet (just approved)
When `keel status` runs
Then it prints tasks with status PENDING, AC state pending, exit 0 —
no exception.

### AC-5: --json flag emits machine-readable structured output
Given any state
When `keel status --json` runs
Then stdout is a single valid JSON document with keys
`{ project, loopPosition, activePhase, activeDraft, tier, tasks, acs, next }`
and no stderr noise; the human renderer is bypassed.

## Tasks

### T1: status data assembler (pure)
- files: `packages/core/src/status.ts`, `packages/core/tests/status.test.ts`
- action: TDD `gatherStatus(state, draftSource, progressSource)` →
  StatusReport. Inputs are already-read state/draft/progress (no fs in
  this layer for testability). Output: project, loopPosition,
  activePhase, activeDraft, tier, draftTitle, tasks[] with status + acs,
  acs[] with derived state, next (string from progress.nextAction).
- verify: tests cover IDLE, BUILD with no progress yet, BUILD with mixed
  task statuses (some DONE, one FAIL → AC blocked), all DONE (AC pass),
  malformed draft (handles gracefully).
- done: AC-1, AC-2, AC-3, AC-4

### T2: fs-aware loader
- files: `packages/core/src/status.ts` (additional export), tests
- action: `loadStatus(root)` reads state.json + finds active DRAFT.md +
  reads PROGRESS.json (optional) and calls gatherStatus. Uses existing
  SimpleStateBackend where possible.
- verify: test against a tempRepo fixture in init/approve/build/settle
  variants.
- done: AC-1, AC-4

### T3: human renderer
- files: `packages/core/src/status.ts` (renderStatus), tests
- action: TDD `renderStatus(report): string` produces a tidy fixed-width
  text block. Sections: HEADER (project + loop), DRAFT (id + title +
  tier), TASKS (table), ACS (table), NEXT (one-line).
- verify: snapshot-style tests assert key substrings present in IDLE,
  BUILD, and mixed-status fixtures.
- done: AC-3

### T4: CLI wiring + --json
- files: `packages/core/src/cli/commands/status.ts`,
  `packages/core/src/cli/index.ts`, tests
- action: register `keel status [--json]` command. Without --json,
  call renderStatus and write to stdout. With --json, JSON.stringify the
  StatusReport (single line plus trailing newline).
- verify: integration tests spawn the built CLI against a tempRepo,
  assert human output substrings and `--json` parses to a valid object
  with expected keys.
- done: AC-1, AC-5

### T5: README + memory
- files: `README.md`, memory `project_keel.md`
- action: add `keel status` to the "Try it" section. Memory: log the
  new command.
- verify: README mentions status; memory updated.
- done: AC-1..AC-5

## Boundaries

- DO NOT mutate state.json, PROGRESS.json, or any artifact in this
  phase. Read-only by design.
- DO NOT add a new dependency for table rendering — pad with strings,
  keep core dependency-free.
- DO NOT replace `keel progress`; it stays as the terse one-line
  resolver. Status is the rich view.
- DO NOT change the StatusReport JSON shape after T4 lands without
  updating downstream consumers (none yet, but mark the JSON schema as
  v1 in comments).
