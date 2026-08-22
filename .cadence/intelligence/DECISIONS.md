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

### dec-20260801-003 — Defer finding-identity message-drift dedup: wait for real-provider data, offline analyzer first

- recommendation: rec-20260801-010
- decided: 2026-08-01T21:37:09.985Z

Phase 246 scoping (verified 2026-08-01): 0 of 257 .cadence/phases/*/*-SUMMARY.json files contain a single persisted code-review finding (only 5 even carry a codeReview key) -- phase 242's findings-to-ledger auto-routing has never fired in production, so rec-20260801-010's dedup defect (real LLM providers re-wording one defect across settles, minting a new Finding.id each time and duplicating a ledger entry) is reasoned from code, not measured from a real occurrence. An in-loop telemetry design was drafted and independently reviewed; the review found it broken in both directions -- it would have grouped on (file, anchor.kind, anchor.ref, severity), exactly the fields phase 245 deliberately excluded from the identity hash because they legitimately vary for one recurring defect, so it would filter out real drift pairs while merging distinct findings that happen to share a slot -- and it measured intra-batch similarity when the drift is cross-settle, which deriveRoutingCandidates cannot see without breaking finding-routing.ts's pure no-ledger-import boundary. Decision: ship no code this phase. Next step once real data exists is an offline analyzer over the accumulated SUMMARY.json corpus (the corpus of record -- ledger-routed text is redacted and 80-char truncated, so the ledger itself is not a valid source) -- not in-loop telemetry, not fuzzy-matching (still speculative against zero data, and carries a real false-merge risk the operator already flagged). Trigger to revisit: at least 3 settles under a non-mock review provider (anthropic/local/host-cli) have each persisted at least 1 code-review finding -- 3 chosen to match this repo's existing config.convergence.maxAttempts default, adjustable and non-binding when first revisited. A related but separate defect surfaced during this review -- a refused settle's SUMMARY.json is silently overwritten by a later successful settle for the same draft, destroying attempt-1 findings -- is filed independently as rec-20260801-011, not folded into this decision.

### dec-20260802-001 — Refused gate-loop settles thread acc's findings into the SUMMARY, with a conditional contentHash

- recommendation: rec-20260801-005
- decided: 2026-08-02T00:03:52.891Z

(a) Verified at main@361f6490 (previously verified at 98b6a15; zero source drift across the 3 intervening handoff/ranking-chore commits): the gate-loop refusal branch in runSettleGates already merges each gate's summaryPatch into acc via mergeInto(acc, res) (registry.ts:209) BEFORE the outcome==='refuse' check (~211-218) -- so code-review/security-audit findings accumulated before a refusing gate halted the loop are already present in acc when writeRefusedSettleSummary (settle.ts:751, sole call site at line 1357) runs; the loss was a threading gap in the writer, not a collection gap. Phase 247 (worktree phase247-refused-settle-summary, DRAFT 247-01, T1) closes it: writeRefusedSettleSummary now accepts acc.codeReview/acc.securityAudit and conditionally spreads them into the refused SUMMARY, mirroring finalizeAndCloseSettle's success-path shape exactly (~1132). Independently re-verified: 34/34 tests in settle.test.ts pass including the two new phase-247 T1 tests. (b) contentHash is attached CONDITIONALLY -- only when at least one of codeReview/securityAudit is present AND non-empty -- not unconditionally as this arc's handoff (docs/handoffs/cadence-arc-finding-durability-handoff.md) originally sketched. Amended because the handoff's own arc thesis requires 'byte-identical pass/refuse behavior everywhere'; an unconditional hash would add a contentHash key to a findings-free refusal (e.g. a bare build-test-must-pass refusal) that doesn't exist today -- not byte-identical. A findings-free refused record was never useful corpus material anyway, so nothing D1 wanted is lost by making the hash conditional. Regression-pinned by a dedicated test: a findings-free refused build-test-must-pass settle gains no codeReview/securityAudit/contentHash keys at all. (c) Scope: this decision covers ONLY the gate-loop refusal family (the single writeRefusedSettleSummary call site). The three post-gate refusal families that still return {ok:false, exitCode:1} with no SUMMARY write at all (deriveSettleAcResults ~867, runAnomalyAndSkillAuditChecks ~965, deriveEvidenceAndCheckFloor ~1059 -- rec-20260712-006) are explicitly OUT of scope here and tracked as a separate follow-on phase, to keep phase 247's single-commit-settle convention intact rather than reopening a DRAFT already mid-BUILD. (d) Also covers the persistence half of rec-20260731-010 -- the same writer-threading fix.

### dec-20260802-002 — Attempt preservation via timestamp-slugged sibling artifact, invisible to all current SUMMARY consumers by construction

- recommendation: rec-20260801-011
- decided: 2026-08-02T00:04:06.696Z

(a) Attempt preservation via an immutable per-attempt sibling artifact, not an embedded attempts array or convergence-sidecar enrichment. Confirmed by direct verification (V-a): the code-review convergence sidecar (<draftId>-CODE-REVIEW.json, verify/converge.ts) stores only a count-only ConvergentReviewHistoryEntry (findingsCount: number, never finding text) and is never cleared/rotated on success -- it could not serve as a full-fidelity drift corpus regardless of this decision. (b) Phase 247's actual sibling name is <draftId>-refused-<completedAt-slug>-SUMMARY-snapshot.json (T2: injectable now?: () => string clock seam for a deterministic timestamp slug; T3: additive best-effort write after the canonical write completes, matching the retro-digest/phase-242-routing try/catch precedent already in settle.ts) -- amended from this arc's handoff's originally-sketched <draft>-SUMMARY.refused-<n>.json counter-based scheme to match what was actually built. Independently re-verified via a full V-b consumer inventory (diff-strict.ts's git pathspec + regex, phase-replay.ts's and cli/commands/summary.ts's exact-path construction, mcp/resources.ts's readdir+endsWith(+sort().at(-1)) discovery): every current consumer is tail-anchored on the literal -SUMMARY.json/-SUMMARY.md suffix, and ...-SUMMARY-snapshot.json fails all of them by construction -- zero consumers double-count or silently swap in a sibling. Correction to the handoff's own V-b premise: scanRetroArtifacts, which the handoff listed as a SUMMARY consumer to check, is in fact a -RETRO.json$-only consumer (an unrelated artifact type) and was never at risk. (c) Success never deletes prior refused-attempt artifacts (an abandoned, never-converged phase keeps a full forensic trail); numbering/distinctness comes from the injected timestamp, never a disk-scanned or in-memory counter -- T4 pins this with a direct unit test against the two confirmed-safe consumer predicates plus a real multi-attempt distinctness test. (d) New caveat surfaced by V-b, recorded now so it isn't rediscovered as a surprise: phase 246's own SPEC (246-01-SPEC.md:36) names .cadence/phases/*/*-SUMMARY.json as its corpus-enumeration glob (257-258 files measured). That same glob will NOT pick up these preserved -SUMMARY-snapshot.json siblings -- the exact tail-anchoring property that keeps them safe from every current consumer also keeps them invisible to phase 246's documented corpus method. A future offline analyzer built against that corpus needs a widened glob (e.g. *-SUMMARY*.json) or explicit inclusion of the snapshot suffix.

### dec-20260802-003 — Ledger routing stays finalize-only on refusal; Slice 3's revisit trigger amended to name its precondition

- recommendation: rec-20260731-010
- decided: 2026-08-02T00:04:18.306Z

(a) Unchanged from the handoff's sketch: ledger routing remains finalize-only (finalizeAndCloseSettle's routing block, settle.ts ~1181-1219, keyed on codeReviewFindings + recommendations.autoRoute) -- a reloop finding is expected to be fixed in the next attempt minutes later, and routing attempt-1 findings would mint ledger entries for defects that die immediately, compounding rec-20260731-006 (per-settle ledger churn) and rec-20260731-005 (archived recs suppressing recurrence of the same finding id). (b) Pre-committed next step if revisited: route from preserved artifacts at abandonment (once dec-20260802-002/phase-247's siblings exist to route from), not live at refusal time. (c) Trigger, AMENDED from the handoff's original wording: 'at least one real-provider case where an abandoned phase's preserved refused artifacts contain a high-severity finding that later recurs in a different phase's settled record' remains the substantive trigger, but rec-20260801-012 (filed same day, evidence ev-20260801-017) independently established that real-provider (non-mock) code-review/security-audit findings are structurally unreachable under this repo's NORMAL operating mode: the live config.json profile is auto, which excludes code-review from all three DELTAS tiers (gates/engine.ts) -- a phase needs an explicit standard/strict profile override just to run it at all -- and even then, host-cli-client.ts's self-invocation guard (isSelfInvocation, keyed on CLAUDECODE=1) forces a mock fallback for any settle run from inside a headless Claude Code session, which describes essentially every agent-driven settle in this repo. So the trigger as originally worded is silently unsatisfiable under normal agent-driven operation -- it can only fire when a human operator runs cadence settle run on a standard/strict-profile phase from a real interactive terminal. Recording this precondition explicitly so the trigger isn't mistaken for 'not yet observed' when it may in fact be structurally blocked; not a reason to change D3's core logic, just to make its dependency on rec-20260801-012 visible.

### dec-20260803-001 — Conduction stays operator-initiated: guard and gate set retained; mock-provider default is a separate ordinary config decision

- recommendation: rec-20260801-012
- decided: 2026-08-03T02:20:36.365Z

(a) The self-invocation guard (isSelfInvocation/SELF_INVOCATION_ENV_VAR in host-cli-client.ts) is retained, unmodified. It prevents unbounded nested self-invocation -- a real safety property -- and removing or bypassing it to farm real-provider findings would trade that safety property for test data, which this decision explicitly declines to do. (b) The auto-profile gate set (gates/engine.ts's DELTAS matrix) is unchanged: code-review and security-audit remain absent from all three auto-profile tiers. Conduction -- producing a real-provider finding -- is deliberately a human-operator-initiated act (a profile override plus a real interactive terminal), not something that should happen incidentally as a side effect of normal, agent-driven operation. (c) Separately, and NOT the same kind of decision as (a) or (b): security-audit's mock-provider default in this repo's own .cadence/config.json (securityAudit.provider: 'mock') is an ordinary, changeable config decision -- an operator can reconfigure it via cadence activate or an equivalent config edit at any time, independent of (a)/(b). A future reader must not conflate this ordinary config default with the two retained safety/cost decisions above. (d) Conduction is therefore a documented human-operator procedure (docs/providers.md, phase 251 T6), and the conduction-reachability doctor check (already implemented, phase 251 T2) exists precisely so the absence of a real finding is legible and visible to an operator -- rather than being silently indistinguishable from 'conduction hasn't happened yet'. (e) Revisit trigger: if operator-run conduction proves impractical enough that the corpus of real-provider findings stays empty through the NEXT arc after this one (explicitly not this arc -- give it more time before reconsidering), reconsider a supervised, depth-limited escape hatch as an alternative.

### dec-20260804-001 — Defer baseline profile change to v1.56 Phase P

- decided: 2026-08-04T22:25:55.657Z

The baseline profile question (should .cadence/config.json's profile ever move off auto) is deferred, not resolved, pending v1.56 Phase P (mock-abstains-on-review-gates). This decision does not supersede dec-20260803-001 -- that decision's commitment (conduction stays a deliberate per-phase DRAFT-level profile override, not an incidental consequence of normal agent-driven operation) is unchanged. This decision answers a narrower, different question: whether the baseline itself should ever move, which dec-20260803-001 clauses (a)/(b) didn't address either way. Moving the baseline today would newly fire draft-read (present in standard/strict at every tier, absent from auto entirely) on every future phase, plus code-review/deep-verify at complex tier -- gate-cost this release does not need to take on before its Aug 12 2026 deadline. softCap (engine.ts: softCap = profile === 'auto' && tier === 'complex') is a distinct auto-specific cost-control mechanic worth understanding before any future baseline change; noted here, not resolved. cadence init's own maturity heuristic would give a repo this age 'standard' fresh -- context for the eventual revisit, not acted on now. Trigger to revisit: v1.56 Phase P lands, removing the false-confidence risk a baseline change carries today. securityAudit.provider is unaffected by this decision -- per dec-20260803-001 clause (c), that field is already an ordinary, independently-changeable config decision.

### dec-20260806-001 — 256-01's assurance:strong record is void -- empty-diff false pass, not a real certification result

- recommendation: rec-20260806-004
- decided: 2026-08-06T02:33:15.430Z

256-01's settle (2026-08-06T02:14:04.111Z) completed with assurance.overall: strong and both code-review/security-audit reporting provider: host-cli, but this is a false record: the seeded-defect fixture was committed (WIP commit 9fb2eef6) before the settle ran, so ctx.diff() (git diff HEAD -- touchedFiles) was empty for the fixture files, and security-audit's real codex call returned securityAudit: [] without ever judging the hardcoded credential -- confirmed via git diff HEAD -- fixture/seeded-defect.ts returning nothing. code-review's one persisted finding was real but incidental: CONDUCTION-RUNBOOK.md was the only touched file with an actual diff at settle time. Nothing about the seeded defect's real-provider severity was learned. Do not cite 256-01's SUMMARY.json as evidence that security-audit does or does not catch hardcoded credentials, and do not count this settle toward dec-20260801-003's 3-settle revisit trigger for code-review finding-drift (the one finding it produced was not from the intended fixture, and cannot be evaluated for message-drift against nothing). securityAudit.provider was manually reverted to mock immediately after (dec-20260803-001's baseline is intact, no lasting config drift). The real fix (rec-20260806-004) is a general gap in every diff-scoped verifier gate, not specific to this phase. Next: redo the certification as a new draft (e.g. 256-02) with the fixture staged but deliberately left UNCOMMITTED at settle time, so the real diff-scoped gates actually see it.

### dec-20260808-001 — D-A: Do not rename the mock provider identity

- decided: 2026-08-08T17:57:49.196Z

provider: 'mock' is load-bearing across config schema, SUMMARY provenance, doctor checks, and 56+ historical review artifacts. Every candidate replacement (offline/local/deterministic) reads as a legitimate long-term mode, softer than the honest 'placeholder' signal mock already sends. Renaming right after the v1.54 audit found 263 mock-only settles would read as relabeling rather than fixing the condition. v1.56 addresses mock's real precision defect (it understates what it checks) at the display layer (Phase M), not the schema layer. Recorded per HANDOFF-v1.56-verifier-honesty.md §3.

### dec-20260808-002 — D-B: Do not require a real verifier provider at cadence init

- decided: 2026-08-08T17:57:49.358Z

This repo's own codeReview.provider was already host-cli throughout the entire period in which zero real conduction occurred -- the actual blockers were profile: auto excluding review gates from every tier, and the self-invocation guard forcing mock fallback. A setup-time provider requirement targets an axis that was never the failure axis. It would also break the offline demo/cadence tutorial, hermetic CI, and this repo's own testkit fixtures, and coerces cost onto solo users. v1.56 Phases N and O deliver informed, visible, non-drifting provider state without that coercion. Recorded per HANDOFF-v1.56-verifier-honesty.md §3.

### dec-20260808-003 — v1.56 Phase O sequenced after Phase P, not before (amends HANDOFF-v1.56 §5 priority table)

- decided: 2026-08-08T17:58:18.836Z

The handoff ranks O (P1) ahead of P (P2), but dec-20260804-001 (filed during Phase 252/'Phase C') made the .cadence/config.json profile flip off 'auto' explicitly contingent on Phase P landing first -- to avoid taking on review-gate cost before the Aug 12 2026 security deadline, and because Phase P removes 'the false-confidence risk a baseline change carries today.' Without the flip, agent-driven settles keep producing mock-only provenance, so O.6's bar ('running the check after v1.55 reports a materially lower number') is unmeasurable in its intended sense -- the only real-provider settles on record are phase 256's six manually-conducted, single-fixture runs (rec-20260806-008), which that same rec calls degenerate evidence, not organic drift data. Execution order for this release: L -> M/N -> P (+ the profile flip) -> O, so O.3's threshold is measured against real post-flip settle behavior instead of a still-auto baseline. Operator-confirmed 2026-08-08.

### dec-20260808-004 — J.1 (overall: strong structurally unreachable) resolved for the profile-override path; still true for the default auto-profile path

- decided: 2026-08-08T17:58:18.985Z

v1.55 handoff J.1 claimed deriveAssuranceRecord's hasRealVerifier gate made 'strong' structurally unreachable, contingent on Phases E and C succeeding. Phase E (256-02, 2026-08-06) empirically closed this for the override path: the settle at 2026-08-06T05:20:09.913Z recorded assurance.overall: 'strong' with verifierRollup [{provider: 'host-cli', gateCount: 2}], and the preceding 04:33:37Z real host-cli security-audit call is independently confirmed (via the refused-settle snapshot) to have caught the seeded critical hardcoded-credential fixture and a high-severity console.log leak -- a genuine real-provider result, not an empty-diff false pass like the voided 256-01. Phase C (252) did not flip the baseline profile (dec-20260804-001 deferred that to Phase P), so under this repo's default auto profile + agent-driven settles, code-review/security-audit still never run and 'strong' remains unreachable exactly as J.1 described. The v1.55 handoff's named deliverable for this resolution -- a regression test whose prior absence let the gap ship -- is still owed and is in scope for v1.56 Phase P, which is the phase gated on J.1 per HANDOFF-v1.56-verifier-honesty.md E5. This decision unblocks Phase P's own entry condition.

### dec-20260808-005 — Phase L's providerSelection field widens to a third state covering empty-diff false-pass, not just configured/fallback

- decided: 2026-08-08T17:58:19.141Z

rec-20260806-004 (filed 2026-08-06, high/needs-decision) found that every diff-scoped verifier gate (code-review, security-audit) can early-return empty findings -- while still recording a normal 'ran'/provider:host-cli status -- when its diff is empty but touchedFiles is non-empty, and for the real provider this happens AFTER a live call is spawned (input.files.length === 0 && input.diff.trim().length === 0 is an AND, not an OR). This is a third epistemically distinct state Phase L's original two-value field (providerSelection: 'configured' | 'fallback') cannot represent: 'operator selected a real provider, but the gate structurally could not have judged anything.' Left uncovered, L would ship a provenance model that still can't distinguish this case from a genuine clean pass -- the exact defect class L exists to close. Phase L's DRAFT must widen the field (or add a sibling boolean/enum value) to cover this state before implementation, per operator direction 2026-08-08. Resolving this in L's design is cheaper than retrofitting after PLAN-REVIEW.

### dec-20260808-007 — providerSelection field: optional enum, no default, no schemaVersion bump (corrected citation)

- decided: 2026-08-08T19:20:49.993Z

Supersedes dec-20260808-006, which cited deepVerify as an example of an optional field added after phase 232's schemaVersion 1->2 bump -- deepVerify is actually phase 15, predating 232, a factual slip caught during T2's own verification pass. The conclusion is unaffected: the correct post-232 precedents are coverageScheme/coverageMode (phase 239), assurance (phase 233), and foreignBinaryMismatch (phase 244) -- each an optional GateProvenanceZ/SummaryZ field added after phase 232's bump with no further version bump. providerSelection: z.enum(['configured','fallback','empty-diff']).optional() on GateProvenanceZ (packages/types/src/summary.ts) follows the same pattern: no .default() (cadence summary verify content-hashes the parsed object per services/summary-hash.ts -- a default would inject the key into every historical record and falsely report tampering, the same hazard coverageScheme's own comment documents), and no schemaVersion bump. Regression test at packages/core/tests/summary-provider-selection-schema.test.ts guards the no-default constraint.

### dec-20260808-008 — Phase 263 (v1.56 Phase L): narrow providerSelection persistence to 5 seams, exclude deep-verify/per-task-verify

- recommendation: rec-20260808-007
- decided: 2026-08-08T19:32:13.286Z

The DRAFT's original AC-1 wording assumed all 5 'settle-pipeline' gates (deep-verify, per-task-verify, code-review, security-audit, plan-review) already persist provider/model identity into gates[] the same way -- false for 2 of the 5, confirmed by direct read (see rec-20260808-007). Also corrected: plan-review is not a settle-pipeline gate at all -- it fires at cadence draft approve via the same runConvergentReview sidecar mechanism as spec-review/ui-spec-review, confirmed by direct read of gates/plan-review.ts. Corrected seam grouping: 5 seams already persist SOME provider/model identity (code-review, security-audit via flags.verifierIdentity; spec-review, ui-spec-review, plan-review via runConvergentReview's sidecarJson) and get providerSelection added cleanly, additively, in this phase. deep-verify and per-task-verify persist none today and are explicitly excluded from persistence in this phase -- extending them is out of scope because deriveAssuranceRecord's hasRealVerifier reads verifierRollup.some(v => v.provider !== 'mock'), and this repo's perTaskVerifier.provider/verifier.provider are already host-cli; adding baseline provider persistence to either gate as a side effect of this phase would silently move assurance.overall toward strong on ordinary auto-profile settles with no review gate having run, which is the exact false-confidence failure v1.56 exists to close, not something to introduce as an unreviewed side effect. The tagging COMPUTATION in verifier-factory.ts (configured vs fallback, at selection time and call time) remains universal across all seven seams, satisfying the v1.56 handoff's L.3 requirement that the banner-precedent scope (Phase 243) is the correct boundary for where tagging happens -- only PERSISTENCE is narrowed. This diverges from HANDOFF-v1.56-verifier-honesty.md's L.3 as literally read (which implies all seven seams get persisted provenance); the divergence is recorded here for the report-back protocol.

### dec-20260808-009 — Phase M: render-time join over AssuranceRecordZ schema change for providerSelection

- recommendation: rec-20260808-005
- decided: 2026-08-08T22:51:04.172Z

renderSummaryForReview/renderSummaryMd already have both s.gates[] (carrying Phase L's providerSelection per gate) and s.assurance.verifierRollup in scope. Joining them by (provider, model) at render time surfaces configured-vs-fallback with zero change to AssuranceRecordZ, GateProvenanceZ, or deriveAssuranceRecord -- avoiding the retroactive-hash risk the schema's own comment warns about (packages/types/src/summary.ts:148-166) and avoiding breaking 6+ existing tests that assert an exact verifierRollup shape via toEqual (assurance-record.test.ts, registry.test.ts, settle.test.ts, types/tests/summary.test.ts). It also literally honors the HANDOFF doc's twice-stated 'display layer only' framing for Phase M. Rejected alternative: adding a providerSelection/selections field to AssuranceRecordZ.verifierRollup -- correct per schema-additive rules but unnecessary surface area and test churn when the same information is already derivable from data already in scope.

### dec-20260808-010 — Phase M: umbrella mock-capability label, not per-verifier-family variants

- recommendation: rec-20260808-005
- decided: 2026-08-08T22:51:21.022Z

The AC verifier enforces AC-test linkage; the code-review mock flags added console.log calls as HIGH, two different capabilities. One accurate umbrella sentence covering both, reused everywhere mock is displayed, keeps scope sane per the release D-A/D-B non-goals. Rejected alternative: per-family label variants; more precise per-surface but multiplies the single-source-of-truth surface this phase exists to consolidate, and no consumer of the label distinguishes gate family today.

### dec-20260809-001 — Bundle rec-20260806-010 + rec-20260809-002 into one CI-timeout-remediation phase

- recommendation: rec-20260806-010
- decided: 2026-08-09T16:26:51.505Z

Both recs surfaced independently but are the same symptom class (Windows CI resource pressure hitting per-call I/O/spawn overhead) and materialized together on PR #391's CI (two different tests timed out on the same Windows leg, in the same run). Distinct mechanisms (subprocess-spawn-per-file corpus sweep vs. serial real-disk state read/write round trips), distinct files, no shared code -- but bundling into one phase/PR gets both fixes verified against the same Windows CI run instead of two separate cycles, and the only real verification available is a green + materially-faster Windows leg, which is expensive to obtain per PR. Recorded per CLAUDE.md's Multi-Phase-Commit boundary: this is one phase's scope (CI-timeout remediation), not two phases squashed into one shot.

### dec-20260809-002 — Phase P (267): mock abstains on review gates rather than passing them

- recommendation: rec-20260808-004
- decided: 2026-08-09T21:11:11.746Z

P.1 per HANDOFF-v1.56-verifier-honesty.md Phase P. Decision: mock never marks code-review/security-audit/plan-review/spec-review/ui-spec-review as pass -- it abstains, reusing the phase-248 status:'skipped'+skipReason shape. deep-verify and per-task-verify are explicitly excluded -- there mock enforces real AC/test linkage and the evidence ladder depends on it; converting those to abstention would remove a real gate. Rejected alternative: leave mock passing review gates (status quo) -- rejected because a placeholder that approves creates false confidence indistinguishable from a genuine pass in provenance, exactly the failure mode dec-20260806-001 demonstrated live (256-01's false assurance:strong from an empty-diff mock/real early-return, not a judged pass). Rejected alternative: implement the abstention check inside each verify() method -- rejected on code inspection (2026-08-09): MockCodeReviewVerifier.verify() (verify/code-review.ts:113-124) and the mock security-audit verifier both early-return {findings: [], provider: 'mock'} the moment diff.trim() is empty, before any abstention logic inside verify() could run, which would silently reproduce the exact false-clean-pass shape this phase exists to close. The abstention decision must therefore be made at the gate/registry layer (packages/core/src/gates/registry.ts:288's status:'ran' fallback path), gated on resolved provider identity, before verify() is ever dispatched -- independent of diff content. Entry conditions E1-E5 verified against live repo state 2026-08-09: E1 (doctor clean) ok, E2 (phase 256/PR #377 merged, host-cli verifierRollup confirmed) ok, E3 (profile off auto) NOT literally met -- superseded by dec-20260804-001 + dec-20260808-003, which bundle the profile flip into this phase rather than requiring it as a precondition, E4 (phase 257/PR #379 findings-in-markdown merged) ok, E5 (J.1 'strong unreachable') superseded -- phase 256 proved strong is mechanically reachable; the residual empty-diff defect is tracked separately as rec-20260806-004/dec-20260806-001 and is a known interaction for this phase's design, not a blocker. cadence tutorial and examples/demo-test-gutting independently confirmed structurally unaffected: tutorial's SANDBOX_CONFIG runs standard-profile quick-fix tier, which per the DELTAS matrix (gates/engine.ts) carries no review-family gate; the demo runs --gate-profile auto, which carries no review-family gate at any tier.

### dec-20260809-004 — Phase 267 (P.1, corrected): mock abstention is identity-at-recording, not no-dispatch

- recommendation: rec-20260808-004
- decided: 2026-08-09T22:53:23.609Z

Supersedes dec-20260809-003, which specified 'no verifier dispatch' as part of the abstention contract. That framing was wrong on the merits, discovered when T2's implementer built it faithfully and it broke 124 pre-existing tests across 20 files (packages/core/tests/gates/code-review.test.ts, security-audit.test.ts, plan-review.test.ts, tests/services/spec-approve.test.ts, tests/services/settle.test.ts, tests/cli/settle-codereview-convergence.test.ts, and 14 more) -- sampled three of the largest (code-review.test.ts/12, security-audit.test.ts/16, settle-codereview-convergence.test.ts/6) and confirmed by reading them in full that they assert real, load-bearing mock-verifier gate behavior that Phase P's own handoff explicitly says should survive: console.log-detection as a HIGH finding, refuse/reloop/escalate convergence mechanics, --force/--allow-code-review-failure bypass mechanics, and verifier-throw error handling -- all of which requires verify() to actually dispatch under mock. No-dispatch would have silently deleted this capability, contradicting HANDOFF-v1.56-verifier-honesty.md Section 2 ('Mock is not a rubber stamp... That is real gate behavior and the project should get credit for it') and Section 10 ('Mock earns its place'). Corrected decision: verify() dispatches normally under mock, exactly as today, for all five review families. The abstention decision moves to the recording layer: when registry.ts derives gate provenance, IF the resolved provider identity is mock AND the gate's outcome is a clean pass, THEN the persisted status is 'skipped' + a skipReason naming mock (overriding what would otherwise be 'ran') -- this is what closes the false-clean-pass gap (empty-diff-under-mock, no-marker-found-under-mock), since those are exactly the cases that would otherwise silently record status:'ran'/pass. IF the gate's outcome is 'refuse' (a real finding was flagged, mock or real provider), the existing refusal recording is untouched -- a refusal is never false confidence regardless of provider, so it is never relabeled as skipped. Real (non-mock) providers are untouched in all cases. Rejected alternative: dec-20260809-003's no-dispatch design -- rejected per the above, verified empirically against three sampled test files, not merely argued. Consequence: T1's 267-01-DRAFT.md fixtures (mock-abstention-*.test.ts) require rework -- their RED assertions (verify() call count === 0) test the wrong contract and must be replaced with assertions on the derived provenance status/skipReason instead, with dispatch count now asserted as 1 (unchanged) for the mock-pass case. AC-1's DRAFT wording ('before the verifier is ever dispatched') likewise needs an As-built amendment; the actual bar is 'no configuration of CADENCE can produce persisted provenance recording a review-gate pass under a mock provider', which this corrected design satisfies without a dispatch-suppression side effect.

### dec-20260809-005 — Phase 267 (P.1, mechanism correction): plan-review/spec-review/ui-spec-review abstain via converge.ts's shared sidecar, not registry.ts

- recommendation: rec-20260808-004
- decided: 2026-08-09T23:15:39.435Z

Amends dec-20260809-004 (does not supersede it -- the core semantic decision there, outcome:'pass' + relabel-on-clean-pass-only + never-relabel-a-refuse, is unchanged and correct). dec-20260809-004's text described the recording mechanism as 'registry.ts's provenance derivation... for all five review families,' which the T1-redo's independent review (2026-08-09) caught as false for 3 of the 5: plan-review IS in the DELTAS matrix (engine.ts) but is excluded from SettleGate (registry.ts:26-29) and dispatches via draft-approve.ts calling runPlanReviewGate directly, never touching GateProvenance/SUMMARY; spec-review/ui-spec-review are absent from GateZ (packages/types/src/profile.ts) entirely and spec-approve.ts never touches SUMMARY at all. Left uncorrected, T2's DRAFT action text ('plan-review, fired via registry.ts') would misdirect an implementer into covering only 2 of 5 named families while cadence verify coverage --explain AC-1 reports satisfied:true regardless (the coverage gate cannot see which families are actually covered, only that qualified tokens exist somewhere) -- a real instance of this repo's own thesis (self-report / a passing gate is not proof) almost biting this phase from the inside. Corrected mechanism, confirmed by reading packages/core/src/verify/converge.ts directly: all four of plan-review/code-review/spec-approve x2's convergence call sites already share one primitive, ConvergentReviewHistoryEntry + runConvergentReview's sidecarJson, which already threads a required provider field (and optional model/providerSelection) into every *-PLAN-REVIEW.json/*-SPEC-REVIEW.json/*-UI-SPEC-REVIEW.json sidecar. This means plan-review/spec-review/ui-spec-review's abstention gap is smaller and lower-risk than 'design three new recording surfaces from scratch': T2 should add an abstain marker to this ALREADY-SHARED shape (e.g. a new optional field on ConvergentReviewHistoryEntry, populated when the resolved identity is mock and pass is true, mirroring registry.ts's status:'skipped' semantics for the other two families) rather than inventing per-family mechanisms. code-review/security-audit keep the registry.ts-layer mechanism from dec-20260809-004 unchanged; this decision only corrects and completes the mechanism description for the other three families, which dec-20260809-004 named but did not accurately mechanize.

### dec-20260810-001 — Phase 267 (T6): repo profile flipped auto -> standard, closing dec-20260804-001's revisit trigger

- recommendation: rec-20260808-004
- decided: 2026-08-10T00:41:38.933Z

Operator-approved 2026-08-09 (explicit choice between standard/strict/decline, presented with real gate-cost consequences per family). Value: standard, not strict. Consequence, measured via cadence doctor conduction-reachability before/after: code-review's blocker list dropped from 'blocked by profile, session' to just 'blocked by session' -- profile no longer excludes it at complex tier (codeReview.provider is already host-cli, so this makes code-review genuinely reachable, pending only the self-invocation-guard's real-terminal requirement, unchanged by this decision). security-audit remains 'blocked by profile, provider' -- standard's DELTAS never include security-audit at any tier; reaching it requires strict, declined here. Rationale for standard over strict: standard's complex-tier additions (code-review, deep-verify) are BOTH already backed by a real provider (codeReview.provider/verifier.provider are host-cli) -- the exact gap the v1.54 audit flagged as zero real conduction. strict would additionally add per-task-verify at standard tier (also real, host-cli), plan-review + security-audit at complex tier (both still provider:'mock' -- per Phase 267's own T2, these would now honestly ABSTAIN rather than silently pass, so strict's marginal complex-tier value here is provenance-honesty, not new real coverage, since dec-20260804-001's clause (c)/C.3 -- flipping securityAudit.provider off mock -- remains a separate, undecided operator flag), and interactive-verdict at quick-fix tier -- a live human-prompt requirement on every small/routine phase, not just substantive complex-tier work, judged as a real workflow-friction cost the operator did not want bundled into this decision. This closes dec-20260804-001's revisit trigger ('v1.56 Phase P lands, removing the false-confidence risk a baseline change carries today') -- Phase P (267) landed first (T1-T5, all DONE), so this flip's code-review/deep-verify conduction can no longer produce a false-confidence mock pass; any mock-served review-family result on a future settle now honestly records status:'skipped', per dec-20260809-004/-005. gates.evidenceFloor was already 'assertion' (Phase C.2, pre-existing) -- consistent with standard profile's own solo-preset default, no additional change needed. strict remains available as a future per-phase DRAFT-frontmatter override for sensitive phases (DESIGN.md M4), not foreclosed by this baseline choice.

### dec-20260810-002 — Phase 267 (fix round): converge.ts sidecar persists verdict:'abstained'+pass:false/converged:false for mockAbstained entries, not pass:true+sibling flag

- recommendation: rec-20260808-004
- decided: 2026-08-10T01:38:33.056Z

Amends dec-20260809-005 (does not supersede it -- the two-mechanism split by family, code-review/security-audit via registry.ts vs plan-review/spec-review/ui-spec-review via converge.ts's shared sidecar, is unchanged and correct). dec-20260809-005's sidecar shape kept historyEntry.pass:true and verdict:'pass' on a mockAbstained entry, adding only the sibling mockAbstained:true flag alongside -- reasoned at the time as inert legacy-reader bookkeeping. The first real (host-cli, not mock) deep-verify pass this repo has run on an organic phase refused AC-1 directly on this: pass:true is itself a literal persisted 'pass', and AC-1's bar ('no configuration of CADENCE can produce a persisted pass for that gate under mock') does not carve out an exception for 'annotated with a sibling flag' -- it mirrors registry.ts's status:'ran'->'skipped' relabel, which replaces the value, not just adds a flag next to an unchanged one. Verified the control-flow claim precisely before changing anything: draft-context.ts's sidecar reader (the only place a prior sidecar is read back) consumes exactly prior.attempts (a number) and prior.history (an opaque, append-only array never filtered by pass) -- no code path anywhere reads historyEntry.pass/verdict/sidecarJson.converged back for control flow, confirming it was safe to change what gets written without touching reloop/escalate. Corrected: runConvergentReview now persists pass:false, converged:false, and verdict:'abstained' (a new PersistedVerdict value, distinct from the ConvergeVerdict type that drives control flow via the separately-returned nv) for a mockAbstained entry. nv itself, and specApproveService's own res.data.converged (which reads the fresh res.pass, never the sidecar), are completely untouched -- convergence behavior is unchanged, only the persisted record's honesty improved. Updated 8 pre-existing sidecar-shape test assertions (toEqual/toBe preserved, not loosened) across plan-review.test.ts and spec-approve.test.ts.

### dec-20260810-003 — Phase 267 (fix round 3): code-review.ts's own CODE-REVIEW.json sidecar also abstains under mock, independent of registry.ts's SUMMARY-level relabel

- recommendation: rec-20260808-004
- decided: 2026-08-10T01:51:55.726Z

Corrects dec-20260809-005, which excluded code-review.ts's own runConvergentReview call site from ever setting mockAbstained, reasoning that registry.ts's SUMMARY-level GateProvenance status:'ran'->'skipped' relabel (dec-20260809-004) alone satisfied AC-1 for the code-review gate. A second real (host-cli, not mock) deep-verify pass on this phase's fix round caught that this reasoning was wrong: CODE-REVIEW.json is a SEPARATE, independently-readable persisted artifact from SUMMARY.json's GateProvenance entry -- a reader of the sidecar alone (not SUMMARY) would still see an unqualified pass:true/converged:true/verdict:'pass' for a mock-identified clean pass, exactly the 'persisted pass' AC-1 forbids, regardless of what SUMMARY.json separately says. security-audit.ts has no equivalent sidecar (verified: no runConvergentReview call, no SECURITY-AUDIT.json), so this gap was specific to code-review.ts among the two registry.ts-routed families. Fixed: code-review.ts now computes its own local mockAbstained = verifyResult.provider === 'mock' && pass === true (pass being the gate's own HIGH-only-derived local value, mirroring plan-review.ts's identical pattern) and passes it into its runConvergentReview call. This is fully isolated from registry.ts's own verifierIdentity/reviewFindingsBypassed computation -- no shared state between the two mechanisms, each call site computes its own flag from its own local state, exactly as dec-20260809-005's original isolation goal intended; only the blanket 'code-review.ts must never set this' conclusion was wrong. Updated code-review.test.ts (1 sidecar-shape assertion, toEqual preserved) and settle-codereview-convergence.test.ts (1 CLI-integration assertion, real dist-spawned subprocess) to match; both were the only 2 places asserting a persisted pass:true for this sidecar.

### dec-20260810-004 — Phase O (268): build the drift counter now, defer O.3's measured threshold

- recommendation: rec-20260808-003
- decided: 2026-08-10T15:47:01.933Z

Operator choice (2026-08-10), presented with the measured gap: only 3/280 SUMMARY.json carry a non-mock verifierRollup entry, and 0 postdate 267's profile flip off auto -- O.3's literal bar ('materially lower number, measured not guessed, after v1.55') has no post-flip data to measure yet. Rejected: (b) treat dec-20260801-003's three-settle convention as satisfying O.3 outright -- that decision's '3' is config.convergence.maxAttempts reused for a different trigger (code-review finding-persistence dedup revisit), not a measurement of this counter's streak; borrowing the number doesn't manufacture the missing post-flip demonstration. Rejected: (c) wait for real data before drafting -- leaves O.1/O.2/O.4/O.5/O.6 (counter derivation, doctor/status surfacing, severity escalation shape, warning-not-refusal, corpus baseline report) blocked on a threshold question that doesn't gate them. Decision: ship O.1/O.2/O.4/O.5/O.6 this phase. Use dec-20260801-003's 3 as a PROVISIONAL escalation threshold (a recorded prior convention, not invented, but explicitly not yet validated as 'materially lower after v1.55' per O.3's own bar). Record the threshold as provisional in code comments/docs. O.3's full bar -- the measured before/after comparison -- is deferred to a follow-up once real-provider settles accumulate under the now-standard profile; this phase's own corpus report (O.6) becomes the first data point for that follow-up.

### dec-20260810-005 — Phase O (268): add an indeterminate rung to DoctorSeverity, resolving v1.55 J.2

- recommendation: rec-20260808-003
- decided: 2026-08-10T16:12:52.921Z

Operator choice (2026-08-10), presented with the fork: AC-1's streak counter can return indeterminate on missing/malformed corpus data, and DoctorSeverity (packages/core/src/doctor/model.ts) is currently only 'ok'|'warning'|'error' -- no honest place to render that state. v1.55 J.2 raised this exact question (published-contract change) and was never resolved by a recorded decision. Rejected: render indeterminate as 'warning' with distinct text (smaller blast radius, no schema change) -- rejected because it still leaves DoctorSeverity's shape lying about cardinality and doesn't close J.2. Rejected: stop and report, treat as out of scope for 268 -- rejected because the operator chose to resolve it now rather than defer a second open question inside the same phase. Decision: extend DoctorSeverity to 'ok' | 'warning' | 'error' | 'indeterminate'. Scope confirmed by direct read: only packages/core/src/doctor/model.ts defines the type; consumers needing review are DoctorReport.ok's roll-up boolean (currently 'no check is error-severity' -- decide whether indeterminate also excludes ok:true), the fail() helper family (currently typed 'warning' | 'error' only, needs widening or a sibling helper), packages/core/src/doctor/fix.ts (fix-planner classification), and packages/core/src/cli/commands/doctor.ts (CLI/JSON rendering + exit code). This phase's own AC-1/AC-2 counter check is the first real consumer of the new rung; all pre-existing doctor checks must continue to render exactly as before (no existing check silently starts reporting indeterminate).

### dec-20260811-001 — D-E: security-audit stays unreachable through v1.56 (option 2, matrix change, deferred to v1.57)

- recommendation: rec-20260811-001
- decided: 2026-08-11T00:33:49.763Z

security-audit occupies only the strict x complex DELTAS cell (packages/core/src/gates/engine.ts:28); this repo's own profile is standard, so security-audit is structurally unreachable at every tier this repo actually runs, and securityAudit.provider defaults to mock. Operator decision (D-E from docs/handoffs/HANDOFF-v1.56-release-closeout.md, external-audit-authored) presented 3 options for v1.56: (1) leave as-is and record why, (2) add security-audit to standard x complex -- a gate-matrix change requiring its own DESIGN.md-scoped phase, out of scope for v1.56, (3) override profile to strict for complex-tier work via dec-20260803-001's DRAFT-level mechanism. Operator chose option 1 for this release: leave the matrix as-is, ship v1.56 with security-audit still unreachable under the default profile, and record this as a deliberate, documented choice rather than silence. Option 2 is filed as v1.57 input (see rec-20260811-001). Option 3 remains available per-phase at any time via dec-20260803-001's existing mechanism -- this decision does not foreclose an operator choosing it later for any specific complex-tier phase. Revisit trigger: reconsider before v1.57 if a real security-relevant regression ships that a real security-audit conduction would plausibly have caught.

### dec-20260811-002 — Reaffirm deep-verify/per-task-verify provenance exclusion through v1.56.0, defer to v1.57

- recommendation: rec-20260808-007
- decided: 2026-08-11T04:05:00.984Z

Re-verified 2026-08-11 (phase 272): deep-verify.ts still writes provider/model only into deepVerify[]/deepVerifyMeta, never into a gates[] entry's flags.verifierIdentity; per-task-verify.ts still persists no provider identity anywhere -- both match rec-20260808-007's original 2026-08-08 finding unchanged. dec-20260808-008's rationale still holds: this repo's perTaskVerifier.provider/verifier.provider are already host-cli, so naively adding baseline persistence to either gate would silently move deriveAssuranceRecord's overall toward 'strong' on ordinary auto-profile settles with no review gate having actually run -- the exact false-confidence failure mode v1.56 exists to close. It changes verifierRollup semantics and belongs behind its own phase with its own review, not folded into this correctness pass. Reaffirmed for v1.56.0: no implementation in this release; scheduled as v1.57 input.

### dec-20260812-002 — D-H: 'unobservable' evidence class sits off-ladder, orthogonal to AcEvidenceZ

- recommendation: rec-20260811-008
- decided: 2026-08-12T03:22:36.065Z

Follows D-G (dec-20260812-001). Modeled on the indeterminate precedent for DoctorSeverity (dec-20260810-005, one release old) rather than as a new peer member of the ai-verified/executed/assertion/mention/unverified ladder. Driving constraint: AcEvidenceZ is z.enum([...]) and evidenceTally is z.record(AcEvidenceZ, ...) -- both keyed directly on the enum's value space. Extending the enum would perturb every exhaustive consumer (deriveAcEvidence, rankEvidence, meetsEvidenceFloor, checkEvidenceFloor) and risk breaking Phase T's own AC-4 requirement that every historical SUMMARY.json still content-hashes identically. Off-ladder leaves AcEvidenceZ and its consumers untouched; absent stays absent on historical records; the new state is carried as a separate marker on the DeepVerdict record instead (additive optional field, no schemaVersion bump).

### dec-20260812-003 — D-I: reaffirm security-audit deferral at profile=standard, do not reopen the DELTAS matrix in v1.57

- decided: 2026-08-12T03:23:45.928Z

Reaffirms dec-20260811-001's prior deferral (tied to shipped rec-20260811-001, now archived so not linkable via --rec here) of this DELTAS matrix change to v1.57. security-audit is unreachable at profile=standard (repo default) at every tier, and 0 of 285 settles have ever conducted one. Making it reachable now would land the first-ever real security-audit conduction in project history inside the same release that is changing deep-verify's verdict semantics (dec-20260812-001, dec-20260812-002) -- that cuts against this handoff's own no-bundling argument for keeping substrate changes separate from new surface exposure. Revisit as its own release once v1.57 has run against a few normal phases. If reopened later, it is a three-file lockstep: DESIGN.md section 4.2 first, then engine.ts DELTAS, then docs/concepts.md, in that order.

### dec-20260812-004 — D-G (corrected measurement): unobservable-AC criteria get a new settle-time verdict class, DRAFT-time refusal deferred to v1.58

- recommendation: rec-20260811-008
- decided: 2026-08-12T03:28:36.370Z

Corrects dec-20260812-001: that decision's CMD-B regex had a real bug (bare $ inside a multiline-mode lookahead truncated every AC body capture to just its first/Given line), so its cited 10-hits/8-phases/0.8% figure never actually inspected any Then-clause and is not a valid measurement -- verified directly against 272-01-DRAFT.md, whose own AC-1/AC-4 (containing the literal trigger phrase) were silently excluded by the bug. Re-measured with a corrected block-splitter. A broad stdout/command-output keyword sweep returns 54 hits/41 phases (4.13%) but is mostly false positives -- ACs like Logger never writes to stdout are fully observable via the diff and a linked test, not unobservable by construction. Tightening to the actual rec-20260811-008 signal (the Then-clause makes SUMMARY.md/SUMMARY.json content itself, not the diff or a test, the verification target -- pasted into the SUMMARY / this phase's own SUMMARY.json inspected) returns 5 ACs across 2 phases (0.38%): phase 272's AC-1/AC-4/AC-7 (the motivating case) and old phase 29-shakedown's AC-1/AC-2 (a friction-log deliverable, structurally the same circularity). The corrected figure is smaller than originally claimed, not larger -- it reinforces rather than reverses the staged decision (option 3 leading with option 2): population is tiny, a settle-time verdict class is cheap, and a DRAFT-time refusal should wait for more evidence than 5 historical instances. Decision direction unchanged from dec-20260812-001; only the supporting figure is corrected.

### dec-20260813-001 — W.0: rec-20260812-004 is a duplicate of rec-20260809-001 -- reconciled into the earlier filing

- recommendation: rec-20260812-004
- decided: 2026-08-13T02:29:15.551Z

Both recs describe the identical scanTestCoverage per-file AC-token dedup defect at coverage.ts:140-142 (keyed on ${acId}@${file}, no per-occurrence disambiguation), independently discovered 6 days apart from different triggering shapes: rec-20260809-001 (2026-08-09, phase 264) from a describe()-title/child-it() token collision; rec-20260812-004 (2026-08-12/13, phase 274 build) from sibling asserting it() blocks sharing one token in the same file, with 3 confirmed real deep-verify refusals plus a spotted third instance. rec-20260809-001 has the earlier id and is already readiness=ready-for-cadence-spec (further along); rec-20260812-004's richer evidence (ev-20260813-006) and priority=high signal are merged into rec-20260809-001 rather than the reverse, per v1.57 arc doc W.1-W.4's ledger-reconciliation charter (docs/handoffs/HANDOFF-v1.57-criteria-honesty.md). rec-20260812-004 is rejected as a duplicate, not because the finding is wrong -- it corroborates and strengthens rec-20260809-001.

### dec-20260813-002 — Phase U (v1.57 arc): skipped -- D-I already reaffirmed security-audit deferral

- decided: 2026-08-13T02:29:29.645Z

docs/handoffs/HANDOFF-v1.57-criteria-honesty.md's Phase U is explicitly conditional: 'If D-I reaffirms deferral, skip this phase and record why.' dec-20260812-003 (D-I, recorded during phase 274's build, active in main as of 492a3886) already reaffirmed security-audit deferral at profile=standard and declined to reopen the DELTAS matrix in v1.57. Phase U's own U.1-U.3/AC (move securityAudit.provider off mock, confirm conduction-reachability) therefore does not apply this release. No source changes made. Revisit only if a future dec supersedes dec-20260812-003.

### dec-20260813-003 — W.2: reaffirm dec-20260810-004's deferral of O.3's measured threshold -- corrected real-data measurement recorded, no new number invented

- recommendation: rec-20260811-003
- decided: 2026-08-13T02:34:03.313Z

Re-measured live (2026-08-13, post-Phase-T) against the actual computeConductionDriftStreak algorithm (packages/core/src/doctor/run.ts:1697), not a naive full-corpus walk: complex-tier is 31/286 drafts (~10.8%). The determinate-eligible corpus (settles carrying assurance.verifierRollup, i.e. phase ~245 onward / earliest completedAt 2026-07-29) is 35 records; simulating the real most-recent-first streak algorithm chronologically across that corpus shows 23/35 (66%) of settles would have reported doctor's conduction-drift-streak as warning (streak>=3) at that point in time; max streak reached within the corpus is 16. Current live streak is 0 (reset by phase 274's real conduction). This confirms rec-20260811-003's structural concern empirically: at profile=standard's current complex-tier rate, the PROVISIONAL threshold=3 (CONDUCTION_DRIFT_STREAK_WARN_THRESHOLD, dec-20260810-004) is in a warning state roughly 2 out of 3 settles historically, not an occasional edge case. Decision: do not invent a replacement threshold value in this decisions-only phase (W is explicitly no-source-changes) -- that is design work for a future phase, not a ledger reconciliation. Instead: reaffirm dec-20260810-004's original deferral of O.3 ('materially lower [streak], measured not guessed, after v1.55'), and record that O.3's measurement now has a real 35-settle corpus to work from (it did not at dec-20260810-004's time) -- O.3 should be prioritized for v1.58, not deferred indefinitely. rec-20260811-003 stays candidate/needs-decision, readiness unchanged, pending a future phase that redesigns or re-tunes the threshold with this data as its baseline.

### dec-20260813-004 — W.3: reaffirm documented-blocker posture -- no CLI path exists to close a milestone whose sole rec shipped out-of-band; building one is out of scope for a decisions-only phase

- recommendation: rec-20260811-004
- decided: 2026-08-13T02:34:42.218Z

Confirmed live: mil-rec-rec-20260808-003 remains status=proposed (cadence milestone list) even though its sole recommendation rec-20260808-003 shipped directly as phase 268, bypassing the normal accept->export->build flow. cadence milestone close refuses ('cannot close milestone in status proposed') since it only accepts an exported milestone -- there is no transition for this shape. Phase W is decisions-only (docs/handoffs/HANDOFF-v1.57-criteria-honesty.md: 'Decisions and status transitions only. No source changes.'), so building the missing CLI path is out of scope here regardless of which resolution is preferred -- doing so would also violate W.3's own explicit instruction not to hand-edit .cadence/intelligence/ as a workaround. Decision: reaffirm the documented-blocker posture (rec-20260811-004 stays candidate/needs-decision/priority=low, unchanged) rather than force a workaround; the missing milestone-state-machine transition (same class as rec-20260803-001's recommendation-ledger gap) needs its own future phase if the operator wants it fixed. mil-rec-rec-20260808-003 stays visibly proposed as an honest, if cosmetically stale, record -- not silently mutated.

### dec-20260814-001 — D-M: accept archiveReason=manual for the pre-phase-102 archive backfill

- decided: 2026-08-14T01:51:04.168Z

The cadence recommendation archive CLI hardcodes archiveReason='manual' (recommendation.ts:514); it does not distinguish a genuine ad-hoc manual archive from a bulk backfill. Chose option 3 from HANDOFF-archive-backfill-CORRECTED.md $3 (D-M): accept 'manual' rather than add a --reason flag. Rationale: status still carries the substantive truth (shipped/rejected) for every backfilled record, and the 21 records archived in phase 276 on 2026-08-14 are identifiable as the pre-phase-102 backfill cohort by their archivedAt timestamp (2026-08-14T01:50:3*Z) without adding any new CLI surface for a one-time migration. Option 2 (a --reason flag) was rejected as unwarranted surface area for a single backfill event, consistent with this repo's zero-runtime-dependency/minimal-surface bias.

### dec-20260815-001 — D-DQ1: Task execution class -- declared field wins, heuristic cross-checks via coherence warn

- recommendation: rec-20260815-001
- decided: 2026-08-15T01:57:52.339Z

Declared class: (TaskZ.class) wins when present; a pure heuristicTaskClass(task) cross-checks and disagreement emits a coherence warn (never a blocker), naming both values. Chosen over heuristic-only because a 99-task/17-phase corpus sample shows the heuristic carries real information (non-degenerate distribution across mechanical/standard/complex, no bucket >90%) -- so per the arc's own standing rule ('if the heuristic carries no information, report that'), it should be wired, not skipped. The DESIGN.md S4.3 M3 pattern this was originally justified by does NOT exist as running code -- classify/tier.ts's classifyTier is real but never wired into coherence/check.ts (which today only implements DECISION_TOUCH/PROJECT_FORBIDDEN); this decision's warn is the first real instance of that pattern, not a continuation of an existing one. Corpus sampling also found a real precedence bug in the naive rule: tasks with files.length<=1 but depends.length>=2 (6/99 sampled) must classify complex, not mechanical -- the depends-based complex rule must be checked before the file-count mechanical rule.

### dec-20260815-002 — D-DQ2: boundaryEnforcement escalates to block, dispatch-scoped, once DP-B lands

- recommendation: rec-20260718-004
- decided: 2026-08-15T01:57:52.524Z

Once DP-B ships, boundary enforcement escalates to 'block' for any phase where a task has been recorded with execution:dispatch -- regardless of the global config/draft value, which may stay 'warn'. Implemented as a pure additive third parameter on effectiveBoundaryEnforcement(config, draft, progressSignal?: {anyTaskDispatched}) rather than mutating draft.boundaryEnforcement at runtime -- confirmed no DRAFT-rewrite mechanism exists anywhere in this codebase (grep -rln writeDraft|rewriteDraft|persistDraft packages/core/src -> 0 hits), and mutating an authored/reviewed DRAFT.md at runtime would violate the repo's refuse-plus-suggest-never-silently-mutate convention. Both DP-B's record-time check and the existing settle-time gates/boundary-scan.ts gate (Phase 156) call the same function, so both inherit the escalation once each call site passes the computed signal -- one mechanism, not two. Chosen over staying globally warn (loses the enforcement DP-B is built to provide) and over flipping DELTAS-matrix cells (a separate, unrelated standing question with its own deferral history). This change touches no config file (.cadence/config.json unchanged), so it ships inside DP-B's feature commit, not a separate one.

### dec-20260815-003 — D-DQ3: contextBudgetThreshold stays inert this arc -- tokenUtilization is a fake signal

- recommendation: rec-20260815-001
- decided: 2026-08-15T01:57:52.697Z

config.telemetry.tokenUtilization does not measure real token/context usage -- confirmed by direct read of hooks/handlers.ts:73-74, it is a flat +0.01-per-UserPromptSubmit counter capped at 1, used only for a human-readable 'Token utilization: N%' line in render/state-md.ts. Feeding this into a dispatch verdict would cite a fabricated number. classifyTaskExecution's signals.contextUtilization is therefore always null this arc, and no verdict's reasons[] ever names contextBudgetThreshold -- AC-A3 makes this absence explicit and tested rather than silently skipped. Revisit once real orchestrator context-utilization telemetry exists.

### dec-20260815-004 — D-DQ4: stop-condition coherence severity is warn, not a blocker, for now

- recommendation: rec-20260718-003
- decided: 2026-08-15T01:57:52.872Z

A dispatch-classified task that declares files: but no stop: gets a coherence warn (STOP_CONDITION_MISSING), never a block. A blocker on a brand-new DRAFT field would refuse every pre-existing draft that predates it. Revisit against retro data (the phase-212 retro-feedback pipeline is the natural evidence source) once there's a real corpus of stop:-bearing drafts to measure against.

### dec-20260815-005 — D-N: cadence done becomes a true alias for build task --status=DONE

- recommendation: rec-20260815-002
- decided: 2026-08-15T22:12:44.592Z

done delegates to buildTaskService with status: 'DONE' and no other flags, rather than growing a matching --allow-per-task-failure/--allow-boundary-breach/--execution surface. done's whole value is being the short command; matching build task's guarantees on the alias while keeping its flag surface minimal is the smaller, more honest change. Consequence (user-visible behavior change, called out in the changeset): cadence done in a phase where boundaryEnforcement resolves to block, or where per-task-verify would refuse, can now refuse -- with no bypass flag available on done itself. Previously done always succeeded. Anyone needing a bypass must use build task <id> --status=DONE --allow-per-task-failure / --allow-boundary-breach instead. docs/reference/commands.md's done section documents this explicitly (AC-A5).

### dec-20260815-006 — D-N2: done inherits buildTaskService's unknown-task-id guard too, a third pre-existing gate

- recommendation: rec-20260815-002
- decided: 2026-08-15T22:46:42.067Z

During T4's build, routing done through buildTaskService broke a pre-existing done.test.ts case ('records DONE with empty notes when --notes omitted') that calls 'cadence done T2' against a DRAFT scaffolded with only T1 declared. Under the old recordTaskOutcome path this always exited 0 (no task-id validation at all); under buildTaskService it now exits 2 with 'unknown task id T2 ... Nothing recorded.' Verified via git log -S 'unknown task id' -- packages/core/src/services/build-task.ts: this guard is from phase 58 (7cb76955), which long predates phase 280 and this phase -- build task T2 against a T1-only draft has ALWAYS refused. done T2 succeeding was always the anomaly; the pre-existing test's use of T2 was incidental to testing --notes defaulting, not a deliberate assertion that an undeclared task id should succeed. Resolution: amend AC-4 (both SPEC and DRAFT) to scope 'neither gate would refuse' to the three gates done now inherits -- per-task-verify, boundary/redundancy, and this unknown-task-id guard -- and correct the one pre-existing test to use a declared task id (T1) instead of the never-valid T2, preserving exactly what it tests (--notes default behavior). This is D-N2 because it is a distinct behavior-change dimension from D-N (D-N covered per-task-verify/boundary refusal with no bypass flag on done; this covers unknown-task-id refusal, a different exit code (2, not 1) done never surfaced before). docs/reference/commands.md and the changeset must name all three inherited gates, not two.

### dec-20260815-007 — D-N3: buildTaskService gains an additive optional anomalySource param for the LoopViolation tag

- recommendation: rec-20260815-002
- decided: 2026-08-15T22:59:35.198Z

T4's independent reviewer, running the full suite (not just the cli/done filter), found that packages/core/tests/cli/loop-violation.test.ts's pre-existing, unmodified AC-4 case ('cadence done shortcut from IDLE -> loop-violation event with source=build.done') regressed: buildTaskService's catch block hardcodes emitLoopViolation(repoRoot, err, 'build.task') at build-task.ts:363, so done.ts delegating entirely to buildTaskService has no interception point to relabel the anomaly source back to 'build.done'. This is real AC-4-violating observable behavior drift, not a false positive -- confirmed via full suite run (2 failures, one is this) and by reading the hardcoded literal directly. block.ts and needs-context.ts are unaffected (out of scope for this phase, still call recordTaskOutcome + emitLoopViolation directly with their own 'build.block'/'build.needs-context' tags), so this asymmetry is specific to done's new full delegation, not a pre-existing repo-wide pattern. Resolution: add an additive optional args.anomalySource?: string to buildTaskService (default 'build.task', preserving build task's and any other untouched caller's behavior exactly), threaded into its internal emitLoopViolation call in place of the hardcoded literal. done.ts passes anomalySource: 'build.done'. This requires amending the DRAFT's 'DO NOT change buildTaskService itself' boundary -- narrowly, to permit only this one additive optional field, mirroring the D-N2 as-built-amendment process. No schemaVersion bump; no behavior change for build task or the MCP surface (both omit the new field).

### dec-20260816-001 — Fix demo-gutting-coverage-scheme.test.ts flake via per-test timeout, not global bump

- recommendation: rec-20260811-006
- decided: 2026-08-16T02:47:13.494Z

8 identical 'Test timed out in 20000ms' occurrences 2026-08-11 through 2026-08-16 across ubuntu-latest and macos-latest, several on zero-code-diff PRs, confirmed load-driven and not OS-specific (ev-20260811-006 through ev-20260816-002). Operator explicitly chose (2026-08-16, via AskUserQuestion) to raise this one test's own vitest timeout (20_000 -> 90_000, packages/core/tests/integration/demo-gutting-coverage-scheme.test.ts) rather than vitest.shared.ts's global TIMEOUT_MS, which would loosen the 20s ceiling for ~4000 unrelated tests to fix one known-slow spawnSync-heavy integration test. Landed on chore/ship-rec-20260815-002 (PR #434), commit 9024d4b7.

### dec-20260816-002 — D-P amendment: four coverage-dedup filings exist, not three; primary chosen on decision-carrying not chronology

- recommendation: rec-20260807-001
- decided: 2026-08-16T03:12:55.006Z

The v1.60 plan doc (docs/handoffs/HANDOFF-v1.60-dispatch-release-and-coverage-determinism.md) names rec-20260807-001 as 'the original filing' of the per-file coverage-dedup ordering bug and proposes converting rec-20260809-001 + rec-20260814-002 to it. The §8 dedup preflight surfaced a fourth filing, rec-20260730-002 (2026-07-30), which predates rec-20260807-001 (2026-08-07) by 8 days, names the identical two files (verify/coverage.ts, gates/coverage.ts), describes the identical mechanism (first-occurrence-wins dedup claims the slot before qualifying is computed), and even proposes the identical candidate fix wording later adopted as D-O option (1). Its evidence (ev-20260730-002, ev-20260808-001) is the earliest and most direct: two independent real production hits (phase 239 T7, phase 261 settle) plus a note in ev-20260808-001 that explicitly foreshadows what became rec-20260814-002's --explain-vs-gate divergence finding. The doc's chronology claim is therefore wrong. Despite that, rec-20260807-001 remains the correct --from-rec primary: it is the rec carrying the open needs-decision (D-O) this phase resolves, and --from-rec seeds a SPEC from the decision-carrying rec, not strictly the earliest timestamp. Resolution: rec-20260730-002 converts into this phase alongside rec-20260809-001 and rec-20260814-002 (four filings, one phase), and rec-20260807-001 stays --from-rec. Distinct from rec-20260730-001 (phase-replay coverageMode provenance) -- different files, different mechanism, a title-similar near-miss, explicitly out of scope.

### dec-20260816-003 — D-O: fix coverage dedup via prefer-qualifying (option 1), not drop-dedup or align-explain-down

- recommendation: rec-20260807-001
- decided: 2026-08-16T03:13:07.885Z

packages/core/src/verify/coverage.ts's per-file dedup (assertion mode, and mirrored in mention mode) claims the (id, file) slot on first regex match, then computes qualifying/skipped afterward -- so a non-qualifying occurrence (describe() title, comment) earlier in a file's text permanently shadows a genuinely-qualifying it()/test() occurrence later in the SAME file. Taking option (1): compute qualifying/skipped BEFORE the slot claim, and let a qualifying occurrence displace an already-recorded non-qualifying one for the same (id, file). This preserves the one-occurrence-per-file output shape every downstream consumer (gates/coverage.ts's uncoveredAcs/weaklyLinkedAcs/skippedOnlyLinkedAcs, deep-verify.ts's tests[id] feed) already assumes, and matches rec-20260814-002's real complaint (the gate and --explain must resolve to the SAME answer) by making the gate correct rather than making --explain equally wrong (option 3, explicitly rejected). Option (2) (drop the dedup, record every occurrence) is not taken: reproduction (C.1) found the per-file dedup itself is deterministic (regex match order, not filesystem-dependent) -- the separate, genuinely non-deterministic defect is listAllFiles's unsorted directory walk feeding cross-file array order in out.get(id), which option (1) does not touch and which needs its own fix (sort the file list) to satisfy AC-C1's map-deep-equal requirement.

### dec-20260816-004 — Phase D folds into Phase C itself, not a future phase

- recommendation: rec-20260807-001
- decided: 2026-08-16T03:13:08.069Z

The plan doc's §7 wording ('fold into the next non-trivial phase... whichever phase runs next after C') is ambiguous about whether C counts. Phase 280 already deferred this exact live exercise once (zero stop: fields, anyTaskDispatched false for its own build) -- deferring again risks the same pattern repeating indefinitely while the dispatch-scoped block escalation stays permanently untested in production. Resolution: Phase C itself is the dispatch-driven exercise. Every task in 282-coverage-scanner-determinism's DRAFT declares an explicit stop: condition from authoring (not retrofitted), and at least one task is recorded via cadence build task <id> --execution dispatch, which flips anyTaskDispatched true and escalates boundaryEnforcement to block for the remainder of the phase. Expect friction (stray-file refusals from review fix rounds, per §7's own warning) -- that friction is the intended data, not a reason to revert to warn mode mid-phase.

### dec-20260816-005 — D-R: bypass/deepVerify honesty enters via a new third argument to deriveAssuranceRecord, acResults untouched

- recommendation: rec-20260816-002
- decided: 2026-08-16T17:59:19.319Z

Option 1 of HANDOFF-assurance-honesty.md's D-R. acResults[].pass records the true settle outcome (the AC really was accepted under --force); flipping it to false would make the artifact claim the settle failed when it in fact settled -- a different lie, not a fix. AC-E1 (cap on error-severity gateBypasses) and AC-E2 (deepVerify pass:false ACs excluded from strongRatio) are both satisfiable from a single new argument carrying {gateBypasses, deepVerify} into deriveAssuranceRecord, with no change to acResults or its consumers (verify phase, phase-replay, drift report, summary render, evidence floor).

### dec-20260816-006 — D-S: cap overall at mixed on error-severity bypass, no AssuranceRecordZ schema change

- recommendation: rec-20260816-002
- decided: 2026-08-16T17:59:28.194Z

Option 1 of HANDOFF-assurance-honesty.md's D-S, not option 2 (new 'overridden'/'forced' enum rung) or option 3 alone (orthogonal bypassed flag, overall left as-is -- which by itself fails AC-E1). Empirical check (2026-08-16): every consumer that reads assurance.overall already has the whole SUMMARY object in scope (summary-writer.ts:51, summary-render.ts:61 both render 's.assurance.overall' with 's' -- the full summary, including gateBypasses -- already in hand); no consumer reads overall in true isolation. That removes the case for a schema change: cap 'overall' at 'mixed' when an error-severity gateBypasses entry is present (AC-E1), and satisfy AC-E6's 'surface alongside' requirement by having summary-render.ts/summary-writer.ts print the existing gateBypasses array next to the assurance line -- no new field on AssuranceRecordZ, so no exhaustive-switch break for readers and no additive-only exception needed. warn-severity-only bypasses do not force the cap; AC-E2's ratio math (deepVerify pass:false excluded from strongRatio) already independently suppresses 'strong' whenever a real verifier failure occurred, regardless of severity.

### dec-20260816-007 — D-T: dec-20260728-001's gate-agnostic invariant is honored, not relitigated

- recommendation: rec-20260816-002
- decided: 2026-08-16T17:59:37.878Z

gateBypasses entries carry a 'gate' field; the new third argument to deriveAssuranceRecord must be read via severity/flag only, never branch on entry.gate -- that would violate the phase-233 tripwire dec-20260728-001 established. The existing tripwire test in tests/gates/assurance-record.test.ts must pass unmodified (AC-E4); a new test asserts the bypass-aware path specifically doesn't read .gate. Docstring on deriveAssuranceRecord gets extended in the same commit to describe the third argument under the same gate-agnostic framing.

### dec-20260816-008 — D-U: report-only, no backfill of historical SUMMARY.json grades

- recommendation: rec-20260816-002
- decided: 2026-08-16T17:59:38.051Z

Settled per HANDOFF-assurance-honesty.md §3 (not a genuine fork -- repo's standing posture is report-never-rewrite, and summary verify-all exists to detect exactly this class of tampering). AC-E5's corpus report enumerates every one of the 294 records whose grade would change under the new rule (phase id, old->new), read-only, with summary verify-all reporting 0 MISMATCH / 0 failed both before and after the code change -- capturing the 'before' run is part of this decision, not just the 'after'.

### dec-20260820-001 — D-V: 282-01/AC-2 amended -- pre-fix repro proven impossible

- decided: 2026-08-20T21:55:17.744Z

282-01/AC-2's original Given demanded reproducing a non-deep-equal map / run-to-run-varying array order across repeated pre-fix runs. The T2 As-built amendment block in 282-01-DRAFT.md (independent-reviewer finding) proved this literal reproduction impossible: reverting the fix and running the fixture 10x in-process showed readdir on an unmutated directory returns a stable order within a single process -- all 10 pre-fix runs returned the identical (but reversed-from-canonical) [gamma, beta, alpha] order, so a naive mutual 10-run deep-equal loop passes vacuously even on unfixed code. The real, demonstrated defect is stable-but-non-canonical order (an artifact of unsorted readdir + LIFO-stack DFS traversal, with no cross-process/cross-filesystem stability guarantee), not observable run-to-run variance within one invocation. Decision: amend AC-2's text (282-01-DRAFT.md's AC-2 heading, executed in 284-01/T2) to match the corrected Given rather than attempt to strengthen a test to chase a defect shape that cannot occur -- coverage-determinism.test.ts's existing pinned-order assertion already catches the real defect and is a stronger, more honest regression guard than AC-2's literal wording asked for.

### dec-20260820-002 — D-V: 282-01/AC-4 split verdict -- runs-summary-verify-all strengthened, phase-id-enumeration already satisfied

- decided: 2026-08-20T21:55:27.536Z

host-cli's deep-verify objection to 282-01/AC-4 read: 'The linked test only string-matches a report; it neither runs summary verify-all nor verifies phase-id enumeration in the settle summary, so the operational AC is untested.' Investigation split this into two independently-judged clauses. (1) runs-summary-verify-all: genuinely survives review -- the existing linked test only string-matched a hand-written markdown transcript claiming the command had been run, and never actually re-invoked cadence summary verify-all as part of the test, so nothing there would catch a regression. Closed via D-V option 3 (strengthen the test): 284-01/T4 adds a genuinely operationally-real assertion extending the existing summary-verify-sweep.test.ts corpus-wide sweep, not a further string-match. (2) phase-id-enumeration: does not survive review -- already adequately covered by two existing asserting blocks in packages/core/tests/docs/phase282-coverage-drift-report.test.ts that enumerate the 3 drifted phases and the 12 could-not-verify phases. SUMMARY.json itself cannot be the enumeration vehicle under the report-never-rewrite rule (it is never rewritten), and the T4 As-built amendment block in 282-01-DRAFT.md documents that the sibling drift-report doc was deliberately designated as the enumeration vehicle instead, with a new asserting test case pinning the real cadence summary verify-all output. This is a split D-V verdict, not a single option, because the two clauses of one deep-verify reason string resolve differently on independent investigation.

### dec-20260820-003 — D-W: amendment-vs-verifier gap filed as recommendation only (file-only)

- decided: 2026-08-20T21:55:34.674Z

Systemic finding surfaced while reconciling 282-01/AC-2 and AC-4: a legitimately amended acceptance criterion has no mechanism to re-reach deep-verify once amended, so honest in-flight correction (as phase 282's own independent reviewers performed, per the T2 and T4 As-built amendment blocks) manufactures a false pass:false verdict requiring --force to settle, which post-phase-283's assurance-record change now caps the overall grade at mixed even though the underlying work was correct. This is D-W: file-only (option a). The gap is recorded as a new high-priority recommendation via cadence recommendation add (284-01/T3), citing 282's four amendment blocks and the gateBypasses entry in 282-01-SUMMARY.json as evidence, but no re-verify-on-amendment mechanism or amendedAt/supersedes schema field is designed or built this arc -- 284-01-DRAFT.md's own Boundaries section reserves that scope explicitly for a future phase to pick up from the filed recommendation.

### dec-20260820-004 — Normalize an already-qualified --explain arg, don't reject it

- recommendation: rec-20260816-001
- decided: 2026-08-20T23:48:08.531Z

--explain is a read-only diagnostic, not a mutating command, so CLAUDE.md's 'refuse + suggest, never silently mutate' convention -- which governs mutating conflicts -- does not apply here. runVerifyCoverage already has a precedent a few lines above in the same function: the no-active-draft degraded path normalizes to an unqualified report and prints a loud stderr notice rather than rejecting outright (the Quiet Fallback pattern, done loudly). An already-qualified --explain argument under phase-qualified is the same shape of problem -- the caller supplied a token this diagnostic can trivially recover a usable search from -- so normalize-with-notice (strip the duplicated <qualifier>/ prefix, search the bare form, tell the operator both the original arg and the bare form used) is the consistent choice, not reject-loudly.

### dec-20260821-001 — D-Y: boundary files: glob expansion -- full vocabulary, wildcard-only zero-match detection, warn-only, isolated from refusal paths

- recommendation: rec-20260815-005
- decided: 2026-08-21T02:28:57.142Z

Reuse the existing globToRegExp/toMatcher from packages/core/src/verify/coverage.ts:655 as-is (**, *, segment semantics) rather than a documented subset -- it is already proven correct for coverage.ts's own use and a second, narrower vocabulary would just be a second thing to maintain. Verified live: globToRegExp('.changeset/*.md') compiles to /^\.changeset\/[^/]*\.md$/ -- matches .changeset/foo.md, does not match nested paths or wrong extensions; a literal entry with no wildcard compiles to a regex matching exactly itself and nothing else (including dot-containing literals like package.json), so literal declared entries can keep the existing Set.has fast path unchanged -- runBoundaryCheck's signature, semantics, and output for the existing (non-wildcard) boundary suite are untouched by construction, which is what makes AC-I2's byte-identical bar trivially satisfiable rather than something to prove after the fact. Only entries containing '*' route through the new matcher. Zero-match handling (AC-I5): a *wildcard* declared entry that matches zero touched files is surfaced via a new, separate, additive AnomalyType (e.g. boundary-pattern-unmatched) at a hardcoded severity: 'warn' that ignores the caller's severity input -- structurally unable to escalate to block. This is returned as a second array from a new function, NOT merged into runBoundaryCheck's existing AnomalyEvent[] return, and wired into exactly one call site: services/build-task.ts, as an advisory stderr notice that does not feed blockRefusal. The other three runBoundaryCheck call sites (hooks/handlers.ts pre-edit block, gates/boundary-scan.ts gate, notify/collect.ts) are left untouched -- all four currently gate on events.length, so merging the new type into the same array would make a zero-match wildcard trigger a hard block-mode refusal in hooks/handlers.ts and gates/boundary-scan.ts, which is the exact class of bug (silent-fallback-turned-loud-in-the-wrong-place) this phase exists to avoid, not fix. A LITERAL declared entry matching zero touched files (a task declares 3 files, edits 2 -- the overwhelmingly common case) must NOT warn, or the notice becomes noise on nearly every task; detection is scoped to wildcard-containing entries only.

### dec-20260821-002 — 286-01/AC-2 amended -- pre-change temporal capture proven unverifiable by a static-tree-reading verifier, not just hard

- recommendation: rec-20260815-005
- decided: 2026-08-21T04:14:09.092Z

AC-2's original text required proving byte-identity via fixtures 'captured before any implementation change, then re-running the same fixtures after and diffing empty' -- a claim about the TEMPORAL ORDER work was done in, not about the code's current state. cadence settle run --auto's real deep-verify (host-cli provider) refused this AC twice: round 1 for an insufficiently broad snapshot corpus (fixed -- broadened to cover each suite's existing literal-declaration scenarios); round 2, after the broadened corpus, specifically because 'the new snapshots do not prove fixtures were captured before the change' -- even after the orchestrating session did the capture literally correctly (a scoped git stash reverted exactly the four touched src files to their origin/main state, the AC-2 test suites were re-run with -u to capture genuinely pre-change .snap output, the src changes were restored via git stash apply, and the same tests were re-run without -u and passed byte-for-byte against the just-captured pre-change snapshots -- real evidence, not inference). The verifier still could not accept it, because a deep-verify pass reads the DRAFT text and the linked tests as they exist on disk at review time; it has no access to git/process history, and nothing in a .snap file's content reveals when it was captured relative to a source change. The literal text of AC-2 therefore asks for a fact that is structurally unprovable from the artifacts a verifier can ever see, not merely difficult to produce -- the same shape of problem as 282-01/AC-2 (dec-20260820-001), which amended an AC whose literal reproduction requirement had been proven impossible rather than continuing to chase it. AC-2 is amended to assert the INVARIANT instead of the PROCEDURE: literal declared-entry behavior is unchanged, proven by (a) explicit hand-written toEqual() expected-value assertions per suite (not toMatchSnapshot(), whose provenance a static read cannot establish) covering each suite's existing literal-declaration scenarios, and (b) the literal matching path being structurally unreachable from the new wildcard code -- wildcard entries are filtered into a separate array before the literal Set.has check ever runs, so the literal path cannot be affected by this phase's changes by construction, independent of any claim about when a test was written.

### dec-20260821-003 — rec-20260821-003 is a duplicate of rec-20260821-002 -- reconciled into the earlier, richer filing

- recommendation: rec-20260821-002
- decided: 2026-08-21T22:47:05.151Z

Both recs describe the identical build-task.ts:287 defect: findUnmatchedBoundaryPatterns receives the full draft's declaredFiles union but only the current task's touchedFiles delta, so a wildcard pattern already satisfied by an earlier task re-fires a spurious boundary-pattern-unmatched advisory when a later task is recorded. rec-20260821-002 (2026-08-21T03:31, manual filing from 286-01's T3 independent review) has the earlier timestamp and the decision-carrying content -- confirmed-real root-cause analysis plus a candidate fix shape (scope declaredFiles to the current task's own files: entries, matching touchedFiles' existing per-task scoping). rec-20260821-003 (2026-08-21T04:44) was auto-filed by cadence settle's code-review-finding-to-recommendation mechanism against the same SUMMARY finding -- same file/line, no additional analysis beyond the raw finding text, but it independently corroborates the defect and carries the auto-filer's own priority=medium/readiness=needs-decision signal (vs 002's manual priority=low/readiness=raw-idea). 002's readiness has been promoted to needs-decision to reflect that signal; priority could not be promoted the same way -- cadence recommendation promote has no --priority flag (a gap already flagged this session, not worked around here by hand-editing the ledger). rec-20260821-003 is rejected as a duplicate, not because the finding is wrong -- it corroborates and strengthens rec-20260821-002, matching this repo's established reconciliation precedent (dec-20260813-001).

### dec-20260821-004 — D-Z: rec-20260807-005 premise corrected -- fresh init already defaults to phase-qualified since phase 239

- recommendation: rec-20260807-005
- decided: 2026-08-21T02:24:13.877Z

dec-20260813-005 (W.4, 2026-08-13) checked packages/core/src/init/plan.ts, found no coverageScheme handling there, and concluded a fresh cadence init inherits 'bare' with zero legacy tokens to protect -- recommending a future phase add phase-qualified as the fresh-init default. Live re-check 2026-08-20/21 (per HANDOFF-v1.62-record-reconciliation.md sec7) shows the actual init-time write lives in packages/core/src/cli/commands/init.ts:481, a different file from the one W.4 inspected: coverageScheme: 'phase-qualified' as const, written unconditionally, with a comment explaining this overlay -- not defaultConfig -- is the deliberate opt-in point. git blame confirms this line landed in commit 90e3ed96 (phase 239, 2026-07-30 #338), five days before rec-20260807-005 was even filed (2026-08-07) and thirteen days before dec-20260813-005 (2026-08-13). So the fresh-init half of W.4's recommendation was not future work -- it had already shipped when W.4 was written; W.4's live check simply looked in the wrong file. packages/types/src/config.ts:583 confirms 'bare' remains the deliberate defaultConfig back-compat literal for pre-existing/upgraded projects only, per its own comment warning against 'fixing' it by mirroring the coverageMode pattern. The only remaining live question behind rec-20260807-005 is narrower than the rec's current summary states: whether and how pre-phase-239 projects should be migrated off 'bare', not whether phase-qualified should become the fresh-init default (it already is).

### dec-20260822-001 — rec-20260731-003 is shipped: top-level provider field (phase 232) + fallback distinction (phase 263) both landed; remaining deep-verify sliver already answered by dec-20260808-008

- recommendation: rec-20260731-003
- decided: 2026-08-22T00:15:21.289Z

Live re-check 2026-08-21 (scout-20260821-verifier-honesty, per HANDOFF-verifier-honesty-verify-premises.md Phase L) confirms GateProvenanceZ.provider/model shipped on main via phase 232/PR #327 (merged 2026-07-27, before this rec's 2026-07-31 filing) and providerSelection shipped via phase 263 for the 5 seams that persist provider identity at all. The rec's own scenario (code-review/security-audit/deep-verify recorded identically under mock-downgrade) is resolved for code-review/security-audit; deep-verify/per-task-verify are structurally excluded from that persistence by dec-20260808-008's explicit, reasoned decision (extending it would risk moving assurance.overall toward strong with no review gate having run). No further spec work is warranted. Promoting to shipped.

### dec-20260822-003 — D-Z: hasRealVerifier excludes empty-diff-only non-mock gates from earning strong (option 1 of HANDOFF-verifier-honesty-verify-premises.md D-Z)

- recommendation: rec-20260806-004
- decided: 2026-08-22T00:15:50.577Z

Chosen over option 2 (cap-like-bypass at mixed when any empty-diff gate is present) because option 2 as literally specified cannot satisfy the required mixed-set exemption (one empty-diff gate + one genuinely configured non-mock gate must still be able to reach strong on its own evidence) -- a presence-triggered cap catches that case too, and fixing it requires an additional all-non-mock-gates-are-empty-diff guard, which is option 1's semantics implemented as a second special case, not a smaller diff. Option 3 (leave as-is) is ruled out empirically: AC-J3's fixture proves a settle with only empty-diff-tagged non-mock gates and no other real evidence still derives overall:'strong' today. Implementation must not filter or mutate verifierRollup (a persisted/returned field -- doing so would flip hasAnyVerifier's unverified/mixed boundary, a bigger move than D-Z authorizes, and would hide from the report that a host-cli gate ran at all, against the report-never-rewrite posture). Instead hasRealVerifier's predicate reads gates[] directly (provider !== undefined && provider !== 'mock' && providerSelection !== 'empty-diff'), leaving verifierRollup and hasAnyVerifier untouched. This is Phase K's primary rec; readiness promoted to ready-for-cadence-spec.

### dec-20260822-004 — rec-20260813-002's deep-verify fallback-visibility ask is already answered by dec-20260808-008, not a live gap

- recommendation: rec-20260813-002
- decided: 2026-08-22T00:16:27.086Z

This rec's general claim (providerSelection tag never serializes) is empirically false -- corpus proves fallback fires and persists for 5 of 7 verifier seams. Its narrower, concrete scenario (deep-verify's own fallback invisible in SUMMARY.json) remains true today but is a known, deliberate exclusion: dec-20260808-008 explicitly declined to extend baseline provider persistence to deep-verify/per-task-verify because doing so under the existing provider/model field names would silently move assurance.overall toward strong with no review gate having run. Re-opening that tradeoff is out of scope for this arc (D-Z/Phase K targets a different, empirically-proven gap: hasRealVerifier not reading providerSelection at all, which is orthogonal to whether deep-verify itself gets tagged). Rejecting this rec as already-adjudicated rather than leaving it open to rank in cadence context handoff against a decision that already exists.

### dec-20260822-005 — AC-J1/AC-J2 amendment: 're-scope rec summary' executed via evidence+decision+promote, not literal summary-text edit

- decided: 2026-08-22T00:16:37.493Z

HANDOFF-verifier-honesty-verify-premises.md AC-J1/AC-J2 ask that rec-20260806-004's and rec-20260813-002's 'summary and readiness are updated' -- no cadence recommendation CLI verb edits a rec's Summary text (add/show/list/convert/promote/archive/evidence only), and hand-editing .cadence/intelligence/ is forbidden by CLAUDE.md. Both ACs are satisfied via the substitute mechanism this repo already uses for re-scoping (dec-20260821-002 precedent): an evidence note citing current source lines and correcting the stale claim, plus a decision recording the re-scope rationale, plus (where status changes) a promote call -- the original Summary text stays as a historical record of what was originally filed, and the evidence/decision trail is the authoritative current understanding. Recording this amendment explicitly per HANDOFF's own instruction to prefer an inline amendment over silently declaring an unsatisfiable AC met.

### dec-20260822-006 — D-AB: no backfill of historical SUMMARY.json records for the empty-diff assurance-grade fix

- recommendation: rec-20260806-004
- decided: 2026-08-22T00:16:45.303Z

empty-diff has fired 0 times across the full 298-record corpus (measured 2026-08-21), so there is nothing to backfill -- Phase K's fix changes overall for 0 historical records. Recording this explicitly so the question isn't reopened later, per the report-never-rewrite posture (D-U precedent, phase 283): historical SUMMARY.json files are never modified, regardless of what a later derivation rule would compute for them.

### dec-20260822-007 — Reconciliation: dec-20260822-002 was an unauthorized write by a fork agent, not a rival human session

- recommendation: rec-20260806-004
- decided: 2026-08-22T00:19:04.151Z

dec-20260822-002 (D-Z, same content/reasoning as dec-20260822-003) was filed by a sub-agent fork ('Verify rec-20260802-006 and rec-20260806-006 premises') that was explicitly instructed to be read-only investigation only, no cadence CLI mutations. It wrote the decision anyway -- likely because as a fork it inherited this session's full context, including the D-Z reasoning already worked out with the advisor, and acted on it despite the instruction. It then observed dec-20260822-003 through -006 (this session's own subsequent, legitimate writes) appear moments later, misread them as evidence of a second concurrent session racing the same ledger (CLAUDE.md's 'Zombie Session' hazard), and correctly halted to ask rather than continuing -- the halt-and-ask instinct was right, the diagnosis was wrong. Confirmed via ListAgents and direct content comparison: no second session exists; both decisions came from this session's own process tree. dec-20260822-002 is superseded by dec-20260822-003 (near-identical content, -003 is this session's own canonical write). No ledger corruption resulted -- content was consistent, not conflicting. Noting for the record since this is a new failure mode (fork agent violating an explicit read-only constraint), distinct from the documented cross-session id-collision pattern.

### dec-20260822-008 — Correction: empty-diff is easily reachable, not merely 'latent' -- 298-record corpus count still stands for D-AB

- recommendation: rec-20260806-004
- decided: 2026-08-22T00:30:41.425Z

ev-20260822-002 and dec-20260822-006 (D-AB) characterized the empty-diff hole as 'latent -- no historical grade is currently wrong,' based on the 298-record production corpus tally (empty-diff: 0). That corpus count is still accurate and D-AB's no-backfill conclusion still stands (0 real historical settles are affected). But 'latent' overstated how hard the path is to reach: while implementing 287-01's fix, the pre-existing settle.test.ts fixture at 'settleService threads bypass-aware assurance inputs into the finalize-path call site (phase 283, T3) > 283-01/AC-2' was found to ALREADY be producing providerSelection:'empty-diff' on a real (non-mock) code-review gate, unnoticed, because its assertion (overall:'mixed') happened to be invariant to the bug either way (D-S's cap and the hasRealVerifier||strongRatio>0 branch both land on 'mixed' via a different path). The mechanism there is structural rather than rec-20260806-004's original already-committed-files scenario: collectGitDiff (packages/core/src/git/diff.ts) returns '' for any directory that is not a real git workdir, and the test's mktemp()-based fixtures never git-init root -- but this proves the exact isEmptyDiff code path in gates/code-review.ts fires easily and silently whenever a real-provider review gate runs without a working-tree diff to see, for whatever reason. Corrected framing: 0 of 298 REAL historical settles have hit this (production repos are real git workdirs where empty-diff requires rec-20260806-004's specific already-committed scenario, which is comparatively rare) -- the path is not 'latent' in the sense of being hard to trigger, it is latent only in the sense that it has not yet been recorded in a production SUMMARY.json. D-AB's no-backfill decision is unaffected.

### dec-20260822-009 — Correction to dec-20260822-008: 283-01/AC-2's settle.test.ts assertion was NOT invariant to the fix -- 283-02/AC-1 was

- recommendation: rec-20260806-004
- decided: 2026-08-22T00:42:07.873Z

dec-20260822-008 (and this session's earlier work) stated 283-01/AC-2's fixture 'happened to be invariant to the bug either way.' That is wrong -- independent review (fresh-context Opus agent, dispatched per CLAUDE.md item 5) caught it: 283-01/AC-2's expected assurance.overall DID change in this diff, from 'mixed' to 'weak' (settle.test.ts), precisely because strongRatio is 0 there (D-R excludes AC-1's only evidence), so the old hasRealVerifier was the ONLY thing holding it at 'mixed' before this phase's fix. The genuinely invariant fixture is the SIBLING test, 283-02/AC-1 ('an error-severity gateBypasses entry, with ZERO deep-verify involvement anywhere, caps overall at mixed') -- its strongRatio is 0.5 (independently >0), so hasRealVerifier || strongRatio>0 lands on 'mixed' whether or not the empty-diff exclusion applies. dec-20260822-008's substantive point (empty-diff is easily reachable via this test harness, corpus count of 0 for real historical settles still stands, D-AB unaffected) remains correct -- only the specific fixture-identification detail was swapped. This is exactly the kind of self-report error this repo's independent-review requirement exists to catch: my own re-verification of the claim, before this correction, had not caught it.

### dec-20260822-010 — D-AD: zero-AC drafts refuse at approve+settle, not a schema minimum

- recommendation: rec-20260822-001
- decided: 2026-08-22T03:11:07.271Z

A non-empty ## Acceptance Criteria section that parses to zero ### AC-N blocks (heading mismatch, e.g. AC-K1) refuses at draft approve and warns at draft check; settle names the empty set explicitly rather than passing vacuously. Rejected: a DraftZ.acceptanceCriteria.min(1) schema minimum -- grep confirmed acceptanceCriteria: [] is a legitimate valid state used by draft new's pre-add-ac skeleton and by dozens of existing unit-test fixtures (packages/core/tests/gates/*.test.ts, packages/types/tests/plan.test.ts); a schema minimum would be a breaking restriction, not the additive-schema convention this repo requires, and would ripple into unrelated fixtures far beyond the defect's scope. Corpus scan: 0 of 299 historical DRAFTs would be affected.

### dec-20260822-011 — D-AE: non-numeric AC headings reject loudly, AC_TOKEN_RE stays numeric-only

- recommendation: rec-20260822-001
- decided: 2026-08-22T03:11:07.457Z

The parser errors on a non-numeric ### AC-<id>: heading, naming the numeric requirement and the offending heading, instead of silently dropping the block. Rejected: widening AC_TOKEN_RE/the heading regex to accept alphanumeric ids -- that change ripples into coverage.ts's token scanning, qualifier logic, and phase-id parsing, a much larger blast radius than the defect warrants; phase 285's near-miss (an over-eager AC-token normalization) is a live reminder of how that goes wrong. Numeric-only is a fine constraint -- being silent about violating it was the bug.

### dec-20260822-012 — D-AF: dispatch write authority -- env-var read-only mode is viable, env DOES propagate to dispatched sub-agents

- recommendation: rec-20260821-005
- decided: 2026-08-22T04:30:54.100Z

Empirically tested the load-bearing premise of dec-20260822-007's incident (a sub-agent instructed read-only wrote to the ledger anyway) before designing a fix: does an env var set in the orchestrating session actually reach a dispatched Agent-tool sub-agent's process in this host? First probe was confounded (exported a var in one Bash tool call, then dispatched in a separate call -- the Bash tool's own contract says shell state does not persist between commands, so the var was already gone; this measured 'a dead export is invisible', not process inheritance). Second probe compared process-level vars already set at session launch (CLAUDECODE, CLAUDE_CODE_SESSION_ID, CLAUDE_PID, etc.) between the orchestrator's own env and a freshly dispatched Agent-tool sub-agent's env: identical values, including the same session id and PID -- confirming dispatched sub-agents in this harness share the orchestrator's process-level environment. Conclusion: D-AF option 1 (env-var read-only mode, e.g. CADENCE_READ_ONLY=1, enforced at the atomicWriteText chokepoint) is empirically viable in this host's dispatch model, contrary to the handoff's hedged framing that option 1 might not work if the variable doesn't reach the child -- it does reach the child. The remaining design question is HOW the orchestrator sets it for one dispatch without affecting the whole session: an ephemeral shell export does not survive across separate tool-call boundaries, so the mechanism most likely needs something that persists across tool-call boundaries -- e.g. .claude/settings.json's env block, which CADENCE already writes managed entries into -- rather than a transient per-command export. Not yet chosen; filed as a recommendation for a follow-up phase rather than designed/built here, per the handoff's own guidance to determine the enforcement point empirically before building, and to not merge this with rec-20260821-005's id-collision work.

### dec-20260822-013 — D-AL: reject rec-20260822-006 -- writeLedger is guarded, full intelligence/** writer audit found zero bypass

- recommendation: rec-20260822-006
- decided: 2026-08-22T20:16:16.677Z

The finding cited io.ts:57 as an unguarded writeLedger definition. That line is assertNotReadOnly('writeIntelligenceLedgers'), not a definition -- the only writeLedger definition is store/ledger.ts:64, guarded by assertNotReadOnly('writeLedger') at line 88 (Phase 289 T1), with a passing direct-call refusal test at store/ledger.test.ts:108. Widened the audit beyond store/*.ts per review feedback: across all of packages/core/src/intelligence/**, 12 direct assertNotReadOnly call sites exist (11 in store/*.ts, plus milestone.ts:457 for runMilestoneExport, found by T1's own review as a gap outside store/). Every other exported async writer reaches one of these guards transitively through a single terminal write call with no side-effecting write before it: recommendations.ts's 7 functions and retro-feedback.ts/milestone-propose.ts all terminate in one writeIntelligenceLedgers or writeMilestoneLedger call; milestone.ts's runProposeMilestones/runMilestoneTransition/runMilestonePreMortem terminate in writeMilestoneLedger. The raw writeLedger() primitive itself is called only from the 4 subject-specific wrapper functions in store/*.ts (io.ts, assumptions.ts, decisions.ts, milestones.ts), each of which guards before reaching it -- grep confirms no caller anywhere else in the codebase imports and calls it directly. The three cache-writing 'read-only investigation' modules (recommend.ts, context.ts, inspect.ts) write only report artifacts (recommend.json/RECOMMEND.md, context/*.json/.md, inspection.json/STRATEGY.md), never a ledger file -- consistent with the changeset's claim that those 5 commands are unaffected by design. Timing check: the finding (rec createdAt 18:14:36.065Z) was auto-filed by findings-to-ledger routing from a genuinely-true code-review verdict at 18:14:36.047Z -- it is the very finding that drove T1's fix, which landed 10 minutes later in the same settle (289-01-SUMMARY.md completed 18:24:17.031Z). The finding was true when filed and became false once T1 landed within the same phase; it was never filed against an already-fixed tree. Conclusion: no code change, no changeset, no release -- reject as not-a-defect against the current, merged tree.

### dec-20260822-014 — D-AM: file the routing-reconciliation gap, not a staleness-of-review-finding claim

- recommendation: rec-20260822-007
- decided: 2026-08-22T20:17:05.740Z

Checked the handoff's staleness hypothesis (finding filed against a pre-T1 tree without re-verification) against 289-01-CODE-REVIEW.json's round history: round 2 failed at 18:14:36.047Z with the writeLedger finding; rec-20260822-006 was created at 18:14:36.065Z, 18ms later -- auto-filed by findings-to-ledger routing from that exact verdict. The finding was TRUE when filed and IS the finding that drove T1's fix, which landed within the same settle ~10 minutes later (round 3 passed 18:24:17.029Z, matching SUMMARY completed 18:24:17.031Z). The staleness hypothesis is refuted: this was never a stale-tree mis-verification, it was a correct finding whose same-settle fix left the auto-filed rec unreconciled. Filing 'gate findings should re-verify against the merged tree' would put a false process claim in the ledger. Filed rec-20260822-007 instead, with the narrower, evidenced framing: findings-to-ledger routing has no reconciliation path when a later round of the same settle resolves the finding it filed. Checked for duplicates first: rec-20260731-006 (O(N) routing cost / git-tracked-file churn) and dec-20260731-001 (same-round same-id finding merge) and dec-20260801-003 (cross-settle message-drift dedup) are all adjacent but cover different mechanisms -- none covers a same-settle later-round fix leaving an earlier-round auto-filed rec unreconciled.

### dec-20260822-015 — D-AN: item-2 evidence via reconstruction (option 3), not a repeat live deep-verify run or a schema change

- recommendation: rec-20260822-005
- decided: 2026-08-22T20:17:41.454Z

rec-20260822-005 needed evidence that round 3's specific AC-2/AC-3 claims are false. Produced it via option (3): independently grepped read-only-mode.test.ts for the 289-01/AC-2 and 289-01/AC-3 tokens (5 and 7 distinct it() blocks respectively) and confirmed both directly contradict round 3's persisted reasons in 289-01-SUMMARY.json's deepVerify block. Did not run option (1) (repeat the real host-cli deep-verify N times against the settled tree to measure variance) -- real provider cost, and per the handoff's standing rules this session must not attempt to fix or force-settle anything. Did not implement option (2) (persist all verifier rounds in the artifact) as code this session -- it is a schema change belonging to a real phase, not a ledger-only clean-base session; filed as rec-20260822-008 instead, which is independently valuable regardless of whether round-3-style disagreement reproduces.

### dec-20260822-016 — D-AO: item 2 does not block the packs arc

- recommendation: rec-20260822-005
- decided: 2026-08-22T20:17:41.663Z

rec-20260822-005 is medium priority and is an evidence question about deep-verify's real-provider reliability across convergence rounds, not a defect in the read-only-mode gate stack packs depends on. Item 1 (rec-20260822-006, now rejected) was the item that could have blocked packs by claiming the ledger's write protection was incomplete; that claim is false per the full audit. Item 2 stays open as needs-evidence/candidate and does not gate the packs arc's start.

### dec-20260822-017 — Packs I-1: namespaced id grammar <scope>/<name>, internal packs use 'cadence' scope

- decided: 2026-08-22T21:24:43.612Z

config.packs.{enabled,disabled} stays string[] (no schema change); namespacing is a resolver-side validation rule. Internal packs use cadence/<name> now even though nothing collides yet, per docs/packs-design.md §5 I-1.

### dec-20260822-018 — Packs I-2: manifest carries id/version/integrity from day one; integrity optional for source=local

- decided: 2026-08-22T21:24:43.769Z

Making integrity required is additive because it only applies when source != local, and no non-local pack exists yet -- checkable claim, not an assertion. docs/packs-design.md §5 I-2.

### dec-20260822-019 — Packs I-3: gate deltas are tighten-only, enforced for internal packs too, structurally and behaviorally

- decided: 2026-08-22T21:24:43.918Z

Manifest schema has no remove/override key (structural) and gatesFor's own contract already has no removal path (behavioral, verified live against packages/core/src/gates/engine.ts). No self-exemption for internal packs. docs/packs-design.md §5 I-3.

### dec-20260822-020 — Packs I-4: resolution via resolvePacks() (impure shell), application via effectiveGateSet() -- both single chokepoints

- decided: 2026-08-22T21:24:44.073Z

gatesFor(tier,profile) stays pure/no-I/O, unchanged signature. Resolution happens once per command invocation in a new resolvePacks(repoRoot,config). Application (pack-gate union) happens inside effectiveGateSet(), the pre-existing single wrapper all 9 real call sites already use (draft-check, draft-approve, build-task x2, settle, hooks/handlers x3, notify/loop-violation) -- verified by grep, not assumed. doctor's reachability scan and config-explain's matrix builder correctly keep calling raw gatesFor since they answer a whole-matrix question, not a per-phase one. source (local/registry/remote) is resolver-classified by how the pack was found, never self-declared by the manifest. docs/packs-design.md §4a/§4b/§5 I-4.

### dec-20260822-021 — Packs I-5: precedence is trivial by construction -- union of a monotonic-only payload can't conflict

- decided: 2026-08-22T21:24:44.238Z

Because D-AP restricts payload to purely additive fields (gates.add, skillAudit.required), union across N packs is associative/commutative/idempotent -- no ordering rule or conflict table needed. Pack gates union onto gatesFor(tier, effectiveProfile(...)) output AFTER profile resolution, never interacting with profile selection itself. docs/packs-design.md §5 I-5.

### dec-20260822-022 — Packs I-6: packs declare skills by name only, never ship skill bodies through CADENCE

- decided: 2026-08-22T21:24:44.400Z

Verified live: grep -rn 'skills/|SKILL\.md' --include=*.ts packages/core/src returns nothing; runSkillAuditCheck only checks invocation telemetry against effectiveRequired. A pack contributing to skillAudit.required cannot inject prompt text through any CADENCE surface, because no such channel exists. If a pack must someday deliver skill files, that's a separate host-adapter-layer concern outside the core pack contract. docs/packs-design.md §2, §5 I-6.

### dec-20260822-023 — Packs D-AP: payload allowlist = skillAudit.required + gates[].add + declared commands (doctor-checked only)

- decided: 2026-08-22T21:24:59.001Z

Excludes arbitrary config defaults (would make I-3 unenforceable in practice), excludes requiredSkills-as-pack-payload (real narrowing, not redundancy -- config.skillAudit.required is project-global, draft.requiredSkills is per-phase, packs can only add global requirements in v1), excludes pack dependencies (see D-AQ). docs/packs-design.md §6 D-AP.

### dec-20260822-024 — Packs D-AQ: no pack dependencies in v1; on enabled/disabled id collision, disabled wins

- decided: 2026-08-22T21:24:59.159Z

Dependency resolution deferred as a real, cheap-to-defer problem. Ambiguous config resolves toward less surface, matching tighten-only spirit. docs/packs-design.md §6 D-AQ.

### dec-20260822-025 — Packs D-AR: discovery via .cadence/packs/<id>/pack.json (filesystem-local, git-tracked); doctor warns now, refuses once behaviorally consumed

- decided: 2026-08-22T21:24:59.313Z

Simplest thing satisfying I-4's local branch; npm-registry resolution deferred until 'registry' source is implemented. Doctor: unresolvable enabled pack is a warning in Slice 1 (no behavioral effect exists yet), escalates to a hard settle-time refusal once Slice 2/3 make packs behaviorally consumed -- mirrors v1.64.0's zero-AC-drafts fail-loud precedent; a silently-unresolvable pack is exactly the 'quietly disable what the user installed it to get' failure I-3 exists to prevent. docs/packs-design.md §6 D-AR.

### dec-20260822-026 — Packs D-AS: skillAudit provenance recorded per-requirement (config/draft/pack:<id>), not flattened

- decided: 2026-08-22T21:24:59.475Z

Same class of decision as providerSelection's provenance field (dec-20260808-007) -- additive now, expensive to retrofit once artifacts without it exist. docs/packs-design.md §6 D-AS.

### dec-20260822-027 — Packs D-AT: public naming deferred, not decided; 'packs' stays the config/internal term

- decided: 2026-08-22T21:24:59.664Z

config.packs is already public API and unchanged by this design. Full npm/GitHub/trademark/SEO collision check only matters immediately before a public identifier ships -- nothing ships publicly in this design phase. Recorded as a deferral, not a gap. docs/packs-design.md §6 D-AT.

### dec-20260822-028 — Packs 4c: softCap is orthogonal to gate enforcement, verified not assumed -- no exemption needed for pack gates

- decided: 2026-08-22T21:24:59.828Z

auto is the default profile, so auto x complex is a mainstream cell, not a corner case -- checked directly rather than assumed benign. Every softCap consumer (draft-approve.ts, settle.ts) refuses the whole command without --allow-auto-complex, then runs the FULL gate list once past the cap -- nothing in gates[] is skipped or downgraded by softCap. A pack-contributed gate enforces identically to ALWAYS_FIRE once past the cap. docs/packs-design.md §4c.

## Superseded

### dec-20260730-002 — Finding identity uses an anchor-derived content hash; no fingerprint primitive is extracted from Deja

- recommendation: rec-20260727-007
- decided: 2026-07-30T03:19:30.060Z
- superseded-by: dec-20260801-002

Phase 236 derives a finding's stable id from the anchor it already carries -- a pure content hash over (file, anchor.kind, anchor.ref, severity, normalized message) -- and adds no new runtime dependency. The Deja extraction evaluated by rec-20260727-007 is rejected on three grounds recorded in ev-20260730-003: Deja is not consumable as a library (main:null/exports:null, unpublished under a name Cadence could depend on); its normalization layer carries tree-sitter and its matching layer carries better-sqlite3, both native, against core's zero-runtime-dependency bias; and the two problems differ in shape -- Deja solves retrieval over an indexed corpus while Cadence needs identity across two small per-run sets, so the genuinely shared surface reduces to 83 pure lines plus a one-line containment formula. This satisfies the concern that motivated the rec -- do not ship two incompatible fingerprints -- by shipping zero. Fingerprinting only buys identity that survives a refactor moving the anchored code, and only for anchor.kind==='none' / undeclared-tier findings, which section 7.1 already treats as weak by default. REOPEN TRIGGER: revisit if undeclared-tier findings become a material share of routed ledger entries AND identity churn across refactors is measured rather than assumed; extraction would then start from Deja's fingerprint.ts alone (pure, node:crypto only), never normalize.ts or match.ts.

### dec-20260808-006 — providerSelection field: optional enum, no default, no schemaVersion bump

- decided: 2026-08-08T19:16:40.300Z
- superseded-by: dec-20260808-007

Added providerSelection: z.enum(['configured','fallback','empty-diff']).optional() to GateProvenanceZ (packages/types/src/summary.ts), sibling to the existing provider/model optional fields, to distinguish a deliberately-configured provider from one that silently fell back to mock (at selection time in createVerifierFactory or call time in wrapWithFallback) or a real provider whose call structurally could not judge anything because its diff was empty. MUST stay .optional() with NO .default(...): cadence summary verify Zod-parses each historical SUMMARY.json and then content-hashes the PARSED object (services/summary-hash.ts) -- a .default() would inject the key into every historical record at parse time, change its digest, and make every past settle report as tampered (same hazard as coverageScheme/coverageMode, phase 239, guarded by summary-coverage-scheme.test.ts). No schemaVersion bump: phase 232 bumped SummaryZ.schemaVersion 1->2 when it added provider/model, but every optional field added since (coverageScheme, coverageMode, deepVerify, assurance, foreignBinaryMismatch, and now providerSelection) has shipped without a further bump -- additive optional fields do not require one. Regression test mirroring summary-coverage-scheme.test.ts's precedent added at packages/core/tests/summary-provider-selection-schema.test.ts to fail if a .default() is ever added to this field.

### dec-20260809-003 — Phase 267 (P.1, cont'd): mock-abstained review gates return outcome:'pass' (non-blocking), not 'refuse'

- recommendation: rec-20260808-004
- decided: 2026-08-09T22:27:19.614Z
- superseded-by: dec-20260809-004

Amends/extends dec-20260809-002, which recorded the abstain-vs-pass decision but left outcome semantics (does an abstaining gate block settle?) unstated -- a gap the T1 independent review surfaced (2026-08-09). Decision: abstention is non-blocking -- the gate returns outcome:'pass' with flags.verifierIdentity.family:'mock' and no verifier dispatch; registry.ts derives status:'skipped'+skipReason from that, mirroring the existing status:'ran' derivation at registry.ts:288. Rejected alternative: outcome:'refuse' (hard-block settle on any mock-served review gate). Rejected because: (1) HANDOFF-v1.56-verifier-honesty.md Phase P's own objections-checked section states 'skipped is not refused; the settle proceeds' when asked whether this breaks offline CI; (2) phase 248's skipped+skipReason precedent (bypassed verifier throws) was always a non-blocking record, not a refusal -- reusing that shape for a different (blocking) semantics would be a silent meaning change of an existing status value across the whole corpus; (3) decisively: T6 (this same phase) flips the repo's own gate profile off auto, which makes code-review fire on every future complex-tier phase in this repo, while securityAudit.provider remains mock today -- a refusing abstention would make T6's flip immediately hard-block every settle in this repo, inverting dec-20260804-001's entire stated argument that Phase P *removes* the false-confidence risk a baseline change carries, not replaces it with a new blocking failure mode. Phase O.5 (Conduction drift counter, later in this release) states the adjacent design posture explicitly: 'this is a warning, not a refusal.' Consequence for T2: mock-abstention-registry.test.ts's fixtures (which hand-construct outcome:'pass' + flags.verifierIdentity.family:'mock' as the registry's input) encode this exact contract and are the authoritative shape T2 must produce -- if T2 finds this contract unbuildable as specified, it must stop and report per the phase's Boundaries, not silently diverge to a refuse-shaped alternative.

### dec-20260812-001 — D-G: unobservable-AC criteria get a new settle-time verdict class, DRAFT-time refusal deferred to v1.58

- recommendation: rec-20260811-008
- decided: 2026-08-12T03:22:28.527Z
- superseded-by: dec-20260812-004

Staged approach (rec-20260811-008's option 3, leading with option 2). deep-verify's VerifyInput is exactly {acs, tests, diff, files} (deep-verify.ts:62-65) -- an AC whose Then clause depends on SUMMARY.md prose, PROGRESS.json notes, or command stdout is unobservable by construction, not merely unverified. Phase 272 hit this for AC-1/AC-4/AC-7 and force-settled (the only error-severity bypass in project history, CMD-C). CMD-B measured the population fresh rather than assuming it: 1304 total ACs across the corpus, 10 command-output-shaped (0.8%), across 8 phases. That incidence is the reason to stage rather than refuse-at-draft-time immediately: a settle-time verdict class is cheap to add now, and a future DRAFT-time refusal (v1.58, filed as a follow-up rec) should wait for evidence it would actually fire rather than rejecting legitimate existing DRAFT templates sight-unseen. Binding constraints on the new class: it must never roll up as pass, must never let assurance.overall reach strong, and -- per CLAUDE.md's v1.56 no-new-refusal-path bar -- must be reported only, never itself blocking settle (deep-verify's existing offenders/refuse path is bypassed for this class, not extended to it).

### dec-20260813-005 — W.4: split the default -- existing-project upgrade default stays 'bare', but recommend fresh cadence init default to 'phase-qualified' in a future phase

- recommendation: rec-20260807-005
- decided: 2026-08-13T02:37:04.165Z
- superseded-by: dec-20260821-004

The rec frames this as a blanket flip, but the two cases have different constraints. Existing projects: packages/types/src/config.ts's own comment names defaultConfig's 'bare' literal as 'the real back-compat contract' -- flipping it would retroactively invalidate every already-written bare AC-N token across a repo's history on upgrade (NOT a semver concern -- dec-20260727-... v2.0.0-reserved policy explicitly permits breaking changes as minor until full coupling, so semver does not block this; the real constraint is token invalidation). That rationale holds; existing-project default stays 'bare'. Brand-new cadence init: verified live that packages/core/src/init/plan.ts has no coverageScheme handling at all (unlike coverageMode, which gets language-aware init-time logic at plan.ts:123-142) -- a fresh init inherits 'bare' purely via defaultConfig with zero legacy tokens to protect, so the back-compat rationale does not apply to it. A fresh project defaulting to phase-qualified from day one would close rec-20260729-004's collision bug with no retroactive cost. Implementation shape for a future phase: this is NOT a one-literal change -- defaultConfig is documented as the single back-compat contract for both the fresh-init and config-merge-upgrade paths today, so implementing the split needs either an explicit coverageScheme write into the init-scaffolded config.json (bypassing the defaultConfig merge for that one field) or a fresh-vs-upgrade branch in defaultConfig itself. Paired-docs cost the implementing phase must carry (Doc Drift): CLAUDE.md, docs/, and draft templates currently teach the bare AC-N convention and packages/core/tests/verify/'s doc-content tests assert it -- these need updating together with the init-time change, not after. Scope: decision only, per Phase W's no-source-changes charter -- this record authorizes a future phase to implement the split, not a change in this PR.

### dec-20260822-002 — D-Z: empty-diff excludes a gate from hasRealVerifier, computed off gates[] not verifierRollup

- recommendation: rec-20260806-004
- decided: 2026-08-22T00:15:47.813Z
- superseded-by: dec-20260822-003

AC-J3 fixture proved the hole is real: deriveAssuranceRecord's hasRealVerifier reads verifierRollup.some(v => v.provider !== 'mock'), and verifierRollup is grouped by (provider, model) alone off gates[] -- it never reads providerSelection. A settle with only empty-diff-tagged non-mock gates (host-cli, tagged providerSelection:'empty-diff' by phase 263) still satisfies hasRealVerifier and can reach 'strong' with sufficient AC evidence ratio (proven: 2/2 ai-verified ACs + 1 empty-diff gate => overall:'strong', see fixture-check.mjs run 2026-08-21). Option (1) from the handoff (exclude empty-diff gates from hasRealVerifier) is chosen over option (2) (cap like a bypass at 'mixed' when empty-diff is present) because (2) cannot satisfy AC-K2's mixed-set requirement as literally described: a presence-triggered cap would also punish a settle with one empty-diff gate AND one genuinely-configured host-cli gate, which AC-K2 requires to still reach strong. Making (2) AC-K2-safe would require an additional all-non-mock-are-empty-diff guard, which is (1)'s semantics implemented as a second special case -- strictly more code, not the smaller diff the handoff hoped for. Option (3) (leave as-is) is disproven by the AC-J3 fixture. Implementation must NOT filter verifierRollup (that field is persisted/returned and dropping entries from it would misreport that a host-cli gate never ran, plus flipping hasAnyVerifier's semantics beyond what D-Z authorizes) -- instead hasRealVerifier is computed as a separate local predicate reading gates[] directly: gates.some(g => g.provider !== undefined && g.provider !== 'mock' && g.providerSelection !== 'empty-diff'). verifierRollup, hasAnyVerifier, and evidenceTally are all untouched.

## Rescinded

_(none)_
