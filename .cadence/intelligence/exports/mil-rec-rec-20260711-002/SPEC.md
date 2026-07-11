---
phase: mil-rec-rec-20260711-002
id: 00-00
status: PENDING
---

# 00-00 — Shared-lexer multi-language assertion-coverage engine (Python/Go/Rust/PHP profiles + operator-extensible custom patterns)

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260711-002`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

Generalize findTestSpans (packages/core/src/verify/test-spans.ts) from a hardcoded JS/TS-only scanner into one shared, string/comment-aware engine parameterized by a per-language 'profile' (opener/assertion regex, comment/string tables, block-boundary strategy: call-expression / brace-delimited / indentation-delimited / do-end-keyword). Ship built-in profiles for python, go, rust, php (Pest + PHPUnit shapes) alongside a re-expressed js/ts profile, dispatched per-file by extension so monorepos work correctly. Add 'verification.coverageProfiles' config so operators can define opener/assertion/blockStyle for any language CADENCE has no built-in profile for, validated at config-load time -- so 'unsupported language' is never a dead end. Bias hard toward false-negative-over-false-positive: an unrecognized shape always yields zero spans, never a partial/wrong match. Pairs with a 'cadence verify coverage --explain AC-N' dry-run diagnostic and a supported-language matrix doc with a doc-content test keeping it in sync with the profile registry. This is the follow-on architecture phase after rec-20260711-001's fast diagnose-fix (dec-20260711-001 records the sequencing/design decision tying the two together).

## Acceptance Criteria

### AC-1: Shared-lexer multi-language assertion-coverage engine (Python/Go/Rust/PHP profiles + operator-extensible custom patterns)
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- Milestone touches documentation surfaces — spec/doc drift risk.

## Open Questions

- _(question)_
