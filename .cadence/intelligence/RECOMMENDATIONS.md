# CADENCE Recommendations

> Generated from `.cadence/intelligence/recommendations.json`.

## rec-20260710-003 — MCP-driven inversion: host CLI calls into cadence mcp serve's verify tool

- status: deferred
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: verify, mcp, providers
- evidence: Surfaced in cadence-scout session on rec-20260710-002, 2026-07-10; alternative architecture to the direct-subprocess proposal
- next: cadence milestone propose

Alternative to shelling out to the host CLI: instead run the host CLI headlessly and have IT call into cadence's own MCP verify tool, using the host's native tool-calling to enforce the per-AC verdict schema rather than parsing freeform JSON from a subprocess. Worth prototyping against rec-20260710-002's direct-subprocess approach before committing -- tool-call-constrained output may be materially more reliable than prompt-and-parse, at the cost of a more unusual control-flow (host CLI as the driver, cadence as the callee).

## rec-20260710-005 — Positioning: out-of-band host-CLI verification as MORE independent than same-session self-report

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs
- evidence: Surfaced in cadence-scout session on rec-20260710-002, 2026-07-10; see cadence-competitive-landscape notes on mock-default risk
- next: cadence milestone propose

A headless host-CLI verifier subprocess has zero shared context with the calling session -- arguably a stronger independence claim than today's same-session self-report or even a direct API call under the same account. Worth a docs/positioning pass tying this framing to the existing 'trustworthy verifier' wedge and the mock-default competitive risk, independent of which engineering direction (rec-20260710-002 direct-subprocess vs MCP-inversion sibling) ships.

## rec-20260712-004 — cadence draft new: num arg accepts nonsense with no sanity check

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, cli
- files: packages/core/src/cli/commands
- evidence: Reconstructed stub: original entry (rec-20260712-001, logged during the phase 170 session, 2026-07-12) was lost to an unrelated git reset --hard before being committed. Recreated from context earlier in this session.
- next: cadence milestone propose

cadence draft new's optional [num] positional argument silently accepts any string with no validation against the phase's existing 01-numbering convention. Omitting num already correctly defaults to 01; passing a bad value produces a nonsensical draft filename with no refusal or warning.

## rec-20260712-005 — add-ac/add-task silently append after a placeholder AC-1/T1

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, cli
- files: packages/core/src/cli/commands
- evidence: Reconstructed stub: original entry (rec-20260712-002, logged during the phase 170 session, 2026-07-12) was lost to an unrelated git reset --hard before being committed. Recreated from context earlier in this session.
- next: cadence milestone propose

cadence draft add-ac and add-task never warn when appending a new AC/task after the scaffolded draft still has its placeholder AC-1/T1 stub in place (e.g. from draft new without --template or --from-rec). This can silently leave a stale generic placeholder alongside real, hand-authored ACs/tasks.

## rec-20260712-009 — Record a gate lifecycle-state taxonomy (requested/started/passed/refused/failed/timed-out) in SUMMARY

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: settle, types, praxis
- files: packages/core/src/services/settle.ts, packages/types/src/summary.ts
- evidence: Transferred from ChatGPT audit of manehorizons/lumen2, 2026-07-12 (P0-1 lifecycle states); sibling: rec-20260712-007. Verified GateProvenanceZ enum only has ran/skipped/refused today.
- next: cadence milestone propose

GateProvenanceZ (packages/types/src/summary.ts) currently enumerates only status: 'ran' | 'skipped' | 'refused' -- confirmed no 'failed' or 'timed-out' state distinct from 'refused', and no in-flight requested/started states. Extend SUMMARY to record a fuller gate lifecycle-state taxonomy so incident analysis and resume can reconstruct where a settle run stopped, including crash-mid-gate cases a synchronous refuse/pass pair can't distinguish. Pairs with the exit-code-taxonomy-as-public-contract work. Distinct from rec-20260611-001, which is about recommendation status lifecycle, not gate lifecycle.

## rec-20260712-016 — Write a formal threat model covering MCP serve, hooks, host adapters, headless verifier, and ledger exposure

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: security, docs
- files: SECURITY.md, DESIGN.md
- evidence: Transferred from ChatGPT audit of manehorizons/lumen2, 2026-07-12 (P1 threat model). Verified SECURITY.md's existing 'Scope and threat model' section omits MCP serve, hooks, host adapters, headless-verifier self-invocation, and ledger exposure.
- next: cadence milestone propose

SECURITY.md already has a 'Scope and threat model' section (shell execution, LLM gate providers, generated/installed files, notification webhooks) but does not mention MCP serve trust, hooks/dispatcher, host-adapter boundaries, headless-verifier self-invocation loops, or local intelligence-ledger exposure at all. Extend SECURITY.md with a structured threat model: prompt injection into gates, MCP serve trust, hooks/dispatcher, host-adapter boundaries, headless-verifier self-invocation loops, release/update integrity, and local intelligence-ledger exposure. Names the surfaces and their mitigations in one place.

## rec-20260712-017 — Add failure-injection tests: corrupt intelligence ledger, offline settle, mcp-serve crash recovery

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: reliability, testkit, intelligence
- files: packages/core/src/intelligence/store, packages/testkit/src
- evidence: Transferred from ChatGPT audit of manehorizons/lumen2, 2026-07-12 (P1 failure-injection). Verified existing 'corrupt' test coverage is state.json-specific, not intelligence-ledger-specific.
- next: cadence milestone propose

Verified: existing 'corrupt' references in tests (state/simple.test.ts, render-context.test.ts, context.test.ts) cover state.json corruption specifically, not the intelligence ledger (evidence.json/recommendations.json). No tests found for intelligence-store ledger corruption, offline settle behavior, or mcp-serve crash recovery. Add static failure-injection coverage for the intelligence store and runtime: a corrupt/partial ledger recovers or fails closed with a clear error, settle behaves predictably with no network, and mcp serve recovers from a crashed session. Mirrors the corrupt-DB/offline-start layer flagged for Lumen.

## rec-20260714-002 — draft add-task has no --name flag (add-ac does) — every appended task needs a hand-fix

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli
- files: packages/core/src/cli/commands/draft.ts
- evidence: Verified live 2026-07-14: ran 'cadence draft add-task 181-mcp-tool-trust-envelope 1 --files ... --action ... --verify ... --done AC-1' five times for T2-T6; every resulting heading was '### T2: ' etc with nothing after the colon, required Edit to add names.
- next: cadence milestone propose

cadence draft add-task <phase> <num> --files --action --verify --done has no --name option, unlike cadence draft add-ac which has --given/--when/--then/--name. Every task appended via add-task lands as '### T<n>: ' with an empty heading, requiring a manual Edit pass to fill in the name before the DRAFT reads sensibly — confirmed live 2026-07-14 appending T2-T6 to phase 181's DRAFT (all five came out blank). Add --name <n> to add-task mirroring add-ac's option.

## rec-20260724-007 — Define and document multi-contributor concurrency semantics for .cadence state

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs, state, team
- files: docs/team-rollout.md
- evidence: Audit 2026-07-24: no merge/conflict/concurrency guidance found in docs; state.json is a single shared file
- next: cadence milestone propose

team-rollout.md covers PR visibility but not the mechanics of two contributors with phases in flight: merge behavior for state.json, the intelligence ledger, and phase directories. First verify whether current behavior is safe-by-construction (per-phase directories may already isolate most conflict surface), then document the answer or design the missing piece. This is the first question a second contributor asks and the team preset is now the default.

## rec-20260724-008 — Spot-check the logged-out GitHub landing render against main README

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs, positioning
- files: README.md
- evidence: Audit 2026-07-24: fetched github.com/manehorizons/cadence rendered old README content against clone at commit 5451109
- next: cadence milestone propose

A logged-out fetch of the repo page served the pre-1.50 README (billsplit headline, nine slash commands, no Codex/MCP/mermaid) while main carries the test-gutting version. Possibly CDN cache on the fetching side, but given the standing stale-rendered-pages lesson and the suite-reveal stakes on first impressions, verify from a logged-out browser and cache-bust if confirmed.

## rec-20260724-009 — SEO differentiation plan for the Cadence name collision ahead of the suite reveal

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: positioning, docs
- evidence: Audit 2026-07-24: web search for cadence github ranks three large incumbent projects above manehorizons/cadence
- next: cadence milestone propose

Organic search for cadence surfaces Uber Cadence Workflow, Flow Cadence language, and Cadence Design Systems before this repo. Renaming is off the table post-launch, so plan differentiation instead: consistent AI-agent-verification framing in every public surface, the docs portal, distinctive taglines, and topic tags. Permanent headwind to budget for in the Mane Horizons reveal, not a fixable defect.

## rec-20260724-010 — milestone premortem has no entry-removal/edit path once an operator-authored item is added

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli, intelligence
- files: packages/core/src/cli/commands/milestone.ts, packages/core/src/intelligence/milestone.ts
- evidence: Discovered 2026-07-24 during rec-20260724-001 milestone shaping: 'test-entry-debug' added to outOfScope via --add-out-of-scope during exploratory testing persisted across a subsequent no-flag premortem refresh, with no CLI path to remove it.
- evidence: Escalation 2026-07-24: found worse than initially scoped. 'cadence milestone propose' is not idempotent w.r.t. pre-mortem data -- rerunning it against an already-proposed milestone (e.g. mil-rec-rec-20260724-001) silently reset preMortem back to {likelyFailureModes:[],hiddenDependencies:[],driftRisks:[],outOfScope:[]}, discarding operator-authored entries added via a prior 'milestone premortem --add-*' call, with no warning or confirmation. Confirmed empirically: populate premortem -> verify via list (populated) -> run propose again -> re-check JSON (wiped). 'cadence milestone list' does NOT have this problem and is the safe read-only render. Recommend re-scoping this rec's fix to also make clusterMilestones()/propose preserve existing preMortem for already-proposed/accepted milestones it re-touches, not just adding a removal verb -- this is a data-loss bug, not only a missing-capability gap. Consider raising priority above 'low' given the destructive-on-rerun behavior.
- next: cadence milestone propose

cadence milestone premortem --add-likely-failure-mode/--add-hidden-dependency/--add-out-of-scope only appends and persists cumulatively across separate invocations (confirmed empirically 2026-07-24 while working mil-rec-rec-20260724-001: a stray debug string added via --add-out-of-scope survived a subsequent no-flag deterministic refresh and could not be removed by any CLI verb). Same class of gap as rec-20260720-001 (deferred milestones had no reopen path): an append-only mutator with no corresponding remove/edit, forcing a direct milestones.json hand-edit as the only escape hatch -- which this repo's own convention (see rec-20260720-001's objective text) treats as a violation. Add a 'cadence milestone premortem --remove-<field> <index-or-text>' (or equivalent) verb.

## rec-20260724-011 — cadence build task / done <id> silently accepts a malformed task id instead of refusing

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli
- files: packages/core/src/services/build-task.ts
- evidence: Reproduced live in phase 213 session 2026-07-24: 'cadence done 213-01-T1' returned 'Recorded 213-01-T1: DONE' with exit 0, but cadence status still showed T1/T2/T3 as PENDING; PROGRESS.json contained both the stray '213-01-T1' key and, after correction, the real 'T1' key.
- next: cadence milestone propose

During phase 213's build, running 'cadence done 213-01-T1' (a fully-qualified-looking id, mirroring the DRAFT frontmatter's 213-01 phase/num prefix) succeeded silently and wrote a new orphaned '213-01-T1' key into PROGRESS.json's tasks map, instead of refusing because no task with that id exists in the active draft (real ids are bare 'T1'/'T2'/'T3'). cadence status/progress kept showing all tasks PENDING afterward with no error surfaced. This violates the repo's own 'Refuse + suggest, never silently mutate' and 'Quiet Fallback always prints a loud notice' conventions (CLAUDE.md). Caught only because status was checked immediately after; recovered by re-running done with the correct bare id and hand-editing PROGRESS.json to remove the 3 stray keys. Fix: cadence build task <id> should validate <id> against the active draft's known task ids and refuse (not silently create a new map entry) on an unknown id.

## rec-20260726-001 — Full cryptographic signing of SUMMARY.json (blocked on threat model)

- status: candidate
- ready: blocked
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: security, verification, summary
- files: packages/types/src/summary.ts, packages/core/src/services/settle.ts
- evidence: Split from rec-20260724-006 2026-07-26 per dec-20260726-001; self-signing in the artifact's own trust domain was judged not meaningfully stronger than a hash
- next: cadence milestone propose

Follow-on to rec-20260724-006 / dec-20260726-001: rec-20260724-006 was split so phase 223 ships a settle-time content hash now. This rec covers the harder half -- full cryptographic signing with a trust root outside the artifact-authoring session (e.g. CI-identity signing via Sigstore keyless, or an operator-provisioned key), so a compromised/dishonest local session can't just re-sign a fabricated SUMMARY. Do not implement until the trust root is pinned by the formal threat model (mil-rec-rec-20260712-016, covering MCP serve/hooks/host-adapters/verifier/ledger exposure), which is currently parked. Blocked-by: mil-rec-rec-20260712-016.

## rec-20260726-005 — coverage.ts's coverageBypassed is false-negative when a --force-only bypass overrides real coverage gaps in assertion mode

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: gates
- files: packages/core/src/gates/coverage.ts, packages/core/src/gates/registry.ts
- evidence: Traced boolean logic by hand: coverageBypassed = allowMissingCoverage===true && !sealed, but the assertion-mode pass-through at line ~127 is also reachable via force-only bypass of real gaps (guard: (issues) && (!force || sealed) being false via force=true).
- next: cadence milestone propose

In runCoverageGate's assertion-mode branch (packages/core/src/gates/coverage.ts ~line 55-127), reaching the final pass return with real coverage gaps present but bypassed via bare --force (not --allow-missing-coverage) leaves coverageBypassed computed as 'ctx.opts.allowMissingCoverage === true && !sealed' — false in this case, since only --force was set. registry.ts's provenance therefore records this gate as status:'ran' even though a genuine --force bypass of real gaps just happened, hiding it from SUMMARY.json's audit trail. Discovered during phase 226's whole-branch review while verifying the reviewer's claim that build-test-must-pass/boundary-scan's new *Bypassed flags mirror coverage.ts's existing pattern exactly -- they do, faithfully, including this pre-existing imprecision (which phase 226 fixed for the two new gates in registry.ts by naming the actually-fired flag, but did not touch coverage.ts itself, out of scope for that phase). Pre-dates phase 226; not introduced by it.

## rec-20260726-006 — boundary-scan is absent from docs/concepts.md's gate-universe matrix (14-gate table, stage-scoped gates section)

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 40%
- decay: fresh
- areas: docs
- files: docs/concepts.md
- next: cadence milestone propose

boundary-scan shipped in Phase 156 but was never given a full 'when it fires / what it checks' row anywhere in docs/concepts.md's main gate-universe listing (the '14 gates: 3 always-fire + 11 delta' tables) or the 'Stage-scoped gates' section -- it only appears in the sealed-gate/bypass-summary material phase 226 fixed. Discovered during phase 226's whole-branch review; explicitly out of that phase's scope (its ACs covered gates.sealed discussion only, not the full gate-universe matrix).

## rec-20260727-008 — Invariant promotion from RetroRollup.findingCategories.recurring

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, types
- evidence: Measured in docs/handoffs/cadence-phase0-assurance-kernel-review.md section 1.10 and section 6 Slice 4
- next: cadence milestone propose

RetroRollupZ.findingCategories already defines 'recurring' as seen in 2+ distinct phases -- the frequency-analysis input layer for invariant promotion is built. Consume it to split recurring-unanchored (invariant candidate) from recurring-anchored (spec-quality/codebase-hostility signal) into different dispositions. Promotion stays explicit, never automatic.

## rec-20260727-009 — Counter-verifier as kernel component with AC-weakness detection

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- evidence: Spec'd in docs/handoffs/cadence-phase0-assurance-kernel-review.md section 4.3, decision D8
- next: cadence milestone propose

A component whose job is detecting an unearned settle can't itself be uninstallable -- its highest-value single job is flagging 'the ACs were too weak for this review to mean anything,' which is the mechanism that makes AC weakness costly. Shares substrate with review (anchor resolution, finding schema, ledger routing, verifier-family abstraction) but differs in target; one Finding type with a target discriminant, two policy layers -- one spine, two heads.

## rec-20260727-010 — Conductor as CLI client; treat access gaps as CLI-completeness bugs

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- evidence: Spec'd in docs/handoffs/cadence-phase0-assurance-kernel-review.md section 4.2, decision D7
- next: cadence milestone propose

Conductor should be a client, not a kernel peer: the decision test is 'can it be implemented entirely against public CLI commands?' A 'no' answer is a bug report about the public surface being incomplete, not a case for privileged access -- keeps the kernel small and lets Conductor live in its own repo on its own cadence, depending only on an already-published contract.

## rec-20260728-002 — Test files are never typechecked or linted

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, tooling
- files: packages/core/tsconfig.json, tsconfig.base.json, packages/core/package.json
- evidence: Phase 234 T1 adversarial review: mutated witness<IsAssignable<VerifierPorts['deep'], VerifierPort<number,string>>>(true) -- semantically false -- and vitest, typecheck, and eslint all exited 0. Independently confirmed the include/exclude and lint-script config.
- next: cadence milestone propose

packages/core/tsconfig.json has include: ["src/**/*"] and tsconfig.base.json excludes **/*.test.ts and tests/, while each package's lint script is 'eslint src'. No test file in the repo is typechecked or linted by any command CI runs, and vitest does not typecheck. Consequence: type-level assertions in tests (conformance witnesses, satisfies checks, expectTypeOf-style guards) are inert -- a provably false witness leaves vitest, typecheck and lint all green. Found during phase 234 T1 review, where a deliberately falsified assignability witness passed all three gates. Options: a tsconfig.test.json wired into the typecheck task, vitest --typecheck, or a convention that type-level guarantees must live in src/.

## rec-20260729-003 — Criteria-gap anchoring is file-granular, so a finding in a covered file never reads as a gap

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: verify, gates
- files: packages/core/src/verify/criteria-gap.ts, packages/core/src/verify/code-review.ts
- evidence: Read the implementation: bestAnchorForFile() is keyed on the file path and its result is spread onto every finding in that file (verify/criteria-gap.ts). Found by the orchestrator during phase 235 T4 re-verification, not self-reported.
- next: cadence milestone propose

Phase 235's anchorFindings (verify/criteria-gap.ts) resolves ONE anchor per file and tags every finding in that file with it, because the code-review verifier returns findings keyed by file with no per-finding criterion attribution. Consequence: a genuinely uncovered defect sitting in a file that some task happens to cover inherits that file's anchor and is NOT counted as a criteria gap — the gap detector under-reports precisely where a phase's ACs are thinnest. Phase 235 extended CodeReviewInput so the verifier can now SEE the ACs/boundaries, which is the prerequisite for the verifier itself citing the criterion it believes a finding violates; the mock does not exercise that. Fix: have the verifier return a per-finding anchor candidate (criterion citation) and grade that, keeping the file-level resolution only as the fallback when the verifier cites nothing.

## rec-20260729-005 — Boundary-string anchors are granted by filename substring match, so an irrelevant boundary can mask a criteria gap

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: verify
- files: packages/core/src/verify/criteria-gap.ts, packages/core/src/verify/anchor.ts
- evidence: Surfaced by independent adversarial review of phase 235 T4, which traced the candidate-construction and exact-match paths and confirmed the guard is tautological by construction. Behavior is pinned intentionally by a test at tests/gates/code-review-criteria-gap.test.ts.
- next: cadence milestone propose

candidatesForFile (verify/criteria-gap.ts) proposes a boundary candidate whenever a free-text boundaries[] entry contains the filename as a substring, and resolveAnchor then 'verifies' it with boundaries.find(b => b === candidate.ref) — which is guaranteed to succeed because the ref was sourced from that same array by construction. The exact-match step therefore confirms only 'this string exists', not that the boundary has anything to do with the finding. Consequence: a boundary like 'DO NOT add a runtime dependency to packages/core/src/gates/code-review.ts' grants declared tier to ANY finding in that file, converting a would-be criteria gap into a (weak) anchored finding and hiding it from the gap count. Matches section 7.1's literal spec, which imposes no relevance requirement on a boundary anchor, and declared is documented as the weakest non-gap tier — so this is working-as-specified, not a code defect. But it is a real false-anchor path that suppresses gap reporting. Distinct from rec-20260729-003 (which is about per-file rather than per-finding granularity). Fix candidates: require the boundary to cite the file more strongly than substring containment, or treat a boundary-only anchor as a gap-with-weak-mitigation rather than a non-gap.

## rec-20260730-001 — phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: verify, coverage, replay
- files: packages/core/src/verify/phase-replay.ts, packages/core/src/services/verify.ts, packages/types/src/summary.ts
- evidence: Reproduced by phase 239 T7's independent review: SUMMARY.coverageMode='mention' replayed with config 'mention' => drift=0 covered=true; same SUMMARY replayed with config 'assertion' => drift=1 covered=false.
- evidence: Confirmed still valid 2026-08-21 (HANDOFF-verifier-honesty-verify-premises.md Phase L sweep, scout-20260821-verifier-honesty): packages/core/src/verify/phase-replay.ts:288 still reads const mode = config.coverageMode ?? 'mention' -- live config only, never summary.coverageMode. No commit since 2026-07-30 has touched this line; surrounding phase-239 T7/T8 comments confirm the exclusion is deliberate (bare-path byte-compat boundary), not an oversight, but the rec's ask (should phase-replay honor recorded provenance instead) remains open and accurately scoped as written. No re-scope needed.
- next: cadence milestone propose

replayPhaseCoverage takes mode from config.coverageMode ?? 'mention' while phase 239 T6 writes summary.coverageMode into every new SUMMARY as provenance. A phase that settled under 'mention' (token legally in a comment) is reported as DRIFTED after the operator later switches the repo to 'assertion' — the phase did not change, the standard did, and verify phase reds CI claiming 'recorded PASS (executed), no longer covered by its linked test'. Fix is summary.coverageMode ?? config.coverageMode, but it changes the BARE path's behavior for any post-239 SUMMARY, so it was deliberately excluded from T7 (whose boundary requires the bare path stay byte-for-byte unchanged). Fixing it only under the qualified branch would leave two schemes resolving the same question differently — the hazard services/settle.ts:432-434 already warns about. Needs its own slice.

## rec-20260731-007 — Finding id collision: two same-severity/message findings in one file share one id

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, types
- files: packages/core/src/verify/finding-identity.ts
- evidence: Opus gap review, phase 236, 2026-07-30: verified two findings differing only in line collapse to identical sha256 id via computeFindingId
- next: cadence milestone propose

computeFindingId hashes (file, anchor.kind, anchor.ref, severity, normalized message) per AC-3's exact spec, with no per-occurrence discriminant. Two distinct findings in the same file with identical anchor/severity/normalized-message (e.g. MockCodeReviewVerifier's 'console.log left in source' emitted twice in one file) collapse to the same id. Harmless today since findings are never keyed by id, but the follow-on ledger-routing phase (source doc section 7.3, phase 236's ROADMAP.md 'As built' amendment) must key on identity for ledger hygiene — it would currently mint one recommendation for N occurrences and a future disposition surface would waive them all together. Surfaced by an Opus gap review (2026-07-30) of phase 236, verified reachable via MockCodeReviewVerifier's literal duplicate-marker behavior. Undocumented anywhere; needs at minimum a doc note, and the ledger-routing phase's design should account for it explicitly (e.g. include occurrence count/ordinal in the hash, or accept it as a deliberate merge-by-identity semantic).

## rec-20260731-008 — docs/concepts.md phase-236 section has unpinned file:line citations that will rot

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs
- files: docs/concepts.md
- evidence: Opus gap review, phase 236, 2026-07-30: git show HEAD~1:docs/concepts.md had 0 file:line citations, phase 236 introduced 10 unpinned ones
- next: cadence milestone propose

The new 'Finding identity, disposition, and type convergence (phase 236)' subsection in docs/concepts.md cites ~10 hardcoded file.ts:NN-NN line ranges (e.g. summary.ts:70-114, finding-identity.ts:58-90, gates/code-review.ts:105, contracts/index.ts:167-186, intelligence.ts:3-15). All verified accurate as of the phase-236 commit, but no doc-content test pins them (unlike CLAUDE.md's 'The Hardcoded Count' precedent for command/slash-command counts) and docs/concepts.md had zero such citations before this commit. They will silently go stale on the next edit to any cited file. Surfaced by an Opus gap review (2026-07-30) of phase 236. Fix options: drop line numbers and cite file paths only, or add a lightweight doc-content test asserting the cited ranges still contain what they claim (matching this repo's existing docs test conventions in packages/core/tests/docs/).

## rec-20260731-004 — docs/providers.md's host-cli 'per-task-verify only' scope claim is stale — all 7 factories now have host-cli wired

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs
- files: docs/providers.md, packages/core/src/verify/code-review-factory.ts, packages/core/src/verify/per-task-factory.ts, packages/core/src/verify/plan-review-factory.ts, packages/core/src/verify/security-audit-factory.ts, packages/core/src/verify/spec-review-factory.ts, packages/core/src/verify/ui-spec-review-factory.ts, packages/core/src/verify/factory.ts
- evidence: Surfaced by the independent whole-branch reviewer during phase 243's pre-settle review (2026-07-31): flagged that phase 243's docs/providers.md edit was about to stamp a fresh 'Phase 243' attribution onto this false premise inside the same doc section; the phase 243 diff was reverted to leave the section exactly as stale as it was on main, and this rec files the underlying drift as its own follow-up instead of fixing it inline (scope discipline).
- next: cadence milestone propose

docs/providers.md ~L307-328 ('Current scope: per-task-verify only') claims 5 of 7 verifier seams (verifier/deep-verify, codeReview, planReview, securityAudit, specReview) 'have no host-cli builder yet' and that wiring them is a future follow-up. Verified false while working phase 243 (2026-07-31): every packages/core/src/verify/*-factory.ts (code-review-factory.ts, per-task-factory.ts, plan-review-factory.ts, security-audit-factory.ts, spec-review-factory.ts, ui-spec-review-factory.ts, factory.ts) already passes a hostCli builder to createVerifierFactory. This means createVerifierFactory's 'host-cli builder not wired for this family' degrade branch is now unreachable in production for any of the 7 seams (only exercisable via a deliberately-incomplete test spec) -- the doc section describes a limitation that no longer exists, without saying when it closed. Needs an audit of when each family's HostCli*Verifier class was added (git blame/log per file) and a doc rewrite -- possibly deleting the 'Current scope' section entirely if host-cli is now fully wired everywhere, or documenting the real remaining gap if any exists.

## rec-20260731-010 — High-severity code-review findings never reach the finding-ledger (they refuse settle before finalizeAndCloseSettle runs)

- status: deferred
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/services/settle.ts, packages/core/src/gates/code-review.ts
- decisions: dec-20260802-003 (active)
- evidence: Surfaced by independent review of phase 242 T3 (2026-07-31), verified live: a forced high-severity settle exits 1 with lastGate.reason naming code-review, no codeReview key in the refused SUMMARY, no ledger entry
- evidence: Persistence half shipped via phase 247 (PR #357, main@afcb90a, re-verified unchanged at main@59a2116e): writeRefusedSettleSummary now threads acc.codeReview/acc.securityAudit with the success path's conditional-spread shape, attaches contentHash when findings are non-empty, and preserves findings-bearing refused attempts as immutable -SUMMARY-snapshot siblings. The summary's claim that a refused settle's findings are not even persisted is stale as of 247. Routing half is disposed by dec-20260802-003 (already recorded, superseding the decision text originally sketched for this rec) — ledger routing stays finalize-only, trigger amended to name rec-20260801-012's finding that real-provider gate throws are structurally unreachable under this repo's normal auto-profile, headless-agent operating mode.
- evidence: Phase 249 T1 verified this disposition durable as of housekeeping PR #359 (main@9d561fbd): dec-20260802-003 active, status deferred, 2 prior evidence entries confirmed unchanged. No additional mutation applied.
- next: cadence milestone propose

Phase 242's finding-to-ledger routing (settle.ts, finalizeAndCloseSettle) only ever runs on a settle that reaches finalization. collectHighFindings (gates/code-review.ts) fails the code-review gate on any 'high' severity finding, so settle takes the writeRefusedSettleSummary path instead -- finalizeAndCloseSettle, and therefore the routing step, is never reached. Verified live: a settle with a high-severity finding exits 1, the refused SUMMARY has no codeReview key at all (the findings aren't even persisted), and no ledger entry is created. The findings only route if the operator bypasses via --force/--allow-code-review-failure. This is consistent with phase 242's DRAFT (AC-1 says 'when settle finalizes'), so it is not a phase-242 defect -- but it means the single most severe class of finding is the one class the routing feature never captures by default. Worth a decision: should a refused settle still route the findings from its failed attempt (there is real diagnostic value in a high-severity finding landing in the ledger even though the phase didn't settle), or is 'only route on a clean settle' the deliberately narrower, safer scope?

## rec-20260731-005 — Archived finding-routing recs permanently suppress recurrence of the same finding id

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/services/settle.ts, packages/core/src/verify/finding-identity.ts
- evidence: Surfaced by independent review of phase 242 T3 (2026-07-31): dedup-set construction from ledger.recommendations + ledger.archived is correct per AC-2, but archiveReason is not distinguished when building that set
- next: cadence milestone propose

Phase 242's AC-2 dedup correctly checks both the ledger's active recommendations array AND its archived array before routing a finding (a previously-routed rec can be soft-archived -- e.g. after being shipped/rejected, since recommendations.autoArchive defaults true -- before the phase is ever re-settled). But this has a real consequence worth a conscious decision: computeFindingId (phase 236, finding-identity.ts) deliberately excludes line number from its hash, so a finding that is fixed, whose rec is archived (possibly as 'rejected'), and which later regresses -- same file/anchor/severity/normalized-message reintroduced -- computes to the byte-identical id and will never be re-routed, silently, forever. This is correct per AC-2 exactly as specified (dedup across settles), but 'permanently' may not be the intended lifetime for a rejected-and-recurred finding. Options: exempt archiveReason: 'rejected' from the dedup set (only 'shipped'/'converted' archival suppresses recurrence), or accept this as the deliberate semantic and document it explicitly next to AC-2.

## rec-20260731-006 — Finding-ledger routing has no per-settle cap: O(N) sequential ledger rewrites, and it now dirties a git-tracked file every settle

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/services/settle.ts, packages/core/src/intelligence/store/recommendations.ts
- evidence: Surfaced by independent review of phase 242 T3 (2026-07-31): verified empirically that Promise.all races on id-minting (3 concurrent calls -> 1 written rec), confirming the sequential loop is necessary but leaves an unbounded-N cost profile; recommendations.json/evidence.json confirmed git-tracked in this repo
- next: cadence milestone propose

Phase 242's routing step (settle.ts, finalizeAndCloseSettle) writes each new routing candidate via a sequential for-of + await addRecommendation loop -- correct and necessary (Promise.all would race on id-minting, verified empirically: 3 concurrent calls collapsed to 1 written rec instead of 3), but each call re-reads and rewrites both ledger files in full, so N candidates cost O(N) full ledger read+writes with no upper bound on N per settle. A real (non-mock) reviewer producing many findings in one settle could mint many recommendations in one step. Separately: .cadence/intelligence/recommendations.json (and evidence.json) are git-tracked in this repo, so routing now dirties a tracked file on every settle that has code-review findings -- widening the existing rec-id-collision-on-rebase surface (two branches/worktrees independently minting new rec ids before either pushes) beyond what manual recommendation add usage already created. Worth a decision: cap candidates per settle (e.g. route only the top-N by severity, log the rest as dropped per this repo's no-silent-caps convention), or accept unbounded routing as intentional since findings are already bounded by the review verifier's own output size.

## rec-20260801-001 — docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8

- status: candidate
- ready: ready-for-cadence-spec
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, docs
- files: docs/reference/commands.md, packages/core/src/config-edit/fields.ts
- evidence: Surfaced during phase 242 T4 doc work (2026-07-31): confirmed docs/reference/commands.md:156 still says 'all five' while EDITABLE_FIELDS has 8 entries (profile, loopEnforcement, acDiscipline, commitCadence, verifier, autoArchive, coverageMode, autoRoute)
- next: cadence milestone propose

docs/reference/commands.md:156 ('Jump to one key -- profile, loopEnforcement, acDiscipline, commitCadence, or verifier. Omit to walk all five.') predates phase 102's autoArchive and phase 108's coverageMode additions to packages/core/src/config-edit/fields.ts's EDITABLE_FIELDS array, and now also predates phase 242's autoRoute addition -- three fields (autoArchive, coverageMode, autoRoute) are absent from this doc's field list and its 'walk all five' claim, though EDITABLE_FIELDS actually holds 8. Not caused by phase 242 -- the gap already existed for autoArchive/coverageMode before this phase; autoRoute is simply the third field to land in it. No doc-content test currently catches this (unlike the command-count/slash-command-count tests this repo already has for similar drift). Fix: update the field list and count, and consider adding a doc-content test deriving the list from EDITABLE_FIELDS.map(f => f.name) the same way docs-command-count.test.ts derives the registered command set, so this can't silently drift again.

## rec-20260801-007 — Three small hygiene gaps from the kernel-arc independent review (2026-08-01)

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/gates/assurance-record.ts, packages/core/src/verify/phase-replay.ts, packages/core/src/cli/commands/summary.ts, eslint.config.js
- evidence: Independent adversarial review of feat/kernel-assurance-v2 (2026-08-01)
- next: cadence milestone propose

(1) eslint.config.js's own comment candidly documents that dynamic import() of verifier family modules is invisible to the new kernel/verifier/consumer boundary rule -- a disclosed, real gap with no tracking recommendation until now. (2) deriveAssuranceRecord's verifierRollup key is an unseparated string join (${provider} ${model ?? ''}) -- theoretically collision-prone if a provider/model string ever contains a space (today's real values never do). (3) readRawSchemaVersion/MAX_RECOGNIZED_SCHEMA_VERSION is duplicated between verify/phase-replay.ts and cli/commands/summary.ts, hand-synced -- a third SummaryZ.safeParse call site would misreport a future schemaVersion-3 record as a generic parse failure instead of 'written by a newer Cadence.' None urgent; bundled as one low-priority rec per the independent review's own framing.

## rec-20260802-003 — Intelligence ledger has 145 orphan decision/evidence links to recs absent from both active and archived arrays

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, intelligence
- files: .cadence/intelligence/recommendations.json
- evidence: cadence intelligence audit at main@59a2116e (2026-08-02): 20 orphan decisions + 125 orphan evidence entries, oldest dated 2026-06-11; sample checked (rec-20260711-001) confirmed absent from both recommendations[] (69 entries) and archived[] (115 entries).
- evidence: Root cause identified while authoring phase 249's SPEC: computeIntelligenceAudit (packages/core/src/intelligence/store/audit.ts) builds its valid-rec-id set from recommendations[] only and never consults archived[] — so a decision/evidence entry whose rec is legitimately archived (not lost, not deleted) is flagged as an orphan indistinguishable from a genuinely-vanished rec like rec-20260711-001. This reframes the finding: it is not only a fixed 145-item historical backlog, it is an ongoing generator of new orphans. recommendation-promote.ts's autoArchive:true default means every phase that closes by promoting its source rec to 'shipped' (the single-commit settle convention's normal path) immediately orphans that rec's own evidence entries. Verified live: rec-20260801-004 (status shipped, in archived[]) has 3 evidence entries (ev-20260801-004, ev-20260802-005, ev-20260802-011) now flagged as orphans by this mechanism, confirmed absent from the original 145-count baseline. Scoping fix, not resolved here: computeIntelligenceAudit's valid-rec-id set should include archived[] alongside recommendations[] before orphan counts are used as any kind of gate.
- evidence: Post-npm-scope-migration re-measure at v1.54.0 (2026-08-03), phase 251 T1c: cadence intelligence audit now reports 20 orphan decisions and 134 orphan evidence entries (154 total), compared against the pre-migration baseline of 20 orphan decisions + 125 orphan evidence entries recorded at filing time. Decisions count unchanged; evidence count grew by 9, consistent with this being a known-drifting metric (computeIntelligenceAudit's archived[]-blind-spot, not yet fixed) that new autoArchive'd promotions (including this same phase's rec-20260802-001 T1a promotion) continue to inflate — not asserted as a threshold, gate, or expected decrease.
- next: cadence milestone propose

cadence intelligence audit reports 20 orphan decisions and 125 orphan evidence entries whose referenced rec ids exist in neither the 69-entry active recommendations array nor the 115-entry archived array in .cadence/intelligence/recommendations.json — e.g. rec-20260711-001, referenced by dec-20260711-001 and ev-20260711-*, is genuinely absent from both, not merely archived. Orphans date back to 2026-06-11, so this predates any known reconciliation pass. Verified at main@59a2116e (this session's own Part 1 evidence/decision additions — ev-20260802-009/010/011, dec-20260802-003 — were checked and are NOT part of this orphan set, so the finding is pre-existing and unrelated to that work). The audit tool's own remediation text calls restore-or-remove an operator decision; 'cadence intelligence reconcile' only re-derives rec-side link arrays and does not resolve orphan subjects. Needs scoping: how far back the gap goes, whether it's from lost commits (git reset --hard has bitten this ledger before per rec-20260712-006's own evidence) or a reconcile bug, and whether restoring vs. pruning is right per orphan.

## rec-20260802-004 — deep-verify.ts's own bypassed-throw case has the identical registry-side provenance gap phase 248 just fixed for code-review/security-audit

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/gates/deep-verify.ts, packages/core/src/gates/registry.ts
- evidence: Surfaced during phase 248's SPEC authoring (2026-08-02): registry.ts's dispatch loop has no branch reading res.flags?.verifierFailure at all — confirmed by reading the full bypass-ladder chain (self-guard predicate, build-test-must-pass x2, boundary-scan, test-coverage, code-review/security-audit's new reviewVerifierFailure branch) and finding none match deep-verify's own verifierFailure flag.
- next: cadence milestone propose

Phase 248 fixed code-review/security-audit: a bypassed verifier throw (--allow-verifier-failure equivalents) now records an honest SUMMARY.gates[] status:'skipped' entry instead of a bare status:'ran' with empty identity. deep-verify.ts (packages/core/src/gates/deep-verify.ts) has the structurally identical bug: on a bypassed throw it already sets flags.verifierFailure = { message, provider }, but registry.ts's runSettleGates dispatch loop has no branch that reads verifierFailure — so it falls through to the same generic status:'ran' with empty identity that phase 248 fixed for the other two gates. Deliberately NOT folded into phase 248 (rec-20260801-004 scoped to code-review/security-audit only per its own files: list) and NOT a copy-paste fix: verifierFailure is load-bearing for notify/collect.ts's anomaly emission and SUMMARY.gateBypasses (hardcoded to attribute failures to 'deep-verify' — which is actually correct for this gate, unlike the false-attribution risk that made phase 248 use a distinct reviewVerifierFailure field instead of reusing verifierFailure). So the registry.ts fix here can consume the existing verifierFailure flag directly, but the new branch's interaction with the anomaly-emission pipeline (does printing a loud stderr notice AND recording gates[] status:'skipped' double-count with the existing anomaly/gateBypasses record for the same event?) needs its own scoping pass before drafting, not an assumption that phase 248's exact pattern transfers unchanged.

## rec-20260802-005 — release-integrity's 10-attempt (~45s) verify budget insufficient for first-ever publish under a new npm scope

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: release, ci
- evidence: Release workflow run 30771173624 (2026-08-02): 'Create GitHub Release and verify registry' step failed with E404 after 10 attempts; publish/tag/GH-release steps all green; manual npm view polling confirmed all 5 @thomas-powers-jr packages resolved a few minutes later
- next: cadence milestone propose

v1.54.0's release (npm scope rename, phase 250) published all 5 packages successfully with provenance, and the git tag + GitHub Release were both created correctly, but the Release workflow's post-publish 'verify registry' step failed -- release-integrity.mjs's POST_PUBLISH_VERIFY_ATTEMPTS=10 (~45s linear backoff, added in phase 218 for routine version-bump propagation lag) wasn't enough for a brand-new scope's CDN entries, which took several more minutes to resolve. Nothing was actually broken (independently verified via npm view/git ls-remote/gh release view once propagation completed) -- same 'red run, real publish' pattern phase 218 fixed, just at a longer timescale than that fix's budget covers. Consider either an adaptive/longer retry budget specifically for a package's first-ever publish (detectable via the pre-publish 404 the script already observes), or documenting this as an expected-slower case in release-cut's known-flake protocol. Don't blanket-extend the budget for routine releases -- 45s was fine per phase 218.

## rec-20260802-006 — Extend security audit CI coverage to website/ workspace

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: security, ci, website
- files: docs/security/audit-exceptions.md, .github/workflows/security.yml, scripts/check-audit-exceptions.mjs, website/pnpm-lock.yaml
- evidence: Dependabot alert sweep 2026-08-02: 38 open alerts total, 30 of which (all high/moderate/low in website/) have zero CI enforcement per the exceptions doc's documented scope; PR #364 fixed 2 of the 7 website high-severity alerts
- evidence: Confirmed still valid 2026-08-21 (HANDOFF-verifier-honesty-verify-premises.md Phase L sweep, scout-20260821-verifier-honesty): .github/workflows/security.yml's audit job runs pnpm audit at repo root; root pnpm-workspace.yaml lists only packages: - 'packages/*' -- website/ is not a workspace member and carries its own separate website/pnpm-lock.yaml + website/pnpm-workspace.yaml, structurally invisible to the root-scoped audit. No other workflow scans website/ for security issues. Readiness/priority unchanged (needs-decision/high) -- genuine live gap.
- next: cadence milestone propose

docs/security/audit-exceptions.md's own text documents that the audit CI job (scripts/check-audit-exceptions.mjs, .github/workflows/security.yml) only scans the packages/* workspace's root pnpm-lock.yaml -- website/ has a fully separate pnpm-workspace.yaml + pnpm-lock.yaml that is never audited at all. Confirmed via live GitHub Dependabot alerts on 2026-08-02: 7 high-severity alerts (astro SSRF #19, brace-expansion #26, js-yaml #27, linkify-it #34, postcss #39, sharp #36, svgo #35) plus 23 moderate/low alerts exist ONLY in website's lockfile and would never fail CI even if left unpatched indefinitely, unlike the same-severity packages/* advisories which are forced into a time-boxed exception table or a real fix. Two of the seven (brace-expansion, js-yaml) were fixed in PR #364 by re-resolving already-permitted transitive versions; the other five need their own patched-version research.

## rec-20260803-001 — No CLI path corrects a shippedRef on an already-shipped recommendation

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, intelligence
- evidence: Verified at v1.54.0: docs/reference/commands.md's recommendation promote section states refusal for terminal statuses and lists the two sanctioned exceptions; rec-20260801-004 and rec-20260712-006 both carry a ref containing 'PR pending' post-merge.
- next: cadence milestone propose

recommendation promote is refused for terminal-status recs, so a --ref recorded at settle time as a placeholder (e.g. 'PR pending') can never be corrected once the PR merges. Observed on rec-20260801-004 (phase 248, PR #358 merged) and rec-20260712-006 (phase 249 merged), both still reading 'PR pending' at v1.54.0. The doctor recommendation-shipped-drift check covers the settle-pending waypoint but not a stale ref on an already-shipped rec. Options to weigh: a narrow 'recommendation ref set <id> --ref' command; allowing --ref on promote for a shipped→shipped no-op transition; or having settle record the branch/PR automatically at the settle-pending → shipped step so a placeholder is never minted. Cosmetic per-instance, but it accumulates once per shipped phase and silently degrades the ledger's own provenance.

## rec-20260804-002 — audit-exceptions parser silently drops any exception row appended below the HTML template comment

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: security, docs
- files: scripts/check-audit-exceptions.mjs, docs/security/audit-exceptions.md, packages/core/tests/docs/security-ci.test.ts
- evidence: parseExceptionsTable(readFileSync('docs/security/audit-exceptions.md')) returns 5 rows today. Appending an identical row BELOW the existing HTML comment (after line 38) still returns 5; appending the same row ABOVE the comment (before line 34) returns 6. Measured via a Node one-liner importing parseExceptionsTable from scripts/check-audit-exceptions.mjs.
- next: cadence milestone propose

parseExceptionsTable stops at the first non-table-row line. docs/security/audit-exceptions.md places an HTML-comment 'how to add a row' template immediately after the last real row. The comment's own text says to append above it, so following the instruction works -- but appending below it produces an exception that parses to nothing and fails CI with 'not listed', with no diagnostic pointing at the placement. Correct and incorrect placement look identical in the rendered Markdown. The inverse case (a template row INSIDE the comment being ignored) is already proven safe and tested at security-ci.test.ts:207 -- this covers only the untested directional case.

## rec-20260804-003 — A rec archived as shipped by a ship-no-code decision is invisible to the documented dedup procedure

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: intelligence, process
- files: packages/core/src/cli/commands/recommendation.ts, .cadence/intelligence/recommendations.json
- evidence: cadence recommendation list does not contain rec-20260801-010; cadence recommendation list --archived does. cadence decision show dec-20260801-003 reports 'Decision: ship no code this phase' plus an unmet revisit trigger (3 non-mock settles each persisting >=1 code-review finding). Discovered 2026-08-04 while dedupping for scout-20260804-integrity-release against a handoff that itself listed rec-20260801-010 in its 'existing, do not duplicate' table.
- evidence: Same defect class also reproduces for status=rejected, not just shipped: promoting rec-20260724-012 to rejected (phase 253 whole-branch review fix, 2026-08-05) hid it from the default 'cadence recommendation list' as expected, but also broke 'cadence recommendation evidence add rec-20260724-012' entirely ('recommendation not found', despite 'recommendation show rec-20260724-012' resolving it fine) -- worse than rec-20260801-010's case, where the rec is merely hidden from listing but presumably still evidence-addressable. The lookup used by evidence add appears to filter against the same active-only set as the default list, not against the full ledger the way show/promote do.
- next: cadence milestone propose

rec-20260801-010 (finding message-drift dedup) is archived with status shipped, shippedRef phase 246 / PR #356. Its linked decision dec-20260801-003 states 'Decision: ship no code this phase' with a revisit trigger -- i.e. the underlying defect was deferred, not fixed. Because 'cadence recommendation list' shows only the active set by default, an agent following the standing dedup-first rule cannot see it and could refile the same defect. Needs either a distinct terminal state for deferred-by-decision, a list surface that includes archived recs carrying an unmet decision trigger, or a doc change making --archived mandatory in the dedup step.

## rec-20260804-004 — Two sibling worktrees each re-claim nearly every phase number 2-249, making worktree-phases a permanently-warning check

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: process, worktrees
- files: .claude/worktrees/
- evidence: git worktree list shows 3 entries (main + the two above). cadence doctor reports 'warning worktree-phases: phase number collision across worktrees' enumerating roughly 2..249, as 1 of 3 problems across 20 checks (exit 0). git log shows phases 246/247/248/249/250/251 all merged directly to main (PRs #365-#369), not via feat/kernel-assurance-v2. Phases 252+ (this release) are outside the collision footprint, so this release's own phases are unaffected.
- next: cadence milestone propose

cadence doctor's worktree-phases check reports a collision footprint spanning essentially the whole phase history, sourced from two worktrees: .claude/worktrees/kernel-arc-docs-review (feat/kernel-assurance-v2 @ 5d5ec8b6) and .claude/worktrees/phase249-refused-settle-post-gate (feat/post-gate-refusal-summaries-phase-249 @ e1aba70b). Both carry a full .cadence/phases tree, so every historical phase reads as contested. kernel-arc-docs-review in particular sits on a branch-naming convention (a long-lived feat/kernel-assurance-v2 feature branch) that phases 246-251 show has since been superseded -- work now lands directly on main -- suggesting this worktree may be an abandoned holdover. OPERATOR DECISION ONLY: per CLAUDE.md's Zombie Session rule, neither worktree may be removed until confirmed dead. Filing this to move the warning from untriaged to tracked, satisfying the v1.55 Definition of Done's 'no untriaged release-blocking warning' bar without touching either tree.

## rec-20260805-001 — docs.yml pins pnpm/action-setup@v4 while other workflows use @v6

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: ci
- files: .github/workflows/docs.yml
- evidence: grep -n action-setup .github/workflows/*.yml shows docs.yml:44 = @v4 vs ci.yml:32, release.yml:30, security.yml:61,94 = @v6 (found while filing phase 253 T7 doc note, 2026-08-04)
- next: cadence milestone propose

The docs workflow (.github/workflows/docs.yml:44) pins pnpm/action-setup@v4; ci.yml, release.yml, and both jobs in security.yml pin @v6. Minor version-pin drift, no known CVE — align docs.yml to @v6 for consistency.

## rec-20260805-002 — check-lockfile-overrides.mjs cannot detect an override floor that is stale relative to the real upstream patched version

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: security
- files: scripts/check-lockfile-overrides.mjs
- evidence: phase 253 (253-dependency-override-remediation) T5 independent review, 2026-08-05: reviewer identified this as a genuine scope boundary while verifying the detector's fail-then-pass evidence
- next: cadence milestone propose

The phase-253 detector (scripts/check-lockfile-overrides.mjs) only checks internal lockfile consistency: that a resolved instance satisfies its own declared pnpm.overrides target. It cannot catch a target whose floor is self-consistent with the lockfile but sits below the real current upstream patched version (the exact original failure shape phase 253 corrected for fast-uri/brace-expansion, where a stale-but-internally-satisfied override masked a still-vulnerable resolved version). Catching that class needs a live-vulnerability cross-check (pnpm audit's job, via scripts/check-audit-exceptions.mjs), not a lockfile-internal consistency check. Flagged by phase 253's T5 independent reviewer; recorded per the repo's Unlogged Audit Finding convention rather than left implicit.

## rec-20260805-003 — DRAFT parser's task action field silently truncates multi-line content to its first line

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 40%
- decay: fresh
- areas: core-parsing
- next: cadence milestone propose

packages/core/src/parse/draft-parser.ts's parseTasks extracts a task's action via a regex with no 's' flag (/-\s*action:\s*(.+)/), capturing only the first line. Any multi-line action body (e.g. a RUNBOOK-style block added after the first sentence) is silently dropped for every machine consumer that reconstructs task text from the parsed action field -- packages/core/src/dispatch/packet.ts and packages/core/src/verify/plan-review.ts both do this. Humans reading the raw DRAFT.md (and cadence draft check, which reads full section text) see the complete content; only field-level machine consumers lose it. Found during phase 255's T5 (255-01-DRAFT.md), which relies on a multi-line RUNBOOK for an unambiguous operator instruction -- confirmed via direct parseDraftMd test that task.action for T5 contains only the first line, dropping the RUNBOOK's ordering constraint and DONE-does-not-mean-executed disambiguation.

## rec-20260805-004 — js-ts coverage profile mismasks regex literals containing quote characters, silently corrupting downstream span detection

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 40%
- decay: fresh
- areas: core-verify
- evidence: Second independent occurrence, this time a backtick rather than a quote character (2026-08-05, phase 256-02 redo). packages/core/tests/docs/phase256-conduction-prep.test.ts line 63 originally read: expect(runbook).not.toMatch(/git commit[^`]*seeded-defect/) -- a bare backtick inside the regex's character class. Since mask.ts's classify() tracks backtick as a string/template delimiter identically to ' and ", this backtick opens a spurious template-literal mode that is never legitimately closed (no matching backtick appears later in the file), corrupting span detection for the rest of the file from that point on. Distinct from the quote-character case in one way worth recording: here the corrupting backtick sat INSIDE the very it() block it broke (256-02/AC-2, opening at line 46), not in an earlier block -- cadence verify coverage --explain AC-2 reported the block's own opening line as 'no containing span' (spans found: 1 for the whole file, should have been 2), because the corrupted mask meant the parser never found a valid closing brace for that block at all, not just that a later block absorbed extra content. This caused a real settle attempt (cadence settle run --allow-failing-build, 2026-08-05T04:00:28Z) to refuse at test-coverage before code-review/security-audit ever ran -- the exact real-provider certification this phase exists to produce was never reached because of this bug, not because of anything about the fixture. Fixed locally by replacing the regex with a plain string/line-based check (avoiding regex entirely for that assertion, not just avoiding the specific bad character) -- verified via cadence verify coverage --explain AC-1/AC-2 (both now satisfies: true, spans found: 2) and the test itself (2/2 passing) before resubmitting the settle.
- next: cadence milestone propose

packages/core/src/verify/coverage-profiles/mask.ts's classify() only knows string delimiters ', ", and ` (js-ts.ts's syntax.strings table) -- it has no concept of a /regex/ literal as a distinct construct. A regex literal containing an odd-parity sequence of unescaped ' or " characters (e.g. /needs\.audit\.result.*!=\s*["']success["']/ ) causes classify() to open a spurious string mode partway through the regex that is never legitimately closed, silently misclassifying all subsequent real code (including ) and } characters needed for paren/brace depth tracking) as string content until an unrelated later quote happens to resync it by coincidence. This corrupts findMatchingParenIndex/callExpressionBlock's span resolution for every it()/test() block between the triggering regex and the accidental resync point -- observed directly in phase 255's packages/core/tests/docs/security-ci.test.ts, where one such regex caused 3 of 5 new AC-tagged describe blocks to report 'token found but not inside any test block recognized by profile js-ts' despite syntactically correct, passing test code. Confirmed via cadence verify coverage --explain and fixed locally in that file by replacing embedded quote characters with hex escapes (\x27/\x22), but the underlying mask.ts/js-ts.ts gap is unfixed and would silently affect any other test file in the repo (or written in the future) whose regex-literal assertions embed a ' or " character with odd parity -- coverage could report false negatives (a real AC test wrongly refused) or, worse, false positives if the resync boundary happens to land such that an unrelated it() block's span absorbs content it shouldn't.

## rec-20260806-001 — conduction-reachability's session axis is a false positive when CADENCE_HOST_CLI_BIN=codex bypasses the claude-only self-invocation guard

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/activate/assess.ts, packages/core/src/verify/host-cli-client.ts, packages/core/src/doctor/run.ts
- evidence: cadence doctor's conduction-reachability check reported 'code-review: blocked by profile, session' on 2026-08-06 while this repo's CADENCE_HOST_CLI_BIN=codex (~/.bashrc:167) meant the session axis was not actually blocking -- confirmed by two real (non-mock) codex-backed per-task-verify calls succeeding in the same headless session, recorded in .cadence/phases/256-real-provider-certification-prep/256-01-PROGRESS.json
- next: cadence milestone propose

isClaudeCodeSession(env) (packages/core/src/activate/assess.ts:86-88) checks only CLAUDECODE==='1' and has no awareness of CADENCE_HOST_CLI_BIN. The actual self-invocation guard (isSelfInvocation, host-cli-client.ts:118-129) is keyed by SELF_INVOCATION_ENV_VAR, which only has an entry for the 'claude' family -- 'codex' is deliberately unguarded (no reliable session-indicator env var exists for it, per that file's own doc comment). When an operator sets CADENCE_HOST_CLI_BIN=codex (a sanctioned mechanism CLAUDE.md itself documents for getting independent review from inside a Claude Code session), any host-cli-configured gate's REAL spawn target is codex, not claude -- so the guard never fires regardless of CLAUDECODE, even inside a headless Claude Code session. conduction-reachability (phase 251) reports code-review as session-blocked purely from CLAUDECODE=1, which is wrong in this configuration: the profile axis is a genuine blocker but the session axis is not. Empirically confirmed 2026-08-06 during phase 256 prep: two per-task-verify calls (host-cli, family resolves to codex per this repo's own ~/.bashrc:167 CADENCE_HOST_CLI_BIN=codex) made real, non-mock calls from inside this Claude Code session, producing genuine LLM-judged verdicts (not MockPerTaskVerifier's deterministic output) -- see .cadence/phases/256-real-provider-certification-prep/256-01-PROGRESS.json's perTaskVerify.provider:host-cli entries with substantive, non-canned reason text. The check's overall 'warning' verdict for this repo is still correct today (security-audit is genuinely blocked on the provider axis, mock), so this hasn't caused a wrong overall status yet -- but the per-axis detail is misleading, and a future repo/config where code-review's provider axis is also already clear would get a false 'blocked' report for a gate that actually isn't.

## rec-20260806-002 — Code-review finding (medium): The instructed “stop and report” path skips Step 5b, leaving securityAudit.prov…

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: .cadence
- files: .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md
- evidence: phase 256-real-provider-certification-prep, draft 256-01, SUMMARY contentHash 51b2f95ce6ec4030acca94c1b1117abb7cd2555cb4cd23aaf0c627fa6a4c2fc8 — medium finding at .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md:106: The instructed “stop and report” path skips Step 5b, leaving securityAudit.provider as host-cli and the repo failing its baseline invariant. Require rollback before stopping.
- next: cadence milestone propose

medium finding at .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md:106: The instructed “stop and report” path skips Step 5b, leaving securityAudit.provider as host-cli and the repo failing its baseline invariant. Require rollback before stopping.

## rec-20260806-003 — Code-review finding (medium): The “stop and report” path skips Step 5b, leaving securityAudit.provider as hos…

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: .cadence
- files: .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md
- evidence: phase 256-real-provider-certification-prep, draft 256-01, SUMMARY contentHash 0e2b9d2da3c2d5076cd4afb28ce1bd27c9939f6d81b7d93fd6fa3a9d9c9d782d — medium finding at .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md:106: The “stop and report” path skips Step 5b, leaving securityAudit.provider as host-cli and the committed baseline failing its invariant.
- next: cadence milestone propose

medium finding at .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md:106: The “stop and report” path skips Step 5b, leaving securityAudit.provider as host-cli and the committed baseline failing its invariant.

## rec-20260806-005 — Code-review finding (medium): The Step 3 "stop and report" path bypasses Step 6, leaving securityAudit.provid…

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: .cadence
- files: .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md
- evidence: phase 256-real-provider-certification-prep, draft 256-02, SUMMARY contentHash b8cecf07e5576324289d22a5c1911f760c7a5c938abdce54fa100889754f27f3 — medium finding at .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md:180: The Step 3 "stop and report" path bypasses Step 6, leaving securityAudit.provider set to host-cli and the baseline config invalid.
- next: cadence milestone propose

medium finding at .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md:180: The Step 3 "stop and report" path bypasses Step 6, leaving securityAudit.provider set to host-cli and the baseline config invalid.

## rec-20260806-006 — build-test-must-pass silently swallows which test failed when bypassed via --allow-failing-build

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/gates/build-test-must-pass.ts, packages/core/src/verify/test-runner.ts
- evidence: Reproduced directly: pnpm --filter cadence-core test -- tests/docs/self-application-config.test.ts with securityAudit.provider=host-cli shows the real AssertionError only when run standalone outside cadence settle; cadence settle run --allow-failing-build gave zero console output about which test failed, on the exact same repo state (2026-08-06).
- evidence: Confirmed still valid 2026-08-21 (HANDOFF-verifier-honesty-verify-premises.md Phase L sweep, scout-20260821-verifier-honesty): packages/core/src/gates/build-test-must-pass.ts's bypass-through path (buildTestBypassed:true) has zero ctx.io.err calls -- completely silent, unlike the refusal branch which does log. packages/core/src/verify/test-runner.ts:17 confirms execSync(command, { cwd, stdio: 'ignore' }) discards subprocess output at the OS level, never captured for later surfacing. Readiness/priority unchanged (needs-decision/high) -- genuine live gap.
- next: cadence milestone propose

packages/core/src/gates/build-test-must-pass.ts only writes a stderr notice on the refusal branch (line 37: '${res.command} exited ${res.exitCode}'); when a failing run is bypassed via --allow-failing-build or --force (line 47-51), the gate returns { outcome: 'pass', flags: { buildTestBypassed: true } } with NO stderr output at all. The subprocess itself is spawned via packages/core/src/verify/test-runner.ts's runTestCommand with stdio: 'ignore' -- the actual test output (which test failed, why) is never captured anywhere, not to the console, not to a log file, not into the SUMMARY. This means an operator who bypasses a failing build genuinely cannot find out which test failed without independently re-running the test command themselves outside cadence. This violates this repo's own documented convention (CLAUDE.md's 'Quiet Fallback' failure mode: 'every fallback and auto-bypass in this codebase prints a loud stderr notice and/or records provenance in the SUMMARY'). Discovered during phase 256-02's real-provider conduction (2026-08-06): the operator was asked to confirm a known, expected build-test-must-pass bypass was ONLY the anticipated self-application-config.test.ts failure and not something else -- and had to be walked through running pnpm test directly, outside cadence, to find out, since cadence itself gave zero signal. Fix direction: capture stdout/stderr from the test command (or at minimum a pass/fail-per-file summary) and print/record it on the bypass path too, not just the refusal path.

## rec-20260806-007 — code-review convergence budget persists across separate settle invocations, undocumented, counts bypassed attempts

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/verify/converge.ts, packages/core/src/gates/code-review.ts
- evidence: 256-02-CODE-REVIEW.json sidecar history (2026-08-06): 3 entries across 3 separate settle invocations (04:21:23 reloop, 04:33:28 reloop+bypassed:true, 04:43:22 escalate) against unchanged vulnerable content, then a 4th real invocation (05:08:23, different content -- the fixed counterpart plus a since-fixed test-file issue) still produced 1 finding and needed to be judged fresh, unaffected by the exhausted counter only because it happened to genuinely pass on the 6th attempt (05:20:09) -- confirmed via packages/core/src/gates/code-review.ts:126 that a genuine pass (highs.length===0) skips the attempt-budget check entirely, so escalate only bites on continued failures, but nothing surfaces the remaining budget before that point.
- next: cadence milestone propose

packages/core/src/verify/converge.ts's maxAttempts logic (nextConvergence: 'if (attempt >= maxAttempts) return escalate') reads attemptsSoFar from a persisted per-draft sidecar (<draftId>-CODE-REVIEW.json), not a per-invocation counter -- so the 3-attempt convergence budget (config.convergence.maxAttempts, default 3) is consumed across ALL separate 'cadence settle run' invocations for a draft, including ones where the operator passed --allow-code-review-failure to deliberately bypass a KNOWN, expected finding (the sidecar still records that as an attempt with bypassed: true and increments the counter). This is undocumented operator-facing behavior: docs/providers.md's conduction procedure and this repo's own runbooks give no indication that re-running settle (e.g. to reproduce output for review, or simply retrying after an unrelated fix) burns down a shared, finite budget that has nothing to do with whether the underlying code actually changed. Concretely hit during phase 256-02's real-provider conduction (2026-08-06): three real settle invocations against the SAME unchanged vulnerable fixture (expected, deliberate, per the runbook's own design) consumed all 3 attempts; a fourth invocation -- triggered only because the operator ran 'clear' in their terminal and had to re-run settle to reproduce output for the assisting session -- hit 'code-review did NOT converge after 3 attempts' before security-audit could run again, even though --allow-code-review-failure would have worked fine on that invocation too had it been included. No engine bug here (the escalate-after-3 mechanism is presumably intentional, forcing a human decision rather than infinite silent bypass-and-retry), but the SILENCE about it being cross-invocation and bypass-inclusive is the gap: an operator has no way to know 'you have N attempts left' before hitting the wall, and no visible signal distinguishes 'this attempt was consumed by a genuine failed fix attempt' from 'this attempt was burned by an incidental re-run.' Fix direction: either surface remaining-attempts count in the reloop/bypass stderr notices (e.g. 'code-review: --allow-code-review-failure set; proceeding past 2 HIGH finding(s). 1 attempt remaining before this draft requires --force.'), or reset/exclude the counter increment specifically when the SAME finding set repeats bypassed (distinguishing genuine iteration from incidental re-invocation).

## rec-20260806-008 — dec-20260801-003's 3-settle revisit trigger has been met -- worth a decision on whether to act

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/intelligence/finding-routing.ts, packages/core/src/verify/finding-identity.ts
- evidence: Counted directly from .cadence/phases/256-real-provider-certification-prep/*.json (2026-08-06): six settles, provider host-cli throughout, codeReview finding counts 2/2/3/1/2/1 respectively; dec-20260801-003's trigger text confirmed via cadence decision show / decisions.json read.
- next: cadence milestone propose

dec-20260801-003 (linked under the now-shipped/closed rec-20260801-010) deferred finding-identity message-drift dedup, with an explicit trigger to revisit: 'at least 3 settles under a non-mock review provider (anthropic/local/host-cli) have each persisted at least 1 code-review finding.' Phase 256-02's real-provider conduction (2026-08-06) produced SIX such settles under provider: host-cli, each persisting >=1 code-review finding: .cadence/phases/256-real-provider-certification-prep/256-02-refused-2026-08-06T04-21-23-042Z-SUMMARY-snapshot.json (2 findings), ...T04-33-37-866Z (2), ...T04-43-22-653Z (3), ...T05-08-23-709Z (1), ...T05-13-30-388Z (2), and the final 256-02-SUMMARY.json (1) -- double the trigger's threshold. This does NOT mean the deferred work should now be built reflexively: several of the six are repeat invocations against unchanged fixture content (deliberate, per the redo's own runbook design, not independent drift signal), and dec-20260801-003's own planned next step was specifically an offline analyzer over the accumulated SUMMARY.json corpus, which has not been built or run. This rec exists only to make the met trigger visible for a future decision -- act on it, defer again with updated reasoning, or determine the corpus still isn't representative enough (six settles from one seeded, single-defect-type fixture may not be what the original decision meant by 'real data'). Could not attach this as evidence directly to rec-20260801-010 -- recommendation evidence add refuses on shipped/closed recs by design.

## rec-20260807-006 — tests/hooks/dispatcher.test.ts Windows CI timeout, recurred 3x during v1.55.0 release-cut

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, ci, testing
- files: packages/core/tests/hooks/dispatcher.test.ts
- evidence: gh run view 31211368719 (main push, commit c23e1092/fb84baab) -- test (windows-latest, 22) failed 3 consecutive reruns, all with identical FAIL tests/hooks/dispatcher.test.ts > HookDispatcher > skill-invoke caps at 100 entries with FIFO drop / Error: Test timed out in 90000ms at dispatcher.test.ts:96:3. Local isolated run (npx vitest run tests/hooks/dispatcher.test.ts on this Windows dev machine): 9/9 passed in 2.35s. Contrast: gh run view 31213678405 (PR #384's own CI) -- test (windows-latest, 22) passed in 12m18s on the same underlying content.
- next: cadence milestone propose

Under the full turbo test suite (401 files, maxWorkers:12) on windows-latest CI, tests/hooks/dispatcher.test.ts > HookDispatcher > skill-invoke caps at 100 entries with FIFO drop (105 sequential dispatch() calls, each a SimpleStateBackend atomic write) timed out at 90000ms 3 times in a row on the identical commit (main push runs for c23e1092/fb84baab), 2026-08-07. Ran the same test file in isolation locally on Windows: passed in 2.35s (9/9), ruling out a logic defect -- points at CI-runner resource contention under full parallel load, consistent with this repo's documented tempRepo/spawn Windows-CI-flake class (CLAUDE.md 'The Windows Panic'). Notably PR #384's own fresh CI run (same full suite, same content) passed windows-latest clean on the first attempt (12m18s), so it is not fully deterministic -- intermittent under load, not a hard regression. Landed right after phase 260's vitest 2->4 upgrade; worth watching whether frequency is elevated vs pre-260 baseline, and whether CLAUDE.md's Flake Reflex known-reference list should add this alongside the existing macOS settle-codereview-convergence.test.ts entry if it keeps recurring.

## rec-20260807-005 — Make phase-qualified the default AC coverage scheme (bare still ships collision bug)

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: gates, verify, init, config
- files: packages/types/src/config.ts, packages/core/src/gates/coverage.ts, packages/core/src/verify/coverage.ts
- decisions: dec-20260813-005 (superseded), dec-20260821-004 (active)
- evidence: Confirmed live 2026-08-07 during phase 261 prep: config.ts:227,252,577 all default coverageScheme to 'bare'; only this repo's own .cadence/config.json overrides to phase-qualified.
- evidence: Verified live 2026-08-21: packages/core/src/cli/commands/init.ts:481 writes coverageScheme: 'phase-qualified' as const unconditionally for every fresh cadence init (git blame: commit 90e3ed96, phase 239, 2026-07-30 -- predates this rec's own filing). packages/types/src/config.ts:583 confirms 'bare' is the deliberate defaultConfig back-compat literal for pre-existing/upgraded projects only. The rec's summary claim that 'bare' remains the default for every fresh cadence init is stale/incorrect; see dec-20260821-001 (supersedes dec-20260813-005, which checked plan.ts instead of cli/commands/init.ts). Remaining open question is narrower: whether/how pre-phase-239 projects migrate off 'bare', not whether fresh init should default to phase-qualified.
- next: cadence milestone propose

Phase 239 (PR #338) shipped an opt-in coverageScheme='phase-qualified' token scheme that closes the cross-phase AC-N token collision (originally rec-20260729-004). But 'bare' remains the DEFAULT for every fresh cadence init and every other cadence-managed project (packages/types/src/config.ts:227,252,577) -- this repo dogfoods the fix for itself only, via its own .cadence/config.json. Decide whether phase-qualified should become the default: weigh against the AC-N token convention documented in CLAUDE.md and asserted by packages/core/tests/verify/, backward compat for pre-239 test files written against bare tokens, and the v2.0.0-reserved semver policy (breaking changes ship as minor until full coupling).

## rec-20260808-001 — cadence doctor: content-agnostic release-drift check via git-tag-distance

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: doctor, release-process
- files: packages/core/src/doctor/run.ts
- evidence: Independent fresh-context review of 262-01-DRAFT.md (2026-08-08) verified the 2026-07-27 incident (commit 127a06b0, v1.51.1 tag) via git log/tag inspection and confirmed a tag-distance check would catch the whole class, not just engines drift.
- next: cadence milestone propose

release-currency (phase 262) is scoped to comparing published vs local 'engines' content only, since that was the exact field behind the 2026-07-27 incident. A strictly stronger, content-agnostic, offline detector exists: local version == published version AND 'git log v<version>..HEAD' is non-empty means main has unreleased commits sitting under an already-published version tag, regardless of which field changed (deps, bin, exports, plain source). Surfaced by independent review during phase 262 DRAFT authoring; deliberately out of scope for 262 to avoid scope creep -- filed as a follow-on.

## rec-20260809-003 — vitest.shared.ts's Windows-timeout comment cites the now-fixed dispatcher cap test

- status: candidate
- ready: ready-for-cadence-spec
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: test-infra
- files: vitest.shared.ts
- evidence: Flagged by phase 266's T2 independent reviewer while confirming the full suite was green; out of phase 266's declared task file scope (no task's files: list includes vitest.shared.ts), so not fixed inline.
- next: cadence milestone propose

vitest.shared.ts:16-19 justifies TIMEOUT_MS=90000 on win32 partly by citing 'the dispatcher cap test (105 sequential dispatch() calls, each doing multiple disk read/writes)' as historical evidence. Phase 266 rewrote that exact test (packages/core/tests/hooks/dispatcher.test.ts, the skill-invoke FIFO-cap test) to call a pure in-memory function instead, with zero disk I/O -- the comment's specific example is now stale, though the general 90000ms value likely still has other justification (CLI-spawning settle tests, general Windows CI slowness) and should not be casually lowered without separately re-measuring those.

## rec-20260809-004 — README.md / packages/core/README.md still claim cadence init --demo is zero-prompt

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs
- files: packages/core/README.md
- evidence: grep -n 'zero prompt' README.md packages/core/README.md both show the same stale comment at README.md:123 and packages/core/README.md:45
- next: cadence milestone propose

Phase 265 made cadence init present the verifier-provider choice explicitly (a real prompt) whenever a prompter is available (TTY or CADENCE_PROMPTER_SCRIPT) and no --verifier-provider/--activate/--full flag settles it. docs/reference/commands.md was corrected in phase 265 T5, but README.md:123 and packages/core/README.md:45 both still show 'cadence init --demo # zero prompts: name + gate profile are derived' as an example comment -- true for name/gate-profile specifically but now potentially misleading for the whole invocation under a TTY. Low priority, cosmetic; found while reviewing phase 265's T5 (docs task) which correctly scoped its own fix to commands.md but flagged these two files as out of its declared boundary.

## rec-20260809-005 — Prompter-desync foot-gun has now bitten twice (settle phase 174, init phase 265) -- systemic fix overdue

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli
- files: packages/core/src/cli/commands/init.ts
- evidence: prompter.ts:84-103's own docstring documents the settle-side instance and defers the fix (Phase 174); init.ts's whole-branch review (phase 265) independently found and locally fixed a second instance in cadence init
- next: cadence milestone propose

packages/core/src/verify/prompter.ts's createDefaultPrompter/init.ts's makePrompter both build a brand-new ScriptedPrompter (cursor reset to 0) on every call, with no memoization. Phase 174's whole-branch review first found this for cadence settle (gates/interactive.ts's interactive-verdict gate + services/retro.ts's post-commit retro offer can both prompt in one settle run) and explicitly deferred a real fix as out-of-phase-scope, noting it needs matching close()-lifecycle changes across every existing caller. Phase 265's whole-branch review independently hit a NEW instance of the exact same bug class in cadence init (the new verifier-provider prompt + the pre-existing host-wire prompt could both fire in one init run) and fixed it locally with a per-command memoized getPrompter() closure -- a real but narrow patch, not the systemic fix Phase 174 already flagged as needed. Two independent commands have now each grown their own scripted-prompter-lifecycle workaround. Worth a real fix: one process-run-scoped Prompter singleton (or equivalent shared factory with proper close() ownership) that every prompt call site in a given cadence invocation reuses, closing it once at the very end -- eliminating this whole class of CADENCE_PROMPTER_SCRIPT desync risk rather than patching it per-command as it's rediscovered.

## rec-20260809-006 — cadence onboard reports live config readiness, not the recorded provider-selection decision

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core
- files: packages/core/src/cli/commands/onboard.ts
- evidence: phase 265's DRAFT AC-5 deliberately scoped only the no-reprompt half after advisor review; rec-20260808-006's shipped promotion notes this remainder explicitly rather than overclaiming full delivery
- next: cadence milestone propose

rec-20260808-006's original text asked that cadence onboard 'report the existing selection rather than re-prompt' -- phase 265 (which closes the rest of that rec) delivered only the negative half: onboard is regression-tested to never gain a provider-selection prompt. It still reports assessReadiness's live config-derived state (provider/keyPresent/ready/reason), not the specific recorded decision from .cadence/intelligence/decisions.json (title/rationale/timestamp of how the choice was made -- prompted, flagged, or defaulted). These usually agree in practice (config reflects the recorded choice), but onboard cannot currently answer 'when/how was this chosen' the way cadence decision list can -- a teammate onboarding onto an existing repo sees the readiness state but not the provenance. Low/medium priority: consider onboard surfacing the most recent matching decision's rationale alongside assessReadiness's report, or a documented pointer to cadence decision list.

## rec-20260811-003 — conduction-drift-streak will chronically warn: ~90% of phases cannot reset it by construction

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core/doctor
- files: packages/core/src/doctor/run.ts
- decisions: dec-20260813-003 (active)
- evidence: tier distribution across 282 drafts: standard 233 (82.6%), complex 29 (10.3%), quick-fix 20 (7.1%); under profile=standard only complex tier includes code-review (deltas: standard x complex has code-review, deep-verify), so only ~10% of phases can reset the streak; threshold is 3; current streak is 2 as of 2026-08-11 (re-verify before acting -- this figure moves every settle); dec-20260803-001 designates conduction as deliberately operator-initiated
- evidence: Corrected live re-measurement 2026-08-13 (v1.57 Phase W, dec-20260813-003), verified against the actual computeConductionDriftStreak algorithm rather than a naive corpus walk: complex-tier 31/286 drafts (~10.8%). Determinate-eligible corpus (assurance.verifierRollup present, since 2026-07-29) = 35 settles; 23/35 (66%) would show doctor's conduction-drift-streak as warning at that point in time; max streak reached = 16. Confirms the chronic-warn concern empirically. See dec-20260813-003 for the full decision: threshold not changed in this decisions-only phase, O.3's measured-threshold follow-up flagged as now-overdue with real data available.
- next: cadence milestone propose

Under profile=standard only complex-tier drafts include code-review, and complex is only ~10% of drafts historically, so ~90% of settles can never reset the conduction-drift-streak counter. dec-20260803-001 designates conduction as deliberately operator-initiated, so the check flags as drift what a standing decision designates as policy. Worth a decision on whether the streak/threshold model still fits that policy.

## rec-20260811-004 — milestone close/status has no CLI path when its recommendation ships out-of-band of accept/export/build

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core/intelligence
- files: packages/core/src/cli/commands/milestone.ts
- decisions: dec-20260813-004 (active)
- evidence: cadence milestone close mil-rec-rec-20260808-003 -> 'milestone close refused: cannot close milestone in status proposed'; CMD-5 (docs/handoffs/HANDOFF-v1.56-release-closeout.md) reports this as the sole desynced milestone as of 2026-08-11; recorded rather than hand-edited per that handoff's Q.3 and the project's no-hand-edit-intelligence-ledger rule
- next: cadence milestone propose

mil-rec-rec-20260808-003 stays status=proposed even though its sole recommendation (rec-20260808-003) is already shipped, because the work landed directly as a phase (268) rather than through the normal milestone accept->export->build flow. cadence milestone close refuses with 'cannot close milestone in status proposed' since it only accepts an exported milestone -- there is no transition for a proposed/accepted milestone whose recommendation(s) shipped by a different path. Same class of gap as rec-20260803-001 (no CLI path corrects a shippedRef on an already-shipped rec) but on the milestone state machine instead of the recommendation ledger.

## rec-20260811-005 — ROADMAP.md missing ### Phase N entries for phases 239-241 (exist on disk, never landed under those headings)

- status: candidate
- ready: ready-for-cadence-spec
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs
- files: .cadence/ROADMAP.md
- evidence: grep -n 'Phase 239\|Phase 240\|Phase 241' .cadence/ROADMAP.md returns only one incidental hit inside phase 236's prose, no heading for any of the three; all three have completedAt dates and merged PRs (#338, #332, #334) confirming real, shipped work
- next: cadence milestone propose

Phases 239 (coverage-phase-scoping, #338), 240 (doctor-multi-seam-readiness, #332), and 241 (anchor-ladder-reachability, #334) all exist on disk with completed SUMMARY.json records and shipped PRs, but ROADMAP.md has no ### Phase N heading for any of the three -- only an incidental mention of 241 inside phase 236's prose. Discovered while researching phase 271's roadmap-currency backfill; left unfixed there since the AC only required drift <= 10 (already satisfied without touching 239-241) and the handoff's own scope discipline (do not add scope) applied. MILESTONES.md now documents all three under a date-derived v1.52.0 section (phase 271 backfill).

## rec-20260811-006 — macOS CI: demo-gutting-coverage-scheme.test.ts hits 20s timeout under load

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: testing, ci
- files: packages/core/tests/integration/demo-gutting-coverage-scheme.test.ts, vitest.shared.ts
- decisions: dec-20260816-001 (active)
- evidence: PR #397 macos-latest leg: run 31447771306, failed job 93645562270 (20s timeout), rerun job 93655957205 passed 6m54s with no code change; local Node22 run 1.75s clean; main's last 6 CI runs green
- evidence: Recurred twice more, cross-OS: (1) main's own edbd2fd0 CI run (31768449705, 2026-08-14, phase 277's release commit -- no relation to this test) timed out on macos-latest, same 20000ms ceiling, same test. (2) PR #421 (phase 278) hit it twice in a row on ubuntu-latest (runs 31837437300 job 94886752553 at 20255ms, and 31839191846 job 94892168370) -- first cross-OS confirmation beyond the macOS-only sighting in PR #397. Both PR #421 occurrences are on an unrelated diff (phase 278 doesn't touch this file or vitest.shared.ts); the recurrence on main's own commit independently rules out any diff-specific cause. Strengthens the case for the precedented darwin-style vitest.shared.ts timeout bump, now scoped to include linux too if the operator picks this up.
- evidence: 3 fresh occurrences 2026-08-15 across 2 unrelated PRs (#433, #434), same repo state: PR #433 (real code diff, packages/core/src/cli/commands/done.ts + build-task.ts) hit it once on ubuntu-latest; PR #434 (pure .cadence/intelligence/*.json ledger data, zero code) hit it on BOTH macos-latest and ubuntu-latest on first run, then macos-latest again on the immediate re-run, before passing on a third attempt. All 4 failures: identical error 'Test timed out in 20000ms' at tests/integration/demo-gutting-coverage-scheme.test.ts:23:3, identical test name '270-01/AC-1 + AC-2: money-shot refusal is AC-2-specific, and the script reaches Settled'. PR #434's diff cannot plausibly cause this (no code touched at all), confirming the timeout is CI-load-driven, not diff-related -- strong evidence this is a real, currently-active flake worth fixing (bump testTimeout for this spawn-heavy integration test, or investigate why the demo script subprocess is slow under concurrent CI load) rather than a one-off.
- evidence: 2 more occurrences 2026-08-16, both on PR #434's own CI run 31918591341 (chore/ship-rec-20260815-002, pure ledger JSON diff, zero code touched): first attempt job 95094570163 (ubuntu-latest, 8m4s) and the operator-approved single re-run job 95096358921 (ubuntu-latest, 7m19s) both failed identically -- 'Test timed out in 20000ms' at demo-gutting-coverage-scheme.test.ts:23:3. windows-latest and macos-latest passed both times. This brings the 2026-08-15/16 session total to 6 identical ubuntu/macos occurrences across PR #433 and #434 alone, all zero-relation diffs. Per the pr-land skill's flake protocol and the repo's 'Flake Reflex' rule, the session stopped re-running after this single permitted retry and is surfacing the pattern to the operator rather than continuing to loop -- this is now well past isolated-flake territory and worth the operator's explicit call on the precedented testTimeout bump.
- next: cadence milestone propose

tests/integration/demo-gutting-coverage-scheme.test.ts (phase 270's run-demo.sh e2e test, spawns npm test x2 + cadence settle run --auto x2) timed out at vitest's 20s default on macos-latest in PR #397's run 31447771306 (job 93645562270), while ubuntu-latest and windows-latest passed the same run and it runs in ~1.75-2.3s locally on Node 22. A same-run rerun (job 93655957205) passed clean in 6m54s with zero code changes -- confirms load-dependent flake, not a logic bug. main's prior 6 CI runs were all green on this test. vitest.shared.ts already scales TIMEOUT_MS to 90000 on win32 for the same class of slow child-process-spawn issue via a documented single-source-of-truth pattern (explicitly rejecting per-test overrides); if this recurs, the same darwin-scoped bump is the precedented fix -- but it trades off loosening the timeout for ~4000 other macOS tests to accommodate one outlier, so needs an explicit operator call, not a reflexive bump.

## rec-20260812-001 — resume drops the dangling-lastHandoff-pointer signal when no fallback doc exists at all

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: resume, handoff, state-tracking
- files: packages/core/src/handoff/locate.ts, packages/core/src/handoff/run-resume.ts
- evidence: Found during phase 273's independent T2 review (2026-08-11): confirmed by reading locate.ts's null-return path and run-resume.ts's found:false branch.
- next: cadence milestone propose

locateFreshestHandoff's new danglingPointer signal (phase 273) is only surfaced when the fallback glob finds at least one other SESSION-*.md to serve. When lastHandoff is dangling AND no SESSION-*.md exists anywhere in .cadence/handoff/, locateFreshestHandoff returns null, localResolve returns { found: false }, and the operator just sees 'resume: no handoff found' with zero indication that state.json actually pointed somewhere real. Deliberately out of scope for phase 273 (AC-1's Given required at least one fallback doc to exist); worth a small follow-up to thread the dangling filename into the not-found path too.

## rec-20260812-002 — classifyAcObservability's negation-clause-boundary heuristic is fragile to punctuation adjacent to the trigger phrase

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core/verify, core/gates
- files: packages/core/src/verify/criteria-observability.ts
- evidence: Phase 274 T1 independent review round 2 (negation ;/em-dash gap on real 261-01 AC-7 text) and T2 independent review (synthetic deploy-log.txt clause-boundary construction) -- both 2026-08-12
- next: cadence milestone propose

Two independent reviewers of phase 274's criteria-observability.ts found real gaps in hasNegationInClause's naive period/newline clause-boundary scan: (1) a semicolon or em-dash between a negation word and the trigger token is not treated as a boundary, so a real negation on the far side of a ; is missed -- confirmed on real corpus text (261-01-DRAFT.md AC-7), safe direction (produces a false observable, not the dangerous false unobservable). (2) A period inside an unrelated token (e.g. a filename like deploy-log.txt) between two distinct clauses can cause a signal match in the first clause to fire unobservable even though a later clause in the same sentence explicitly disclaims the SUMMARY reference -- constructed synthetically, not found in the real 1,310-AC corpus (validated twice, zero real false positives). Both point at the same root cause: a real sentence/clause boundary needs smarter detection than raw period/newline splitting. Neither gap blocked phase 274's own settle (D-G's own asymmetric-safety and staged-rollout rationale accepts this residual risk for v1.57, matching the 0.8%-population reasoning already used to defer DRAFT-time refusal to v1.58).

## rec-20260812-003 — renderSummaryMd splices operator/verifier free text into SUMMARY.md unsanitized -- an unbalanced code fence corrupts everything after it

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core/parse
- files: packages/core/src/parse/summary-writer.ts
- evidence: Phase 274 T6 independent review, 2026-08-12: reproduced markdown-corruption via t.notes with an unbalanced code fence, confirmed unrelated to T6's own change
- next: cadence milestone propose

renderSummaryMd (packages/core/src/parse/summary-writer.ts) has never sanitized free-text fields it splices into the Markdown sidecar: ac.note, t.notes (operator-supplied via 'build task --notes'), g.skipReason, b.reason (--force justification), and now (phase 274 T6) the classifier's unobservable reason. Confirmed by phase 274 T6's independent reviewer: constructing a reason/notes string containing an unbalanced markdown code fence corrupts every section after it when the SUMMARY.md is viewed through an actual CommonMark renderer (verified with python-markdown, same lazy-continuation rules as GitHub) -- reproduced with zero T6 code involved, using only t.notes. Not a new defect, not introduced by phase 274 -- a repo-wide gap in the renderer shared by at least 5 free-text fields.

## rec-20260813-001 — Code-review finding (medium): Exported mutable gate tables can be changed by any importer, altering later `ga…

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: packages/core
- files: packages/core/src/gates/engine.ts
- evidence: phase 274-unobservable-criteria-classification, draft 274-01, SUMMARY contentHash 2bf2cc959a487b419d2d98847674fa31cc764ba573122e48b22dde059c324699 — medium finding at packages/core/src/gates/engine.ts:22: Exported mutable gate tables can be changed by any importer, altering later `gatesFor()` results. Expose frozen/read-only data or copies instead.
- next: cadence milestone propose

medium finding at packages/core/src/gates/engine.ts:22: Exported mutable gate tables can be changed by any importer, altering later `gatesFor()` results. Expose frozen/read-only data or copies instead.

## rec-20260813-003 — classifyAcObservability's SUMMARY_TOKEN regex lacks a trailing word-boundary guard (SUMMARYFOO/SUMMARYs still match as bare SUMMARY)

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core/verify
- files: packages/core/src/verify/criteria-observability.ts
- evidence: packages/core/src/verify/criteria-observability.ts SUMMARY_TOKEN regex; whole-branch review's direct node -e regex probing; full-corpus scan (1237 ACs, one benign occurrence in 244-01-DRAFT.md AC-2)
- next: cadence milestone propose

verify/criteria-observability.ts's SUMMARY_TOKEN regex (/\bSUMMARY(?:\.(?:json|md)\b)?(?!\.\w)/g) was fixed this phase (274) to stop matching SUMMARY.mdx/SUMMARY.yaml (a real code-review HIGH finding) via a (?!\.\w) negative lookahead guarding the dot-extension case specifically. An independent whole-branch review of that fix found the guard doesn't extend to a trailing word-boundary in general: text containing SUMMARY_TOKEN, SUMMARYFOO, or SUMMARYs still matches as a bare SUMMARY token, since the lookahead only excludes a following '.'+word-char, not any following word character. A full real-corpus scan (1237 parseable DRAFT ACs) found exactly one occurrence of this shape (244-01-DRAFT.md AC-2's 'pre-existing SUMMARYs') and it produced zero false positive, since it doesn't sit near any of the classifier's narrow trigger phrases -- so this is a real but currently benign gap, same root-cause family as rec-20260812-002's negation-boundary fragility (both are edge cases in the classifier's structural pattern-matching, deferred per D-G's staged-rollout rationale rather than fixed, given zero real-corpus manifestation).

## rec-20260813-004 — engine.ts's exported DELTAS/ALWAYS_FIRE tables are mutable at the type level (code-review MEDIUM, still open)

- status: candidate
- ready: needs-evidence
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core/gates
- files: packages/core/src/gates/engine.ts
- evidence: packages/core/src/gates/engine.ts DELTAS/ALWAYS_FIRE exports; 274-01-CODE-REVIEW.json / 274-01-SUMMARY.json codeReview field (MEDIUM finding, disposition: open)
- next: cadence milestone propose

Phase 274's T7 fix exported gates/engine.ts's previously-module-private DELTAS and ALWAYS_FIRE consts (Record<Profile, Record<Tier, Gate[]>> and Gate[] respectively) so a test could assert DELTAS.standard.complex directly, per AC-6's literal Then-clause requirement. This phase's own code-review gate flagged a MEDIUM finding on the export: the exported tables are mutable at the type level (plain Gate[] arrays, not readonly/as-const), so any future importer could in principle mutate the single source-of-truth gate matrix at runtime with no compiler error. Confirmed still recorded only as disposition:'open' in 274-01-SUMMARY.json's codeReview field -- never independently filed as a recommendation. Object.freeze would only be a shallow, cosmetic fix (nested arrays stay mutable); a real fix needs 'as const' plus readonly types on both exports, which the current callers (engine.ts's internal DELTAS/ALWAYS_FIRE lookups, engine.test.ts's read-only assertions) would tolerate without change, but wasn't attempted in phase 274 to keep that fix minimal and narrowly scoped to AC-6's literal requirement.

## rec-20260813-005 — resume serves a stale-but-existing lastHandoff pointer without checking for a fresher doc

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: resume, handoff, state-tracking
- files: packages/core/src/handoff/locate.ts
- evidence: 2026-08-13 resume session: lastHandoff pointed at phase-273 doc; a newer phase-274 doc (worktree-authored, generated_at strictly later) sat unindexed in the same directory after sync; cadence resume served the stale one with no signal.
- next: cadence milestone propose

locateFreshestHandoff (packages/core/src/handoff/locate.ts:44-49) returns the lastHandoff-pointed doc immediately once existsSync(pointer) is true -- it never compares that doc's generated_at against the ranked glob of other SESSION-*.md files in the same directory. Phase 273 (rec-20260811-009) only fixed the dangling case (pointer names a file that no longer exists); this is the sibling case where the pointer target still exists but a newer handoff has since been written (e.g. by a different worktree merging back, or a session that wrote a fresh doc without updating state.json's session.lastHandoff). Hit live on 2026-08-13: the primary checkout's lastHandoff pointed at SESSION-2026-08-12.md (phase 273) while origin had already merged phase 274, whose own worktree-local handoff (SESSION-2026-08-13-phase274-landed-v157-phaseT-complete.md) was strictly newer by generated_at and sat in the same .cadence/handoff/ dir once synced -- cadence resume served the stale doc with zero warning, costing a full manual cross-worktree investigation to catch. Fix shape: after resolving via the pointer, also rank against the glob and warn (not silently switch) if a strictly-newer generated_at doc exists elsewhere in the directory.

## rec-20260813-006 — cadence doctor / resume flow could warn before a git reset --hard discards uncommitted tracked-file changes, not just commits

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, docs
- files: .claude/settings.json, .claude/scheduled_tasks.lock
- evidence: v1.57.0 release cut session, 2026-08-13: git reset --hard origin/main discarded uncommitted local-only edits to .claude/settings.json and .claude/scheduled_tasks.lock; content unrecoverable, cadence doctor confirmed no functional breakage post-hoc but this was not guaranteed
- next: cadence milestone propose

During v1.57.0's release cut (2026-08-13), reconciling a diverged local main via an explicitly-consented 'git reset --hard origin/main' silently discarded uncommitted local-only edits to .claude/settings.json and .claude/scheduled_tasks.lock -- the consent question (mine) incorrectly claimed these files would be 'left untouched', which is only true for untracked files, not uncommitted changes to tracked ones. Unlike discarded commits (recoverable via reflog for ~90d), uncommitted working-tree content to tracked files has no recovery path once reset -- it was genuinely and permanently lost; the operator did not know what was in them either. cadence doctor's host-hooks check confirmed no functional breakage this time (the discarded settings.json content matched every other worktree's baseline), but that was luck, not a guarantee -- a future reset could discard something load-bearing. A doctor check (or a resume/reset-adjacent CLI guard) could detect known local-only tracked files (.claude/settings.json, .claude/scheduled_tasks.lock per CLAUDE.md's own 'Helpful Stage' list) with uncommitted changes and surface a specific warning distinct from the generic 'you have uncommitted changes' signal, before any command that would discard them via reset --hard/checkout onto a ref.

## rec-20260815-003 — Record genuine orchestrator/subagent-driven independent review in deep-verify's audit trail, distinct from mock

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, verify, host-adapters
- evidence: DP-B (phase 280) settle, 2026-08-15: three consecutive host-cli timeouts in one evening (deep-verify x2, code-review x1), all on CADENCE_HOST_CLI_BIN=codex with the documented 180s 'never exits' spawn-timeout limitation (docs/providers.md); claude family is unavailable for the same purpose in this repo's own dogfooding because CLAUDECODE=1 trips the self-invocation guard whenever settle runs inside a headless Claude Code session -- the common case here. A manually-dispatched fresh-context Agent-tool subagent whole-branch review, done the same evening outside cadence's gate machinery, found 3 real defects (a stale registry.ts predicate, a stale config.md doc claim, a missing changeset) that no per-task review caught -- proving the review channel works, just isn't recordable.
- next: cadence milestone propose

Right now the only 'real LLM' path for the deep-verify/code-review settle gates is the host-cli provider, and both its families are commonly blocked: 'claude' by the self-invocation guard whenever settle itself runs inside a headless Claude Code session (the common case for this repo's own dogfooding), and 'codex' by the 180s spawn timeout on substantial prompts -- hit 3 times in one evening during DP-B's (phase 280) own settle (2 deep-verify timeouts, 1 code-review timeout), all falling back to mock. Separately, an orchestrating Claude Code session CAN dispatch a genuinely independent, adversarial fresh-context subagent (the Agent tool) to review a branch/diff against the DRAFT's ACs -- CLAUDE.md already sanctions this as the correct alternative to a self-review, and DP-B's own whole-branch review (done exactly this way) caught 3 real defects invisible to any single per-task review. But that review happens entirely outside cadence's own gate machinery: it never touches SUMMARY.json, so the audit trail shows 'deep-verify: mock' even when a real independent review genuinely occurred through a different channel. The naive fix -- letting a session hand-write a stronger observedProvider value like 'orchestrator-reviewed' into SUMMARY.json after the fact -- is explicitly wrong: SUMMARY.json's provenance fields exist specifically to distrust an agent's self-report, and a hand-writable 'I was reviewed independently, trust me' value is a one-way ratchet that makes the field stop carrying information (the existing code-review gate's own 'mock pass -> skipped, not a persisted pass' behavior is the project's own precedent for refusing exactly this shortcut). The real design question is what evidence would EARN a genuine non-mock, non-host-cli provenance status -- i.e. how to make the artifact PRODUCED by the review rather than ASSERTED after it. Two candidate shapes worth designing against: (a) a new '--verifier orchestrator' mode where settle emits a structured review request (ACs + diff + test refs, same VerifyInput shape deep-verify already builds) to a known path, blocks/polls for a structured response written back to that path by whatever dispatched the review, and only counts it if the response is well-formed and satisfies a real schema -- so the provenance is earned by the artifact's existence, not typed in after the fact; (b) extend the HostAdapter contract so an Agent-tool-capable host can register itself as a verifier provider through the existing host-agnostic seam (core still never imports host code, no special-casing 'Claude Code' by name), rather than inventing a parallel mechanism. Either shape needs to answer: what stops a session from writing a fake structured response to fake the review, same as the naive hand-edit does -- likely needs either a host-side attestation the core can check (e.g. a session/agent id that must differ from the settling session's own), or accept it as an operator-trust boundary the same way host-cli's per-call fallback already is.

## rec-20260815-004 — ROADMAP.md/MILESTONES.md backfill gap: phases 271-280 have no roadmap/milestone entries

- status: candidate
- ready: raw-idea
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs
- files: .cadence/ROADMAP.md, .cadence/MILESTONES.md
- evidence: computeRoadmapDrift() with disk=281 (phase 281 present), roadmap=270, milestones=270 -> drift=11 > threshold 10, before phase 281's own T5 fix recorded a Phase 281 entry
- next: cadence milestone propose

tests/docs/phase271-record-integrity.test.ts's roadmap-currency drift check (disk-vs-backfill, threshold 10) was already at its maximum tolerance (drift=10, disk=280, backfill=270) before phase 281 existed -- confirmed via cadence doctor at session start ('roadmap-currency: ok ... within the 10-phase threshold'). Phase 281's own directory creation alone (independent of its content) tipped drift to 11 and broke the test; phase 281 fixed this narrowly by recording only its own Phase 281 entry in both files (bringing drift back to 0), per D-N3-adjacent as-built scope decision -- see .cadence/phases/281-done-bypass-fix/281-01-DRAFT.md's T5. The underlying gap (phases 271-280 have zero ROADMAP.md/MILESTONES.md entries) is still open and will recur: the very next new phase after 281 will again sit at drift=1 with zero slack, and any phase after that risks tripping the same threshold again depending on how many phases land between now and the next backfill sweep. Precedent: rec-20260811-005 tracks the same class of gap for phases 239-241. Resolution: a dedicated backfill phase (or the release-cut skill's doc-sync step) should write full ### Phase N / - **Phase N** entries for 271 through (whatever the disk-max is at backfill time), sourced from real phase SUMMARY/PROGRESS records and merged PR numbers, not guessed.

## rec-20260820-001 — Amendment-vs-verifier gap: a legitimately amended AC has no path back to deep-verify

- status: candidate
- ready: needs-decision
- priority: high
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: gates, verification, assurance
- files: packages/core/src/gates/deep-verify.ts, .cadence/phases/282-coverage-scanner-determinism/282-01-DRAFT.md, .cadence/phases/282-coverage-scanner-determinism/282-01-SUMMARY.json
- evidence: 282-01-SUMMARY.json gateBypasses: flag --force, reason 'settle --force bypassed failing verdicts (deep: AC-2, AC-4)', severity error; 282-01-DRAFT.md carries four As-built amendment blocks (T1, T2, two under T4) showing the underlying issues were already found/corrected by independent review
- evidence: 282-01-DRAFT.md's four As-built amendment blocks, in order of appearance: (T1) mention-mode dedup treatment deliberately not retrofitted -- reviewer-flagged, no bug found; (T2) AC-2's Given/action wording corrected -- independent reproduction (reverting the fix, running the fixture 10x in-process) proved the originally-demanded pre-fix reproduction (non-deep-equal map / run-to-run-varying order) impossible, since readdir on an unmutated directory returns a stable-but-non-canonical order within a single process; (T4, first block) and (T4, second block) -- real deep-verify (not mock) found two genuine gaps during independent verification, both addressed in-flight. None of these four amendments could feed back into a re-verify of the deep-verify pass:false verdicts already rendered against AC-2 and AC-4's original wording -- there is no re-verify-on-amendment mechanism in packages/core/src/gates/deep-verify.ts. The resulting bypass is recorded verbatim in 282-01-SUMMARY.json's gateBypasses array: {gate: settle, flag: --force, reason: 'settle --force bypassed failing verdicts (deep: AC-2, AC-4)', severity: error}. Decided as D-W (file-only, dec-20260820-003): this recommendation records the gap; a re-verify-on-amendment mechanism or amendedAt/supersedes schema field is explicitly out of scope this arc.
- evidence: The mixed-grade cap this recommendation describes is the D-S rule (dec-20260816-006, phase 283-01/T2), implemented in packages/core/src/gates/assurance-record.ts (~lines 84-99): if gateBypasses contains at least one severity:error entry, overall is capped at 'mixed', downgrading an otherwise-'strong' result. 282-01-SUMMARY.json's own gateBypasses entry (flag --force, severity error) is exactly that shape, so a live recomputation of 282's assurance record today would grade 'mixed'. Note for the record: 282-01-SUMMARY.json's stored assurance.overall field itself still reads 'strong', not 'mixed' -- 282 settled before phase 283 shipped this cap, and report-never-rewrite means that historical SUMMARY.json is never recomputed retroactively. deep-verify.ts is where the AC-2/AC-4 pass:false verdicts that gateBypasses references originate; assurance-record.ts is where those bypasses actually get translated into the grade cap. Both files are relevant to the mechanism; this note names the cap's precise implementation site since the affectedFiles list on this recommendation's own add command named only deep-verify.ts.
- evidence: Correction to ev-20260820-002's phrasing: 282-01-DRAFT.md has three '**As-built amendment**' headings (T1, T2, T4), not four separate blocks -- the T4 heading carries two numbered findings (1: AC-1's mention-mode disjunction ported to SPEC Constraints; 2: AC-4's summary-verify-all run for real) under one block. rec-20260820-001's own summary phrase 'four ... blocks (T1, T2, two under T4)' is accurate (its parenthetical disambiguates), but ev-20260820-002's '(T4, first block) and (T4, second block)' wording incorrectly implies two separate T4 headings. Flagged by phase 284's whole-branch review; filed as an additive correction since evidence notes have no post-creation edit path.
- next: cadence milestone propose

Mechanism: when an acceptance criterion's text is legitimately amended in-flight (an independent reviewer finds the AC's literal wording describes an impossible or already-superseded defect shape and corrects it), the amended AC has no mechanism to re-reach deep-verify -- the verifier already rendered its pass:false verdict against the original, now-superseded wording, and there is no re-verify-on-amendment path. This forces settle --force to close the loop, and post-phase-283's assurance-record change now caps the resulting overall grade at mixed even when the underlying work and the amendment were both correct. Perverse incentive: left unaddressed, this quietly disincentivizes the honest behavior of amending a wrong AC in-flight, because doing so guarantees a --force and a capped grade, while silently leaving a known-wrong AC's text untouched avoids that penalty. Surfaced while reconciling phase 282-coverage-scanner-determinism's AC-2/AC-4 historical record (phase 284-record-reconciliation): 282's own four As-built amendment blocks show independent reviewers had already found and corrected the underlying issues in ways host-cli deep-verify's pass:false judgement didn't reflect, forcing the --force override captured in 282-01-SUMMARY.json's gateBypasses entry. See packages/core/src/gates/deep-verify.ts (no re-verify-on-amendment path exists), .cadence/phases/282-coverage-scanner-determinism/282-01-DRAFT.md (the four As-built amendment blocks), and .cadence/phases/282-coverage-scanner-determinism/282-01-SUMMARY.json (the gateBypasses entry and assurance record).

## rec-20260820-002 — Code-review finding (medium): The DRAFT has three As-built amendment headings (T1, T2, T4), not four. This re…

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: .cadence
- files: .cadence/intelligence/recommendations.json
- evidence: phase 284-record-reconciliation, draft 284-01, SUMMARY contentHash f0875bfb7c6c43a46cb644383cd49d971a3bbba3fdd117d10122761a389ee864 — medium finding at .cadence/intelligence/recommendations.json:2230: The DRAFT has three As-built amendment headings (T1, T2, T4), not four. This records a false fact; ev-004 compounds it by claiming a parenthetical the summary lacks.
- next: cadence milestone propose

medium finding at .cadence/intelligence/recommendations.json:2230: The DRAFT has three As-built amendment headings (T1, T2, T4), not four. This records a false fact; ev-004 compounds it by claiming a parenthetical the summary lacks.

## rec-20260821-001 — Code-review finding (medium): Incorrect: bare mode accepts `<phase>/AC-N` literally (and AC-3 tests it); only…

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: docs
- files: docs/reference/commands.md
- evidence: phase 285-explain-double-qualification, draft 285-01, SUMMARY contentHash bf2ccba1750350290965f276dc0202debc22876ca30dee31228d0354b6449074 — medium finding at docs/reference/commands.md:2442: Incorrect: bare mode accepts `<phase>/AC-N` literally (and AC-3 tests it); only phase-qualified normalizes. Say bare `AC-N` is recommended, or scope the restriction to phase-qualified.
- next: cadence milestone propose

medium finding at docs/reference/commands.md:2442: Incorrect: bare mode accepts `<phase>/AC-N` literally (and AC-3 tests it); only phase-qualified normalizes. Say bare `AC-N` is recommended, or scope the restriction to phase-qualified.

## rec-20260821-002 — boundary-pattern-unmatched advisory re-fires for an earlier task's already-satisfied wildcard in multi-task drafts

- status: candidate
- ready: needs-decision
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, dispatch
- files: packages/core/src/services/build-task.ts, packages/core/src/checks/boundary.ts
- decisions: dec-20260821-003 (active)
- evidence: 286-01-DRAFT.md's T3 As-built amendment (follow-up-filed section) and T3 independent review, 2026-08-21
- evidence: Reconciled duplicate: rec-20260821-003 (auto-filed by cadence settle's code-review-finding-to-recommendation mechanism) describes the identical defect (build-task.ts:287, false boundary-pattern-unmatched re-fire after an earlier task's wildcard match is subtracted from the delta) with independent corroboration — cadence-artifact evidence from phase 286-boundary-glob-expansion draft 286-01's SUMMARY. Absorbed here; rec-20260821-003 marked rejected as a duplicate.
- next: cadence milestone propose

packages/core/src/services/build-task.ts passes findUnmatchedBoundaryPatterns the full draft's declaredFiles (union across all tasks, draft.tasks.flatMap(t => t.files)) but only the CURRENT task's touchedFiles delta (deriveTaskTouchedFiles subtracts files already recorded by earlier tasks). In a multi-task draft where task A declares and satisfies a wildcard pattern (e.g. .changeset/*.md), recording a later task B re-evaluates that same pattern against B's delta, which no longer contains the file that satisfied it -- producing a spurious boundary-pattern-unmatched warn advisory for A's already-matched pattern when B is recorded. Confirmed real (phase 286-01's own T3 independent review, 2026-08-21), warn-only (never a refusal -- dec-20260821-001's severity isolation holds regardless), and latent for phase 286-01's own build since none of its tasks declare a wildcard files: entry. Worth fixing because it reintroduces exactly the 'noise on nearly every task' class that dec-20260821-001 scoped wildcard-only zero-match detection to avoid -- just for wildcard-declaring multi-task drafts specifically, which are precisely the case this feature exists to serve well. Likely fix shape: scope findUnmatchedBoundaryPatterns's declaredFiles input to only the CURRENT task's own files: entries (not the whole draft's union), matching the same per-task scoping touchedFiles already uses -- needs a design decision on whether that changes any other AC-5 guarantee.

## rec-20260821-004 — recommendation promote has no path to edit an existing rec's priority or summary text

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: cli, intelligence
- files: packages/core/src/cli/commands/recommendation.ts, packages/core/src/services/recommendation-promote.ts
- evidence: ev-20260821-003 on rec-20260815-005 is the workaround this gap forced
- next: cadence milestone propose

cadence recommendation promote only mutates status/readiness/shippedRef (packages/core/src/services/recommendation-promote.ts); there is no CLI or service seam to correct a stale priority or summary on an existing recommendation once filed. Hand-editing .cadence/intelligence/recommendations.json is explicitly forbidden (CLAUDE.md sec7, 'No hand-edits to .cadence/intelligence/'). Hit directly 2026-08-21: HANDOFF-v1.62-record-reconciliation.md sec6 asked to raise rec-20260815-005's priority from low to medium, and no mechanism existed to do it -- worked around via an evidence note (ev-20260821-003) instead, which is a weaker signal than a real priority field since list/sort-by priority won't reflect it. The likely-correct fix is a promote-like verb (e.g. --priority on promote, or a new recommendation amend) that appends provenance the way promote already does, keeping the ledger's report-never-silently-rewrite posture intact.

## rec-20260821-005 — Cross-session rec/dec/ev-id collision-avoidance mechanism needs a real fix, not renumber-on-conflict

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, intelligence
- files: packages/core/src/services/recommendation-add.ts, packages/core/src/services/decision-add.ts, packages/core/src/checks/doctor/ledger-remote-collision.ts
- decisions: dec-20260822-012 (active)
- evidence: 4th occurrence 2026-08-21: dec-20260821-003 collision between PR #455's dedupe decision and primary checkout's unpushed D-Z decision (dec-20260813-005 supersession), resolved by renumbering to dec-20260821-004
- evidence: Correction: the affected files listed at filing time were guessed and wrong. Actual ID-minting logic lives in packages/core/src/intelligence/store/ids.ts (and packages/core/src/intelligence/store/ledger.ts), not the doctor/promote paths originally cited; doctor's ledger-remote-collision check lives in packages/core/src/doctor/run.ts.
- next: cadence milestone propose

The .cadence/intelligence/*.json ledger mints next-available IDs (rec-YYYYMMDD-NNN, dec-YYYYMMDD-NNN, ev-YYYYMMDD-NNN) by scanning the locally-visible ledger state. Two sessions/worktrees working against different bases (e.g. primary checkout's unpushed local history vs. a phase worktree branched from origin/main) independently mint the same next-available ID for genuinely different content, producing a real git merge conflict on the next sync. Hit and manually resolved at least 4 times now: twice during phase 286's two post-merge syncs (2026-08-21, see feedback-worktree-ledger-and-phase-collision-on-settle), once during the v1.57 arc (dec-20260813-001), and again immediately after PR #455 merged (dec-20260821-003 collided between the origin-based dedupe worktree's new decision and the primary checkout's unpushed 'D-Z' decision, renumbered to dec-20260821-004). The fix pattern is now well-rehearsed (git show :2:/:3:, diff by content not markers, renumber the not-yet-pushed side, patch cross-refs, cadence intelligence reconcile, verify via doctor's ledger-remote-collision check) but is manual and error-prone every time. Candidate real fixes: ID minting keyed off something collision-resistant across bases (e.g. a short content hash or session/worktree-scoped suffix instead of pure sequential NNN), or a cadence CLI verb that automates the rehearsed renumber-and-patch-cross-refs sequence instead of requiring a hand-rolled node diff script each time.

## rec-20260822-002 — MCP settle tool response drops stderr notices on the success path

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, mcp
- files: packages/core/src/mcp/server.ts
- evidence: phase 288-01 T3 independent review (fresh-context subagent), 2026-08-22: bufferIO()-based reproduction showed a zero-AC settle's MCP response text omits the stderr notice that the CLI surface correctly prints
- next: cadence milestone propose

packages/core/src/mcp/server.ts:26 selects response text via (io.stdout() || io.stderr()).trimEnd() — on any settle success, stdout is truthy (settleService always writes 'Settled <id>' to stdout before returning), so the || short-circuits and every stderr-only notice is silently dropped from the cadence_settle MCP tool's response, even though the same notice reaches real stderr on the CLI surface. Discovered during phase 288-01's independent review of T3 (a settle-time notice for genuinely-empty AC sets): confirmed via bufferIO() that a zero-AC settle's MCP response is 'Settled 01-01' / isError:false with no mention of the empty AC set, while the CLI prints the notice correctly. Refusal paths are unaffected (io.out is never called before a refusal, so stdout stays empty and stderr surfaces normally) -- this is a success-path-only gap. Root cause is in the shared MCP output-selection helper, not settle.ts itself, so it likely affects every MCP tool call that both writes routine stdout AND a stderr warning/notice on a successful outcome, not just settle -- worth auditing broadly, not patching settle-specific. Candidate fix: concatenate stdout+stderr (or otherwise surface both) instead of picking one via ||, verified against every existing MCP tool's expected response shape.

## rec-20260822-005 — settle --deep verify (host-cli) gave a false AC refusal on unchanged evidence -- likely incomplete evidence-assembly

- status: candidate
- ready: needs-evidence
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: verify, deep-verify, host-cli
- decisions: dec-20260822-015 (active), dec-20260822-016 (active)
- evidence: 289-01 settle attempts 2026-08-22: round 3's AC-2/AC-3 refusal claims falsified by direct grep against the test files; rounds 1-2's claims on the same phase were real and independently confirmed
- evidence: Follow-up investigation (same session, before user response on the settle decision): checked packages/core/src/verify/anthropic-verifier.ts's formatUserMessage -- the per-AC linked-tests list sent to the verifier is NOT truncated/sampled (every VerifyTestRef is included, no slice/limit). Checked the diff cap (verifier.diffCapBytes, default 256KB): the phase's actual cumulative working-tree diff is ~49KB, well under the cap, so diff truncation is not the mechanism either. This narrows the hypothesis: the false round-3 AC-2/AC-3 refusal is most likely plain LLM judgment inconsistency across repeated calls on the same complete, untruncated input (a known LLM reliability failure mode -- claiming a narrower evidence set than what was actually supplied), not a code-level evidence-assembly bug. Revises this rec's original 'incomplete or non-deterministic evidence-assembly' hypothesis toward 'the single-shot LLM verdict has no cross-check/majority-vote and is empirically not reliable enough to hard-block settle on its own for phases whose evidence set is unchanged between runs.' Possible directions: (a) log the exact verifier input alongside the verdict so a refusal is reproducible/auditable after the fact instead of only the verdict reason surviving; (b) require 2-of-3 agreement across repeated deep-verify calls before treating a refusal as blocking; (c) at minimum, surface to the operator when a re-run of deep-verify on unchanged evidence produces a different verdict than a prior run in the same settle session, since that's a strong signal the refusal shouldn't be trusted as-is.
- evidence: Independently re-falsified round 3's specific claims (not just trusting the rec's own text): grep -n '289-01/AC-2' read-only-mode.test.ts returns 5 distinct it() blocks (context handoff L74, recommend L103, inspect L123, recommendation list L143, next L168) against round 3's claim that only context handoff was cited. grep -n '289-01/AC-3' returns 7 distinct it() blocks (decision add L351, recommendation add L377, recommendation list L403, decision supersede L422, assumption add+validate L440, milestone propose L467, intelligence reconcile L482) against round 3's claim that only decision add and milestone writing were cited. Both round-3 claims are directly false against the merged test file. Did not attempt a repeat-deep-verify run (D-AN option 1, real provider cost) or artifact-retention schema change (option 2) this session -- option 3 (reconstruct/falsify from the existing record) was judged sufficient; see rec-20260822-008 for the artifact-retention gap this surfaced.
- next: cadence milestone propose

During 289-01's settle, the real (non-mock) host-cli deep-verify pass was run three consecutive times against the phase's AC coverage. Rounds 1-2 caught two genuine, independently-confirmed gaps (a missing CLI-subprocess refusal test for AC-1, and an AC-3/AC-6 wording contradiction), both fixed and re-verified. Round 3, with zero AC-2-relevant changes made since round 1 (where AC-2 passed), refused AC-2 claiming 'only context handoff is cited as exercised' and refused AC-3 claiming 'cited tests cover only decision add and milestone writing' -- both claims are directly falsified by grepping the test files: read-only-mode.test.ts has all five 289-01/AC-2-tagged tests (context handoff, recommend, inspect, recommendation list, next) and seven 289-01/AC-3-tagged tests (decision add, recommendation add, recommendation list, decision supersede, assumption add, assumption validate, milestone propose, intelligence reconcile). This suggests the deep-verify pass's evidence-assembly step (whatever selects/truncates which matching test titles/spans get shown to the verifier LLM) is incomplete or non-deterministic under some condition -- possibly a token/context truncation when a phase accumulates many coverage-evidence rows across multiple settle attempts. Worth investigating packages/core/src/verify/*.ts's evidence-gathering path for coverage-gate-satisfied ACs, and/or adding a regression fixture that pins a phase with >5 tests per AC to check the verifier is shown all of them.

## rec-20260822-007 — Findings-to-ledger routing leaves an auto-filed rec unreconciled when a same-settle later round fixes the finding

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, intelligence-store
- files: packages/core/src/services/settle.ts, packages/core/src/intelligence/finding-routing.ts
- decisions: dec-20260822-014 (active)
- evidence: 289-01-CODE-REVIEW.json history: round2 fail@18:14:36.047Z (1 finding) -> rec-20260822-006 createdAt 18:14:36.065Z -> round3 pass@18:24:17.029Z (0 findings), matching 289-01-SUMMARY.md's completed timestamp 18:24:17.031Z (T1's fix).
- next: cadence milestone propose

Phase 289's rec-20260822-006 was a real instance: a code-review finding at round 2 (18:14:36.047Z, host-cli) correctly reported writeLedger as unguarded, and findings-to-ledger routing auto-filed rec-20260822-006 18ms later (18:14:36.065Z). T1's fix landed within the same settle, ~10 minutes later (289-01 completed 18:24:17.031Z), and round 3 passed with 0 findings -- but the auto-filed rec was never closed, reconciled, or even flagged stale; it sat open as candidate/needs-decision until this session manually rejected it with a full audit. The finding was never wrong -- the routing mechanism that files a rec at refusal time has no path back to check whether a later round of the same settle already resolved it. This is distinct from dec-20260731-001 (same-settle same-id finding merge -- multiple occurrences of one finding within a single round) and dec-20260801-003 (cross-settle message-drift dedup -- a re-worded finding across separate settles); neither covers a finding that is fixed by a later round of the same settle it was filed in. Worth a decision: on settle success, cross-check open candidate-status recs with a sourceFindingId against that phase's final (passing) code-review result and flag/auto-close ones the final round no longer reproduces -- or at minimum, surface a doctor check so these don't require a human noticing the discrepancy, as happened here.

## rec-20260822-008 — SUMMARY.json's deepVerify only persists the final convergence round, hiding self-contradicting verifier rounds from the audit trail

- status: candidate
- ready: needs-decision
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, verify
- files: packages/core/src/verify/deep-verify.ts, packages/types/src/summary.ts
- evidence: 289-01-SUMMARY.json's persisted deepVerify block has AC-1/2/3/4 pass:false (round-3 verdicts); 289-01-CODE-REVIEW.json's separate 'history' array proves 3 rounds ran and that per-round retention is already a working pattern elsewhere in the same phase's own artifacts.
- next: cadence milestone propose

289-01's real (non-mock) host-cli deep-verify ran 3 consecutive rounds during settle (289-01-CODE-REVIEW.json's separate code-review history shows the pattern; the deepVerify equivalent is not separately retained round-by-round). Rounds 1-2 caught two genuine, independently-confirmed gaps and were fixed; round 3, with zero AC-2/AC-3-relevant changes since round 1 where those ACs passed, gave a false refusal on both -- directly falsified by grepping the test files (rec-20260822-005: 5 289-01/AC-2 tests and 7 289-01/AC-3 tests exist, contradicting round 3's specific 'only 1 test cited' claims). Only round 3's verdict survives in 289-01-SUMMARY.json's persisted deepVerify block; rounds 1-2's verdicts exist only in human-written task-note prose (T2's PROGRESS.json note), not in any queryable artifact. A verifier that disagrees with itself across rounds is therefore invisible to anything but a human reading task notes -- cadence doctor, summary verify-all, and any future automated audit over SUMMARY.json corpora would see only the last round's (possibly wrong) verdict with no record that it contradicted an earlier passing round on unchanged evidence. Worth a decision: persist all convergence rounds' deepVerify verdicts (not just the final one) in SUMMARY.json, analogous to how 289-01-CODE-REVIEW.json's own 'history' array already retains per-round pass/findingsCount/verdict for code-review.

## rec-20260822-009 — Packs Slice 1: manifest schema + resolvePacks() + doctor resolve/validate check, zero behavioral effect

- status: candidate
- ready: ready-for-cadence-spec
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, doctor, packs
- files: packages/types/src/config.ts, packages/core/src/doctor/run.ts, docs/reference/commands.md
- evidence: config.packs schema has existed with zero consumers for months (grep -rln packs --include=*.ts packages/core/src returns nothing); docs/packs-design.md is the full design record.
- next: cadence milestone propose

Add PackManifest type, resolvePacks(repoRoot, config) impure-shell resolver, and a new cadence doctor check reporting each enabled pack resolved/unresolved with a reason. No consumer of resolved packs anywhere else -- gatesFor/effectiveGateSet output must stay byte-identical for every existing fixture. Ships its doctor-check row in docs/reference/commands.md in the same change (doc-drift rule). Proves I-1/I-2/I-4a. See docs/packs-design.md §7 Slice 1.

## rec-20260822-010 — Packs Slice 2: skillAudit.required contribution with per-requirement provenance

- status: candidate
- ready: ready-for-cadence-spec
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, packs
- files: packages/core/src/checks/skill-audit.ts
- evidence: runSkillAuditCheck already computes effectiveRequired as a dedup'd union of config.skillAudit.required and draft.requiredSkills -- packs are a third union source, same mechanism.
- next: cadence milestone propose

A pack's skillAudit.required unions into runSkillAuditCheck's effectiveRequired, tagged with source (config/draft/pack:<id>) in SUMMARY.json (D-AS). First real behavioral consumer of resolved packs. Doctor's unresolvable-enabled-pack check escalates from warning to hard settle-time refusal once this lands (D-AR), following the v1.64.0 fail-loud precedent. Depends on Slice 1. See docs/packs-design.md §7 Slice 2.

## rec-20260822-011 — Packs Slice 3: tighten-only gate-profile deltas via effectiveGateSet(), config-explain stays honest

- status: candidate
- ready: ready-for-cadence-spec
- priority: medium
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, gates, packs
- files: packages/core/src/gates/engine.ts, packages/core/src/config-explain/build.ts
- evidence: effectiveGateSet() (engine.ts:233) is the single existing chokepoint already used by all 9 real gatesFor-derived call sites (draft-check, draft-approve, build-task x2, settle, hooks/handlers x3, notify/loop-violation) -- verified by grep, not assumed.
- next: cadence milestone propose

A pack's gates[].add unions into effectiveGateSet()'s output (never raw gatesFor -- gatesFor stays pure/2-arg/untouched). Manifest validation refuses any non-additive shape at resolve time, not silently. cadence config explain's current-tier row (not the whole-matrix table) reflects enabled packs' contribution so the command that exists to answer 'what's actually enforced' stays accurate once packs are real. Depends on Slice 1/2. See docs/packs-design.md §4b/§7 Slice 3.

## rec-20260822-012 — Packs Slice 4 (stretch): declared-commands doctor check, non-enforced

- status: candidate
- ready: raw-idea
- priority: low
- leverage: 5/10
- risk: 5/10
- confidence: 70%
- decay: fresh
- areas: core, doctor, packs
- evidence: CMD-E measured 13 slash commands in .claude/commands/ as one of the four enforcement-primitive surfaces packs would compose; commands are declarative/doctor-checked only per D-AP.
- next: cadence milestone propose

A pack's commands[] (declared slash-command names) checked for presence by cadence doctor only -- never gate-enforced, matching D-AP's exclusion of commands from anything gate-shaped. May land after the rest of the packs arc closes; explicitly optional. See docs/packs-design.md §7 Slice 4.
