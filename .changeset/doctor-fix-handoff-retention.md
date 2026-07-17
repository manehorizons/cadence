---
'@manehorizons/cadence-core': minor
---

`cadence doctor --fix` now auto-remediates the `handoff-retention` check: when `handoff.retain` is unset and the `.cadence/handoff/` SESSION-doc archive has grown past the existing warn threshold, `--fix` sets `handoff.retain` to the default (10) and immediately prunes the archive down to that budget, reusing the existing `pruneHandoffDir`/`selectPrunable` retention primitives and always preserving the active `lastHandoff` doc. Previously this check only printed guidance. Fulfils a narrowed slice of rec-20260709-002; the other manual doctor checks (`worktree-phases`, `verification-readiness`, `recommendation-shipped-drift`, `coverage-mode-language-support`) remain manual since each requires a genuine judgment call `--fix` cannot safely auto-decide.
