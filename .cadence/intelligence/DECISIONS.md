# CADENCE Decisions

> Generated from `.cadence/intelligence/decisions.json`.

## Active

### dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase

- recommendation: rec-20260711-001
- decided: 2026-07-11T03:08:39.649Z

Sequencing: (A) MVP-0 now -- cadence init sniffs project language and only defaults coverageMode to 'assertion' when a real profile exists (else 'mention' + loud notice); default test-file globs become language-aware at init too (discovery was TS-only, a second bug layered under the parsing one); the test-coverage gate error splits 'no files matched globs' from 'files matched but no assertion-shaped span found', and 'cadence doctor' flags assertion-mode paired with an unsupported language. This closes the permanently-unsatisfiable-gate failure mode for every language immediately, with no new architecture. (B) Later phase -- generalize findTestSpans into one shared, string/comment-aware scanner parameterized by a 'language profile' (opener/assertion regex, comment/string tables, block-boundary strategy: call/brace/indent/keyword). Built-in profiles for python (indent), go (brace), rust (brace, attribute-aware), php (call-family via Pest, plus PHPUnit method+->assert* shape), alongside the existing js/ts (call). Dispatch is per-file by extension/glob, monorepo-safe. Also ship 'verification.coverageProfiles' -- an operator-extensible config array so an unsupported language is never a dead end again, validated at config-load time (refuse + suggest on bad regex/missing fields, never silently ignored). Bias throughout: false negatives (gate blocks on a real test) are safe and already have relaxation valves (mention mode, --allow-missing-coverage); false positives (something wrongly counted as assertion-covered) defeat the gate's purpose and must never happen from an unrecognized shape -- unknown shape always yields 'no span', never a partial match. Testing: TDD per block-boundary strategy with real-framework fixtures (pytest, Go table-driven incl. subtests, Rust #[test]/#[should_panic], Pest, PHPUnit) plus documented edge cases. Diagnosability: a 'cadence verify coverage --explain AC-N' dry-run that prints found spans and why each did/didn't satisfy assertion mode. Docs: a supported-language matrix in docs/reference/config.md with a doc-content test asserting it matches the live profile registry. Artifact split: rec-20260711-001 stays scoped to the MVP-0 fast fix and can convert to a phase directly; the shared-lexer engine (Python/Go/Rust/PHP profiles + custom escape hatch) is filed as its own, larger recommendation. Source: operator-driven brainstorm 2026-07-11, informed by wide-net ideation covering ~12 languages/frameworks and 7 architectural options (tree-sitter, per-language scanners, generic config-driven engine, runner-inventory verification, pluggable coverage-strategy interface, etc.) -- tree-sitter rejected as violating the zero-runtime-dependency bias without explicit operator sign-off; a fully generic un-scoped heuristic rejected as too permissive given the false-positive bias above.

## Superseded

_(none)_

## Rescinded

_(none)_
