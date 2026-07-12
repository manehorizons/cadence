---
'@manehorizons/cadence-host-claude-code': patch
---

Fix `installHooks()` silently discarding third-party `.claude/settings.json` content when the file is present but not valid JSON — the root cause of the earlier deja-hooks-wiped incident (31f1351 / PR #170), which was previously only hand-patched at the data level, never at the install-time source. A `JSON.parse` failure on an existing file now throws a descriptive refusal instead of resetting to `{}` and overwriting; `ENOENT` (no file yet) is unaffected and still creates a fresh file. Every successful write (fresh install or merge) now backs up the prior file's raw content to a timestamped `settings.json.bak-<ts>` before writing, and writes atomically via a same-directory temp file + `rename()` instead of an in-place `writeFile`.
