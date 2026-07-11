---
'@manehorizons/cadence-core': patch
---

Fix `cadence init` defaulting `verification.coverageMode` to `'assertion'` for every project regardless of language, which made the `test-coverage` gate permanently unsatisfiable for non-JS/TS projects (the assertion-mode span-finder only recognizes JS/TS `it()`/`test()` syntax).

- `cadence init` now detects the project's language from root marker files (`package.json`→js/ts, `pyproject.toml`/`setup.py`/`requirements.txt`→python, `go.mod`→go, `Cargo.toml`→rust, `composer.json`→php) and only defaults `coverageMode` to `'assertion'` when the detected language is js/ts; every other detected or unknown language defaults to `'mention'` instead, with a stderr notice explaining why. Existing `.cadence/config.json` files are never rewritten.
- Default `verification.testGlobs` are now language-aware too, so `mention`-mode coverage checking can actually discover test files in non-JS projects (python: `**/test_*.py`, `**/*_test.py`; go: `**/*_test.go`; rust: `tests/**/*.rs`, `**/*_test.rs`; php: `**/*Test.php`, `tests/**/*.php`).
- The `test-coverage` gate's assertion-mode refusal message now distinguishes its causes accurately: no test file matched the configured globs at all, vs. files matched but no test references the AC, vs. files matched and reference the AC but not inside an asserting `it()`/`test()` block — each with its own suggested fix.
- `cadence doctor` (and the MCP `doctor` tool) now warns when `coverageMode: 'assertion'` is paired with a detected project language that has no assertion-mode parsing support yet, suggesting `cadence config edit coverageMode`.

This does not add real assertion-mode test-span parsing for Python/Go/Rust/PHP — only js/ts has that today. It closes the "permanently unsatisfiable gate" failure mode for every language by making the defaults and diagnostics honest.
