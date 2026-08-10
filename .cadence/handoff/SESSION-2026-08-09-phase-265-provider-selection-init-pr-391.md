---
cadence_handoff: 1
generated_at: 2026-08-09T05:05:24.675Z
label: phase-265-provider-selection-init-pr-391
loop_position: IDLE
active_phase: 265-affirmative-provider-selection-at-init
active_draft: 
tier: 
git_branch: worktree-265-provider-selection-init
git_dirty: true
git_head: 00766e24
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-08-09 (phase-265-provider-selection-init-pr-391)

## TL;DR for the next session
- Phase 265 ("Affirmative provider selection at init", v1.56 Phase N) is settled and PR'd as **#391**, not yet merged — waiting on CI, then needs operator "merge it" consent per this repo's convention.
- `cadence init` now presents the verifier-provider choice explicitly (a real prompt, mock unshamed) and records the choice as a retrievable `.cadence/intelligence/decisions.json` entry, without breaking any non-interactive path.
- Two whole-branch review rounds (not one) caught real bugs a per-task review missed: a prompter-desync bug and a resulting crash — both fixed and empirically verified via a temporary revert-and-retest. See Carry-forward gotchas below for the pattern that caused it — it will bite again if a third command adds a second interactive prompt.
- v1.56 "Verifier Honesty Semantics": Phases L, M, N all shipped. Per `dec-20260808-003`'s amended ordering, **Phase P is next, not Phase O** — O was resequenced to run after P (O's threshold needs post-profile-flip settle data that only exists once P lands).
- `rec-20260808-006` promoted to shipped, precisely scoped; three new recs filed this session (`rec-20260809-003/004/005`), all still open/candidate.
- `.flywheel-DEGRADED`/`.flywheel/` now also appear one directory deeper, inside `packages/core/` — not investigated, just noticed.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `worktree-265-provider-selection-init` (dirty), 0 ahead / 0 behind origin
- HEAD `00766e24`
- Recent commits:
```
00766e24 feat: affirmative provider selection at init (phase 265)
814953ea chore(cadence): file rec-20260809-002 (Windows CI flake) + stamp session handoff — phase-264-shipped (#390)
04a38d0a feat: rendered label precision for verifier provenance (phase 264) (#389)
ca610665 feat: provider selection provenance -- configured vs fallback vs empty-diff (phase 263) (#388)
fba34ab0 chore(cadence): file scout-20260804-verifier-honesty recs + D-A/D-B/sequencing decisions (#387)
688f88fd feat: cadence doctor check for release-currency (phase 262) (#386)
3e6019fc feat: historical AC-coverage audit for pre-phase-239 records (phase 261) (#385)
fb84baab chore(release): v1.55.0 -- integrity release (#384)
```
- Loop: IDLE · phase 265-affirmative-provider-selection-at-init · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260808-003 — No standing signal for consecutive settles without real-provider conduction (candidate/ready-for-cadence-spec)
  - rec-20260809-001 — scanTestCoverage dedups AC-token occurrences per-file by first match only, dropping later qualifying refs (candidate/ready-for-cadence-spec)
  - rec-20260801-001 — docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8 (candidate/ready-for-cadence-spec)
  - rec-20260730-001 — phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode (candidate/needs-decision)
  - rec-20260730-002 — Coverage dedup: a qualified AC token outside an asserting block silently zeroes that AC's coverage (candidate/needs-decision)
- Open assumptions:
  - (none)
- Active decisions:
  - dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase
  - dec-20260721-001 — cadence next extends nextAction(), does not subsume quickstart or reimplement
  - dec-20260721-002 — Shared legal-moves computation also powers empty-state footers (rec-20260721-001)
  - dec-20260721-003 — cadence next --json includes schemaVersion: 1
  - dec-20260721-004 — Ship /cadence-next slash command alongside the CLI command
  - dec-20260724-001 — Enforce ledger-diff at audit close, not a standing rule
  - dec-20260724-002 — Scope rec-20260724-003 to a CHANGELOG-currency gate only, defer auto-generation
  - dec-20260726-001 — Split SUMMARY.json attestation: content-hash now, full signing deferred to threat model
  - dec-20260730-001 — Coverage phase-scoping uses a phase-qualified test token, not file-ownership scoping
  - dec-20260728-001 — Phase 233 AC-3 tripwire cleared: assurance-record derivation is gate-agnostic
  - dec-20260729-001 — Phase 234 AC-1 narrowed: contracts/ is the type-naming surface, not the resolution surface
  - dec-20260729-002 — Uniform opts? on VerifierPort is what makes zero-special-cases true
  - dec-20260729-003 — Phase 235 scope: criteria-anchoring is code-review only, not spec-review/ui-spec-review/plan-review
  - dec-20260729-004 — Anchor executable tier: non-empty verify + build-test-must-pass ran, no prose heuristic
  - dec-20260729-005 — Criteria-gap refusal reuses code-review's existing HIGH-severity refuse path, not gates.evidenceFloor
  - dec-20260729-006 — D3 unconditional declaration binds the floor outcome, not the empty-gap case
  - dec-20260731-001 — Findings-to-ledger routing merges same-identity findings by design; the identity hash itself is not changed
  - dec-20260801-001 — Add a settle-time guard for global-CLI-shadowing-branch-build; interim rule is settle via the local build
  - dec-20260801-002 — Finding identity narrowed to (file, normalized message); anchor/severity dropped as identity inputs
  - dec-20260801-003 — Defer finding-identity message-drift dedup: wait for real-provider data, offline analyzer first
  - dec-20260802-001 — Refused gate-loop settles thread acc's findings into the SUMMARY, with a conditional contentHash
  - dec-20260802-002 — Attempt preservation via timestamp-slugged sibling artifact, invisible to all current SUMMARY consumers by construction
  - dec-20260802-003 — Ledger routing stays finalize-only on refusal; Slice 3's revisit trigger amended to name its precondition
  - dec-20260803-001 — Conduction stays operator-initiated: guard and gate set retained; mock-provider default is a separate ordinary config decision
  - dec-20260804-001 — Defer baseline profile change to v1.56 Phase P
  - dec-20260806-001 — 256-01's assurance:strong record is void -- empty-diff false pass, not a real certification result
  - dec-20260808-001 — D-A: Do not rename the mock provider identity
  - dec-20260808-002 — D-B: Do not require a real verifier provider at cadence init
  - dec-20260808-003 — v1.56 Phase O sequenced after Phase P, not before (amends HANDOFF-v1.56 §5 priority table)
  - dec-20260808-004 — J.1 (overall: strong structurally unreachable) resolved for the profile-override path; still true for the default auto-profile path
  - dec-20260808-005 — Phase L's providerSelection field widens to a third state covering empty-diff false-pass, not just configured/fallback
  - dec-20260808-007 — providerSelection field: optional enum, no default, no schemaVersion bump (corrected citation)
  - dec-20260808-008 — Phase 263 (v1.56 Phase L): narrow providerSelection persistence to 5 seams, exclude deep-verify/per-task-verify
  - dec-20260808-009 — Phase M: render-time join over AssuranceRecordZ schema change for providerSelection
  - dec-20260808-010 — Phase M: umbrella mock-capability label, not per-verifier-family variants
- Files in play:
  - `packages/core/src/verify/coverage.ts` — affected by rec-20260809-001 scanTestCoverage dedups AC-token occurrences per-file by first match only, dropping later qualifying refs
  - `docs/reference/commands.md` — affected by rec-20260801-001 docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8
  - `packages/core/src/config-edit/fields.ts` — affected by rec-20260801-001 docs/reference/commands.md config edit section lists only 5 fields; EDITABLE_FIELDS has 8
  - `packages/core/src/verify/phase-replay.ts` — affected by rec-20260730-001 phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode
  - `packages/core/src/services/verify.ts` — affected by rec-20260730-001 phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode
  - `packages/types/src/summary.ts` — affected by rec-20260730-001 phase-replay ignores SUMMARY.coverageMode provenance, re-derives coverage under the live config's mode
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260730-002 Coverage dedup: a qualified AC token outside an asserting block silently zeroes that AC's coverage

## What landed this session
- Phase 264 ("Rendered label precision", v1.56 Phase M) — merged as PR #389 earlier this session; a small follow-up ledger/handoff commit merged as PR #390.
- Phase 265 DRAFT authored (AC-1..AC-5, T1-T5, `tier: complex`) inside a fresh worktree branched off `origin/main`; escalated to the advisor before approval, which caught a real AC-1/AC-2 contradiction over `CADENCE_PROMPTER_SCRIPT`, a missing `host-cli` type gap, a stale `done:` reference, and a missing coverage-token boundary line — all fixed before approval. Approved with a deliberate `--allow-auto-complex` override (9 files across 5 tasks genuinely exceeds `standard` tier's 8-file cap; not gamed by re-shuffling `files:` lists).
- Built via 3 dispatch waves (T1/T2/T4 parallel → T3 → T5), each task independently re-verified (diff read + rebuild + full suite, not trusted from subagent reports).
- T3 (wiring `init.ts`) got its own dedicated adversarial review before being recorded DONE — found and fixed two real "honest provenance" bugs: an invalid prompt answer mislabeling its own decision-record rationale, and `--full --verifier-provider <x>` producing self-contradicting console output.
- **Two full whole-branch review rounds** (not the usual one) before settle:
  - Round 1 found and fixed an Important bug: `init.ts` called the private `makePrompter()` helper twice in one run (new provider prompt + pre-existing host-wire prompt), and since it builds a fresh, cursor-reset `ScriptedPrompter` every call with no memoization, this silently desynced `CADENCE_PROMPTER_SCRIPT`-driven scripted runs — the host-wire question would receive whatever the FIRST scripted answer was, not the one intended for it. Fixed with a single memoized `getPrompter()` shared across both call sites, closed once.
  - Round 2 (after consulting the advisor on whether the remaining findings blocked merge — they did) found and fixed a genuine crash: a script written for the old single-answer host-wire convention now gets exhausted by the new prompt running first, crashing `cadence init` non-idempotently *after* the scaffold was already written (a retry would hit "already initialized"). Fixed to degrade gracefully — loud stderr notice, exit 0, scaffold intact. Also corrected the changeset, which had drifted into a blanket "no behavior changes" claim that the reviewer's own repro had just falsified.
  - Both fixes were empirically verified by me directly — temporarily reverting each fix, confirming the exact regression tests go red, then restoring and confirming green again. Not just "trust the subagent's report."
- Settled with `--allow-auto-complex` (same deliberate call as approval); `SUMMARY.json` verified directly (`schemaVersion: 2`, confirming the branch build was used, not the global-CLI-shadowing trap).
- `rec-20260808-006` promoted to `shipped`, scoped via `--ref` to what actually landed. Filed `rec-20260809-003` (stale "zero-prompt" wording in both top-level READMEs), `rec-20260809-004` (the prompter-desync bug class is still open for `cadence settle`'s own two prompt sites, a known-and-deferred Phase 174 limitation — this session fixed a second, independent instance, not the systemic root cause), and `rec-20260809-005` (onboard reports live config readiness, not the specific recorded decision — the literal remainder of `rec-20260808-006`'s original text).
- Single settle commit `00766e24`, pushed, PR **#391** opened. CI was still running when this handoff was written.

## Carry-forward gotchas
- **The highest-value line in this doc**: `packages/core/src/verify/prompter.ts:84-103`'s own docstring documents a known, deliberately-deferred limitation from Phase 174 — `createDefaultPrompter()`/`makePrompter()`-style factories build a brand-new `ScriptedPrompter` (cursor reset to 0) on every call, with no memoization, so calling one twice in a single command run silently desyncs a `CADENCE_PROMPTER_SCRIPT` script between the two prompts. Phase 174 hit this for `cadence settle` (interactive-verdict gate + retro issue offer, still open, `rec-20260809-004`). Phase 265 independently hit a NEW instance of the exact same bug class in `cadence init` (the new provider prompt + the pre-existing host-wire prompt) and fixed it LOCALLY with a per-command memoized `getPrompter()` closure — not a systemic fix. **Any future phase that adds a second interactive prompt to ANY command must check for this pattern first** — grep for existing `makePrompter()`/`createDefaultPrompter()` call sites in that command's file before adding a new one. `rec-20260809-004` proposes the real fix: one process-run-scoped `Prompter` singleton.
- `scanTestCoverage`'s per-file `(id, file)` dedup bug (`rec-20260809-001`, hit in phase 264) is still open and unfixed — if a future phase's settle refuses despite `cadence verify coverage --explain AC-N` reporting SATISFIED, check whether a `describe()` and its child `it()` share the same qualified AC token (the scanner keeps only the first, often non-qualifying, occurrence).
- This worktree's own commit (`00766e24`) is not yet merged — do not assume phase 265 is "done" until PR #391 shows `MERGED`. If resuming this exact session/worktree, check `gh pr view 391` before doing anything else.
- `.flywheel-DEGRADED`/`.flywheel/` are now also appearing one directory level deeper, inside `packages/core/`, not just at the repo root — first noticed this session, not investigated. The earlier "leave it alone" call (from the previous session, phase 264) was already revised once after a reviewer traced it to a live daemon racing the coverage directory; this new nesting is a second data point worth a look, not yet acted on.
- `rec-20260809-005` (onboard doesn't surface the *recorded decision*, only live config readiness) and `rec-20260809-004` (systemic prompter fix) are both real, filed, low/medium-priority follow-ups — not blockers, but don't let them silently decay past `dec-20260724-001`'s ledger-diff discipline.

## Next action
- Immediate: check PR #391's CI status (`gh pr checks 391`); on green, report to the operator and get explicit "merge it" consent before merging (this repo's consent-gated merge convention — a generic "continue" does not count).
- Post-merge: sync `origin/main`, remove this worktree (it will be stale — its own extra commits are already contained in the squash, matching the phase-264 pattern from earlier this session), and consider starting v1.56 Phase P next (not Phase O — see TL;DR).
