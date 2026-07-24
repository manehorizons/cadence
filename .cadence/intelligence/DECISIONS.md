# CADENCE Decisions

> Generated from `.cadence/intelligence/decisions.json`.

## Active

### dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase

- recommendation: rec-20260711-001
- decided: 2026-07-11T03:08:39.649Z

Sequencing: (A) MVP-0 now -- cadence init sniffs project language and only defaults coverageMode to 'assertion' when a real profile exists (else 'mention' + loud notice); default test-file globs become language-aware at init too (discovery was TS-only, a second bug layered under the parsing one); the test-coverage gate error splits 'no files matched globs' from 'files matched but no assertion-shaped span found', and 'cadence doctor' flags assertion-mode paired with an unsupported language. This closes the permanently-unsatisfiable-gate failure mode for every language immediately, with no new architecture. (B) Later phase -- generalize findTestSpans into one shared, string/comment-aware scanner parameterized by a 'language profile' (opener/assertion regex, comment/string tables, block-boundary strategy: call/brace/indent/keyword). Built-in profiles for python (indent), go (brace), rust (brace, attribute-aware), php (call-family via Pest, plus PHPUnit method+->assert* shape), alongside the existing js/ts (call). Dispatch is per-file by extension/glob, monorepo-safe. Also ship 'verification.coverageProfiles' -- an operator-extensible config array so an unsupported language is never a dead end again, validated at config-load time (refuse + suggest on bad regex/missing fields, never silently ignored). Bias throughout: false negatives (gate blocks on a real test) are safe and already have relaxation valves (mention mode, --allow-missing-coverage); false positives (something wrongly counted as assertion-covered) defeat the gate's purpose and must never happen from an unrecognized shape -- unknown shape always yields 'no span', never a partial match. Testing: TDD per block-boundary strategy with real-framework fixtures (pytest, Go table-driven incl. subtests, Rust #[test]/#[should_panic], Pest, PHPUnit) plus documented edge cases. Diagnosability: a 'cadence verify coverage --explain AC-N' dry-run that prints found spans and why each did/didn't satisfy assertion mode. Docs: a supported-language matrix in docs/reference/config.md with a doc-content test asserting it matches the live profile registry. Artifact split: rec-20260711-001 stays scoped to the MVP-0 fast fix and can convert to a phase directly; the shared-lexer engine (Python/Go/Rust/PHP profiles + custom escape hatch) is filed as its own, larger recommendation. Source: operator-driven brainstorm 2026-07-11, informed by wide-net ideation covering ~12 languages/frameworks and 7 architectural options (tree-sitter, per-language scanners, generic config-driven engine, runner-inventory verification, pluggable coverage-strategy interface, etc.) -- tree-sitter rejected as violating the zero-runtime-dependency bias without explicit operator sign-off; a fully generic un-scoped heuristic rejected as too permissive given the false-positive bias above.

### dec-20260721-001 — cadence next extends nextAction(), does not subsume quickstart or reimplement

- recommendation: rec-20260721-002
- decided: 2026-07-21T22:47:29.452Z

nextAction() (packages/core/src/progress.ts:31) is upgraded to return ranked legalMoves[] (position, remainingTasks, blockedOn) instead of a single {command, reason} pair, keeping a single-command shape for back-compat. quickstart and progress continue calling nextAction() for their existing one-line view; cadence next is the new surface exposing the full ranked list + --json. quickstart's other state-summary content is not absorbed.

### dec-20260721-002 — Shared legal-moves computation also powers empty-state footers (rec-20260721-001)

- recommendation: rec-20260721-002
- decided: 2026-07-21T22:47:29.636Z

One computation, two surfaces: rec-20260721-001's empty/refusal messages call the same underlying legal-moves logic for their 'Try:' line, and cadence next remains directly invocable standalone. Not standalone-only.

### dec-20260721-003 — cadence next --json includes schemaVersion: 1

- recommendation: rec-20260721-002
- decided: 2026-07-21T22:47:29.830Z

Matches the established house convention already used in status.ts, milestone.ts, recommendations.ts, inspect.ts, settle.ts, etc. (resume.ts/run-resume.ts are the known gap, not the precedent to follow). Not test-enforced today, but consistency across all --json commands is the goal.

### dec-20260721-004 — Ship /cadence-next slash command alongside the CLI command

- recommendation: rec-20260721-002
- decided: 2026-07-21T22:47:30.023Z

Registration is a single CommandSpec entry in packages/host-claude-code/src/install-commands.ts (14 -> 15) plus updating the doc-count test's expected number (docs-command-count.test.ts). Low cost, and this command is explicitly aimed at agent/host-driven navigation, so the slash-command surface matters at ship time rather than being deferred.

### dec-20260724-001 — Enforce ledger-diff at audit close, not a standing rule

- recommendation: rec-20260724-002
- decided: 2026-07-24T19:24:16.170Z

Chose a mechanical ledger-diff step over a documented standing rule or a scout-id requirement. A standing rule ('audit sessions end with same-session ingestion') is a promise an agent can silently skip -- the exact self-report-trust failure mode CADENCE's thesis exists to prevent. A required scout-id only makes gaps auditable in hindsight, after a P0 has already slipped. The ledger-diff step instead makes ingestion mechanically checkable at audit-close time: enumerate critical/P0 findings, grep recommendations.json for a matching rec by title/area/evidence keyword, and refuse to close the audit session on any unmatched finding until it is filed via 'cadence recommendation add'. This directly targets the failure that motivated the rec: the v1.47.0 audit's assurance-levels P0 was partially executed from memory and never reached the ledger.

## Superseded

_(none)_

## Rescinded

_(none)_
