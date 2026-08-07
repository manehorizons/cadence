---
"@thomas-powers-jr/cadence-core": minor
---

Added a new `cadence doctor` check, `roadmap-currency`, that reports drift between the highest phase number under `.cadence/phases/` and the highest phase number referenced in `ROADMAP.md`/`MILESTONES.md` — an anti-recurrence mechanism for the 113-phase/6-week ROADMAP drift fixed in PR #321.

Drift is computed against the lower of the two reference files (using only files that contain at least one `Phase N` heading — a file with zero matches is excluded from the comparison, never treated as `0`, so a consumer repo that only maintains one of the two files doesn't warn forever). `severity: 'warning'` when drift exceeds 10 phases, `'ok'` otherwise, and `fixId: null` always — generating roadmap prose is deliberately not automated. The check silently passes on a fresh consumer repo (no phases yet, or `ROADMAP.md` still the `init` stub), and degrades to a best-effort "not determinable" `ok` on any unexpected read failure rather than throwing.
