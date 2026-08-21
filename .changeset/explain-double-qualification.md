---
"@thomas-powers-jr/cadence-core": patch
---

Fix: `cadence verify coverage --explain` no longer silently double-qualifies an already-qualified AC id under `verification.coverageScheme: 'phase-qualified'`.

Passing an already-qualified argument (e.g. `--explain 282-01/AC-4` when the active draft is already `282-01`) previously caused the active draft's qualifier to be prepended a second time, building a search token (`282-01/282-01/AC-4`) that could never match anything — the command silently reported `NOT SATISFIED` at exit `0`, with no error or warning. `runVerifyCoverage` now detects when the `--explain` argument already starts with the active draft's own qualifier prefix, strips it, searches using the bare form instead (identical to what `--explain AC-4` alone would do), and prints a stderr notice naming both the original argument and the bare form actually used.

A related edge case found during review: stripping a qualifier-only argument (`--explain '282-01/'`, nothing after the slash) down to an empty string would otherwise search an empty pattern, which silently matches everywhere and reports a false `satisfied: true` — the opposite failure direction, and worse than the bug this fix addresses. That case is now refused outright (non-zero exit, a message naming the problem) rather than searched.

The correct bare `--explain AC-N` form is byte-for-byte unchanged (proven via a committed snapshot of the literal stdout), and the `bare` coverage scheme is entirely unaffected — the new logic only runs inside the `phase-qualified` branch. `explainAcCoverage` and `CoverageExplainResult` in `packages/core/src/verify/coverage.ts` are untouched; this is a service-layer-only fix. `docs/reference/commands.md`'s `verify coverage --explain` section documents the bare-form contract, the normalization behavior, and the qualifier-only refusal.

Closes `rec-20260816-001`.
