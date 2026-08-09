---
"@thomas-powers-jr/cadence-core": minor
---

Added `cadence summary verify-all`, an in-process sweep that walks every `<id>-SUMMARY.json` under `.cadence/phases/**` and verifies each one the same way `summary verify <phase> <num>` does, without spawning a CLI subprocess per file. Reports MISMATCH and any load/parse/schema failure as a failure, treats NO_HASH as informational only, and exits nonzero iff at least one file failed.

This closes a growing correctness gap in this project's own CI: the corpus-wide `summary verify` sweep test (phase 257) previously spawned one subprocess per historical summary (275+ and growing), which was closing in on the Windows CI timeout as the corpus grew. It now runs as a single process.

Also fixes a related, independently-confirmed Windows CI timeout: the `skill-invoke` FIFO-cap-at-100 hook-dispatcher test drove 105 serial real-disk state read/write round trips. The cap logic is now a pure function (`applySkillInvoke`), unit-tested directly with no I/O — internal only, no CLI-visible behavior change.
