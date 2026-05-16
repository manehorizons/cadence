---
phase: 29-tty
id: 29-03
tier: standard
status: PENDING
---

# 29-03 — 29.3 interactive/approve TTY exercise

## Objective

Exercise the manual-approve y/n prompt and the `settle run --interactive` per-AC walker on a real human-driven TTY, recording UX/correctness findings in `.cadence/shakedown/29-03-TTY.md`.

## Context

Observation-only (mirrors 29.1/29.2). Human drove a `standard × standard` scratch project. Non-TTY refusal not re-driven (prior session evidence: 29.2 / F6). Findings → later remediation phase.

## Acceptance Criteria

### AC-1: manual-approve TTY paths exercised + recorded
Given a real TTY and the `approve` gate in the set
When the y/n prompt is driven (decline, garbage, accept)
Then the refuse-leaves-state-untouched path and accept→BUILD are confirmed and any wording/feedback friction is logged verbatim.

### AC-2: interactive settle walker exercised + recorded
Given `settle run --interactive` on a real TTY
When each AC is walked (pass+note, skip)
Then the walker UX and any correctness surprises are logged verbatim with findings tagged.

## Tasks

### T1: capture + analyze the TTY transcript
- files: `.cadence/shakedown/29-03-TTY.md`
- action: record the human's verbatim approve-prompt + walker transcript; tag findings `bug|docs|ux|works-as-designed`; headline + carry-forward.
- verify: report covers both gates, AC-1/AC-2, findings tagged.
- done: AC-1, AC-2

## Boundaries

- DO NOT fix any finding here — observation-only; remediation is a later phase.
- DO NOT commit the scratch project into cadence; only `.cadence/shakedown/29-03-TTY.md` is the cadence-side artifact.
- DO NOT push without user approval.
