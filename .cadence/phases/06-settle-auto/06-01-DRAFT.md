---
phase: 06-settle-auto
id: 06-01
tier: standard
status: PENDING
---

# 06-01 — keel settle --auto derives AC verdicts from task statuses

## Objective

Stop requiring every AC to be mapped manually on `keel settle run`. The
same derivation `keel status` already computes (linked tasks DONE → AC
pass, blocked task → AC blocked, otherwise pending) becomes the source
of truth for AC verdicts when `--auto` is passed.

## Acceptance Criteria

### AC-1: --auto derives AC verdicts from task statuses
Given a workspace in BUILD with all linked tasks DONE
When `keel settle run --auto` runs
Then the resulting SUMMARY records every AC as pass, no `--ac` flag
required.

### AC-2: --auto refuses on blocked/pending ACs without --force
Given a workspace where at least one AC is `blocked` (linked task
BLOCKED/NEEDS_CONTEXT) or `pending` (linked task PENDING/IN_PROGRESS)
When `keel settle run --auto` runs
Then the command exits non-zero with a clear message listing the
blocker ACs and which tasks are responsible. No SUMMARY is written;
state remains BUILD.

### AC-3: --auto --force settles anyway, recording verdicts honestly
Given the same blocked/pending state
When `keel settle run --auto --force` runs
Then the SUMMARY is written; blocked ACs are recorded as fail with a
derived note ("auto: task TN BLOCKED"), pending ACs as fail with note
"auto: tasks incomplete". Exit 0.

### AC-4: explicit --ac flags still work and override --auto for that id
Given `keel settle run --auto --ac AC-1=fail:custom reason`
When the command runs
Then AC-1 is recorded as fail with the custom note even though
derivation says pass; other ACs use the derived verdict.

### AC-5: no regression to existing --ac flow
Given the legacy invocation `keel settle run --ac AC-1=pass --ac AC-2=fail:x`
When it runs
Then behavior is byte-equivalent to today (no --auto applied,
no derivation engaged).

## Tasks

### T1: deriveAcResults helper
- files: `packages/core/src/status.ts` (add export),
  `packages/core/tests/status.test.ts` (extend)
- action: TDD `deriveAcResults(state, draft, progress)` returning an
  array of `{ id: string; verdict: 'pass'|'blocked'|'pending'; blockers: string[] }`
  where `blockers` lists task IDs that prevent a pass. Reuse the
  derivation already in gatherStatus.
- verify: tests cover all-DONE, mixed (one BLOCKED, rest DONE), all
  PENDING, NEEDS_CONTEXT, and "AC has no linked tasks" edge case.
- done: AC-1, AC-2

### T2: wire --auto and --force into settle CLI
- files: `packages/core/src/cli/commands/settle.ts`
- action: add `--auto` and `--force` options. When `--auto`:
  - compute deriveAcResults
  - for every AC not already in `opts.ac` map, append derived result
    (`pass` → `AC-N=pass`; `blocked`/`pending` → fail with auto-note,
    only when --force; otherwise abort early with helpful stderr).
  - error path lists offending ACs and the task IDs causing the block.
- verify: unit test the merge logic if extracted; otherwise rely on
  CLI integration tests.
- done: AC-1, AC-2, AC-3, AC-4

### T3: CLI integration tests
- files: `packages/core/tests/cli/settle-auto.test.ts`
- action: TDD with tempRepo fixtures:
  - happy path: all tasks DONE → `settle run --auto` → SUMMARY has
    pass verdicts for every AC
  - blocked path: one task BLOCKED → `settle run --auto` → exit 1,
    stderr names the AC and task; state still BUILD; no SUMMARY file
  - force path: same blocked state + `--force` → SUMMARY written with
    fail verdicts; exit 0; state IDLE
  - override path: `--auto --ac AC-1=fail:custom` overrides derivation
  - legacy path: `--ac` only still works exactly as before
- verify: each test asserts both SUMMARY content (or its absence) and
  state.json transitions.
- done: AC-1..AC-5

### T4: README + memory update
- files: `README.md`, memory `project_keel.md`
- action: README "Try it" snippet uses `settle run --auto`. Add a
  short note: `--ac` overrides for any individual ACs, `--force` to
  settle past blockers. Memory: log the addition.
- verify: README shows the new snippet; memory updated.
- done: AC-5

## Boundaries

- DO NOT change SUMMARY.md or summary JSON schema. Only how
  acResults gets populated.
- DO NOT alter task status semantics (BLOCKING vs PASS task sets stay
  in sync with status.ts).
- DO NOT remove the legacy --ac path. --auto is additive.
- DO NOT touch state machine outside settle (still IDLE after success).
