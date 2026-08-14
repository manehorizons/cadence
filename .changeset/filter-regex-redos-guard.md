---
"@thomas-powers-jr/cadence-core": patch
---

`--filter-regex` (on `recommendation list` / `decision list` / `assumption list`) now rejects patterns with nested quantifiers that can cause catastrophic backtracking (e.g. `(a+)+`) before compiling the operator-supplied pattern, addressing a CodeQL `js/regex-injection` (ReDoS) finding on `packages/core/src/cli/list-filter.ts`.
