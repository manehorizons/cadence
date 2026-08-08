---
"@thomas-powers-jr/cadence-core": minor
---

Added a new read-only diagnostic, `cadence verify historical-coverage-audit`, that audits every pre-phase-239 (`coverageScheme` absent) `SUMMARY.json` record's recorded AC PASS for genuine, attributable test evidence — answering `rec-20260729-006`.

Each AC classifies into one of four buckets, computed from only that phase's own literal (non-wildcard), on-disk declared test files: `self-attested` (a token match in a file no other phase's DRAFT declares literally — high confidence), `self-attested-shared` (a match, but only in a file 2+ phases also declare literally — cannot rule out belonging to another phase's identically-numbered AC), `not-found-in-declared-files` (declared files were scanned, token not found — no repo-wide fallback), and `unreachable` (no literal, existing test file declared at all). It never performs a repo-wide bare-`AC-N` token scan (395 of 448 test files in a real corpus can contain that token as unrelated fixture data) and never resolves wildcard-glob `files:` entries. Purely additive and read-only: `cadence verify phase`'s existing `indeterminate` contract and command path are unmodified.

`--json` emits the full per-phase report; human mode prints aggregate bucket totals and an unreadable-record count. Exit code is always `0` on a successful run (a diagnostic, not a gate) and `1` only if the audit itself fails to run.
