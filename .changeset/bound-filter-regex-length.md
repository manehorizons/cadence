---
'@manehorizons/cadence-core': patch
---

Fixes a ReDoS-shaped regex-injection risk (#249, CodeQL) in `cadence assumption list`, `cadence decision list`, and `cadence recommendation list`: `--filter-regex` values were compiled directly with `new RegExp(...)` with no bound on pattern length, so a pathologically long attacker- or script-supplied pattern could hang the process. Each command now rejects patterns longer than 200 characters with a clear `<command> list failed: --filter-regex pattern is too long: ...` stderr message and non-zero exit, before `new RegExp` is ever called — legitimate, previously-accepted patterns (well under the cap) are unaffected. The guard is duplicated per-command rather than factored into a shared helper, matching this codebase's existing `parseRegexFlags` precedent. `--filter-regex`'s `--help` text and `docs/reference/commands.md` are updated to document the length limit.
