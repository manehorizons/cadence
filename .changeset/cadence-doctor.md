---
"@manehorizons/cadence-core": minor
"@manehorizons/cadence-types": minor
"@manehorizons/cadence-host-claude-code": minor
---

Add `cadence doctor` — diagnose a project's CADENCE setup (phase 56).

A new deterministic, offline, report-only command that health-checks a project
and reports each finding as `ok`/`warning`/`error` with a remediation hint:
Node floor, `.cadence/` + config validity, state-file integrity, the
`.githooks` pre-push gate (`core.hooksPath`), Claude Code managed hooks, and —
the check this directly earned — slash-command run-line portability (no
machine-absolute paths). Human output by default, `--json` for scripting/CI;
exits non-zero only on `error`-severity findings so it is usable as a CI gate.
`cadence-types` and `cadence-host-claude-code` are bumped only to keep the three
public packages in lockstep; neither changed.
