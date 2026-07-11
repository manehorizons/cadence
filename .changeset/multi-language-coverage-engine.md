---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
---

Add real assertion-mode test-coverage span parsing for Python, Go, Rust, and PHP (previously js/ts only), plus an operator-extensible escape hatch for any other language.

- A shared, profile-parameterized scanning engine (`packages/core/src/verify/coverage-profiles/`) replaces the old hardcoded JS/TS-only scanner. Four block-boundary strategies — call-expression, brace-delimited, indentation-delimited, and do-end-keyword — cover every built-in profile and remain available to custom ones.
- Five built-in language profiles ship: js/ts (re-expressed, byte-identical behavior to before), python (pytest-style, including `async def`), go (`func TestX(t *testing.T)`, table-driven tests, testify), rust (`#[test]`/`#[should_panic]`, unbounded raw strings), and php (both Pest closures and PHPUnit methods, including heredoc/nowdoc-safe masking).
- `verification.coverageProfiles` lets an operator define a custom profile (opener/assertion patterns, comment/string syntax, block strategy) for any language with no built-in support — validated at config-load time with refuse+suggest diagnostics; custom profiles are add-only and cannot override a built-in's extensions.
- `cadence verify coverage --explain AC-N [--json]` is a new read-only diagnostic: which files matched, which profile scanned each one, every span found, and why each did or didn't satisfy assertion mode.
- Per-file dispatch is wired into the real `test-coverage` gate (`scanTestCoverage`) — assertion mode now genuinely works end-to-end for all five built-in languages, not just in isolation. The gate's refusal messages are language-neutral and point at the new `--explain` diagnostic. `cadence init`'s default `verification.testGlobs` for rust now also includes `src/**/*.rs`, since idiomatic Rust unit tests commonly live inline in a `#[cfg(test)] mod tests { ... }` block. `cadence doctor`'s coverage-mode language-support check now reflects the live profile registry instead of a hardcoded js-only list.
- The false-positive-averse invariant holds throughout: an unrecognized shape always yields zero spans, never a partial or fabricated match. This required closing several real gaps found during review — opener-pattern spoofing via comments, strings, and nested parenthesized sub-expressions (go); an unbounded-hash raw-string masking gap (rust); a standalone-heredoc fabricated-span gap (php); and a cross-process custom-profile collision-shadowing gap (`verification.coverageProfiles`).
