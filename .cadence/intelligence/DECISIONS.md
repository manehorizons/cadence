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

### dec-20260724-002 — Scope rec-20260724-003 to a CHANGELOG-currency gate only, defer auto-generation

- recommendation: rec-20260724-003
- decided: 2026-07-24T23:41:13.458Z

rec-20260724-003 proposed two things: (1) auto-generating CHANGELOG.md prose from settled phases' SUMMARY.json artifacts, and (2) a release-time gate refusing publish when the changelog lags the version bump. Scoping to (2) only: a doc-content test asserting CHANGELOG.md's newest '## [x.y.z]' heading matches packages/core/package.json's version, enforced the same way CLAUDE.md's version string is doc-sync-gated (packages/core/tests/docs/*.test.ts), plus a release-cut skill step calling it out explicitly. (1) is deferred, not rejected — auto-summarizing SUMMARY.json into readable changelog prose is a harder, more speculative problem (quality of generated prose, what to include/omit) that deserves its own design pass rather than being bundled into a mechanical CI gate. The 44-version backfill done 2026-07-24 (PR #297) proves the gate alone is sufficient to prevent recurrence of this specific drift.

### dec-20260726-001 — Split SUMMARY.json attestation: content-hash now, full signing deferred to threat model

- recommendation: rec-20260724-006
- decided: 2026-07-26T01:59:18.580Z

rec-20260724-006 (needs-decision) proposed a range from a settle-time content hash to full cryptographic signing. Full signing only provides real protection if the signer is a different trust domain than the artifact author (e.g. CI-identity signing via Sigstore keyless) -- self-signing in the same trust domain as SUMMARY.json's author is not meaningfully stronger than a hash. That trust-root decision has no grounding yet: the formal threat model (mil-rec-rec-20260712-016, covering MCP serve/hooks/host-adapters/verifier/ledger) is still parked. Decision: ship a content-hash/provenance chain in state.json now (phase 223) to close the silent-hand-edit gap, and defer full signing to a new recommendation gated on the threat-model rec landing first.

### dec-20260730-001 — Coverage phase-scoping uses a phase-qualified test token, not file-ownership scoping

- decided: 2026-07-30T00:16:43.028Z

Closes rec-20260729-004 (filed on the kernel-assurance arc branch; not present in main's ledger, so promotion is deferred until the arc merges). Defect confirmed on origin/main and in published v1.51.1, dating to phase 14 (54fdc55e): scanTestCoverage walks packages/**/*.test.ts repo-wide and links an AC by the bare token /\\bAC-\\d+\\b/. AC ids are phase-local and restart at AC-1 each phase, so the namespace collides globally; measured here, AC-1 was satisfied by 189 unrelated files. Three mechanisms were considered. File-ownership scoping is REJECTED as the enforcement mechanism: (1) no trustworthy ownership signal exists in gate context — ctx.touchedFiles derives from draft.tasks[].files (services/settle.ts:1051) and DRAFT files: lines inconsistently declare test paths (phase 233: 0 of 4; phase 232: 1 of 6), while PROGRESS.json per-task touchedFiles is worse still (233's T1-T3 empty, T4 holding absolute paths into another worktree); (2) it is ALREADY SHIPPED in the replay path since phase 204 and demonstrably misfires — replayPhaseCoverage is draft-file-scoped with a doc comment naming this exact collision, yet 'verify phase 233-per-settle-assurance-record 01' reports 5/5 ACs drifting against a SUMMARY recording all five pass/executed, a false positive since 233's tests exist with tokens inside asserting blocks (tests/gates/assurance-record.test.ts:11,34). The two mechanisms thus fail in opposite directions on the same phase. (3) File-scoping stays gameable by declaration: listing an old test file containing a historical AC-3 in a task's files: satisfies the scoped scan without writing a test, since boundary-scan checks touched-vs-declared, not declared-but-untouched. A phase-qualified token cannot exist anywhere in history, so the only way to satisfy the gate is to write a new asserting test carrying this phase's token. Token form must be PREFIX ('235-01/AC-3'), not infix: /\\bAC-\\d+\\b/ lexes 'AC-235-01-3' as 'AC-235', silently corrupting every existing scanner, whereas the prefix form leaves the bare AC-3 token lexable so replay and --explain keep working. Delivered as verification.coverageScheme: 'bare' | 'phase-qualified' via the phase-139 two-layer precedent (Zod .default('bare') as the backward-compat fallback for pre-existing configs; defaultConfig writes 'phase-qualified' for fresh inits), so consumer projects are unaffected on upgrade until they opt in. Reporting matched files is folded in as a diagnostic, not as the fix — a gate that passes while disclosing weak evidence is not proof.

### dec-20260728-001 — Phase 233 AC-3 tripwire cleared: assurance-record derivation is gate-agnostic

- decided: 2026-07-28T02:33:14.475Z

rec-20260728-001 (Per-settle assurance record), shipped via phase 233-per-settle-assurance-record. The derivation (packages/core/src/gates/assurance-record.ts, deriveAssuranceRecord) reads only gate-provenance provider/model fields and per-AC evidence classes -- never a specific gate name or id. Confirmed by the implementer, an independent per-task reviewer, and a fresh whole-branch reviewer, each reading the function directly and grepping for gate.gate/gate-name branching (none found). Per the phase 233 spec's binding tripwire, this clears phases 234-237 (kernel/verifier/consumer boundary work) to proceed on the premise that the kernel/verifier/consumer boundary is real, not a special-cased illusion. Non-blocking design-gap noted for those phases: only 2 of 10 GATE_ORDER gates (code-review, security-audit) currently populate verifier identity (phase 232's scope), so 'overall' has no signal from other gates that perform real verification (e.g. build-test-must-pass) -- worth addressing in a later slice, not a defect in phase 233 itself.

### dec-20260729-001 — Phase 234 AC-1 narrowed: contracts/ is the type-naming surface, not the resolution surface

- recommendation: rec-20260727-003
- decided: 2026-07-29T01:15:16.785Z

AC-1 originally read 'that module is the only surface through which a verifier is resolved'. That over-claimed relative to the design source: docs/handoffs/cadence-phase0-assurance-kernel-review.md section 6 Slice 2 asks only to name the three roles as published contracts and add a lint rule against importing kernel internals -- it never requires contracts/ to be the resolution surface, and architecturally it should not be. Verifier resolution legitimately happens by direct verify/*-factory.ts import at four composition roots (services/settle.ts, gates/build-context.ts, gates/draft-context.ts, services/spec-approve-ports.ts); two independent reviews judged that placement correct, and contracts/ re-exports only the VerifierProvider type from verifier-factory.js, never a select* function. Amended AC-1 to 'the only surface through which a verifier TYPE is named', which IS mechanically enforced: zero direct imports of the seven verifier-family modules remain in packages/core/src outside verify/ and contracts/. Operator-approved 2026-07-28.

### dec-20260729-002 — Uniform opts? on VerifierPort is what makes zero-special-cases true

- recommendation: rec-20260727-003
- decided: 2026-07-29T01:15:16.977Z

The published VerifierPort<I,R> carries a uniform optional opts?: VerifierCallOptions. Before phase 234 only security-audit's PORT threaded opts (Phase 184); the other six ports -- deep-verify included -- were declared arity-1, so restating them widens their type-level call signature by one optional parameter. Accepted deliberately: it is source-compatible and runtime-identical (every real call site still passes one argument), and it is the mechanism by which AC-2's 'zero special cases' is literally true. The rejected alternative was two port shapes (arity-1 plus a cancellable variant), which is itself the special-casing AC-2 forbids and would have risked the phase's binding tripwire. Known cost: five families advertise a cancellation affordance they ignore. Operator-approved 2026-07-28.

### dec-20260729-003 — Phase 235 scope: criteria-anchoring is code-review only, not spec-review/ui-spec-review/plan-review

- recommendation: rec-20260727-004
- decided: 2026-07-29T22:09:00.176Z

Resolves section 10 open question 3 of the phase-0 assurance-kernel review. Although spec-review, ui-spec-review and plan-review are already criteria-shaped, generalizing the anchor ladder to them in slice 3 is scope creep: it would widen the phase past its overrun tripwire and couple the anchor ladder to three more input contracts before the ladder has proven itself on one. Scope stays the code-review verifier only; the other three gates keep current behavior. Backfilled as a decision record 2026-07-29 -- the boundary was already asserted in the 235-01 DRAFT but never written to the ledger by the session that authored it.

### dec-20260729-004 — Anchor executable tier: non-empty verify + build-test-must-pass ran, no prose heuristic

- recommendation: rec-20260727-005
- decided: 2026-07-29T22:25:05.265Z

Section 7.1 defines executable as an AC referenced by a task whose verify is a runnable command AND build-test-must-pass actually ran. Nothing in the repo has a runnable-command predicate; the existing precedent (gates/task-verify-required.ts) tests only t.verify.trim().length. Implementing command-likeness as a heuristic would be fragile and could itself over-claim or under-claim. Decision: treat verify as runnable iff non-empty after trim, and rely on the gate-provenance condition (status === 'ran', never 'skipped' or 'refused') as the substantive corroboration that prevents over-claiming. That pairing is why 7.1 states two conditions rather than one. Residual known gap: a prose-only verify line on a phase whose suite ran elsewhere can still reach executable; refining that is a follow-up, not this slice.

### dec-20260729-005 — Criteria-gap refusal reuses code-review's existing HIGH-severity refuse path, not gates.evidenceFloor

- recommendation: rec-20260727-004
- decided: 2026-07-29T22:44:26.595Z

D1 and section 6 Slice 3 say gap findings block above a severity floor; D2 says they trip the existing evidenceFloor with no second refusal primitive. These conflict: gates.evidenceFloor ranks AcEvidence (ai-verified > executed > assertion > mention > unverified) per AC, while findings carry severity high|medium|low, and no severity-to-evidence mapping exists. Decision: read D2 as forbidding a NEW refusal primitive and a NEW config knob, not as naming the AcEvidence floor specifically. Gap findings are emitted into the finding stream code-review already refuses on (HIGH refuses settle unless --allow-code-review-failure). This satisfies D2 literally (no second primitive, no doubled config surface), matches D1's severity-floor wording, and preserves AC-7 (no change to per-AC evidence semantics or to pass/refuse behavior for finding classes that existed before this phase). Rejected: mapping severity onto AcEvidence (invents semantics and perturbs the phase-214 floor), and a dedicated gates.criteriaGapFloor knob (the exact second-primitive/config-doubling D2 rejects). Tripwire T4 retuning, if gap findings prove too noisy on real phases, therefore means retuning the code-review severity assignment, not adding a floor.

### dec-20260729-006 — D3 unconditional declaration binds the floor outcome, not the empty-gap case

- recommendation: rec-20260727-004
- decided: 2026-07-29T23:06:44.137Z

D3 says gap count and severity distribution are declared unconditionally; AC-4's operative text qualifies this as 'regardless of whether the floor stops the settle'. Read as: the declaration must not be suppressed by the floor OUTCOME (pass, refuse, or bypass via --allow-code-review-failure/--force) nor by config. It does not require printing a '0 finding(s) unanchored' stderr line into a settle that produced no findings at all. Implementation: gapResult is computed unconditionally on every gate run and the anchor-tagged findings land in summaryPatch.codeReview on all three return paths (pass, reloop-refuse, escalate-refuse), so gap count and severity distribution stay derivable from the persisted SUMMARY in every outcome; only the stderr convenience notice is guarded by gapCount > 0. Forced by AC-7: two pre-existing tests (tests/cli/settle-code-review.test.ts AC-4 and tests/cli/settle-codereview-convergence.test.ts AC-1) assert a clean-diff settle emits nothing matching /code-review:/ on stderr, and AC-7 forbids loosening an existing test to accommodate this phase. Independent review adjudicated this reading as non-weakening and verified both CLI suites pass with the guard in place. Recorded because the parallel D1/D2 tension got dec-20260729-005 and this one had been left implicit — a future reader could otherwise re-litigate it wrongly.

### dec-20260731-001 — Findings-to-ledger routing merges same-identity findings by design; the identity hash itself is not changed

- recommendation: rec-20260731-009
- decided: 2026-07-31T22:08:58.679Z

rec-20260731-007 found that computeFindingId (phase 236, finding-identity.ts) collapses two distinct findings in one file that share (file, anchor.kind, anchor.ref, severity, normalized message) — no occurrence discriminant. Phase 242 (findings-to-ledger auto-routing, source doc §7.3) must key routing on Finding.id for ledger hygiene (dedup across re-settles), so this collision surfaces directly in routing: N same-id occurrences would otherwise mint one ledger entry with no record that N occurrences existed. Decision: keep the identity hash unchanged (out of phase 242's scope -- changing it is a phase-236-owned concern with its own downstream fallout to assess separately) and instead have the routing step's derivation merge same-id findings within one settle into a single Recommendation, recording the occurrence count explicitly in that entry's evidence/summary text. This is a deliberate merge-by-identity semantic, not silent data loss: a ledger reader sees 'N occurrences' rather than one bare finding. Revisit only if occurrence-level waiving (waiving one of N occurrences but not the others) becomes a real requirement -- today's FindingZ.disposition/waiver model waives by id, i.e. by the whole merged group, which is consistent with this decision.

### dec-20260801-001 — Add a settle-time guard for global-CLI-shadowing-branch-build; interim rule is settle via the local build

- recommendation: rec-20260729-001
- decided: 2026-08-01T01:45:29.153Z

Swept 233/234/235/236/241/242 SUMMARYs: 233 and 234 are schemaVersion 1 with no assurance record (the bug, confirmed); 235 onward are all schemaVersion 2 with an assurance record -- the arc already informally adopted 'settle via node packages/core/bin/cadence.cjs' as of phase 235, so the gap did not recur after 234 despite no code fix existing yet. Per this repo's Quiet Fallback rule, a silent version mismatch needs a loud guard, not just tribal-knowledge discipline. --version is identical between the global npm install and any branch build (both report the same string), so the guard cannot key on version -- it must compare resolved binary realpath (or a build fingerprint) against the current git worktree root at settle time, and print a loud stderr notice (banner pattern, matching phase 243's precedent on main, db225ace) when they diverge rather than silently downgrading to schemaVersion 1. Scope: settle.ts's schemaVersion/assurance-record write path, not a general CLI-resolution redesign.

### dec-20260801-002 — Finding identity narrowed to (file, normalized message); anchor/severity dropped as identity inputs

- decided: 2026-08-01T17:29:57.283Z

Narrows dec-20260730-002's anchor-inclusion conclusion; its Deja-fingerprint-extraction rejection (the decision's other, independent conclusion) is unaffected and still stands. Phase 236's anchor-derived hash included anchor.kind/anchor.ref alongside severity, on the theory that a finding's own anchor is a legitimate, already-available content signal. Independent review (2026-08-01) found this wrong in two concrete ways, filed as rec-20260801-008/rec-20260801-009 (rec-20260801-008 later archived, split into the now-shipped anchor/severity fix and rec-20260801-010's residual message-drift risk): (1) the DRAFT-amendment/anchor-earning workflow deliberately re-anchors a previously-unanchored finding once a criterion covers it -- criteria-anchor-corpus.test.ts's own AC-5 round-trip test already proved message/severity/line survive that transition unchanged, but the pre-245 hash still minted a new id purely because anchor changed; (2) severity is live LLM classification under real verifier providers (anthropic/local/host-cli), so a re-run can legitimately reclassify the same defect's severity, and the pre-245 hash treated that as a new finding too. Both caused phase 242's ledger dedup (keyed on Finding.id) to miss an already-routed finding and mint a duplicate Recommendation. Phase 245 (245-finding-identity-stability) narrowed computeFindingId to hash only (file, normalized message); anchor/severity remain real Finding fields, just no longer identity inputs. Message-text free-form drift under real providers (the harder half of the original finding) is NOT fixed by this decision -- tracked separately as rec-20260801-010, operator risk-accepted rather than built speculatively.

## Superseded

### dec-20260730-002 — Finding identity uses an anchor-derived content hash; no fingerprint primitive is extracted from Deja

- recommendation: rec-20260727-007
- decided: 2026-07-30T03:19:30.060Z
- superseded-by: dec-20260801-002

Phase 236 derives a finding's stable id from the anchor it already carries -- a pure content hash over (file, anchor.kind, anchor.ref, severity, normalized message) -- and adds no new runtime dependency. The Deja extraction evaluated by rec-20260727-007 is rejected on three grounds recorded in ev-20260730-003: Deja is not consumable as a library (main:null/exports:null, unpublished under a name Cadence could depend on); its normalization layer carries tree-sitter and its matching layer carries better-sqlite3, both native, against core's zero-runtime-dependency bias; and the two problems differ in shape -- Deja solves retrieval over an indexed corpus while Cadence needs identity across two small per-run sets, so the genuinely shared surface reduces to 83 pure lines plus a one-line containment formula. This satisfies the concern that motivated the rec -- do not ship two incompatible fingerprints -- by shipping zero. Fingerprinting only buys identity that survives a refactor moving the anchored code, and only for anchor.kind==='none' / undeclared-tier findings, which section 7.1 already treats as weak by default. REOPEN TRIGGER: revisit if undeclared-tier findings become a material share of routed ledger entries AND identity churn across refactors is measured rather than assumed; extraction would then start from Deja's fingerprint.ts alone (pure, node:crypto only), never normalize.ts or match.ts.

## Rescinded

_(none)_
