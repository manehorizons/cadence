# @thomas-powers-jr/cadence-core

## 1.57.0

### Minor Changes

- c582da3: `deep-verify` and `per-task-verify` now persist the provider/model identity that actually ran them into a settle's `gates[]` array — previously neither gate recorded any identity there at all (unlike `code-review`/`security-audit`), so an operator reading `SUMMARY.json` had no way to tell whether either had run under a real verifier or the `mock` placeholder.

  The new fields — `observedProvider`, `observedModel`, and (for `per-task-verify`) `taskId` — are structurally separate from the existing `provider`/`model` fields on `GateProvenanceZ`, so `deriveAssuranceRecord`'s assurance rollup, which folds `gates[].provider`/`.model` by field name, stays completely blind to them. This is deliberate: this repo's own verifiers already run as `host-cli` (non-mock), so naively feeding `deep-verify`'s and `per-task-verify`'s identity into the existing rollup fields would silently inflate `assurance.overall` toward `strong` on ordinary settles where no review gate actually ran. The safety property is proven by tests on the existing fold code, not by adding a new exclusion branch to it.

  `per-task-verify` never previously appeared in `gates[]` at all — it runs during BUILD, not settle. Settle now synthesizes one entry per task carrying a persisted `PerTaskVerifyRecord`, prepended to the front of the array (per-task-verify's work completed before this settle's own gate loop starts, and prepending preserves the existing convention — used throughout this repo's test suite — that the _last_ entry in `gates[]` is the gate that most recently ran or refused during this settle).

  All three new fields are additive and `.optional()` with no default and no `schemaVersion` bump — absent on every historical `SUMMARY.json`, and `computeSummaryContentHash` is unaffected.

- 4901a00: `cadence resume` now warns when `state.json`'s `session.lastHandoff` pointer names a `SESSION-*.md` file that no longer exists. Previously `locateFreshestHandoff` silently fell back to the freshest-by-`generated_at` doc in `.cadence/handoff/` with no signal that the pointer was dangling, so a stale-but-plausible doc could read as authoritative. The warning names both the missing pointer filename and the doc actually served, and is rendered as its own message distinct from the existing loop-position drift banner, on both the `cadence resume` CLI text surface and the `resumeService`/MCP `CommandIO` surface.

  `ResumeResult` (`@thomas-powers-jr/cadence-types`) gains an additive, optional `danglingHandoffPointer` field carrying the missing pointer's filename when this fires. Absent on every normal resolution path (no pointer ever set, or the pointer names a file that exists).

- 492a388: `settle run --deep` no longer refuses (or requires `--force`) on an Acceptance Criterion whose satisfaction condition is structurally circular — it depends on the very `SUMMARY.md`/`SUMMARY.json` that settle produces, which doesn't exist until after the deep-verify pass that would need to observe it. A new pure classifier (`classifyAcObservability`) detects this narrow shape from an AC's Given/When/Then text and routes it to a distinct `unobservable` verdict instead of an ordinary `fail`. `unobservable`-marked ACs are excluded from deep-verify's offenders list, the evidence-floor gate, and the force-used honesty report's `deep:` bucket — but never rolled up as a pass, and never allowed to move `assurance.overall` toward `strong`. `SUMMARY.md` and the CLI's summary-render surface render such ACs distinctly from both PASS and FAIL, carrying the classifier's reason, so an operator can tell "wasn't checked because it structurally can't be" from "checked and failed."

  `DeepVerdictZ` (`@thomas-powers-jr/cadence-types`) gains an additive, optional `unobservable` boolean field. Absent on every historical `SUMMARY.json` and on every AC this classifier doesn't flag; `computeSummaryContentHash` is unaffected. The classifier defaults to `observable` on any ambiguity — a false negative is just an ordinary `fail`, while a false positive would silently excuse a real failure, so every trigger pattern is narrow and structural (case-sensitive `SUMMARY` token, quote-scope and negation-scope guards) rather than a broad keyword sweep.

### Patch Changes

- Updated dependencies [c582da3]
- Updated dependencies [4901a00]
- Updated dependencies [492a388]
  - @thomas-powers-jr/cadence-types@1.57.0

## 1.56.0

### Minor Changes

- 79a760a: `cadence init` now presents the verifier-provider choice explicitly: unless an explicit `--verifier-provider <mock|anthropic|local|host-cli>` flag, `--activate`, or `--full` already settled it, init asks which provider should back deep-verify — with `mock` listed as a normal, unshamed, first-class option rather than a fallback to feel bad about. The prompt fires only when a prompter is available (a real TTY, or `CADENCE_PROMPTER_SCRIPT` for scripted/CI runs); with no prompter available it silently defaults to `mock` — never coerced onto a real provider.

  On every completed scaffolding run — flag-resolved, prompted, or defaulted — the choice is now recorded as a retrievable decision in `.cadence/intelligence/decisions.json` (viewable via `cadence decision list`), so no repo runs indefinitely under an inherited default without the operator having made or seen that choice. `--dry-run` continues to preview the resolution without prompting or writing a decision.

  Non-interactive paths with **no prompter available** (no TTY, no `CADENCE_PROMPTER_SCRIPT`) and explicit-flag paths (`--verifier-provider`/`--activate`/`--full`) resolve exactly as before, just with the resolution now logged. Scripted (`CADENCE_PROMPTER_SCRIPT`-driven) runs against a repo with `.claude/` present now need **one additional scripted answer** ahead of the pre-existing host-wire question, since the new verifier-provider prompt asks first — existing scripts relying on the old single-answer convention should account for this. If the script runs out at the host-wire step, that step degrades gracefully — loud stderr notice, exit 0, scaffold intact — rather than failing the run.

- e228a6f: Added `cadence summary verify-all`, an in-process sweep that walks every `<id>-SUMMARY.json` under `.cadence/phases/**` and verifies each one the same way `summary verify <phase> <num>` does, without spawning a CLI subprocess per file. Reports MISMATCH and any load/parse/schema failure as a failure, treats NO_HASH as informational only, and exits nonzero iff at least one file failed.

  This closes a growing correctness gap in this project's own CI: the corpus-wide `summary verify` sweep test (phase 257) previously spawned one subprocess per historical summary (275+ and growing), which was closing in on the Windows CI timeout as the corpus grew. It now runs as a single process.

  Also fixes a related, independently-confirmed Windows CI timeout: the `skill-invoke` FIFO-cap-at-100 hook-dispatcher test drove 105 serial real-disk state read/write round trips. The cap logic is now a pure function (`applySkillInvoke`), unit-tested directly with no I/O — internal only, no CLI-visible behavior change.

- 14288c5: Added a new `cadence doctor` check, `conduction-drift-streak`, that answers the trend question phase 251's `conduction-reachability` couldn't: not just "can this repo conduct a real finding" but "has it, lately." It's a read-only, best-effort utility walking the settled-phase `.cadence/phases/**/*-SUMMARY.json` corpus in chronological order and counting the consecutive most-recent settles that carried no non-mock provider identity in `assurance.verifierRollup` — the same drift that let 263 settles accumulate under `mock` with zero escalation, per the v1.54 audit. Also surfaced (without escalation) in `cadence status`.

  `DoctorSeverity` gains a fourth rung, `indeterminate`: a check that could not assess the repo at all (e.g. an unreadable or malformed SUMMARY record whose true chronological position can't be ruled out as the most recent) — distinct from `ok`'s "assessed, no problem found." Every existing consumer (`DoctorReport.ok`'s roll-up, the `fail()` helper, `cadence doctor --fix`'s fix-planner, the CLI/JSON renderer, `doctorNextStep`'s Next-step guidance, and the MCP `doctorService` seam) handles it explicitly — `indeterminate` rolls up like `warning` (never fails the exit code) but is never counted as a problem and never silently folded into "all checks passed."

  Once the streak reaches 3 consecutive mock-only settles, the check escalates from `ok` to `warning` — a warning only, never a settle refusal. That threshold is explicitly **provisional** (borrowed from an unrelated decision's `config.convergence.maxAttempts` default as a placeholder, not yet independently measured for this check) and says so in both the code and the rendered output; a follow-up will validate it once enough real-provider settles accumulate under the now-standard profile.

  Every pre-existing doctor check's rendered output and exit code is unaffected — a fixture corpus and regression suite cover the counter's chronological-ordering, malformed-data, and pre-existing-schema edge cases.

- 688f88f: Added a new `cadence doctor` check, `release-currency`, that warns when the local repo's publishable content has drifted from what npm actually serves under the matching version — closing the gap behind a real incident where a `package.json` `engines` bump landed on `main` but the previously-published tarball under the _same_ version string still declared the old floor, undetected for days because nothing ever compared content, only version numbers.

  It compares local `packages/core/package.json`'s `engines` field against npm's published `engines` for that package (`npm view <pkg> engines --json`), and independently flags any pending `.changeset/*.md` files awaiting release, naming each one's bump type (when reported on its own, wording escalates if any pending changeset declares a `major` or `minor` bump). Both signals fold into a single `warning`-severity finding (never `error`) with `fixId: null`: this is a manual, judgment-call fix (cut a release, or confirm the divergence is intentional), never auto-applied by `--fix`.

  Fully best-effort and non-blocking. If the local `package.json` is missing, unparseable, or `private: true`, the whole check is skipped with a silent `ok`. If the `npm view` fetch fails — no network, an unpublished/private package, or a timeout — only the `engines` comparison is skipped; the pending-changesets signal is still evaluated. It never throws and never fails the `cadence doctor` exit code on its own.

- 3e6019f: Added a new read-only diagnostic, `cadence verify historical-coverage-audit`, that audits every pre-phase-239 (`coverageScheme` absent) `SUMMARY.json` record's recorded AC PASS for genuine, attributable test evidence — answering `rec-20260729-006`.

  Each AC classifies into one of four buckets, computed from only that phase's own literal (non-wildcard), on-disk declared test files: `self-attested` (a token match in a file no other phase's DRAFT declares literally — high confidence), `self-attested-shared` (a match, but only in a file 2+ phases also declare literally — cannot rule out belonging to another phase's identically-numbered AC), `not-found-in-declared-files` (declared files were scanned, token not found — no repo-wide fallback), and `unreachable` (no literal, existing test file declared at all). It never performs a repo-wide bare-`AC-N` token scan (395 of 448 test files in a real corpus can contain that token as unrelated fixture data) and never resolves wildcard-glob `files:` entries. Purely additive and read-only: `cadence verify phase`'s existing `indeterminate` contract and command path are unmodified.

  `--json` emits the full per-phase report; human mode prints aggregate bucket totals and an unreadable-record count. Exit code is always `0` on a successful run (a diagnostic, not a gate) and `1` only if the audit itself fails to run.

- a66c412: Mock no longer records a persisted `pass` for the five review-family gates (`code-review`, `security-audit`, `plan-review`, `spec-review`, `ui-spec-review`) — it abstains instead. `verify()` still dispatches exactly as before under mock (its deterministic checks — flagging an added `console.log(` as HIGH, AC↔test linkage, etc. — still run and can still refuse), but when the resolved identity is mock and the outcome is a genuinely clean pass, the persisted record is relabeled rather than left as an unqualified pass: `code-review`/`security-audit` gate provenance records `status: 'skipped'` with a `skipReason` naming the abstention (instead of `'ran'`), and `plan-review`/`spec-review`/`ui-spec-review`'s convergence sidecar (`*-PLAN-REVIEW.json`/`*-SPEC-REVIEW.json`/`*-UI-SPEC-REVIEW.json`) gains a new optional `mockAbstained: true` field on the relevant history entry. A mock-served `refuse` (a real finding was flagged) is never relabeled — a refusal is never false confidence, regardless of provider.

  This closes the false-clean-pass gap where an empty diff, or a diff with no matching pattern, was recorded identically to a genuine review having run and found nothing. `deep-verify` and `per-task-verify` are unaffected — they enforce real AC↔test linkage under mock and keep their existing pass/fail semantics unchanged.

  `GateProvenanceZ`/`ConvergentReviewHistoryEntry` gain no required fields and no schema-version bump — both additive, matching the phase 239/263 precedent; every historical `SUMMARY.json` and convergence sidecar still parses, and no historical review-gate pass record is reinterpreted (the new fields apply only to settles/reviews run after this change).

  The repo's own `.cadence/config.json` `profile` moves off `auto` to `standard` in this same release, closing a previously-deferred baseline-profile decision — mock abstention removes the false-confidence risk that baseline change would otherwise have carried. See `docs/handoffs/HANDOFF-v1.56-verifier-honesty.md` (Phase P) for the full design history.

- ca61066: Added `providerSelection` to persisted gate provenance, distinguishing three previously-indistinguishable states behind a `provider: 'mock'` entry: a deliberately **configured** provider (including a deliberately configured `mock`), a silent **fallback** to mock (at selection time in `createVerifierFactory` — a missing `ANTHROPIC_API_KEY`, unset `local` base URL/model, or a verifier family with no `host-cli` builder wired — or at call time in `wrapWithFallback`'s Proxy catch, e.g. a `host-cli` spawn failure), and an **empty-diff** observation for `code-review`/`security-audit` specifically, where a real (non-mock) provider was called but `touchedFiles` was non-empty while the diff was empty, so the call was structurally unable to judge anything. A fallback anywhere in a gate run wins over a success later in the same run (any-fallback-wins, not last-write-wins).

  `GateProvenanceZ.providerSelection` is a new optional enum (`'configured' | 'fallback' | 'empty-diff'`) with no `.default(...)` and no `schemaVersion` bump — additive, matching the precedent set by `coverageScheme`/`coverageMode` (phase 239): every historical `SUMMARY.json` still parses and content-hashes identically (verified against all 275 existing records in this repo's own corpus, 38 of which carry a stored hash).

  Persisted for five of the seven verifier seams: `code-review`, `security-audit` (lifted onto the `gates[]` entry the same way `provider`/`model` already are) and `spec-review`, `ui-spec-review`, `plan-review` (threaded into their convergence-sidecar JSON). `deep-verify` and `per-task-verify` are deliberately excluded — neither persists any provider identity into `gates[]` today, and this repo's own `perTaskVerifier`/`verifier` providers are already `host-cli`; adding baseline persistence to either as a side effect here would grow `deriveAssuranceRecord`'s `verifierRollup` with real `host-cli` entries on ordinary auto-profile settles, silently moving `assurance.overall` toward `strong` with no review gate having actually run — the exact false-confidence failure this field exists to make visible elsewhere. See `docs/providers.md` for the full breakdown and a corpus-wide query command.

### Patch Changes

- 2d290db: Fixed a raw NUL byte (`0x00`) in `assurance-record.ts`, used as a `Map`-key delimiter inside a template literal, which made the file `grep`/`file(1)`-classify as binary — `grep` silently suppressed every match in it. Replaced with an escaped Unicode NUL (`U+0000`); the delimiter's runtime value is unchanged, so this is an encoding fix, not a behavior change. Added a corpus-wide regression guard against recurrence (no `packages/*/src/**/*.ts` file may contain a raw `0x00` byte).

  Also corrected `deriveAssuranceRecord`'s `'weak'` classification docstring, which claimed the zero-ACs/zero-verifier-identity shape resolves to `'weak'` — it has always resolved to `'unverified'` (the branch above it fires first, both of its conditions being vacuously true for empty input). Added coverage for both previously-untested branches of that shape.

- 04a38d0: Rendered provider labels now precisely convey what the `mock` verifier does and does not check, and — when the underlying gate provenance carries Phase 263's `providerSelection` — whether a `mock` entry was a deliberate choice, a silent fallback, or (for any provider) an empty-diff judgment that could not evaluate anything.

  Affected surfaces: `cadence summary render`, the on-disk `<id>-SUMMARY.md` sidecar, `cadence doctor`'s verification-readiness warnings, `cadence config explain`'s provider warnings, and the phase-243 fallback banners. All five now source their wording from one single-sourced formatter (`formatVerifierRollupLabel`) and a new `MOCK_VERIFIER_CAPABILITY` constant, so the wording can't drift across renderers the way the pre-existing duplicated literal previously allowed.

  Display layer only: the `mock` provider identity, `provider`/`providerSelection` JSON fields, `AssuranceRecordZ`/`GateProvenanceZ` schema, `deriveAssuranceRecord`'s derivation logic, and `contentHash` verification are all unchanged. `MOCK_VERIFIER_NOTICE` (the pre-existing activation-nudge wording) is untouched — the new constant is a neutral sibling, not a replacement.

- Updated dependencies [ca61066]
- Updated dependencies [04a38d0]
  - @thomas-powers-jr/cadence-types@1.56.0

## 1.55.0

### Minor Changes

- c8333f8: Added a new `cadence doctor` check, `conduction-reachability`, that reports — separately for `code-review` and `security-audit`, since the two gates are asymmetrically gated in this repo — whether the current configuration can produce a real-provider (non-`mock`) finding at all.

  Two independent, deliberately-retained blockers make this structurally unreachable in normal, headless-agent-driven operation: the `auto` gate profile excludes both review gates from every tier, and the self-invocation guard forces a `mock` verifier fallback whenever `cadence` is already running inside a headless Claude Code session. A third, ordinary (non-safety-related) blocker can also apply: a gate's own `provider` config being set to `'mock'`.

  The check evaluates three axes per gate — profile inclusion (`gatesFor` across all tiers), provider configuration (`seamProvider`), and the self-invocation session guard (conditioned on the gate's own provider being `'host-cli'`, since the guard only applies to that spawn path) — and reports `severity: 'warning'` naming exactly which axis or axes block each gate, with `fixId: null` (no safe auto-repair exists; every remediation is an operator decision). `status: 'ok'` only when both gates are fully reachable.

  Neither blocker is modified or bypassed by this change — `isSelfInvocation`, `SELF_INVOCATION_ENV_VAR`, and the `DELTAS` gate matrix are untouched. The check adds visibility only, so an operator can tell "no real finding has been produced yet" apart from "no real finding can currently be produced," and `docs/providers.md` now documents the exact operator procedure (a DRAFT-level `profile:` override, run from a real interactive terminal) to produce one when needed.

- db8209f: Fixed a real coverage-scanner defect: the JS/TS `test-coverage` gate's `classify()` state machine had no concept of a regex literal, so a paren, quote, or backtick inside an unrecognized `/regex/` — not just parens/backticks, as originally reported — was read as a real structural character. This corrupted `findMatchingParenIndex`'s depth-aware paren matcher and/or flipped the scanner into real string/template mode for the rest of the file, silently undercounting or dropping test-block spans (and, in rarer cases, silently dropping a real assertion from a span without changing its count). A repo-wide sweep found this affected 20 of this repo's own 446 JS/TS test files before the fix; all 20 are now confirmed resolved with no file-content edits needed, since the fix lives entirely in the scanner.

  `classify()` (`packages/core/src/verify/coverage-profiles/mask.ts`) now recognizes JS/TS regex literals as their own lexical category, opt-in per language profile via a new `LanguageSyntax.regexLiterals` field (set only for the built-in `js-ts` profile — no other language profile is affected). Regex-vs-division disambiguation uses a masker-only heuristic (no new runtime dependency) against an explicitly documented, bounded preceding-token vocabulary; a `/` in a context outside that vocabulary resolves conservatively, the same as division, rather than guessing regex-open.

  That conservative fallback is now also surfaced instead of staying silent: `cadence verify coverage --explain` reports a `[mask diagnostic]` line naming the out-of-vocabulary context, so a scanner blind spot is visible instead of quietly under-counting coverage. `findSpansForProfile`'s existing signature and behavior are unchanged for every existing caller; the new diagnostics are opt-in via a sibling function.

- 8098aee: Persisted `codeReview`/`securityAudit` findings on a `SUMMARY.json` are now rendered in both Markdown summary surfaces — the on-disk `<id>-SUMMARY.md` sidecar (`renderSummaryMd`) and `cadence summary render`'s output (`renderSummaryForReview`) — under a shared `## Findings` section, placed after `## Tasks` and before the gates heading in both. Previously these findings were JSON-only: a refused settle or a pasted PR summary gave no visibility into the finding that actually caused the refusal without opening the raw `.json` record.

  Findings are grouped and ordered deterministically: `codeReview` findings by file path (codepoint order), then severity (critical > high > medium > low), then `id`; `securityAudit` findings by severity then `id`, with original array order as the stable tie-break when `id` is absent (as it always is for `security-audit` findings under the current schema). Each rendered line includes severity, message, and — when present — line, id, target, anchor (kind/ref/tier), disposition, and waiver expiry. The `## Findings` heading itself is omitted entirely when there is nothing to render, so every historical summary predating this change (no `codeReview`/`securityAudit` fields at all) renders byte-identically to before, and `cadence summary verify`'s `contentHash` check — which hashes the parsed JSON, never the Markdown — is unaffected; a new test sweeps all 269 existing `.cadence/phases/**/*-SUMMARY.json` records in this repo to prove it.

  Every rendered finding message passes through the existing `redactSecrets` utility. `security-audit` findings were already redacted upstream before reaching `SummaryZ`; this adds the same protection for `code-review` findings, which previously were not. Only the credential shapes `redactSecrets` already recognizes (PEM keys, JWTs, AWS access keys, GitHub tokens, Authorization headers, `key=`/`token=`/`password=`/`secret=`-style assignments) are redacted — webhook URLs and bare local file paths are not, and are deliberately out of scope; widening `redactSecrets`'s shared patterns (it also backs `gates/security-audit.ts`, `intelligence/finding-routing.ts`, and others) is left to a future phase if ever needed.

- a5e729d: Added a new `cadence doctor` check, `roadmap-currency`, that reports drift between the highest phase number under `.cadence/phases/` and the highest phase number referenced in `ROADMAP.md`/`MILESTONES.md` — an anti-recurrence mechanism for the 113-phase/6-week ROADMAP drift fixed in PR #321.

  Drift is computed against the lower of the two reference files (using only files that contain at least one `Phase N` heading — a file with zero matches is excluded from the comparison, never treated as `0`, so a consumer repo that only maintains one of the two files doesn't warn forever). `severity: 'warning'` when drift exceeds 10 phases, `'ok'` otherwise, and `fixId: null` always — generating roadmap prose is deliberately not automated. The check silently passes on a fresh consumer repo (no phases yet, or `ROADMAP.md` still the `init` stub), and degrades to a best-effort "not determinable" `ok` on any unexpected read failure rather than throwing.

### Patch Changes

- @thomas-powers-jr/cadence-types@1.55.0

## 1.54.0

### Minor Changes

- fcd76ad: Fixed a provenance-honesty gap: when a `code-review` or `security-audit`
  verifier **throw** (the call itself never returned — revoked key, network
  blip) was bypassed via `--force`, `--allow-code-review-failure`, or
  `--allow-security-audit-failure`, the persisted `SUMMARY.gates[]` entry
  read `{ gate: 'code-review', status: 'ran' }` — indistinguishable from a
  clean real-provider pass, since only the absence of the phase-232
  `provider`/`model` fields hinted anything was wrong.

  Both gates' catch blocks now set a new, distinct `GateFlags.reviewVerifierFailure`
  field on a bypassed throw (deliberately not the pre-existing `verifierFailure`
  field, which is reserved for `deep-verify` and feeds `notify/collect.ts`'s
  anomaly emission — reusing it would have fabricated a false `deep-verify`
  entry in `SUMMARY.gateBypasses`). `packages/core/src/gates/registry.ts`'s
  `runSettleGates` dispatch loop turns this into an honest
  `status: 'skipped'` entry with a `skipReason` naming the flag that
  triggered the bypass, the underlying failure message, and the configured
  provider — with no fabricated `provider`/`model` structured field, so the
  entry correctly stays excluded from `deriveAssuranceRecord`'s
  `verifierRollup`. The bypass also now prints a loud stderr notice, matching
  this repo's no-quiet-fallback convention. A verifier throw with no bypass
  flag set continues to refuse identically to before (exit code, exact
  stderr reason text, and no `flags` on the refusal — all unchanged).

  Out of scope, unchanged: the pre-existing findings-based bypass path (real
  HIGH/CRITICAL findings waved through on a review call that _did_ return)
  still correctly records `status: 'ran'` with a real `verifierIdentity`.
  `deep-verify.ts`'s own identical registry-side gap (its bypassed throw also
  still records `status: 'ran'` with empty identity today) is a separate,
  unscoped concern — tracked as a follow-up recommendation.

- 8b42ff4: Renamed the npm scope to `@thomas-powers-jr` across all five published
  packages, matching the GitHub org rename in #360. This is a rename of
  existing software on its existing 1.x version lineage, not a new product —
  consistent with the standing pre-v2.0.0 semver policy.

  The previously-published packages under the old scope are not deleted —
  they stay resolvable and get `npm deprecate`d with a pointer to the new
  scope, as a separate operator-run step after this release. See
  [docs/migration-npm-scope.md](../docs/migration-npm-scope.md) for the full
  migration path, including the exact `cadence doctor --fix --wire-host`
  command that repairs an existing consumer's host-adapter hook install.

  `cadence doctor`'s host-hooks and `cadence config explain`'s warnings both
  now distinguish a hook entry that's missing entirely from one that's
  present but still pointing at the old scope — previously both cases
  reported the same "not found" message, which was factually wrong for the
  second case.

- 8f58bde: Fixed three more silent-refusal gaps in `cadence settle run`: the
  AC-derivation refusal (`--auto`/`--interactive` finding a blocked or
  incomplete task), the anomaly/skill-audit refusal, and the evidence-floor
  refusal each previously exited 1 with zero durable evidence beyond an
  ephemeral stderr line — no `SUMMARY.json`/`.md` was written at all. Phase
  247 had already fixed this for the gate-loop refusal family (a gate itself
  returning `refused`); these three post-gate-loop families were a separate,
  undocumented gap in the same mechanism.

  All three now route through the existing `writeRefusedSettleSummary`
  (unchanged), reusing the `acc`/`gates` already computed earlier in
  `settleService` — no new parameters on any helper function, no
  reimplementation. A findings-bearing refusal in any of these three
  families inherits the identical conditional `contentHash` and per-attempt
  snapshot-sibling behavior phase 247 built for the gate-loop family;
  `acResults` stays `[]` on all four refusal families alike, matching the
  existing invariant. Exit code, stderr messaging, loop-state non-mutation,
  and every gate's own outcome are unchanged.

  Out of scope, unchanged by design: `loadSettlePreconditions`'s precondition
  refusal, `checkPhaseCollisionBackstop`'s worktree-collision backstop, and
  `resolveSettleGateSet`'s soft-cap refusal all fire before a `gates`
  provenance array exists to attach a SUMMARY to — none of the three writes
  one, before or after this change.

- afcb90a: Fixed two compounding data-loss gaps in a refused (failed) `cadence settle`:
  `writeRefusedSettleSummary` (`packages/core/src/services/settle.ts`) never
  recorded the `codeReview`/`securityAudit` findings that caused the refusal
  in the first place, even though they were already accumulated into `acc`
  by the time the gate loop halted — they were computed, then silently
  dropped at the write. Fixed by threading `acc.codeReview`/
  `acc.securityAudit` into the refused `SUMMARY.json`, mirroring the
  success path's shape exactly, with a `contentHash` attached exactly when
  at least one of those collections is non-empty (a findings-free refusal —
  e.g. a bare `build-test-must-pass` refusal — keeps producing byte-identical
  output to before this change).

  Second, even once recorded, a later settle attempt for the same draft
  silently overwrote the previous attempt's refused record — a convergence
  reloop's attempt-1 findings vanished the moment attempt-2 ran, success or
  refusal. Fixed by additively writing an immutable per-attempt sibling pair
  (`<id>-refused-<completedAt-slug>-SUMMARY-snapshot.json`/`.md`, exported as
  `refusedSnapshotArtifactBase`) whenever a refusal recorded findings — named
  so it is invisible to every existing SUMMARY-discovery consumer
  (`mcp/resources.ts`, `git/diff-strict.ts`, `verify phase`, `summary
render`/`verify`) by construction, best-effort (a sibling-write failure is
  reported on stderr but never affects the canonical write or settle's exit
  code), and never written on the success path or for a findings-free
  refusal. The canonical `<id>-SUMMARY.json`/`.md` continues to reflect only
  the latest attempt, as before — nothing that reads it changes behavior;
  prior attempts' siblings simply keep accumulating on disk.

  `cadence summary verify`'s `NO_HASH` outcome and `packages/core/src/
services/summary-verify.ts`'s doc comment are updated to reflect the new
  conditional truth: `NO_HASH` now means "pre-phase-223 record, or a refused
  settle that recorded no findings" rather than "any refused settle."

### Patch Changes

- Updated dependencies [8b42ff4]
  - @thomas-powers-jr/cadence-types@1.54.0

## 1.53.0

### Minor Changes

- eddfc6b: The anchor ladder's `executable` tier is now reachable in a real settle (Phase
  241, `rec-20260729-002` / `rec-20260729-007`). Phase 235 shipped the full
  four-tier ladder as a pure resolver, but its top rung was dead in production:
  `SettleContext` exposed no prior-gate provenance to a `GateImpl` — the
  accumulator was a local inside `runSettleGates` — so `gates/code-review.ts`
  called the resolver with a literal `[]` and every live finding capped at
  `structured`/`declared`/`undeclared`. `executable` was exercised only by unit
  tests that injected provenance directly.

  - `SettleContext` gains an optional, readonly `gateProvenance` — the entries
    recorded so far this settle, in `GATE_ORDER`. `runSettleGates` hands each
    gate a per-gate context carrying a **two-level-frozen** snapshot: the array
    and each entry are frozen, and the entries are copies. The element-level
    freeze is the load-bearing half — a shallow copy would leave entries sharing
    object identity with the live accumulator, so a gate could have rewritten an
    entry that lands in `SUMMARY.json.gates` and feeds the phase-233 assurance
    record. The field is typed `readonly Readonly<GateProvenance>[]`, so the
    compiler refuses element mutation and the runtime copy holds even against a
    gate that casts the guard away. (A plain `readonly T[]` would not suffice: it
    constrains the array's shape, not its elements' fields.)
  - The field is optional and additive: every pre-existing `SettleContext`
    literal, in production and in tests, compiles unchanged, and a reader treats
    an absent field the same as an empty array — never as "unknown".
  - `gates/code-review.ts` passes that snapshot through. Because `code-review`
    runs 9th in `GATE_ORDER` and `build-test-must-pass` 5th, the corroborating
    status is already recorded by the time anchoring happens.

  This widens what is **reachable** without weakening what must be **earned**.
  The ladder's two-condition check in `verify/anchor.ts` is untouched:
  `executable` still requires both an AC cited by a task with a non-empty
  `verify:` **and** a `build-test-must-pass` entry with `status: 'ran'`. A
  `skipped`, `refused`, or absent entry still caps the tier — a failing suite
  waved through with `--allow-failing-build` records `skipped` and demonstrably
  cannot buy a stronger anchor.

  Reachability is proven end-to-end rather than asserted: a new test drives the
  real CLI over an ephemeral repo at a profile whose gate set includes
  `code-review` and reads the tier back out of the persisted `SUMMARY.json`.
  Reverting the one-line gate change flips that recorded tier from `executable`
  to `structured`, so the test measures the production path and nothing else.

  Two limitations disclosed with the ladder in phase 235 remain open and are
  still documented: anchoring is resolved per-file rather than per-finding, so an
  uncovered defect in an otherwise-covered file can be missed
  (`rec-20260729-003`); and a boundary string that merely contains a finding's
  filename as a substring can mask a real gap by granting `declared` tier too
  broadly (`rec-20260729-005`).

- c27bcb0: `code-review` findings are now criteria-anchored (Phase 235, `rec-20260727-004`
  / `rec-20260727-005`): every finding is tagged with how strongly it ties back
  to something the phase's DRAFT actually declared, on a four-tier ladder —
  `executable` > `structured` > `declared` > `undeclared` — resolved by a new
  pure `resolveAnchor` (`packages/core/src/verify/anchor.ts`). A finding whose
  best anchor resolves to `undeclared` is a **criteria gap**: diff work no
  acceptance criterion and no boundary covers.

  `GateProvenanceZ`-adjacent `SummaryZ` gains an additive `AnchorZ` peer schema
  (`{ kind: 'ac' | 'boundary' | 'none', ref?, tier }`, deliberately independent
  of the existing `AcEvidenceZ` ladder — the two rank different things) and
  `FindingZ` gains an optional `anchor` field. Both are purely additive: a
  pre-phase-235 `SUMMARY.json` with no `anchor` on any finding still parses
  unchanged.

  A criteria gap adds **no new refusal path and no new bypass flag** — a gap
  finding flows into the exact same finding stream `code-review` already
  refuses on, so a HIGH-severity gap refuses through the pre-existing
  HIGH-finding contract (`dec-20260729-005`); gap count and severity
  distribution are declared to stderr unconditionally, independent of whether
  the gate passes, refuses, or is bypassed (`dec-20260729-006`). `GATE_ORDER`
  and every gate's pass/refuse semantics for pre-existing finding classes are
  unchanged. Scope is deliberately narrow — only `code-review` is
  criteria-anchored; `spec-review`, `ui-spec-review`, and `plan-review` are
  untouched (`dec-20260729-003`).

  Three limitations were filed rather than papered over. The first —
  `executable` not being reachable in a real settle, because `SettleContext`
  exposed no prior-gate provenance to a single gate (`rec-20260729-002`) — is
  **resolved by phase 241 in this same release**, so it never reaches a
  published version; see that entry for the fix. The other two remain open:
  anchoring is resolved per-file rather than per-finding, so an uncovered
  defect in an otherwise-covered file can be missed (`rec-20260729-003`); and a
  boundary string that merely contains a finding's filename as a substring can
  mask a real gap by granting `declared` tier too broadly (`rec-20260729-005`).

- 5cc4085: Findings now carry a stable identity (Phase 236, `rec-20260727-006`): `FindingZ`
  gains additive `id`, `target: 'artifact' | 'verification'`, `disposition: 'open'
| 'accepted' | 'waived' | 'fixed' | 'superseded'`, and `waiver: { expiry }`
  fields. `id` is a pure content hash over `(file, normalized message)` —
  deliberately never a line number, so the same finding keeps the same `id`
  across settles even after an unrelated edit shifts which line it sits on
  (`packages/core/src/verify/finding-identity.ts`). `anchor`/`severity` are
  accepted as parameters for call-site compatibility but do not participate in
  the hash (Phase 245 narrowed the formula from an original `(file, anchor.kind,
anchor.ref, severity, normalized message)`, after independent review found
  both anchor and severity can legitimately change across settles for the same
  underlying defect). A
  `waiver` is only valid when `disposition === 'waived'`, enforced by a
  cross-field schema refine — a waiver with no expiry is a belief masquerading
  as knowledge, and an orphaned waiver on a non-waived finding is never valid.
  `AnchorZ.kind` widens to also accept `'invariant'`, unused by any producer yet
  (a follow-on phase's scope).

  The `code-review` verifier's persisted findings (`gates/code-review.ts`) now
  carry this identity: `id`, `target: 'artifact'`, and a default
  `disposition: 'open'`, alongside their existing §7.1 anchor tag. This required
  converging code-review's previously-local 3-severity `Finding`/`FindingSeverity`
  type onto the shared, persisted 4-severity `Finding` from `@manehorizons/cadence-types`
  (`rec-20260727-006`'s design-doc decision D9 — "one `Finding` type,
  discriminated by `target`"). `CodeReviewFinding`/`CodeReviewFindingSeverity`
  remain available from `packages/core/src/contracts/index.ts` as backward-compat
  aliases of the now-shared type — `CodeReviewFindingSeverity` correspondingly
  widens from `'high' | 'medium' | 'low'` to the full `'critical' | 'high' |
'medium' | 'low'` union, though no code-review provider constructs `'critical'`
  today.

  `RecommendationSourceZ` gains a `'review'` member (`rec-20260727-011`), so a
  future phase that routes code-review findings into the recommendation ledger
  can carry real provenance instead of mislabeling them `manual`/`cadence`.

  All schema changes are purely additive — every pre-phase-236 `SUMMARY.json`
  still parses unchanged. This phase is deliberately schema-and-computation
  only: findings-to-ledger auto-routing (creating `Recommendation` + `Evidence`
  entries from findings during settle) is **not** implemented here — that
  behavioral work is split to a follow-on phase, recorded inline in
  `.cadence/ROADMAP.md`'s Phase 236 entry.

- 7ddc72a: Identified code-review findings now route into the recommendation ledger at
  settle time (Phase 242, `rec-20260731-003`) — the behavioral half Phase 236
  deliberately deferred. Each finding that carries a stable `Finding.id` (Phase
  236 identity) becomes a `Recommendation` with `source: 'review'`, linked to a
  `cadence-artifact` `Evidence` entry whose `path` is that settle's
  `<draftId>-SUMMARY.json` and whose `summary` names the phase id, draft id, and
  SUMMARY `contentHash`. Routing is keyed on `Finding.id`, so a re-settle of an
  unchanged phase never mints a duplicate entry for a finding already routed,
  and one freshly-minted `scoutId` covers a whole settle's batch rather than one
  per finding. Findings with no stable id (e.g. `security-audit`, which has no
  identity wired in yet) are skipped, never force-routed.

  `RecommendationZ` gains an optional `sourceFindingId` (the dedup key), and
  `addRecommendation` gains optional `source` and a structured `cadence-artifact`
  evidence override — both backward compatible; every existing caller keeps
  today's `source: 'manual'`, free-text-evidence behavior unchanged. Two or more
  findings that collide on identity within one settle (`rec-20260731-001`'s
  known collision — same file/anchor/severity/normalized-message, no occurrence
  discriminant) merge into a single `Recommendation` rather than mint one entry
  with no trace of the duplicates or _N_ separate entries for one id; per
  `dec-20260731-001`, the identity hash itself is untouched — the merge records
  the occurrence count explicitly in the entry's evidence/summary text.

  A new `recommendations.autoRoute` config field (`boolean`, default `true`,
  alongside the existing `autoArchive`) gates the step. Like the existing
  retro-digest and auto-archive steps, routing is best-effort: a failure (e.g. a
  ledger write error) never blocks or fails settle, and always prints a stderr
  notice rather than failing silently. This is a settle-time writer only — no
  new gate, no `GATE_ORDER` change, and no refusal semantics; every existing
  gate's pass/refuse verdict is byte-for-byte unchanged. Disposition mutation
  (accept / waive / fix / supersede) still has no CLI surface — that stays a
  follow-on phase's scope, per Phase 236's own boundary.

- 3b95218: Settle can now tell a `mock`-verified `code-review`/`security-audit` gate
  from a real-provider one — closing CADENCE's sole surviving P0 (Phase 232,
  `rec-20260727-001`). Previously `CodeReviewResult`/`SecurityAuditResult`
  computed `provider`/`model` in memory but discarded both before persistence,
  so a SUMMARY could record only _that_ a review ran, never _what_ ran it.

  `GateProvenanceZ` gains optional `provider`/`model` fields, populated only
  for the `code-review` and `security-audit` gate entries (every other gate's
  entry is unchanged). `GateFlags` gains an internal `verifierIdentity` field
  that gate implementations use to report this identity generically — the
  gate registry merges it onto the persisted provenance entry by flag
  presence, not by gate name, so no gate-specific special-casing was needed
  to express it.

  This is a SUMMARY shape change, so `SummaryZ.schemaVersion` moves from the
  literal `1` to `1 | 2`: writers now emit `2`; readers still accept
  pre-existing `1` records unchanged. A SUMMARY written by a genuinely newer
  Cadence (an unrecognized higher `schemaVersion`) now reports a distinct
  "written by a newer Cadence" diagnostic instead of a generic parse/corruption
  error, mirroring Phase 223's `contentHash` "unverifiable" precedent.

  No `GATE_ORDER` changes, no gate pass/refuse behavior changes, no new
  refusals — this is purely provenance the record was silently dropping.

- 0726e40: **The kernel / verifier / consumer boundary is now named and lint-enforced.**

  The split has been ~80% built and unnamed for many phases: `GateImpl` /
  `GATE_REGISTRY` totality plus injected verifier ports already formed a plugin
  architecture with no published contract. Phase 234 names it without moving a
  package or changing a single gate's behaviour.

  A new `contracts/` module publishes the three roles (`kernel`, `verifier`,
  `consumer`) as assertable data — including the governing rule that **no plugin
  can pass; only the kernel calls green** — plus a generic
  `VerifierPort<I, R>` that all seven verifier-backed gates (`deep-verify`,
  `code-review`, `security-audit`, `plan-review`, `per-task-verify`,
  `spec-review`, `ui-spec-review`) are expressed at, with no per-gate special
  casing. It also re-exports every family's input/result types so callers never
  reach into `verify/` internals for a type.

  `spec-review` and `ui-spec-review` — previously the only two verifier-backed
  gates with no injection seam — are now resolved through ports, and
  `specApproveService` accepts an optional ports argument for testing. Default
  resolution, argument fidelity, and lazy UI-path selection are unchanged, and
  are now pinned by tests.

  An ESLint `no-restricted-imports` zone fails the build when any module outside
  `verify/` or `contracts/` imports one of the seven verifier-family modules
  directly instead of the published contract, matching both extensioned and
  extensionless specifiers. Statically-imported violations are caught; dynamic
  `import()` is not reachable by this rule and is documented as such.

  `GATE_ORDER` and every gate's pass/refuse semantics are unchanged, pinned by a
  regression fixture that drives a real ten-gate settle through the production
  registry, and the full settled-SUMMARY corpus still parses at both
  `schemaVersion` 1 and 2.

  No runtime dependency added. No package moved. No public CLI or config surface
  changed.

- cfe582a: Every settle now derives and reports one whole-run **assurance record** —
  a durable answer to "how strongly was this settle actually verified?"
  (Phase 233, `rec-20260728-001`). Composed from the per-gate verifier identity
  persisted in Phase 232 plus the existing per-AC evidence-class ladder
  (`ai-verified > executed > assertion > mention > unverified`), it makes a
  settle whose gates all ran under `mock` visibly different, in the durable
  record, from one verified for real.

  `SummaryZ` gains an optional `assurance` field: `verifierRollup` (one entry
  per distinct `(provider, model)` pair observed across gate provenance),
  `evidenceTally` (an exhaustive count over all five evidence classes), and
  `overall` (`'strong' | 'mixed' | 'weak' | 'unverified'`, a single
  deterministic label). The derivation (`deriveAssuranceRecord`) is a pure
  function of the gate-provenance array and the AC-evidence array only — no
  gate-specific special-casing was needed to express it, clearing this phase's
  binding tripwire and leaving the door open for further kernel/verifier/
  consumer boundary work.

  `assurance` is reported only: it adds no gate, no refusal path, and no
  bypass flag, and settle's pass/refuse outcome is byte-for-byte unchanged.
  It is covered by Phase 223's settle-time content hash, so a post-settle
  hand-edit to it is caught by `cadence summary verify` exactly like any other
  field, and it is surfaced as an `## Assurance` section in both
  `cadence summary render` and the `SUMMARY.md` sidecar.

- bff35bf: `cadence settle` now detects when it is actually executing through a
  `cadence` binary that resolves OUTSIDE the current repo checkout, despite
  that repo having its own local build (`rec-20260729-001`). This is the exact
  bug confirmed on phases 233/234: a stale globally-installed `cadence` binary
  silently shadowed the checkout's own `packages/core/bin/cadence.cjs`,
  producing a downgraded `schemaVersion: 1` SUMMARY with no `assurance`
  record — and the two binaries reported an _identical_ `--version` string on
  the unreleased branch, so version comparison can't catch it.

  Detection (`detectForeignCadenceBinary`, `packages/core/src/services/
settle.ts`) is a pure, unit-tested function: is the realpath of the binary
  actually executing this settle located inside the repo's own toplevel, given
  that the repo is recognizably CADENCE's own monorepo (`packages/core/bin/
cadence.cjs` + `.cadence/` both present at its root). An ordinary consumer
  project settling via a globally-installed `cadence` is never a false
  positive — that gate is what keeps this narrow.

  On a mismatch, settle prints a loud stderr banner ("SETTLING VIA A FOREIGN
  CADENCE BINARY", `buildForeignBinaryBanner` — same shape/placement
  convention as the existing `MOCK_FALLBACK_BANNER`) naming both paths and
  suggesting the fix, and `SummaryZ` gains an optional `foreignBinaryMismatch`
  field (`{ runningBinaryPath, repoToplevel }`) recording the same provenance
  on the written SUMMARY so the condition is auditable from the artifact alone.
  Like `assurance` (phase 233), this is reported only — no gate, no refusal
  path, no bypass flag; settle still completes normally either way. The field
  is genuinely absent (never `false`/`null`) on a matched invocation, which is
  the common/correct case.

  This guard only runs in code that contains it, so it could not have caught
  233/234 themselves, and it will not catch a settle run through an
  already-published `cadence` binary that predates this release — it protects
  settles going forward, once operators are actually running a build that
  includes this fix.

### Patch Changes

- 0d6aea6: Fixed `computeFindingId` (`packages/core/src/verify/finding-identity.ts`) minting a
  new identity for an unchanged finding in two real cases, either of which caused
  Phase 242's ledger dedup (keyed on `Finding.id`) to miss the finding and route a
  duplicate `Recommendation` for the same underlying defect. The hash previously
  included `anchor.kind`, `anchor.ref`, and `severity` alongside `file` and
  normalized `message` — but both anchor and severity can legitimately change
  across settles for the same defect: the DRAFT-amendment workflow deliberately
  re-anchors a previously-unanchored ("gap") finding once a criterion is added to
  cover it (proven by `criteria-anchor-corpus.test.ts`'s own "AC-5 round trip"
  test, which already asserted message/severity/line survive that transition
  unchanged but never asserted `.id` did — now fixed), and `severity` is live LLM
  classification under real verifier providers (`anthropic`/`local`/`host-cli`),
  so a re-run can legitimately reclassify the same defect's severity. Identity is
  now a pure hash over `(file, normalized message)` only; `anchor` and `severity`
  are still accepted as `computeFindingId` parameters (call-site compatibility)
  and remain real, unchanged fields on a stamped `Finding` — they are simply no
  longer identity inputs. `computeFindingId`'s line-number exclusion (unrelated,
  pre-existing, phase 236) is untouched.

  `deriveRoutingCandidates` (`packages/core/src/intelligence/finding-routing.ts`)
  previously assumed every occurrence of a same-id merge group agreed on
  `severity` "by construction" — true before this fix (severity was a hash
  input), false after. It now tracks the most severe occurrence seen across a
  merge group and reports that severity/priority on the routed candidate, rather
  than silently whichever occurrence happened to be encountered first.

- db225ac: Follow-up to #331 (rec-20260731-002): `createVerifierFactory`'s three
  selection-time credential/prerequisite-missing degrade branches — an explicit
  `anthropic` request with no `ANTHROPIC_API_KEY`, an explicit `local` request
  with no `CADENCE_LOCAL_BASE_URL`/model, and a `host-cli` request for a family
  that hasn't wired a builder — previously emitted only a bare single-line
  stderr warning for all 7 verifier seams (`specReview`, `uiSpecReview`,
  `verifier`/deep-verify, `perTaskVerifier`, `codeReview`, `planReview`,
  `securityAudit`), unlike the loud `MOCK_FALLBACK_BANNER` deep-verify already
  gets from `settle.ts` when its _configured_ provider resolves to mock.

  All three branches now emit the same loud, multi-line banner (reusing
  `MOCK_VERIFIER_NOTICE`'s "not real verification" wording), naming the seam and
  the specific missing prerequisite. The silent default-mock fallthrough (no
  provider configured, or explicit `mock`) is untouched, as is
  `wrapWithFallback`'s separate per-call runtime warning for a host-cli binary
  that fails mid-call (different, higher-frequency event — not in scope here).
  `settle.ts`'s own deep-verify pre-check and this new factory-level banner are
  disjoint by construction (they branch on mutually exclusive resolved-provider
  values), so deep-verify never double-warns.

- Updated dependencies [c27bcb0]
- Updated dependencies [5cc4085]
- Updated dependencies [7ddc72a]
- Updated dependencies [3b95218]
- Updated dependencies [cfe582a]
- Updated dependencies [bff35bf]
  - @manehorizons/cadence-types@1.53.0

## 1.52.0

### Minor Changes

- a58cac1: Closed three drifts around `gates.sealed` (rec-20260725-006). Docs now name all
  three gates that actually consult `isGateSealed` (`test-coverage`,
  `build-test-must-pass`, `boundary-scan` — `docs/reference/config.md` and
  `docs/concepts.md` previously named only the first two, stale since
  `boundary-scan` shipped in Phase 156), plus the missing `--allow-failing-build`
  / `--allow-boundary-scan-failure` rows in the "Gate bypass reference summary"
  table; a new doc-content test derives the sealed-gate set from the real
  `isGateSealed` call sites so a future gate can't drift the same way again.
  `docs/concepts.md` gains a "Bypass-flag naming policy" section explaining the
  `--force` / `--allow-<gate>-failure` / `--allow-<verb>` split and auditing
  every bypassable gate's flag against it. `runSettleGates`'s gate-provenance
  collection now records a bypass-specific skip reason for `build-test-must-pass`
  and `boundary-scan` (previously only `test-coverage`'s bypass was distinguished
  from a normal "ran"), naming whichever flag actually fired (`--force` vs the
  gate's own dedicated flag) rather than always naming the dedicated one. No
  gate pass/refuse/seal decisions changed — this is documentation accuracy and
  provenance-recording parity only.
- 90e3ed9: Closed the phase-attributable AC coverage collision (phase 239). Nothing in a
  settled phase's artifacts previously recorded which phase a test belonged to:
  the `test-coverage` gate searched every `packages/**/*.test.ts` for the bare
  `AC-N` token, so any past phase's `AC-3` satisfied every future phase's
  `AC-3` (AC ids restart at `AC-1` every phase);
  meanwhile `cadence verify phase`'s replay scoped its re-scan to only the files
  the DRAFT declared, which chronically under-declares and produced false
  "drifted" verdicts against phases whose tests genuinely still pass.

  A new opt-in `verification.coverageScheme` config field (`"bare"` | `"phase-qualified"`,
  schema default `"bare"`) closes both. Under `"phase-qualified"`, an `AC-N`
  token must carry its phase-slice prefix (`239-01/AC-3`) to count as coverage
  evidence — a bare or foreign-phase token no longer satisfies the gate, and
  every refusal names the exact expected token. `cadence verify phase` drops
  file-scoping entirely for a phase-qualified SUMMARY and instead matches by
  that phase's own qualified token across the configured `verification.testGlobs`,
  so an under-declared DRAFT no longer produces false drift. A phase
  settled before the scheme existed has no phase-attributable evidence at all;
  its replay now reports every AC `indeterminate` with `drift: false` rather
  than asserting a verdict it cannot substantiate.

  The field defaults to `"bare"` for every existing config (including one that
  predates this field) — this is a two-layer default: `defaultConfig` itself
  holds `"bare"` so `loadConfig`'s config.json-over-`defaultConfig` merge never
  silently flips an upgraded consumer, and only a fresh `cadence init` writes
  `"phase-qualified"` explicitly. Existing consumers on `@manehorizons/cadence-core@1.51.1`
  are fully unaffected until they opt in via `cadence config edit coverageScheme`.
  `SUMMARY.json` gains additive, optional `coverageScheme`/`coverageMode` fields
  recording which scheme produced a settle's evidence; `cadence verify coverage
--explain` reports per-occurrence whether a token satisfies the configured
  scheme.

- 127a06b: **BREAKING (engine floor): minimum supported Node.js raised from `>=20` to
  `>=22`.** Node 20 reaches its scheduled end-of-life in April 2026, and Phase
  238 retires the Node 20 CI/test leg across the monorepo (see
  `.cadence/phases/238-drop-node20-support/`) — these packages are no longer
  tested against, or guaranteed to work on, Node 20 or 21. Shipped as a minor
  bump rather than major, matching the precedent set by the Zod v3→v4 upgrade
  (`[1.4.0]`): no external adopters are affected at release time, and CADENCE
  is reserving its first major/2.0.0 release for when the full coupling of
  Cadence is complete.

  Every published package's `package.json` now declares
  `"engines": { "node": ">=22" }`. Consumers still on Node 20 or 21 should
  upgrade their Node.js runtime before installing or running any package at
  this version or later — by default, npm and pnpm only _warn_ on an
  `engines` mismatch (this repo does not set `engine-strict`), but CI
  pipelines or environments with `engine-strict` enabled will fail outright,
  and pipelines pinned to Node 20 should bump their Node version to keep
  using the `cadence` CLI, either host adapter, or
  `@manehorizons/cadence-types`.

- 92ae02e: `cadence doctor` gains a `ledger-remote-collision` check (rec-20260726-003):
  `mintId` computes the next recommendation/evidence/decision/assumption id
  purely from the local ledger on disk, so two unpushed branches/worktrees/
  sessions can independently mint the same id for different content — this
  happened for real on 2026-07-26 and required a manual git-merge + JSON-union
  fix (PR #308).

  The new check fetches the tracked upstream branch (reusing the existing
  `checkRemoteFreshness` fetch plumbing), resolves `git merge-base HEAD @{u}`,
  and diffs local's new-since-merge-base ledger ids against the upstream's
  new-since-merge-base ids across all four ledgers, warning (never `error`) on
  any overlap and naming the colliding id(s). It degrades safely to `ok` — no
  git repository, no upstream, a failed fetch, a detached HEAD, or no
  discoverable merge-base all skip the check rather than failing it. No
  `--fix` auto-repair exists for this finding — resolving a real collision
  needs a human to pick which side re-mints, matching `worktree-phases`.

- d7d4239: `SUMMARY.json` gets a settle-time content hash, closing the "hand-edited
  SUMMARY renders faithfully as if it were genuine" gap (rec-20260724-006).

  - `Summary` (types) gains an optional, additive `contentHash: { algorithm:
'sha256'; value: string }` field — existing SUMMARY.json records without
    it keep parsing unchanged.
  - `cadence settle run` now computes a sha256 digest over a canonical
    (deep, stable-key-order) stringification of the settled summary and
    attaches it before writing `SUMMARY.json`/`SUMMARY.md`. Both `cadence
summary render` and the settle-time `SUMMARY.md` sidecar display it.
  - New `cadence summary verify <phase> <num>` recomputes the digest and
    reports `MATCH`, `MISMATCH` (non-zero exit — the stored hash doesn't
    match the content, i.e. the file was edited after settle), or `NO_HASH`
    (a pre-phase-223 or refused-settle record, reported cleanly rather than
    a false pass).

  This is detection only, not signing — self-signing in the same trust
  domain as the artifact's author isn't meaningfully stronger than a hash.
  Full cryptographic signing with an external trust root is deferred to
  rec-20260726-001, gated on the parked MCP/hooks/host-adapter/verifier/
  ledger threat-model rec (mil-rec-rec-20260712-016). See dec-20260726-001
  for the full rationale.

### Patch Changes

- f88716c: Fixes rec-20260726-002: a fresh `EnterWorktree` git worktree (or a fresh
  clone) carries the committed `.cadence/` scaffold but never `state.json`
  (gitignored since phase 196), so every state-mutating command threw
  `NotInitializedError` saying "run `cadence init`" — but `cadence init`
  correctly refuses on an already-`.cadence/`-committed repo, a dead end that
  had to be worked around by hand-authoring `state.json` (hit live during
  phase 222). `cadence onboard` already bootstraps exactly this case safely
  (phase 196 fallout, #177), but nothing in the failure path pointed at it.
  `SimpleStateBackend.readState()`'s `NotInitializedError` now distinguishes
  "`.cadence/` doesn't exist at all" (still names `cadence init`) from
  "`.cadence/` exists but `state.json` is missing" (now names `cadence
onboard`), and `cadence init`'s "already initialized" refusal prints an
  additional line pointing at `cadence onboard` in the same missing-state.json
  case. `cadence init` still refuses and writes nothing either way — only the
  guidance changes.
- 0e854cd: Extracted a shared `runConvergentReview` primitive (in `packages/core/src/verify/converge.ts`,
  alongside `nextConvergence`) that all 4 bounded-convergence call sites
  (`plan-review`, `code-review`, `spec-approve`'s spec-review and ui-spec-review)
  now delegate to, instead of each independently re-implementing the same
  read-sidecar → verify → verdict → history-append → write-sidecar → branch
  sequence (rec-20260725-008). Purely internal — no change to the convergence
  policy, sidecar JSON on-disk shape, or CLI-visible behavior; a future fifth
  convergence call site (e.g. survey #4's settle-gate convergence) can now reuse
  this primitive instead of copy-pasting a fifth time.
- 84dc9bd: Fixes #331: `cadence doctor`'s `verification-readiness` check inspected only the
  deep-verify seam despite its seven-seam name, so a seam configured to a real
  provider whose credentials were absent was classified as real and never
  credential-checked — `doctor` printed `✓ ok` while that gate was guaranteed to
  silently fall back to `mock` at call time. `cadence config explain` already
  caught this via its `provider-no-key` warning, and its remedy line says "Run
  `cadence doctor` to confirm provider health" — pointing the operator at the
  command that reported the green tick.

  `assessReadiness` gains `seamsDowngraded`: the seams whose configured provider
  is real but whose credentials are missing, in `VERIFIER_SEAMS` order. It never
  includes a `mock` seam (not a downgrade — it announces itself) nor a `host-cli`
  seam (no required credential by design). The existing `seamsReal`/`seamsMock`
  partition, which classifies by configured provider name, is unchanged — the new
  field expresses what that partition structurally cannot.

  `checkVerificationReadiness` now warns when any non-deep-verify seam will
  downgrade, naming each offending seam and its provider, and reusing the
  Claude-Code-login confusion wording when an affected seam is `anthropic` inside
  a live Claude Code session. The deep-verify branches are evaluated first so
  their more specific wording still wins when deep-verify is itself the problem.
  No check changes from `warning` to `error`, and no previously-warning
  configuration now passes.

  Found downstream: a project had `specReview` on `anthropic` with no key, so
  `cadence spec approve` downgraded to mock and wrote a SPEC-REVIEW artifact
  reading `pass: true, converged: true, findings: 0, attempts: 0, provider:
"mock"` — a spec no model had read, recorded as a clean convergent pass, with
  `doctor` reporting `ok` throughout.

- 65bcd73: Fixed the built-in python coverage profile's opener regex to accept a
  return-type annotation (e.g. `def test_foo(x: Path) -> None:`) between the
  parameter list and the trailing colon. Previously any test function
  annotated with a return type failed to match the opener at all, which
  silently dropped the entire file's span table — `cadence verify coverage`
  reported "no test block was recognized in this file" for real, passing,
  assertion-bearing pytest suites whose team convention adds `-> None:` (or
  any other return annotation) to every test function, indistinguishable from
  "no tests exist." Files that happened not to use return-type annotations
  were unaffected, which is what made the gap easy to miss. Also audited the
  js/ts profile for an analogous blind spot on typed callback signatures —
  none exists, since its opener matches on the `it(`/`test(` call token
  itself, not the callback's own signature.
- 7960bff: Refactors `rec-20260725-007`: `settleService` (`packages/core/src/services/settle.ts`)
  was a single ~555-line function spanning at least 9 concerns — bypass-arg
  parsing, the phase-collision backstop, the mock-verifier banner, gate-loop
  handling, per-AC evidence derivation, the evidence-floor gate, the friction
  digest, recommendation ship-promotion, and the interactive GitHub-issue
  offer — distinguished only by inline `// Phase N` comments, not function
  boundaries. It is now decomposed into 9 named, private, top-level step
  functions (`loadSettlePreconditions`, `checkPhaseCollisionBackstop`,
  `resolveSettleGateSet`, `buildSettleContext`, `writeRefusedSettleSummary`,
  `deriveSettleAcResults`, `runAnomalyAndSkillAuditChecks`,
  `deriveEvidenceAndCheckFloor`, `finalizeAndCloseSettle`), with
  `settleService` itself reduced to a short, top-to-bottom orchestrator that
  calls them in sequence. This is a pure, behavior-preserving extraction — no
  logic, ordering, message text, or the `settleService`/`SettleArgs`/
  `CommandResult` public interface changed, and no test files were edited;
  the existing `settle*.test.ts` behavioral suites are unchanged and pass
  exactly as before (363/363 files, 3295/3295 tests in `cadence-core`).
- Updated dependencies [90e3ed9]
- Updated dependencies [127a06b]
- Updated dependencies [d7d4239]
  - @manehorizons/cadence-types@1.52.0

## 1.51.1

### Patch Changes

- e9f6556: Closes three confirmed CLI/MCP parity gaps in the Praxis-adjacent surfaces:

  - `cadence_recommendation_promote` (MCP) now accepts a `ref` argument and
    threads it into `shippedRef` exactly like the CLI's
    `recommendation promote --status=shipped --ref "<text>"` already does —
    previously the MCP tool silently dropped it. Also fixes a latent bug where
    a `status=shipped` promotion (which auto-archives by default) always
    returned `data: null` even on full success, because the lookup only
    checked the live `recommendations` array, not `archived`.
  - The "did this `milestone propose` run produce any newly-proposed
    milestones" predicate — previously copy-pasted as an identical literal
    expression in both `cli/commands/milestone.ts` and
    `services/milestone-propose.ts`, a duplication class that had already
    caused one whole-branch-review-caught drift bug — is now a single
    exported `hasNewlyProposedMilestone()` both call sites invoke.
  - `next`/`verify coverage`/`verify phase`/`explain` logic, which already had
    the right `(repoRoot, args, io) => CommandResult` service shape but lived
    in `cli/commands/` where the MCP surface couldn't reach it, is relocated
    into `services/{next,verify,explain}.ts`. The MCP server now registers
    `cadence_next`, `cadence_verify_coverage`, `cadence_verify_phase`, and
    `cadence_explain` (all read-only), with test coverage asserting output
    parity against their CLI counterparts. `docs/mcp.md` and
    `docs/reference/commands.md` are updated for the new tool count (18→22).

  No CLI-facing behavior, flags, or exit codes changed for any of the affected
  commands — this is a parity/dedup fix, not a rewrite.

- 655663e: Unify the five Praxis intelligence ledgers (recommendations, evidence,
  assumptions, decisions, milestones) onto one shared read/write/id-minting
  module (`intelligence/store/ledger.ts`) instead of five independently
  hand-rolled implementations, so a safeguard added for one subject — like
  phase 219's cross-ledger id-collision check, previously recommendations-only
  — now applies to all four minting subjects (recommendations, evidence,
  assumptions, decisions) instead of needing to be re-patched per subject.
  Each subject's existing read/write/mint function names and signatures are
  unchanged (thin wrappers over the shared primitives); bespoke per-subject
  logic (recommendation promotion/archive/unarchive, decision supersession)
  stays subject-specific rather than being forced into one generic shape.

  Also fixes a real gap this refactor surfaced: `milestones.json` was the only
  one of the five ledger files not written with `{ mode: 0o600 }`.

  `cadence intelligence audit`/`reconcile`/`stats` now include milestones as a
  fifth ledger: a new `orphan-milestone` finding kind catches a milestone
  referencing a recommendation id that no longer exists in either the live or
  archived recommendation arrays (a reference to a merely-archived, still
  `unarchive`-recoverable recommendation is correctly NOT flagged).

  `cadence recommendation/decision/assumption list`'s `--sort-by`/
  `--filter-regex`/`--filter-regex-flags` validation is now one shared
  pipeline instead of three independently maintained copies — behavior and
  error wording are unchanged.

  `cadence-types`, `cadence-host-claude-code`, and `cadence-host-codex` carry
  version-alignment bumps only; none of the three changed.

- e05922e: Fix `cadence recommendation add`'s id-minting to cross-check `evidence.json`
  (phase 219, rec-20260724-013). `nextRecommendationId` previously derived the
  next `rec-YYYYMMDD-NNN` id only from `recommendations.json`, so a dangling
  `evidence.json` row left behind by a bad rebase-conflict resolution or an
  interrupted `add` call — a `recommendationId` reference with no matching
  `recommendations.json` entry — could silently collide with a freshly minted
  id for an unrelated recommendation. The minted id is now guaranteed strictly
  greater than both the `recommendations.json` max and the max
  `recommendationId` referenced by `evidence.json` for the same date prefix.

  Also adds a new `orphaned-evidence` `cadence doctor` check that surfaces any
  `evidence.json` row whose `recommendationId` has no matching
  `recommendations.json` entry, naming the evidence id and the missing
  recommendation id — so this class of drift is caught immediately instead of
  surviving unnoticed.

  `cadence-types`, `cadence-host-claude-code`, and `cadence-host-codex` carry
  version-alignment bumps only; none of the three changed.

- 1f70e66: Extracts the logic host-claude-code and host-codex duplicated into a new
  shared package, `@manehorizons/cadence-host-toolkit`:

  - The hook-event routing algorithm's shape and the slash-command catalog
    (`COMMANDS`) now live in `host-toolkit/src/routing.ts`. Both adapters
    render their slash commands from this one catalog, which fixes a real
    drift bug: host-codex's local copy had silently lost `cadence-dispatch`'s
    `DISPATCH_DIALOGUE` body. Host-codex's own `mapEvent`/`extractPayload`/
    `routeHookEvent` stay local — its `apply_patch`-based extraction is
    genuinely different from host-claude-code's `file_path`-based extraction,
    not just duplicated; only the structurally-identical `RouteResult` type is
    shared.
  - `install.ts`'s managed-marker merge logic and `locate-self.ts` are also
    extracted into the toolkit, with one shared test suite; both adapters'
    own `install.ts`/`locate-self.ts` are now thin wrappers.
  - Core now enforces a new `HostCapabilities.agentIdentification` flag: a
    host that declares it cannot supply `agentId`/`agentType` (Codex, whose
    hook payload shape doesn't document one) causes core to notice loudly on
    stderr instead of silently behaving as if no subagent were involved.
    Codex's CLI now embeds its declared capabilities into the real hook
    payload it sends to `cadence hook`, so the check is live end-to-end, not
    just testable in isolation.

  No CLI-facing behavior, flags, or exit codes changed for either adapter —
  this is an internal dedup/extraction plus one new loud-notice-on-a-capability-
  gap fix, not a rewrite. `HostAdapter`'s public contract is unchanged.

- Updated dependencies [655663e]
- Updated dependencies [e05922e]
- Updated dependencies [1f70e66]
  - @manehorizons/cadence-types@1.51.1

## 1.51.0

### Minor Changes

- a24506d: Adds a `gates.evidenceFloor` gate that refuses `cadence settle run --auto` when any AC's `PASS` verdict rests on evidence ranked below a configured floor on the Phase 140 evidence ladder (`ai-verified` > `executed` > `assertion` > `mention` > `unverified`), closing the enforcement gap left when that ladder shipped visibility-only. Preset defaults: `solo` → `assertion`, `team` / `production` → `executed`; the schema-level default stays `mention` for back-compat. `ai-verified` is reachable only via an explicit config override — no preset defaults to it, since it is structurally unreachable while the active `deep-verify` provider is `mock`, and the refusal now names that specific reason instead of the generic below-floor message.

  A named, per-AC, reason-required bypass (`--evidence-floor-bypass <AC-id:reason>` on `settle run`) exempts exactly the named AC and is recorded in `SUMMARY.gateBypasses` — never a blanket, phase-wide bypass.

  Closes rec-20260724-001 (re-filed P0 from the 2026-07-24 external audit, enforcement half of the assurance-levels gap first raised in the v1.47.0 audit).

- 35379fe: Adds a `phase-freshness` check to `cadence doctor`: warns when the active phase/draft's `PROGRESS.json` has a task `updatedAt` within the last 10 minutes, naming the task and its age, with remediation to confirm no other session is actively working on the same phase/draft before continuing — closing rec-20260722-001.

  The freshness math lives in a new pure `assessProgressFreshness` (`packages/core/src/phases/liveness.ts`), following the existing `collision.ts` pure/impure split. Read-only and best-effort like the rest of `doctor`: no active phase/draft, or no `PROGRESS.json` yet, both degrade to `ok` rather than being treated as a problem.

- 2d8d5f8: Adds `cadence retro feedback`: matches recurring cross-phase retro friction (gate bypasses, rough task statuses, finding categories — from the phase 174/186 retro artifacts and rollup) to recommendations by `affectedAreas`/`affectedFiles` overlap, and records each match as an auditable, idempotent evidence entry. `cadence recommend`, `cadence context`, and `cadence next` all now factor linked friction evidence into a new transparent `frictionPts` scoring term (capped, weighted, additive — a recommendation with zero friction evidence scores identically to before), so recommendations tied to real recurring pain rank consistently higher across every command that ranks recommendations. Closes rec-20260712-003.
- 621f87f: Close the trust envelope: extend the MCP tool-trust enforcement added in phase 181 to `cadence_settle`. Phase 181 classified `cadence_settle` as capability class `SETTLE` and allowed `cadence mcp trust grant --tool cadence_settle` to succeed, but deliberately left the tool itself ungated — an MCP call to `cadence_settle` ran immediately with no trust check. It is now wrapped with the same trust-envelope pre-check as the two `APPROVAL_BYPASS` tools (`cadence_draft_approve`, `cadence_spec_approve`): a call with no valid, matching, unexpired grant is refused — naming the failing check — before `settleService` runs, so no `state.json`/`SUMMARY.{json,md}` write occurs and the loop position is unchanged. A valid grant, issued via `cadence mcp trust grant --tool cadence_settle` on a real terminal, lets the call proceed exactly as before. The shared enforcement function is renamed `enforceApprovalBypassGrant` → `enforceGatedToolGrant` to reflect that it now gates three tools, not two. Closes rec-20260724-005.

### Patch Changes

- 11bda6b: Clarifies the anthropic-provider mock-fallback warning (`verifier-factory.ts`) and its `cadence config explain` counterpart (`config-explain/build.ts`): both now state that being logged into Claude Code (or another IDE/host CLI session) does not satisfy the `anthropic` provider's `ANTHROPIC_API_KEY` requirement — it's a direct Anthropic SDK call needing a separately API-billed key, with no visibility into a host session's own credential store. Closes rec-20260723-001, surfaced by a real external consumer hitting silent mock-fallback with no obvious cause.

  `docs/providers.md`'s quoted warning sample is updated to match.

- 81b44fe: `cadence doctor`'s verification-readiness check and `cadence activate`'s key-missing message are now CLAUDECODE-aware: when the `anthropic` provider is selected, `ANTHROPIC_API_KEY` is missing, and the process is running inside a live Claude Code session (`CLAUDECODE=1`), both surfaces now name the Claude-Code-login-doesn't-satisfy-this confusion directly and proactively suggest `cadence activate --provider host-cli` as the way to reuse that session's own auth instead of a separate API key. Outside a Claude Code session (or for other providers), both surfaces are unchanged. Closes rec-20260723-003, sibling to the phase 209/210 work on the same underlying confusion.
- Updated dependencies [a24506d]
- Updated dependencies [621f87f]
  - @manehorizons/cadence-types@1.51.0

## 1.50.0

### Minor Changes

- 30cd195: Adds `cadence verify phase [phase] [num]` — a state-independent, phase-scoped re-derivation of whether a settled phase's recorded AC coverage still holds against the current working tree, using only the phase's committed `DRAFT.md` and `SUMMARY.json` (no active loop state required). The coverage rescan is scoped to the phase's own declared task files, closing a cross-phase `AC-N` token collision that an unscoped repo-wide scan would otherwise be vulnerable to. `--changed --base <ref>` discovers phases via `git diff` for CI use; the optional `verification.testCommand` re-run reports a separate, suite-wide (not per-AC) pass/fail signal.

  Adds `cadence init --ci`, which scaffolds a GitHub Actions workflow calling `cadence verify phase --changed` on every pull request, plus prints (never executes) a `gh api` recipe to make that check required on the default branch. Closes rec-20260709-003.

- 42deb4b: Adds `cadence next`, a read-only command that answers "what now?" deterministically from live loop state at any position — 1-3 ranked legal moves with exact commands, plus a stable `--json` contract (`{schemaVersion: 1, position, remainingTasks, blockedOn, legalMoves[]}`) for agent orchestrators. Sourced from an extended `nextAction()` (`packages/core/src/progress.ts`), which now also computes ranked `legalMoves[]` alongside its existing `{command, reason}` shape — strictly additive; `cadence progress` and `cadence quickstart` are unchanged. Closes rec-20260721-002.

  Registers `/cadence-next` as the 15th Claude Code slash command and the matching Codex prompt command (both host adapters share the `COMMAND_GUIDANCE` catalog in `@manehorizons/cadence-types`).

  Also narrows `cadence status --json` and `cadence quickstart --json`'s `next` field to `{command, reason}` explicitly — both were passing `nextAction()`'s full return through unnarrowed, so the new `legalMoves[]` array would otherwise have silently leaked into those two commands' existing public JSON contracts (mirrors the narrowing `cadence progress` already had).

- b2b8b6b: Empty-result and refusal messages across the intelligence-layer CLI surface (`cadence recommend`, `cadence milestone propose`, `cadence recommendation promote`/`convert`/`list`, `cadence retro`) now state why the result is empty, the concrete unmet precondition, the nearest-miss candidate from the already-loaded ledger, and the exact command that would change the outcome — closing rec-20260721-001.

  Adds a shared `findNearestCandidates` helper (`packages/core/src/intelligence/nearest-candidate.ts`, extracted from `cadence next`'s existing ranking logic with no behavior change) as the preferred mechanism for "nearest eligible candidate" lookups, so a message's suggestion never diverges from `cadence recommend`/`cadence next`'s own ranking. `cadence milestone propose` gets this enrichment on both the CLI and the MCP-tool (`cadence_milestone_propose`) surfaces, keyed on "zero milestones newly proposed this run" rather than "the ledger is empty" so it still fires correctly when older accepted/deferred/exported milestones already exist. `cadence recommendation` not-found errors (5 near-duplicate sites) are consolidated behind one message builder with a nearest-ID suggestion; its 7 promote/convert status-refusal sites now append the exact unblocking command to their existing status text. `cadence retro` now distinguishes "no settled phases yet" from "phases scanned, zero friction found" instead of one ambiguous message for both.

  `docs/concepts.md` documents the four-part invariant (why / precondition / nearest candidates / exact command) as the guidance bar for future intelligence-layer commands.

- a09ee46: Adds `cadence milestone reopen <id>`, a CLI transition that moves a `deferred` milestone back to `proposed` so its claimed recommendations become eligible for re-clustering again. Previously `applyTransition()` had no path out of `deferred` — `clusterMilestones()` treats any non-`proposed` milestone as a permanent survivor and permanently excludes its claimed `recommendationId`s, so a deferred milestone stayed stuck forever with no CLI recourse short of hand-editing `milestones.json`. `reopen` refuses loudly (exit 1, no state mutation) if the milestone isn't currently `deferred` (naming its current status), the id doesn't exist, or the milestone's claimed recommendation(s) collide with another still-live (non-`deferred`/non-`proposed`) milestone.
- 6e774d5: Adds an opt-in `<id>-UI-SPEC.md` artifact, sibling to the existing pre-DRAFT `SPEC.md`, for a phase that touches UI surfaces. `cadence spec new --ui` scaffolds it with a fixed shape — per-component `Layout & Tokens` and `Precedent References` nested under each `### <Component>`, plus a whole-slice `Responsive & Interaction` section — so a design contract can be locked down before DRAFT tasks are written, closing rec-20260711-004.

  `cadence spec approve` runs a new convergent `ui-spec-review` gate after the existing `spec-review` gate, only when a sibling UI-SPEC is present: same `nextConvergence` primitive, its own `<id>-UI-SPEC-REVIEW.json` sidecar, its own unconditional `ui-spec-review-unconverged` anomaly, and its own independent `--allow-ui-spec-review-failure` bypass flag. `cadence draft new` seeds an approved UI-SPEC's content into a new `## UI Contract` DRAFT section (bold-text rendering, no nested headings) between Acceptance Criteria and Tasks.

  No new loop position and no `state.json` schema change — opt-in purely by the UI-SPEC file's own presence, the same pattern the SPEC stage itself uses. The new `uiSpecReview` config key is wired into `cadence config explain` and `cadence activate` alongside the other six provider blocks.

### Patch Changes

- Updated dependencies [42deb4b]
- Updated dependencies [6e774d5]
  - @manehorizons/cadence-types@1.50.0

## 1.49.0

### Minor Changes

- e0b7f44: Adds `cadence summary render <phase> <num>`, a read-only CLI command that reads a settled phase's `<id>-SUMMARY.json`, validates it against the `SummaryZ` schema, and prints a deterministic Markdown rendering (per-AC pass/fail with evidence level, per-task status, gate outcomes, gate bypasses, decisions, deferred items — empty sections omitted entirely) suitable for pasting into a PR description or comment. Refuses loudly with a distinct stderr message and non-zero exit for each of three failure modes (missing file, invalid JSON, schema-validation failure) rather than crashing or printing a partial render. Adds `docs/team-rollout.md`, a guide for adopting CADENCE across a team in PR review without replacing existing CI or human review.

## 1.48.0

### Minor Changes

- 60b7b5a: Adds a CLI writer for a milestone's operator-authored pre-mortem fields (closes rec-20260714-001): `cadence milestone premortem <id>` now accepts repeatable `--add-out-of-scope <text...>`, `--add-likely-failure-mode <text...>`, and `--add-hidden-dependency <text...>` options that append operator-authored text without hand-editing `.cadence/intelligence/milestones.json`. Each value is refused (non-zero exit, clear stderr, nothing written) if empty or whitespace-only after trimming. Operator-authored `likelyFailureModes`/`hiddenDependencies` entries now survive a later plain `cadence milestone premortem <id>` refresh alongside the freshly-derived deterministic entries, mirroring the guarantee `outOfScope` already had. All operator-supplied text is newline-collapsed to a single line before being stored, matching how every other pre-mortem entry in the ledger is normalized (a raw embedded newline would otherwise break `MILESTONES.md`'s one-bullet-per-entry rendering).
- 7cc606d: Adds `cadence recommendation evidence add <recId> --note <text>`, a tied-record writer that appends a new evidence note to an _existing_ recommendation and links it into the recommendation's `evidenceIds`. Previously the only way to attach evidence after a recommendation's creation was a manual hand-edit of `evidence.json` and `recommendations.json` in lockstep — `cadence intelligence reconcile` does not help here, since `deriveRecommendationLinks` only re-derives `assumptionIds`/`decisionIds` from the assumption/decision ledgers, never `evidenceIds` from the evidence ledger, so a hand-added evidence entry silently would not show up in `cadence recommendation show` until `evidenceIds` was also hand-edited. The new command writes both ledger files atomically in one call, redacts secret-shaped substrings in the note the same way `recommendation add --evidence` does, and refuses cleanly (no ledger mutation) on an unknown recommendation id.
- ac6722c: Fixes `.cadence/state.json`/`STATE.md` tracked-file cross-worktree merge conflicts (#177): `cadence init` now gitignores the four CADENCE-owned ephemeral paths (`state.json`, `STATE.md`, `mcp-trust.json`, `intelligence/context/`) by default, and `cadence doctor`/`cadence doctor --fix` gain a `state-tracked` check + `untrack-state` auto-repair to migrate existing repos (this repo included). The audit-trail value a tracked `state.json` used to carry incidentally now lives in a new `stateAtSettle` field on `SUMMARY.json`/`SUMMARY.md`, captured immediately before each settle resets the loop to `IDLE`. `cadence doctor` also diagnoses an unresolved git conflict in `state.json` with a field-by-field local/incoming diff instead of a bare JSON-parse error, and `cadence doctor --fix --resolve-state-conflict=local|incoming` writes the chosen side through the normal state-commit path. Any command that hits a corrupted `state.json` now prints a pointer to `cadence doctor --fix` instead of a bare error. `docs/concepts.md`, `CLAUDE.md`, and `docs/reference/commands.md` are updated to describe the new convention.

### Patch Changes

- 7a9098a: Fixes a ReDoS-shaped regex-injection risk (#249, CodeQL) in `cadence assumption list`, `cadence decision list`, and `cadence recommendation list`: `--filter-regex` values were compiled directly with `new RegExp(...)` with no bound on pattern length, so a pathologically long attacker- or script-supplied pattern could hang the process. Each command now rejects patterns longer than 200 characters with a clear `<command> list failed: --filter-regex pattern is too long: ...` stderr message and non-zero exit, before `new RegExp` is ever called — legitimate, previously-accepted patterns (well under the cap) are unaffected. The guard is duplicated per-command rather than factored into a shared helper, matching this codebase's existing `parseRegexFlags` precedent. `--filter-regex`'s `--help` text and `docs/reference/commands.md` are updated to document the length limit.
- 9dd68f8: Fixes `cadence onboard` silently no-op'ing on a `.cadence/` dir with a missing `state.json` (#177 fallout from phase 196's `state.json`/`STATE.md` gitignoring): a fresh `git worktree` or a fresh clone of a repo with `.cadence/` already committed has no `state.json` yet, but `onboard` — the command built exactly for "a repo that already has `.cadence/` committed" — previously read it for the project name, fell back to `"unnamed"` on the missing file, and never wrote one, leaving every subsequent state-reading command (`cadence progress`, etc.) throw `NotInitializedError` right after `onboard` reported success. `onboard` now bootstraps a fresh `state.json` (`loopPosition: IDLE`, no active phase/draft/task, `revision: 0`) whenever one is missing, deriving the project name from `.cadence/PROJECT.md`'s header rather than `package.json` (which can disagree with the recorded project name in a monorepo), and prints a loud stderr notice when it does. An existing `state.json` is left completely untouched. `cadence doctor`'s missing-`state.json` diagnostic now names `cadence onboard` as the fix instead of advice that no longer worked (`cadence init` correctly refuses on an already-`.cadence/`-committed repo). `docs/reference/commands.md`'s `onboard` behavior section is updated to describe both the bootstrap and pass-through paths.
- 2acd4c0: Fixes a bug (#248) where `cadence recommendation add` could reuse an already-issued recommendation ID once every recommendation created on a given day had been archived (e.g. shipped). `nextRecommendationId` only scanned the active `recommendations` array for the highest existing same-day sequence number, never the `archived` bucket — once the active array had no same-day entries left, the counter reset to `001` and collided with the first ID issued that day, even though that ID remained in permanent use elsewhere (evidence, assumptions, decisions, milestone links, commit messages, DRAFT files). New recommendation IDs are now guaranteed unique across a project's full history, not just among currently-active entries.
- 14c7336: Adds a `task-verify-required` settle gate that refuses `cadence settle run` when a task is marked DONE but its DRAFT `- verify:` line was empty or omitted — previously `draft-parser.ts` silently defaulted a missing line to `''` and SUMMARY.md recorded a bare `TN: DONE` with zero evidence (#206). The gate fires in `standard`/`complex` tiers across `strict`/`standard`/`auto` profiles; `quick-fix` is deliberately exempt. The refusal names every offending task id and points at the missing verify line, following this repo's refuse-and-suggest house style — it never mutates the DRAFT or task status. `docs/concepts.md` and `cadence explain gates` are updated for the new 14-gate total.

## 1.47.0

### Minor Changes

- a786395: `cadence dispatch plan` gave no per-task signal about whether a dispatched task should run in its own isolated worktree — isolation was decided purely by human/skill-level convention, with no backing in the dispatch plan itself. Per rec-20260718-002 (from the same 2026-07-18 incident that motivated the dispatch-packet action-class prohibitions), every task in a dispatch plan now carries a `recommendedIsolation` value of `'worktree'` or `'none'`: `'worktree'` when the task declares one or more `files:` (it will mutate the working tree), `'none'` when it declares none (read-only/no mutation expected). This is surfaced both as a new `recommendedIsolation` field in `cadence dispatch plan --json`'s per-task output and as an advisory line in the rendered packet text itself — purely additive, no `Task`/`Draft` schema change, and no enforcement mechanism.

### Patch Changes

- 3b03250: `cadence dispatch plan`'s rendered packet (`renderPacket`) previously told the dispatched implementation agent to self-record its own outcome via `cadence build task <id> --status=...` — the only thing scoping its behavior was a `files:` boundary. A real incident (2026-07-18) showed the gap: a dispatched fork agent overran its scoped task, ran `cadence build`/`cadence settle` and `git commit` directly against `main` four times, self-authorized without the orchestrator's review. Every rendered packet now includes a mandatory prohibition block forbidding state-mutating `cadence` subcommands (`cadence build`, `cadence settle`, etc.), `git commit`/`git push`, `gh`/network actions, and invoking `AskUserQuestion` — the dispatched agent must stop and report to the orchestrating session once its verify condition is met (or it's blocked); the orchestrator alone records the task outcome.
- 57eb46b: Fixes `cadence settle run` deterministically failing with `StateConflictError` whenever a `host-cli` verifier gate (whose subprocess can run for minutes) overlapped another subagent's `SubagentStop` hook — the hook's telemetry-only `session.subagentSpawns += 1` was routed through the same revision-guarded `SimpleStateBackend.commit()` as structural writes, so every spawn bump invalidated any other command's in-flight snapshot and the failure never converged on retry (#234). `StateBackend` gains `bumpSessionCounter()`, a write path scoped to purely-informational `session` counters that never compares to or bumps the optimistic-concurrency `revision` field; `handleSubagentResult()`'s telemetry-only branch now uses it. Structural commits (loop position, tasks, drafts, decisions, subagent baselines) keep the exact same revision-guarded conflict behavior as before.

## 1.46.0

### Minor Changes

- 7c5f4ff: Add `cadence onboard`, a one-command setup for the 2nd-Nth teammate cloning a repo that already has `.cadence/` committed: it installs host hooks (reusing `cadence init`'s host-wire logic, now shared via `init/host-wire.ts`), reports the existing project's name and gate profile, and reports provider/API-key readiness — without re-scaffolding `.cadence/config.json` or `state.json`. Refuses cleanly with a pointer to `cadence init` when no `.cadence/` is present. `cadence init` now also seeds a managed `CONTRIBUTING.md` block pointing new contributors at `cadence onboard`, so the path is discoverable. Fulfils rec-20260709-005.
- 3e9319e: Add `cadence retro`, a read-only cross-phase rollup over every settled phase's post-settle retro artifact (`.cadence/phases/*/*-RETRO.json`). It aggregates gate-bypass names, rough-task statuses, and code-review/security-audit/boundary-scan finding categories across all scanned phases, splitting each dimension into a **recurring** bucket (2+ phases) and a **one-off** bucket (exactly 1 phase) so friction that keeps showing up isn't buried under single-occurrence noise. Supports `--format terminal|json` (default `terminal`), mirroring `cadence intelligence stats`'s format-flag and exit-code conventions; never writes to `state.json`, `STATE.md`, or any phase artifact. `@manehorizons/cadence-types` gains additive `RetroRollupZ`, `PhaseRetroEntryZ`, `RetroFrequencyEntryZ`, and `RetroFrequencyBucketsZ` schemas (and their inferred types) backing the rollup shape. Fulfils rec-20260712-002.
- 499558f: `cadence doctor --fix` now auto-remediates the `handoff-retention` check: when `handoff.retain` is unset and the `.cadence/handoff/` SESSION-doc archive has grown past the existing warn threshold, `--fix` sets `handoff.retain` to the default (10) and immediately prunes the archive down to that budget, reusing the existing `pruneHandoffDir`/`selectPrunable` retention primitives and always preserving the active `lastHandoff` doc. Previously this check only printed guidance. Fulfils a narrowed slice of rec-20260709-002; the other manual doctor checks (`worktree-phases`, `verification-readiness`, `recommendation-shipped-drift`, `coverage-mode-language-support`) remain manual since each requires a genuine judgment call `--fix` cannot safely auto-decide.
- eecc525: Wire a real `hostCli` builder into the 5 verifier families phase 165 left unwired: `spec-review`, `plan-review`, `code-review`, `security-audit`, and deep-verify (`Verifier`). Only `per-task` (phase 165 T7) had a working `host-cli` provider — every other family with `provider: "host-cli"` set in `.cadence/config.json` was silently falling back to `mock` (a deterministic placeholder, not real verification) regardless of config, since `createVerifierFactory`'s generic `host-cli` dispatch only activates when a family supplies a `hostCli()` builder. Adds `HostCliSpecReviewVerifier`, `HostCliPlanReviewVerifier`, `HostCliCodeReviewVerifier`, `HostCliSecurityAuditVerifier`, and `HostCliVerifier`, each spawning the configured host CLI (`claude`/`codex`) headlessly via the existing `hostCliJSON` transport — same pattern as `HostCliPerTaskVerifier`, no new dependency. `cadence doctor`'s verification-readiness claim for the `verifier` seam ("deep-verify uses host-cli with credentials present") is now actually true instead of coincidentally true.
- 749fd2d: Add `cadence init --full`, a one-command full setup that composes the existing `--wire-host`, `--demo`, and `--activate` flags: when their preconditions are met it wires the detected host with no prompt, seeds the `01-demo` phase, and activates real verification when `ANTHROPIC_API_KEY` is present — printing one consolidated "Full setup summary" (done/skipped-with-reason per feature) in addition to the existing per-feature messages. Any explicitly-passed flag, including `--skip-host-wire`, still overrides its `--full`-implied default. Bare `cadence init` with no flags is unchanged. Fulfils rec-20260709-001.

### Patch Changes

- 42dc58f: Fix `--allow-auto-complex` soft-cap overrides being invisible in `SUMMARY.json` and the real-time anomaly-notify transport. Settling a phase under the auto×complex soft cap with `--allow-auto-complex` now records a `{ gate: 'soft-cap', flag: '--allow-auto-complex', severity: 'warn' }` entry in `SUMMARY.json`'s `gateBypasses`, and `cadence draft approve --allow-auto-complex` now emits a new `auto-complex-override` `AnomalyEvent` through the anomaly-notify transport (mirroring `coherence-warn`) when the `anomaly-notify` gate is active. `@manehorizons/cadence-types` gains the additive `'auto-complex-override'` value on `AnomalyTypeZ`.
- Updated dependencies [3e9319e]
- Updated dependencies [42dc58f]
  - @manehorizons/cadence-types@1.46.0

## 1.45.0

### Minor Changes

- 90364bb: Add an MCP tool-trust envelope constraining `cadence_draft_approve` and `cadence_spec_approve` — the two MCP tools where the tool call itself previously acted as the approval, with no expiry, capability scope, or revoke logic. Each of the 18 registered MCP tools is now tagged with a `capabilityClass` (`READ_ONLY` | `LEDGER_WRITE` | `LOOP_WRITE` | `APPROVAL_BYPASS` | `SETTLE`); the two `APPROVAL_BYPASS` tools now refuse (naming the failing check, before any `state.json` write) unless the caller holds a trust grant that matches the tool's live structural def-hash (name + description + inputSchema), was issued for the running CADENCE version, and has not expired. Grants are issued exclusively via a new CLI-only command family — `cadence mcp trust grant --tool <name> [--ttl-days <n>]`, `cadence mcp trust revoke --tool <name>`, `cadence mcp trust list` — never reachable from any MCP tool call, so an MCP client can never self-grant approval-bypass trust. Grants are stored in a new operator/machine-local `.cadence/mcp-trust.json` ledger (gitignored, not shared repo state like `state.json`). `cadence_settle` is classified `SETTLE` but deliberately left ungated this phase. See `docs/concepts.md`'s new "MCP tool-trust envelope" section and `docs/reference/commands.md`'s `mcp trust` entries for full detail.
- 424aa8c: Add `cadence milestone status <id>`, a read-only reconciliation command that maps a milestone's converted recommendations to their phases, resolves each phase's owning worktree (local or sibling) via `gatherHandoffCandidates`, and reports that worktree's live loop position — replacing N manual `cadence status` round-trips with one. Recommendations not yet converted to a phase, and converted phases with no matching worktree, are reported (as `not-yet-converted`/`no-worktree-found`) rather than dropped. Supports `--json`; refuses with exit 1 for an unknown milestone id, matching the existing `accept`/`defer`/`close` refusal shape. Never writes to any ledger, `state.json`, or worktree.

### Patch Changes

- 5b426dd: Thread an optional `{ signal?: AbortSignal; traceId?: string }` through the verifier call path so long verifier runs can be cancelled cleanly and correlated via a trace id in logs. `host-cli-client.ts`'s headless-CLI subprocess spawn now honors an external `AbortSignal` (killing the child and rejecting with a new `HostCliError` reason `'aborted'`, distinct from the existing `'timeout'`) alongside its existing internal spawn-timeout timer. `Verifier.verify` and `SecurityAuditVerifier.verify` both gain the same optional second parameter — `LocalVerifier`/`LocalSecurityAuditVerifier` forward `signal` into the underlying `fetch`/`localChatJSON` call, `AnthropicSecurityAuditVerifier` forwards `signal` into the Anthropic SDK's request options, and `MockVerifier`/`MockSecurityAuditVerifier` accept-and-ignore it. The `security-audit` gate now generates a fresh per-run trace id and passes it through end-to-end as a concrete proof the plumbing is connected, not just added-and-unused. Purely additive: every existing call site that omits the new parameter keeps compiling and behaving exactly as before. `local-client.ts`'s network-error handling now also preserves the original error via `{ cause }` and includes its name in the message, so an aborted call can be told apart from a genuine network failure. Scoped to `packages/core/src/gates` + `security-audit.ts`'s verifier hierarchy per rec-20260712-010; the same pattern is left for a future phase to apply to `PerTaskVerifier`/`CodeReviewVerifier`/`PlanReviewVerifier`/`SpecReviewVerifier`.
- 462f239: Harden the `host-cli` verifier provider against three risks: invisible consumption of the host CLI's own subscription/usage quota during verification calls, an unguarded self-invocation path when `cadence` itself is already running inside the same host CLI it would spawn, and a subprocess hang when the spawned process never exits. `hostCliJSON` now emits a one-time-per-process stderr notice on the first real spawn (never on provider selection alone); refuses to spawn — falling back to `mock` via the existing per-call fallback path — when the `claude` family's session env var (`CLAUDECODE=1`) indicates cadence is already running inside a headless `claude` session (`codex` has no reliable documented equivalent and is left unguarded); and bounds the spawn with a configurable `CADENCE_HOST_CLI_TIMEOUT_MS` timeout (default 3 minutes) that kills a hung subprocess and rejects with a new `HostCliError(reason: 'timeout')` instead of hanging forever. See `docs/providers.md`'s `host-cli` section for full operator-facing detail, including the consequence that `host-cli` calls always fall back to `mock` when `cadence` runs from inside a Claude Code terminal, hook, or Bash tool call.
- c8b197a: Redact secrets/credentials from persisted intelligence-ledger and security-audit output. `Evidence.summary` (free-text quotes attached via `addRecommendation`'s `evidenceSummary`) and `security-audit` gate `Finding.message` (both `SUMMARY.securityAudit` and the per-critical stderr log) now pass through a new `redactSecrets` utility before being written, replacing AWS access keys, GitHub tokens, bearer/basic Authorization header values, JWT-shaped strings, PEM private-key blocks, and generic `key=`/`token=`/`password=`/`secret=` assignments with `[REDACTED]`. The four intelligence ledger JSON files (`recommendations.json`, `evidence.json`, `assumptions.json`, `decisions.json`) are now also written with `0o600` (owner-only) file permissions, applied atomically at file-creation time rather than via a create-then-chmod race.
- Updated dependencies [90364bb]
  - @manehorizons/cadence-types@1.45.0

## 1.44.1

### Patch Changes

- Fix a gate implementation's thrown exception escaping uncaught out of `runSettleGates` to `settle.ts`'s outer catch, which printed to stderr and exited 1 with no `SUMMARY` written — `security-audit` was previously the sole gate normalizing its own throws into a `refuse` outcome. The gate invocation in `runSettleGates` is now wrapped centrally, so any of the other 8 gates throwing produces the same synthesized `{outcome: 'refuse', reason}` plus a `'refused'` provenance entry, flowing through the existing refusal path that persists `SUMMARY.json`/`SUMMARY.md` and leaves loop state untouched. Closes `rec-20260712-007`.
- e38d86a: Add optimistic concurrency to `SimpleStateBackend.commit()` to prevent lost updates when two `cadence` state writers (CLI commands, hooks, or the MCP server) race on `.cadence/state.json` in the same checkout — the actual failure mode behind a recent incident where two concurrent Claude Code sessions in one primary checkout stomped each other's uncommitted work. `CadenceState` gains a `revision: number` field (additive, `.default(0)`, back-compat with pre-existing `state.json` files). `commit()` now compares the current on-disk revision to the caller's in-memory `state.revision` before writing: a match bumps it in place and writes as before; a mismatch refuses with a new `StateConflictError` (naming both revisions) instead of silently overwriting the other writer's change, unless the new `{ force: true }` option is passed (which overwrites unconditionally and warns loudly to stderr). A bootstrap write (no existing `state.json`) skips the check entirely. The in-place revision bump means a caller issuing several sequential `commit()` calls on the same in-memory object — e.g. a hook handler with two independent write branches — stays in sync automatically without re-reading between calls.
- 6fc52bd: Add a post-settle retro artifact and an interactive GitHub issue offer (rec-20260712-001). On every successful `cadence settle`, a friction digest — gate bypasses, tasks whose terminal status wasn't a clean `DONE`, and any code-review/security-audit/boundary-scan findings — is synthesized purely from the SUMMARY data already assembled and written as `<draftId>-RETRO.json`/`.md` alongside `SUMMARY.json`/`.md` (a clean settle writes a "No friction detected this settle." form). `@manehorizons/cadence-types` gains an additive `RetroDigest`/`RetroDigestZ` schema and a `retro: { enabled, offerGithubIssue }` config block (both default `true`, same shape convention as the existing `recommendations` block). When the digest is non-empty and the run is interactive (a real TTY, or the `CADENCE_PROMPTER_SCRIPT` test seam), settle also offers to file a GitHub issue for it via `gh` — resolving and naming the actual target repo before asking (`gh repo view`), creating the issue non-interactively with an explicit `--repo`, then best-effort labeling it `needs-triage` in a separate call so a repo without that label can't fail issue creation outright. The offer runs strictly _after_ the loop's state commit, never before, so an open prompt can never strand the loop mid-`BUILD`. A duplicated prompter-factory closure (previously independent copies in `settle.ts` and `handoff/run-resume.ts`) was consolidated into one shared `createDefaultPrompter()` in `verify/prompter.ts` as part of this work — see that function's doc comment for a documented, narrow known limitation around scripted settle runs that fire both the interactive-verdict gate and a friction-having retro offer in the same process.
- c5cd4b0: Fix a refusing settle gate silently dropping out of `gates` provenance and a refused `settle run` writing no `SUMMARY` at all — previously the only trace of a refusal was an ephemeral stderr line. `GateProvenanceZ.status` gains a `'refused'` value plus an optional `reason` string (additive, back-compat with pre-existing `ran`/`skipped` records); all 9 settle-dispatched gates (`draft-read`, `structural-verifier`, `boundary-scan`, `build-test-must-pass`, `test-coverage`, `interactive-verdict`, `deep-verify`, `code-review`, `security-audit`) now attach `reason` matching their stderr text on refusal, and `runSettleGates` pushes the refusing gate's entry onto `gates` before halting. A refused `cadence settle run` now persists `SUMMARY.{json,md}` (populated `gates` through the refusing entry, real `taskResults`, empty `acResults`/`decisions`/`deferred`) without transitioning `loopPosition`/`activeDraft`, so the loop stays exactly where a human can retry.
- Updated dependencies [e38d86a]
- Updated dependencies [6fc52bd]
- Updated dependencies [c5cd4b0]
  - @manehorizons/cadence-types@1.44.1

## 1.44.0

### Minor Changes

- e3179cf: Add real assertion-mode test-coverage span parsing for Python, Go, Rust, and PHP (previously js/ts only), plus an operator-extensible escape hatch for any other language.
  - A shared, profile-parameterized scanning engine (`packages/core/src/verify/coverage-profiles/`) replaces the old hardcoded JS/TS-only scanner. Four block-boundary strategies — call-expression, brace-delimited, indentation-delimited, and do-end-keyword — cover every built-in profile and remain available to custom ones.
  - Five built-in language profiles ship: js/ts (re-expressed, byte-identical behavior to before), python (pytest-style, including `async def`), go (`func TestX(t *testing.T)`, table-driven tests, testify), rust (`#[test]`/`#[should_panic]`, unbounded raw strings), and php (both Pest closures and PHPUnit methods, including heredoc/nowdoc-safe masking).
  - `verification.coverageProfiles` lets an operator define a custom profile (opener/assertion patterns, comment/string syntax, block strategy) for any language with no built-in support — validated at config-load time with refuse+suggest diagnostics; custom profiles are add-only and cannot override a built-in's extensions.
  - `cadence verify coverage --explain AC-N [--json]` is a new read-only diagnostic: which files matched, which profile scanned each one, every span found, and why each did or didn't satisfy assertion mode.
  - Per-file dispatch is wired into the real `test-coverage` gate (`scanTestCoverage`) — assertion mode now genuinely works end-to-end for all five built-in languages, not just in isolation. The gate's refusal messages are language-neutral and point at the new `--explain` diagnostic. `cadence init`'s default `verification.testGlobs` for rust now also includes `src/**/*.rs`, since idiomatic Rust unit tests commonly live inline in a `#[cfg(test)] mod tests { ... }` block. `cadence doctor`'s coverage-mode language-support check now reflects the live profile registry instead of a hardcoded js-only list.
  - The false-positive-averse invariant holds throughout: an unrecognized shape always yields zero spans, never a partial or fabricated match. This required closing several real gaps found during review — opener-pattern spoofing via comments, strings, and nested parenthesized sub-expressions (go); an unbounded-hash raw-string masking gap (rust); a standalone-heredoc fabricated-span gap (php); and a cross-process custom-profile collision-shadowing gap (`verification.coverageProfiles`).

### Patch Changes

- a5b21ec: Fix `cadence init` defaulting `verification.coverageMode` to `'assertion'` for every project regardless of language, which made the `test-coverage` gate permanently unsatisfiable for non-JS/TS projects (the assertion-mode span-finder only recognizes JS/TS `it()`/`test()` syntax).
  - `cadence init` now detects the project's language from root marker files (`package.json`→js/ts, `pyproject.toml`/`setup.py`/`requirements.txt`→python, `go.mod`→go, `Cargo.toml`→rust, `composer.json`→php) and only defaults `coverageMode` to `'assertion'` when the detected language is js/ts; every other detected or unknown language defaults to `'mention'` instead, with a stderr notice explaining why. Existing `.cadence/config.json` files are never rewritten.
  - Default `verification.testGlobs` are now language-aware too, so `mention`-mode coverage checking can actually discover test files in non-JS projects (python: `**/test_*.py`, `**/*_test.py`; go: `**/*_test.go`; rust: `tests/**/*.rs`, `**/*_test.rs`; php: `**/*Test.php`, `tests/**/*.php`).
  - The `test-coverage` gate's assertion-mode refusal message now distinguishes its causes accurately: no test file matched the configured globs at all, vs. files matched but no test references the AC, vs. files matched and reference the AC but not inside an asserting `it()`/`test()` block — each with its own suggested fix.
  - `cadence doctor` (and the MCP `doctor` tool) now warns when `coverageMode: 'assertion'` is paired with a detected project language that has no assertion-mode parsing support yet, suggesting `cadence config edit coverageMode`.

  This does not add real assertion-mode test-span parsing for Python/Go/Rust/PHP — only js/ts has that today. It closes the "permanently unsatisfiable gate" failure mode for every language by making the defaults and diagnostics honest.

- 8bf3135: Fix `test-coverage` gate in `assertion` coverage mode wrongly treating an AC whose only linked test sits inside a `test.skip`/`.todo`/`.failing` block as fully covered, even when the block contains an intact assertion. Previously `cadence settle run --auto` would settle clean (exit 0) on a skipped test; the gate now refuses with a distinct message ("AC-N's only linked test is skipped") separate from the existing "no linked test" and "mentioned but not asserting" refusals, naming the fix (unskip the test or replace it with a running asserting block) rather than suggesting an unrelated `coverageMode` switch.

  `findTestSpans` now flags `skip`/`todo`/`failing` openers as non-asserting spans (`only`/`concurrent` are unaffected, since those execute normally); `scanTestCoverage` propagates this through a new `skipped` flag on each test reference, and a new `skippedOnlyLinkedAcs` export is mutually exclusive with the existing `weaklyLinkedAcs` — an AC only lands in the new bucket when every one of its non-qualifying references is skip-caused. `mention`-mode coverage is unaffected.

- Updated dependencies [a5b21ec]
- Updated dependencies [e3179cf]
- Updated dependencies [8bf3135]
  - @manehorizons/cadence-types@1.44.0

## 1.43.0

### Minor Changes

- Enable `cadence init` to prepare a repo for Codex on the first run, so a new
  user starting Codex can immediately use Cadence commands without manually
  discovering extra adapter setup steps.
  - `cadence init --host codex` (with `--agents-md`) now wires host hooks,
    generates the project-level `AGENTS.md` guidance, and flows through the
    same init path as Claude Code — previously Codex setup only installed
    adapter hooks/prompts and skipped `AGENTS.md` generation.
  - `cadence doctor` gained Codex readiness checks (hooks, prompts,
    `AGENTS.md`, global command availability), each with an opt-in `doctor
--fix` remediation.
  - Codex/quickstart/CLI docs point first-time users at `cadence init --host
codex` instead of adapter-only setup.

- d502562: Harden handoff/resume against two gaps ground-truth discovery didn't cover:
  a handoff that's stale relative to origin, and a handoff whose narrative was
  never finished.
  - `cadence resume` now runs a best-effort origin-freshness probe before
    replaying a doc (config `resume.remoteCheck`, default `true`; `--offline`
    to skip) and warns when origin has commits this clone lacks, since a
    stale handoff can be superseded by work pushed from another machine.
  - `cadence resume` and `cadence handoff --check` (new) both detect
    scaffolded `<!-- … FILL IN … -->` sections left unfilled by a prior
    session and flag them — `resume` as a warning, `handoff --check` as an
    exit-3 completion gate.
  - `cadence handoff --no-fetch` skips the pre-facts `git fetch` for a fully
    offline write; `git-facts` records whether the fetch actually ran.
  - The Claude Code `/cadence-handoff` and `/cadence-resume` slash-command
    guidance text is updated to teach agents the new gate and banner.

- 1351044: Add `host-cli`, a 4th verifier provider that shells out to your already-authenticated `claude`/`codex` CLI in headless mode instead of requiring a separate `ANTHROPIC_API_KEY`.
  - New provider value `'host-cli'` on every provider config slice (`verifier`, `perTaskVerifier`, `codeReview`, `planReview`, `securityAudit`, `specReview`), plus `cadence activate --provider host-cli` and `cadence settle run --verifier host-cli`. Binary discovery defaults to `claude` on PATH, overridable via `CADENCE_HOST_CLI_BIN`.
  - If the configured binary is missing or the CLI reports an auth/exit failure, verification for that call transparently falls back to `mock` with a loud stderr warning — never silent, never a hang waiting on interactive auth.
  - **Current scope**: only the per-task-verify family (the BUILD-phase task verifier) has a real `host-cli`-backed implementation in this release. The other verifier families (deep-verify, code-review, spec-review, plan-review, security-audit) accept the config value but currently fall back to mock with a warning until they're wired in a follow-up. `cadence doctor`/`cadence activate` report `host-cli` readiness from config well-formedness alone (no required credential, by design) — not a live probe of the binary; that's only discovered lazily on the first real verification call. See `docs/providers.md` for the full picture, including a known no-spawn-timeout gap.
  - The JSON-extraction + schema-repair-retry logic previously private to the `local` provider is now a shared, transport-agnostic module (`json-repair.ts`) reused by both `local` and `host-cli`.

- bef364d: Make verifier activation trustworthy: broader key discovery, a real
  activation smoke test, and committed provider config that actually reaches
  every real call site.
  - A verifier API key is now discovered from a `.env` file at the repo root
    when it isn't exported into the process environment (`discoverKey`),
    closing the gap where a legitimately-available key was invisible to
    `cadence activate`/`cadence doctor` unless manually `export`ed.
  - `cadence activate`'s live provider check is no longer coincidentally
    skippable — when a key is discovered and the provider isn't `mock`, the
    smoke test runs and its outcome (not mere key presence) gates whether
    activation is reported as successful. `--no-check` remains the only
    explicit opt-out.
  - The discovered-key path now reaches every real verifier-selection call
    site (`cadence doctor`, `cadence settle run`'s deep-verify/code-review/
    security-audit seams, the draft/build gates, `cadence spec approve`), not
    just the primitives — including `cadence mcp serve --repo <path>`, where
    the server process's own working directory can differ from the repo being
    operated on. A teammate who never ran `cadence activate` locally, but
    whose key is discoverable and whose repo already commits a real provider
    choice, now gets real verification instead of a silent mock fallback.

### Patch Changes

- Updated dependencies
- Updated dependencies [d502562]
- Updated dependencies [1351044]
- Updated dependencies [bef364d]
  - @manehorizons/cadence-types@1.43.0

## 1.42.0

### Minor Changes

- Add `boundaryEnforcement: 'warn' | 'block'` (default `warn`, back-compat), overridable per-phase via DRAFT frontmatter. In `block` mode, `handlePreToolEdit` refuses an out-of-boundary edit at edit time instead of only warning. Fails open (never blocks) when there's no active draft/phase, or when the active draft declares zero `files:` in total.
- Add a `boundary-scan` settle gate — closes the blind spot edit-time `boundaryEnforcement: 'block'` can't see (most notably a subagent-driven edit, invisible to the pre-tool-edit hook). Enumerates every file touched by the whole phase via an unscoped git diff against the integration ref, and refuses settle on a real out-of-boundary offender when `boundaryEnforcement` resolves to `block` — bypassable via `--force`/`--allow-boundary-scan-failure` unless the gate is sealed.
- Catch a subagent (or a human) touching a DRAFT task's declared files after that task is already marked `DONE`/`DONE_WITH_CONCERNS` — live at edit time via a new `redundantWorkEnforcement: 'off' | 'warn' | 'block'` config (default `warn`, DRAFT-frontmatter overridable), plus a `SubagentStart` baseline snapshot + advisory task-board nudge and a `SubagentStop` safety net that diffs an agent's touched files against its baseline.
- Add `cadence dispatch plan [--json]`, a read-only CLI command that computes wave-based subagent dispatch groups from the active BUILD draft's task list (a unified topological-leveling pass over `depends:` edges and `files:`-overlap prerequisite edges, plus cycle/unknown-dependency detection), and a new `/cadence-dispatch` Claude Code slash command that drives the host agent through a parallel Task-tool dispatch loop over the computed waves. `Task` gains an optional `depends: string[]` DRAFT.md field.

### Patch Changes

- Fix `parseSpecMd`/`parseDraftMd` silently truncating a multi-line Objective or a multi-line Given/When/Then clause at the first line break. Both extractors now capture the full wrapped text; single-line parsing is byte-identical to before.
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @manehorizons/cadence-types@1.42.0

## 1.41.0

### Minor Changes

- Add three MCP tools closing the scout-to-phase dead-end for MCP-only clients:
  `cadence_recommendation_convert`, `cadence_milestone_propose`, and
  `cadence_recommendation_archive`, each a thin wrapper over the existing
  service/store functions. Also expose a per-phase `SUMMARY.json` resource
  (`cadence://phase/{phase}/summary.json`), and fix
  `cadence_recommendation_promote`'s description, which pointed at a CLI-only
  `milestone propose` command an MCP client has no way to invoke.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.41.0

## 1.40.0

### Minor Changes

- Add `cadence draft set-objective`/`add-ac`/`add-task`: three additive
  subcommands that mutate a PENDING `DRAFT.md`'s Objective, Acceptance
  Criteria, and Tasks sections directly, round-tripping through the existing
  `parseDraftMd` parser so a hand-typed heading typo can no longer silently
  corrupt AC/Task id sequencing. Hand-editing `DRAFT.md` remains fully
  supported. Also fixes a `parseAcceptanceCriteria`/`parseTasks` heading-regex
  bug found via the new round-trip tests where a name-less `### AC-N:` heading
  bled the next line into the parsed name.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.40.0

## 1.39.0

### Minor Changes

- Two additive features land together in this release:
  - **`settle-pending` recommendation status** (issue #126, part 1/3): when a
    `converted` recommendation's phase settles, it now moves to a new
    non-terminal `settle-pending` status (visible in the active ledger, not
    archived) instead of the old behavior of silently archiving it. A new
    `cadence doctor` `recommendation-shipped-drift` check and an optional
    `cadence progress` `Note:` line surface recommendations awaiting ship
    confirmation (`recommendation promote --status=shipped`).
  - **`/cadence-recommend` slash command + `cadence recommend --top <n>`**: caps
    the displayed ranked recommendation list to the top N entries (totals still
    report the full count).

  `cadence-types` carries the `settle-pending` schema addition; `cadence-core`
  carries both features' logic; the two host adapters are version-alignment
  only (prompt-catalog parity, no functional change).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.39.0

## 1.38.0

### Minor Changes

- Cross-worktree handoff discovery for `cadence resume` (v1.38 milestone,
  phases 142-144). `cadence resume` now discovers resumable handoff docs
  across all active git worktrees of a repo, not just the current checkout's
  own `.cadence/handoff/` — a live `git worktree list` scan, no cached index.

  Bare `cadence resume` still resumes the local candidate by default; when 2+
  worktrees have resumable handoffs it additionally prints a one-line stderr
  nudge pointing at `--list` (a new `resume.autoList` config field switches
  this to an auto-opening interactive picker instead). New CLI flags —
  `--list`, `--pick <n>`, `--path <p>`, `--local` — surface the full candidate
  set and let you resolve directly to any of them. Picking a sibling
  worktree's candidate is strictly read-only: it never writes into that
  worktree's `.cadence/` and never stamps the local `state.session.lastHandoff`.

  `cadence-core` carries the feature; `cadence-types` carries the additive
  `HandoffCandidate`/`ResumeResult` schema fields and the new `resume` config
  block; both host adapters get a slash-command guidance update (prompt-parity
  only, no functional change).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.38.0

## 1.37.0

### Minor Changes

- Close the gap between what `cadence tutorial` demonstrates (real enforcement)
  and what a fresh `cadence init` delivers: `verification.coverageMode` now
  defaults to `assertion` for new inits across all three presets (a comment-only
  `AC-N` mention no longer counts as tested; existing `config.json` files are
  untouched), `verification.testCommand` is derived from the target repo's
  `package.json#scripts.test` + detected package manager and wired into both the
  real init write path and `init --dry-run`'s preview, and `build-test-must-pass`
  now writes a loud, non-blocking notice to stderr when no test command is
  configured instead of passing silently.
- Make a settle's PASS verdicts auditable instead of opaque: `SUMMARY.json`
  now records per-gate `ran`/`skipped` (+ reason) provenance for every
  settle-dispatched gate, and each `acResults[]` row carries an optional
  `evidence` class (`ai-verified`, `executed`, `assertion`, `mention`, or
  `unverified`) — the strongest real evidence found for that AC. A
  mock-provider deep-verify never reports `ai-verified` evidence. `SUMMARY.md`
  renders a new "Gate provenance" section plus an evidence tag next to each AC
  line. Pre-existing SUMMARY records without these fields still parse and
  render unchanged.

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @manehorizons/cadence-types@1.37.0

## 1.36.0

### Minor Changes

- Onboarding-honesty wave 1: six small, high-trust fixes from the 2026-07-01
  audit (phases 133–138).
  - `cadence doctor`'s git-hooks check now verifies `.githooks/` actually exists
    before flagging, and never auto-overwrites a pre-existing custom
    `hooksPath` (e.g. Husky) (phase 133).
  - `cadence progress --json` — mirrors `recommend --json`'s pattern (phase 134).
  - `init --demo` no longer prints the generic "Your first loop"/"Hand it to
    your AI agent" blocks (which immediately refuse in DRAFT) alongside the
    correct demo instructions (phase 135).
  - README's real-phase walkthrough gets an inline `--no-approve` pointer at
    the approve line (phase 136).
  - Refusal trio: BUILD-state `progress` names the real first-pending task (or
    `settle run --auto`) instead of an unrunnable compound command;
    `draft approve` on a missing `DRAFT.md` gives a clean guarded refusal
    instead of a raw `ENOENT`; out-of-position `settle run` also prints a
    `Next:` line (phase 137).
  - Slash-command count reconciled to the code-true count across
    README/quickstart/claude-code.md (fixed a broken TOC anchor), and
    `cadence start`'s menu gained an `activate` option (phase 138).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.36.0

## 1.35.0

### Minor Changes

- Add `cadence init --dry-run`: a non-destructive fit-check that resolves
  everything init would (project name, gate profile, layout, test globs,
  verification/provider status, host surface, and the exact files it would
  create) and prints a preview without touching the repo. Honors the resolution
  flags (`--gate-profile`, `--activate`, `--demo`), and previews rather than
  refuses on an already-initialized repo (a real init still exits 2). Powered by
  a pure `planInit`/`renderInitPlan` seam; the real write path is unchanged.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.35.0

## 1.34.0

### Minor Changes

- e8101b8: Add `cadence doctor --fix`: apply safe, deterministic repairs for the fixable
  doctor findings (git-hooks → `core.hooksPath=.githooks`; regenerate a missing
  `STATE.md`), with a `--wire-host` opt-in that re-runs the Claude Code host
  install for host findings and a `--dry-run` preview that writes nothing. Risky
  findings stay manual guidance. Non-interactive and agent/non-TTY-safe.

### Patch Changes

- Updated dependencies [e8101b8]
  - @manehorizons/cadence-types@1.34.0

## 1.33.0

### Minor Changes

- 689249b: Add `cadence agent-prompt` and an `init` output block that hand the user a
  copy-paste prompt to scaffold the first real CADENCE phase with an AI agent
  (testable ACs, stop at approval). Host-agnostic; pure render shared by both
  surfaces.

### Patch Changes

- Updated dependencies [689249b]
  - @manehorizons/cadence-types@1.33.0

## 1.32.0

### Minor Changes

- fae3d3e: Rebuild `cadence tutorial` around the catch (refuse → fix → pass)

  The tutorial now stages a lie and lets settle catch it. In a throwaway sandbox it
  drives draft → approve → build, marks task `T1` DONE with a real `sum.mjs` but no
  test, and runs `cadence settle run --auto` — which **refuses**: the `test-coverage`
  gate names `AC-1` and the loop stays open. The tutorial then writes a real
  `sum.test.mjs`; the second `settle run --auto` executes it through
  `build-test-must-pass` (`node --test`, real exit code) and the loop closes with a
  SUMMARY. The previous `--ac AC-1=pass` manual assertion and `allowMissingCoverage`
  bypass are gone — the gates decide on real state alone, so the refusal a newcomer
  needs to see is now the demo's centerpiece. No engine changes; `cadence init --demo`
  and `renderDemoDraft` are untouched. `cadence-core` carries the feature; the other
  three published packages are version-alignment only.

### Patch Changes

- Updated dependencies [fae3d3e]
  - @manehorizons/cadence-types@1.32.0

## 1.31.0

### Minor Changes

- 94ade49: Add first-real-task DRAFT templates for `cadence draft new --template`.

  `bugfix`, `feature`, and `refactor` templates now generate editable Objective,
  Acceptance Criteria, Tasks, and Boundaries sections from the supplied title,
  while preserving the legacy scaffold whenever `--template` is omitted. The
  template path works with auto-derived phase ids and explicit phase/task ids, and
  unknown template names refuse before writing a DRAFT.

  The README, quickstart, CLI guide, and command reference now show template
  commands as the first-real-DRAFT path after tutorial/demo onboarding. The host
  adapter and types packages carry version-alignment bumps only.

- 5ab7814: Make onboarding faster and more opinionated.

  The README now leads with a no-install `npx` tutorial, the quickstart separates
  the 30-second demo from the first-real-phase template path, `cadence init`
  prints template-first next steps, and `cadence start` now shows a state-aware
  recommended command before the full menu.

### Patch Changes

- Updated dependencies [94ade49]
  - @manehorizons/cadence-types@1.31.0

## 1.30.0

### Minor Changes

- Release v1.30.0: adoption-onboarding ergonomics, settle bypass audit trails, and Codex host parity.
  - `cadence draft new --title "..."` can now derive the next free phase id and task number, making the recommended first-loop command shorter and less error-prone.
  - `cadence settle run` now records and prints explicit gate bypass audit entries for force, coverage, and verifier-failure paths, and SUMMARY artifacts expose those bypasses through the shared summary schema.
  - Codex host prompts now source shared command guidance, install the `cadence-scout` prompt, and carry parity coverage for local hook roundtrips and prompt-catalog drift.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.30.0

## 1.29.0

### Minor Changes

- Non-TTY auto-bypass for the approve + interactive-verdict gates (phase 116, rec-20260617-005).

  The two interactive loop gates no longer hard-fail in a non-TTY with `StdinPrompter: stdin is not a TTY`. A pure `resolveInteractivity(env, isTTY)` seam drives both: the `approve` gate auto-passes loudly (stderr audit trail), and the `interactive-verdict` gate skips its per-AC walker, passes, and records `interactiveVerifySkipped: "non-tty"` in the SUMMARY — no human verdicts are fabricated, and the other verification gates still decide. Three env controls: `CADENCE_REQUIRE_TTY=1` restores the strict refusal, `CADENCE_NONINTERACTIVE=1` forces bypass under a pseudo-TTY, and a supplied `CADENCE_PROMPTER_SCRIPT` is always honored. Env-driven only — no config knob.

  `cadence-core` carries the feature; `cadence-types` carries the `interactiveVerifySkipped` summary field; the two host adapters are version-alignment only.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.29.0

## 1.28.0

### Minor Changes

- 401d86c: Coverage-gate assertion mode (phase 108): an opt-in
  `verification.coverageMode` that closes the test-coverage gate's
  "mentioned-but-not-tested" false positive. The default `mention` mode is
  unchanged — any occurrence of an `AC-N` token anywhere in a matched test file
  (comments included) counts as covered.
  - `verification.coverageMode: "assertion"` counts an `AC-N` token only when it
    sits inside an asserting `it()`/`test()` block. A comment-only or
    assertion-less mention is reported as a **weak link**: the gate refuses with a
    distinct "not inside an asserting it()/test() block" hint, separate from the
    plain "has no linked test" message for an entirely-absent AC, and the refusal
    names the mode.
  - Span detection is a pure, dependency-free, string/comment-aware scan
    (`findTestSpans`) — no AST, no new dependency, no network; deterministic and
    offline. Parens inside a title string don't break it.
  - Editable via `cadence config edit coverageMode`; documented in
    `docs/reference/config.md` and `docs/concepts.md`.

  Backward-compatible: a config with no `verification.coverageMode` loads as
  `mention` and behaves byte-for-byte as before. `cadence-types` carries the new
  schema field; `host-claude-code` / `host-codex` carry version-alignment bumps
  only.

- 3fae956: Onboarding front door + guided Next: rail (phase 113): make `cadence start` the
  single, unambiguous onboarding entry point, with `cadence quickstart` reframed
  as the post-init "where am I / what's next" map.
  - README leads with `cadence start` alone (the co-equal "or quickstart" framing
    is gone; quickstart is now described as the post-init map).
  - `cadence doctor` ends with a `Next:` line — the first problem's remediation
    when any check is non-ok, else `cadence progress` — so doctor joins the same
    guided rail as the other onboarding commands. (`--json` output unchanged.)
  - `docs/quickstart.md` opens with a 3-way driver fork (terminal / Claude Code /
    MCP) so host users branch immediately.

  Copy/UX only except the small `doctor` Next: line; v1.27's
  `init`/`--demo`/`--activate` flows are untouched, and `quickstart` keeps its
  never-throw guarantee. `cadence-types` / the two host adapters carry
  version-alignment bumps only.

- f6182c0: Onboarding papercuts (phase 114): two small fixes.
  - `cadence init` now prints a one-line heads-up when a young repo gets the
    `auto` gate profile from the git-history suggestion — warning that
    `draft approve` will flip to interactive once the repo passes ~20 commits, and
    that pinning `--gate-profile auto` keeps it hands-off. Only fires for derived
    `auto` (not when pinned explicitly, nor for `standard`/`strict`).
    (rec-20260617-009, scoped down — the preset/profile terminology already
    carries inline clarifiers.)
  - `cadence handoff` honors a `CADENCE_NOW` env override (a date string) for the
    SESSION-doc date, via a pure `resolveNow(env)` seam — making handoff runs
    reproducible and closing a UTC-midnight flake in the clobber-refusal test
    (two runs straddling midnight got different dates and never collided). No
    behavior change when unset. (rec-20260618-001.)

  `cadence-types` / the two host adapters carry version-alignment bumps only.

### Patch Changes

- Updated dependencies [401d86c]
- Updated dependencies [3fae956]
- Updated dependencies [f6182c0]
  - @manehorizons/cadence-types@1.28.0

## 1.27.0

### Minor Changes

- v1.27.0 — onboarding breeze: make `cadence init` a zero-friction front door.
  - **Zero-prompt init** (phase 108): `cadence init` derives the project name
    (`package.json#name`, scope-stripped, else the directory name) and the gate
    profile (git-history heuristic) — it asks nothing.
  - **Auto-wire the host** (phase 108): when a `.claude/` workspace is present,
    `--wire-host` runs the Claude Code adapter install in the same step via a
    subprocess spawn (core never imports host code); a TTY offers it, non-TTY
    skips with a pointer. `--skip-host-wire` opts out.
  - **`init --demo`** (phase 109): seed a ready-to-approve demo phase (objective +
    AC-1 + T1, shared with the `tutorial` toy template) so a newcomer runs a full
    `approve → done → settle` loop in their own repo with no hand-edit.
  - **`init --activate`** (phase 110): when `ANTHROPIC_API_KEY` is present, turn on
    real verification (`verifier.provider=anthropic`, deep-verify seam) in the same
    step via the shared activate seam — the key is never persisted, and no live
    check runs (that stays in `cadence activate`).

  `cadence-types`, `cadence-host-claude-code`, and `cadence-host-codex` carry
  version-alignment bumps only (the feature lands in `cadence-core`).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.27.0

## 1.26.0

### Minor Changes

- Add `cadence start`, an interactive onboarding front door: "What are you doing?"
  → numbered pick → confirm → runs the matching setup command (tutorial, init,
  Claude Code / Codex host install, MCP install, or doctor). Sibling to the
  read-only `cadence quickstart`. Dispatch is a uniform subprocess spawn (the
  `cadence` binary for core routes, `npx` for the two host packages). Scriptable
  via `--pick`/`--yes`/`--json`; a non-interactive shell prints the menu and exits 0.

  cadence-core carries the feature; the other three are version-alignment bumps.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.26.0

## 1.25.0

### Minor Changes

- v1.25.0 — real-verification-default: name mock honestly as a placeholder

  The `mock` verifier is now explicitly named a non-verifier placeholder across
  every surface, closing the gap between the "real verification gate" pitch and
  the out-of-box mock default (the #1 finding of the 2026-06-11 competitive
  assessment; rec-20260611-003).

  A single source-of-truth `MOCK_VERIFIER_NOTICE` constant in `cadence-types`
  feeds: the settle mock-fallback banner, the `cadence doctor`
  verification-readiness check, `cadence init`'s new "Turn on real verification"
  block, the `cadence quickstart` / `config explain` all-mock warning, and the
  docs (README, concepts, providers, config). Warning-only — mock stays the
  zero-config offline default; nothing is blocked. `cadence-types` carries the
  new constant; the host adapters carry version-alignment bumps only.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.25.0

## 1.24.0

### Minor Changes

- 9d6684e: Recommendation retention (v1.24): manual + automatic soft-archival of
  recommendations. Terminal recs already drop out of the active `cadence recommend`
  surface but the ledger was append-only — v1.24 adds recoverable move-aside archival.
  - `cadence recommendation archive <id>` / `unarchive <id>` and `recommendation list
--archived` — manual soft-archive (moves a rec into the ledger's new `archived`
    array; recoverable, never deleted; `recommendation show` is archive-aware).
  - `recommendations.autoArchive` config (default **on**, recoverable): a rec is
    auto-archived when it goes terminal — `shipped`/`rejected` immediately on `promote`,
    and a `converted` rec when its phase completes SETTLE (best-effort, never blocks
    settle). Set `false` to keep terminal recs in the active ledger.

  Backward-compatible: a pre-v1.24 `recommendations.json` (no `archived` key) loads
  unchanged. `host-claude-code` / `host-codex` carry version-alignment bumps only.

### Patch Changes

- Updated dependencies [9d6684e]
  - @manehorizons/cadence-types@1.24.0

## 1.23.0

### Minor Changes

- 14aadd0: Add a `shipped` terminal status to the recommendation lifecycle (phase 100,
  from rec-20260611-001). A rec whose work has landed — directly via a PR, or
  after a formal `convert` — can now reach a truthful positive-terminal state via
  `cadence recommendation promote <id> --status=shipped [--ref "PR #70 / v1.22.1"]`,
  instead of being stuck at `candidate`. `shipped` recs drop out of the active
  `cadence recommend` surface (like `converted`/`rejected`); the optional freeform
  `shippedRef` is rendered as a `- shipped:` provenance line. The one sanctioned
  transition out of an otherwise-terminal status is `converted → shipped`.

### Patch Changes

- Updated dependencies [14aadd0]
  - @manehorizons/cadence-types@1.23.0

## 1.22.1

### Patch Changes

- 9a23c60: Fix the phase-id ceiling (rec-20260610-001): widen the id schema from
  `^\d{2}-\d{2}$` to `^\d{2,}-\d{2,}$` and derive ids through a single
  `derivePhaseTaskId` helper, so phases >= 100 are representable end-to-end
  instead of being mangled into `10-100`. Existing 01-99 ids are unchanged.
- Updated dependencies [9a23c60]
  - @manehorizons/cadence-types@1.22.1

## 1.22.0

### Minor Changes

- Verification-activation (v1.22.0): `cadence activate` — a guided command that takes
  a project from all-mock verifiers to one real-verification loop.
  - **`cadence activate`** picks a provider and writes `verifier.provider` (the
    deep-verify seam by default; `--all` sets every seam), validates the key with a
    minimal live anthropic ping (`--no-check` to skip; `local`/`mock` skip the ping),
    and never persists the key — only the provider name is written. Key-missing still
    records the selection and prints the exact `export …` line (set-up-now-key-later);
    a failed live check exits non-zero without losing the selection. `--print` previews
    the plan without writing; non-interactive runs require `--provider`.
  - **`cadence doctor`** gains a `verification-readiness` check (reusing the same pure
    readiness assessment): `warning` on all-mock (remedy: `cadence activate`) or a real
    provider missing its key; `ok` otherwise; best-effort, never throws.
  - **Discoverability:** `cadence quickstart`, `cadence config explain` (a new
    `all-mock` warning), and `cadence init` now point at `cadence activate`.

  `cadence-host-claude-code` and `cadence-host-codex` carry version-alignment bumps
  only (no functional change).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.22.0

## 1.21.0

### Minor Changes

- Quickstart-onboarding milestone (v1.21.0): a four-slice arc that lowers the
  barrier to a first CADENCE loop and makes config self-explanatory.
  - **Slice A — `cadence config explain`**: terminal-sized, in-CLI explanation of
    the _active_ config in plain language — resolved gates, providers, and
    warnings — so operators don't have to cross-reference `docs/reference/config.md`.
  - **Slice B — deepen `config explain`**: richer per-field guidance and an
    optional `[field]` focus, extending the embedded help so it works from any
    install.
  - **Slice C — `cadence config edit`**: a guided edit wizard that writes
    validated changes back to `.cadence/config.json` without hand-editing JSON.
  - **Slice D — `cadence quickstart`**: a state-aware onboarding front door that
    orients a new user from any loop position (uninitialized, IDLE, mid-phase),
    reusing `nextAction`; never throws, with a corrupt-state fallback and `--json`.

  `cadence-host-claude-code` and `cadence-host-codex` carry version-alignment bumps
  only (no functional change).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.21.0

## 1.20.0

### Minor Changes

- Handoff retention (v1.20): opt-in, count-based pruning of dated `SESSION-*.md`
  handoff docs. A new `handoff.retain` config field keeps the N most-recent
  session handoffs and hard-deletes the rest at handoff-write time
  (deterministic, offline, best-effort — never fails a handoff, never silently
  destroys the dated archive `resume` relies on). Unset = no pruning (current
  behavior). A read-only `cadence doctor` `handoff-retention` check makes
  unmanaged accumulation visible. `host-claude-code`/`host-codex` carry
  version-alignment bumps only.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.20.0

## 1.19.0

### Minor Changes

- v1.19 worktree-safety polish: surface cross-worktree phase usage proactively on the v1.18
  collision primitive. `cadence doctor` gains a read-only `worktree-phases` check (warns when a
  sibling worktree claims a local phase number, naming the conflict + next free number; best-effort,
  sibling-vs-local only), and the IDLE `cadence draft new …` suggestion in `progress`/`recommend`
  now fills in the next free number (`max(observed)+1` over local + sibling + upstream) instead of a
  bare placeholder, so the first pick clears claims the guard would refuse. Lowest-gap numbering was
  evaluated and dropped — `nextFree` stays monotonic `max+1`. `cadence-types`,
  `cadence-host-claude-code`, and `cadence-host-codex` carry version-alignment bumps only.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.19.0

## 1.18.0

### Minor Changes

- v1.18 — worktree-safety: phase-collision guard.

  CADENCE's loop state lives in the working tree and each git worktree holds a private `.cadence/`, so
  two worktrees branched from the same commit can both scaffold "phase N" — and with different slugs
  git silently merges both in. The new phase-collision guard observes ground truth (`git worktree list`
  - `origin/<integrationRef>`) and refuses to scaffold a phase number already claimed by a sibling
    worktree or upstream, naming the conflict and suggesting the next free number, so the collision fails
    loud before wasted work.
  * Fires at scaffold time (`cadence spec new` / `cadence draft new`) and as a `cadence settle run`
    backstop. `--allow-phase-collision` bypasses per run (never bypasses the local same-dir refusal).
  * New `phaseGuard { enabled (default true), integrationRef (default "main") }` config block.
  * Best-effort: a non-git / offline / single-worktree checkout behaves exactly as before — the only
    hard failure is an actual detected collision.

  `cadence-types` adds the `phaseGuard` schema; `cadence-host-claude-code` and `cadence-host-codex`
  carry version-alignment bumps only (no functional change).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.18.0

## 1.17.0

### Minor Changes

- Observability: structured operator-debugging logger (v1.17)

  Add a zero-dependency, additive, default-off structured logger for diagnosing CADENCE itself.
  Writes only to stderr (never stdout — safe for `--json` and the `cadence mcp serve` protocol
  channel), gated by `CADENCE_LOG_LEVEL`/`CADENCE_LOG_FORMAT` env vars and an optional
  `config.logging { level, format }` block (precedence env > config > default `silent`).

  Three seams are instrumented via context-bound child loggers: `gate` (settle gate
  skipped/passed/refused decisions), `hook` (host lifecycle event dispatch), and `verify` (AI
  verifier provider request/response/error, including token usage). Verifier auth headers and API
  keys are never logged. `cadence-types` gains the pure `LogLevel`/`LogFormat`/`LogRecord` types;
  `cadence-host-*` carry version-alignment bumps only (no functional change).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.17.0

## 1.16.0

### Minor Changes

- MCP surface deepening (v1.16.0): grow the `cadence mcp serve` surface from a
  thin tools-only slice into a full MCP integration, along four dimensions.
  - **Resources (phase 75).** `.cadence/` artifacts are exposed read-on-demand
    under a `cadence://` scheme — `state`, `state.json`, `roadmap`, `project`,
    `recommendations`, plus templated `phase/{phase}/draft|summary`. No
    subscriptions / file-watching; readers reuse the same bytes the CLI reads.
  - **Tool parity (phase 76).** Five proven-out commands join the tool set:
    `cadence_handoff`, `cadence_resume`, `cadence_recommendation_add`,
    `cadence_recommendation_promote`, `cadence_doctor` — enabling session
    continuity and the full scout → rec → promote path over MCP (15 tools total).
  - **Prompts + shared guidance (phase 77).** The canonical command guidance and
    the `cadence-scout` dialogue move into a shared `cadence-types` module
    (`COMMAND_GUIDANCE` + `SCOUT_DIALOGUE`) — one source of truth for both the
    Claude Code slash commands (rendered output byte-identical) and the new MCP
    prompts (`cadence_scout`, `cadence_next`, `cadence_draft`, `cadence_settle`).
  - **Zero-config (phase 78).** New `cadence mcp install [--print] [--client <c>]`
    non-destructively writes/merges a project `.mcp.json` (idempotent; refuses to
    clobber a malformed file); `--print` emits a snippet for other hosts.

  `cadence-types` carries the shared guidance module; `cadence-host-claude-code`
  re-sources its slash-command prose from it (byte-identical); `cadence-host-codex`
  carries a version-alignment bump only. stdio-only and imperative-surface-only
  still hold — ambient edit-time gates remain host-hook-only (DESIGN.md D11,
  deepened additively, no new D-number).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.16.0

## 1.15.0

### Minor Changes

- f501588: Verifier robustness (v1.15.0): make the real verifier providers dependable in a
  settle gate, let the operator pick one at the command line, and make every
  verifier run's token usage auditable. Provider hardening + ergonomics around
  unchanged verdict logic — not a verifier rewrite.
  - **Provider hardening (Phase 72).** `anthropic` gains configurable
    `verifier.timeoutMs` + `verifier.maxRetries` (threaded via a pure
    `buildAnthropicClientConfig` seam), so a transient 429/5xx/network blip in a
    settle gate retries before failing loud. `local` gains auth: a bearer
    `Authorization` header from `CADENCE_LOCAL_API_KEY` plus arbitrary
    `verifier.localHeaders`, so token-gated OpenAI-compatible proxies work. Header
    values are never logged. Three new backward-compatible `verifier.*` config
    fields.
  - **Verifier selection + cost visibility (Phase 73).** `cadence settle run
--verifier <mock|anthropic|local>` overrides the config-only provider
    selection (precedence flag > config > default `mock`; invalid values rejected
    at parse time). The override flows into the v1.14 mock-fallback banner so it
    reflects the effective provider. `VerifyResult` and the SUMMARY's
    `deepVerifyMeta` gain optional token usage (`inputTokens` / `outputTokens`),
    captured from Anthropic's `usage` and from `local` endpoints that return one.
    Dollar cost is not derived (no price table to rot).

  `cadence-types`, `cadence-host-claude-code`, and `cadence-host-codex` carry
  version-alignment bumps only (the token-usage field on `deepVerifyMeta` lives in
  `cadence-types`; the host adapters are unchanged).

### Patch Changes

- Updated dependencies [f501588]
  - @manehorizons/cadence-types@1.15.0

## 1.14.0

### Minor Changes

- b8861dc: Verifier correctness (v1.14.0): the `deep-verify` gate now sends the AI verifier
  the actual phase diff instead of an empty string, so deep verification judges the
  implementation rather than test-linkage alone.
  - `deep-verify` wires the memoized `git diff HEAD` (shared with `code-review`) into
    the verifier input, bounded by the new `verifier.diffCapBytes` config (default
    256KB) and truncated with an explicit `[diff truncated: N of M bytes]` marker.
  - A run-level `deepVerifyMeta` provenance record (`diffProvided`, `diffBytes`,
    `truncated`, `filesCount`, `provider`, `model`) is written to the SUMMARY so a
    verdict is auditable.
  - The mock-fallback banner now fires whenever the gate runs in mock — on `--deep`
    **or** gate-set membership (e.g. `standard × complex`) — so a settle never runs
    mock verification silently.

  `cadence-host-claude-code` and `cadence-host-codex` carry version-alignment bumps
  only (no functional change).

### Patch Changes

- Updated dependencies [b8861dc]
  - @manehorizons/cadence-types@1.14.0

## 1.13.0

### Minor Changes

- **Multi-host reach: the OpenAI Codex adapter** — a new published package
  `@manehorizons/cadence-host-codex`, the second consumer of the phase-60
  host-adapter contract (`ADAPTER_CONTRACT_VERSION = 1`, unchanged). It proves the
  contract is not Claude-Code-shaped: a genuinely differently-shaped host conforms
  without a contract bump.
  - `codexAdapter satisfies HostAdapter`: capabilities, `mapEvent` (Codex's
    near-1:1 lifecycle → cadence abstract events), and `extractPayload` parsing
    Codex's multi-file `apply_patch` envelope into `ExtractedPayload.files`.
  - `cadence-host-codex install`: project-level `.codex/hooks.json` + global
    `$CODEX_HOME/prompts/cadence-*.md` slash-command prompts (with a global-scope
    warning), `--local`/`CODEX_HOME` aware.
  - `cadence-host-codex hook`: the runtime shim — translates Codex stdin-JSON and
    spawns the core dispatcher; proven end-to-end against real loop state.

  `cadence-core`, `cadence-types`, and `cadence-host-claude-code` carry
  version-alignment bumps to stay in lockstep; no functional change.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.13.0

## 1.12.0

### Minor Changes

- Two adoption-layer CLI features land in `cadence-core`:
  - **`cadence tutorial`** (phase 63) runs one real DRAFT→BUILD→SETTLE loop inside
    a throwaway sandbox, printing each step's command and the engine's actual
    output before cleaning up — the executable companion to the "Your first loop"
    block in `cadence init`. Fully offline and side-effect free.
  - **`cadence explain [concept]`** (phase 64) prints curated, terminal-sized
    explanations of the core concepts (loop, gates, tiers, profiles) from content
    embedded in the binary, so the model is self-teaching without leaving the
    terminal or depending on the `docs/` tree being shipped. Bare invocation lists
    the concepts; unknown names get a nearest-match did-you-mean nudge.

  `cadence-types` and `cadence-host-claude-code` carry version-alignment bumps to
  stay in lockstep with `cadence-core`; neither has a functional change in this
  release.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.12.0

## 1.11.0

### Minor Changes

- First-class scout-session grouping + guided first-loop onboarding nudge.
  - **Phase 61 — scout-session grouping (`scoutId`).** An optional `scoutId` on
    recommendations groups the N recs landed by one `/cadence-scout` session so
    they are queryable as a set: a `--scout-id` flag on `cadence recommendation
add`, a `recommend --scout-id <id>` cluster filter (scopes the report +
    totals), a `- scout: <id>` render line, and `/cadence-scout` auto-minting a
    `scout-YYYYMMDD-HHMM` session id. Additive — reports for recs without a
    `scoutId` are unchanged. (`cadence-types`: optional `scoutId` on
    `RecommendationZ` + `RecommendationRankZ`.)
  - **Phase 62 — guided first-loop nudge in `cadence init`.** The end of `cadence
init` now prints a numbered "Your first loop" block (draft new → edit →
    approve → done → settle) plus a `cadence progress` escape hatch, replacing the
    thin `Next: edit ROADMAP.md` line. Output-text only.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.11.0

## 1.10.0

### Minor Changes

- Explicit, versioned host-adapter contract. `@manehorizons/cadence-types` now
  exports a first-class `HostAdapter` interface plus `HostCapabilitiesZ`,
  `ADAPTER_CONTRACT_VERSION`, and `ExtractedPayload`, formalising what a host
  integration must implement. `claudeCodeAdapter` in
  `@manehorizons/cadence-host-claude-code` conforms to the contract, and the docs
  portal gains a "write your own adapter" guide. Also bumps `commander` 13 → 14 in
  `@manehorizons/cadence-core` (the engine floor stays Node `>=20`; commander is
  pinned to `^14` deliberately).

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.10.0

## 1.9.0

### Minor Changes

- e95def0: `cadence resume` now defaults to brief output when live state matches the
  handoff doc, and auto-promotes to full output (whole doc + live-context replay)
  on drift. New `--full` / `--brief` flags force a mode; `--json` gains a `mode`
  field and `context` is now nullable (null in brief mode, since the live-context
  recompute is skipped).

### Patch Changes

- Updated dependencies [e95def0]
  - @manehorizons/cadence-types@1.9.0

## 1.8.0

### Minor Changes

- 7cb7695: Add `cadence mcp serve` — an MCP server surface (phase 58).

  CADENCE can now run as a local Model Context Protocol server over stdio, so any
  MCP-capable host (Claude Desktop, Cursor, other agents) can drive the
  DRAFT→BUILD→SETTLE loop with no bespoke adapter. It's a third surface on the
  single engine (CLI · Claude-Code hooks · MCP), not multi-host adapter pluralism
  (DESIGN.md D11).

  The server exposes 10 curated tools wrapping the same engine the CLI uses —
  `cadence_progress`/`status`/`recommend` (read) and `draft_new`/`draft_check`/
  `draft_approve`/`build_task`/`settle`/`spec_new`/`spec_approve` (write). The
  curated command logic was factored into shared `*Service(repoRoot, args, io)`
  functions so the CLI and MCP call one implementation (CLI output unchanged).
  Command-boundary gates (coherence, the settle gate stack, spec-review) run
  exactly as on the CLI; ambient edit-time gates require host hooks and are not
  available over MCP. The `@modelcontextprotocol/sdk` dependency is lazy-loaded,
  so ordinary CLI commands never pay its load cost. stdio only — no
  HTTP/remote/auth. See `docs/mcp.md`.

### Patch Changes

- Updated dependencies [7cb7695]
  - @manehorizons/cadence-types@1.8.0

## 1.7.0

### Minor Changes

- d478355: Add `cadence doctor` — diagnose a project's CADENCE setup (phase 56).

  A new deterministic, offline, report-only command that health-checks a project
  and reports each finding as `ok`/`warning`/`error` with a remediation hint:
  Node floor, `.cadence/` + config validity, state-file integrity, the
  `.githooks` pre-push gate (`core.hooksPath`), Claude Code managed hooks, and —
  the check this directly earned — slash-command run-line portability (no
  machine-absolute paths). Human output by default, `--json` for scripting/CI;
  exits non-zero only on `error`-severity findings so it is usable as a CI gate.
  `cadence-types` and `cadence-host-claude-code` are bumped only to keep the three
  public packages in lockstep; neither changed.

- 05d6ea4: Add `cadence recommendation promote` — advance a recommendation's status and/or
  readiness (phase 57).

  Closes the gap where `milestone propose` (which requires `status=accepted` +
  `readiness∈{ready-for-milestone,ready-for-cadence-spec}`) was unreachable for
  manually-added recommendations: `convert` was the only status transition and
  `readiness` was write-once at `add`. `recommendation promote <id>
[--status <s>] [--readiness <r>]` sets either/both, validated against the
  status/readiness enums. It is independent of `convert` — it never sets
  `convertedToPhaseId` and refuses `--status converted` and terminal
  (`converted`/`rejected`) recs. `cadence-types` and `cadence-host-claude-code`
  are bumped only to keep the three public packages in lockstep; neither changed.

### Patch Changes

- b3c4008: Fix the `install --local` warning so it names **every** surface it wrote
  machine-absolute paths into — not just `settings.json`.

  Previously the warning mentioned only `.claude/settings.json`, so the slash
  commands written to `.claude/commands/cadence-*.md` under `--local` were a
  silent offender: their absolute `node <abs>/cli/index.js` paths could be
  committed unflagged and then failed to resolve on every other clone or machine.
  The warning now enumerates each surface actually written (settings file and/or
  command files, narrowed by `--no-hooks` / `--no-commands`) and points at the
  portable plain-`install` form that is safe to commit. Docs (`docs/claude-code.md`)
  updated to match. `cadence-core` and `cadence-types` are bumped only to keep the
  three public packages in lockstep; neither changed.

- Updated dependencies [d478355]
- Updated dependencies [b3c4008]
- Updated dependencies [05d6ea4]
  - @manehorizons/cadence-types@1.7.0

## 1.6.1

### Patch Changes

- f0d2e4a: Internal refactor (phase 54): split the `intelligence/store` module.

  No user-facing or API change — the published packages' public surface is
  unchanged and all behavior is identical (the full test suite passes unmodified).
  This is a maintainability deepening: the 985-LOC `intelligence/store.ts`
  god-module was decomposed into ten single-responsibility modules under
  `intelligence/store/` (paths, ids, io, recommendations, assumptions, decisions,
  stats, audit, reconcile, milestones), with `store.ts` kept as a thin re-export
  barrel so every existing import site resolves unchanged. `cadence-types` and
  `cadence-host-claude-code` are bumped only to keep the three public packages in
  lockstep; neither changed.

- Updated dependencies [f0d2e4a]
  - @manehorizons/cadence-types@1.6.1

## 1.6.0

### Minor Changes

- v1.6.0 — preset flag rename + `/cadence-scout`
  - **`cadence init --preset`** is the new primary flag for selecting a config
    preset (`solo | team | production`); `--profile` lives on as a deprecated,
    still-working alias that emits a one-line stderr notice. The old name was a
    misnomer — it set a preset, not a gate profile (`--gate-profile`). (Phase
    `52-preset-flag-rename`.)
  - **`/cadence-scout`** — a twelfth Claude Code slash command installed by
    `cadence-host-claude-code`: a divergent→convergent ideation dialogue that
    lands survivors as Praxis recommendations via `cadence recommendation add`.
    Host-side only; zero core-engine change, no new gate / loop position / record
    type. (Phase `53-cadence-scout`.)

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.6.0

## 1.5.1

### Patch Changes

- 9fe4780: Onboarding hardening (phase 48): clearer first-run experience.
  - A distinct `NotInitializedError` — running a command before `cadence init`
    now says "CADENCE not initialized here — run `cadence init`" instead of a
    misleading `StateCorruptError`.
  - Enforce the Node ≥20 floor: `engines.node` on the published packages plus a
    runtime guard that fails fast with a readable message instead of a cryptic
    ESM error.
  - `cadence settle run --deep` prints a prominent banner when the effective
    verifier provider is `mock` (the shipped default), so deep verification can't
    silently hand back fake verdicts.
  - The scaffolded `CLAUDE.md` no longer links to a `DESIGN.md` that consumer
    repos never receive; it points at the published concepts doc instead.
  - README explains all three gate profiles' `approve` behavior and the
    commit-count suggestion heuristic.

- Updated dependencies [9fe4780]
  - @manehorizons/cadence-types@1.5.1

## 1.5.0

### Minor Changes

- Add session-continuity commands `cadence handoff` (scaffold a SESSION doc with loop state, read-only git facts, and the context-handoff packet pre-filled) and `cadence resume` (read-only replay of the freshest handoff + live context), plus `/cadence-handoff` and `/cadence-resume` host slash commands. Also fixes a `files-outside-boundary` false positive where absolute touched paths were compared against relative DRAFT `files:` declarations.

### Patch Changes

- Updated dependencies
  - @manehorizons/cadence-types@1.5.0
