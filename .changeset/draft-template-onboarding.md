---
"@manehorizons/cadence-core": minor
"@manehorizons/cadence-types": minor
"@manehorizons/cadence-host-claude-code": minor
"@manehorizons/cadence-host-codex": minor
---

Add first-real-task DRAFT templates for `cadence draft new --template`.

`bugfix`, `feature`, and `refactor` templates now generate editable Objective,
Acceptance Criteria, Tasks, and Boundaries sections from the supplied title,
while preserving the legacy scaffold whenever `--template` is omitted. The
template path works with auto-derived phase ids and explicit phase/task ids, and
unknown template names refuse before writing a DRAFT.

The README, quickstart, CLI guide, and command reference now show template
commands as the first-real-DRAFT path after tutorial/demo onboarding. The host
adapter and types packages carry version-alignment bumps only.
