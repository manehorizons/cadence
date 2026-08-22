# Changelog

All notable changes to this project are documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is [SemVer](https://semver.org/spec/v2.0.0.html). Phase numbers reference entries under `.cadence/phases/`.

## [Unreleased]

## [1.63.0] - 2026-08-22

> Published to npm via the `Release` workflow (provenance), tag `v1.63.0`. Per-package bumps managed by changesets, lockstep across all five published packages.

### Fixed

- A settle whose only real-provider verification signal is a `providerSelection: 'empty-diff'` gate (a real, non-mock verifier call whose diff was empty, so it structurally could not judge anything) can no longer earn `assurance.overall: 'strong'` on that signal alone. `deriveAssuranceRecord`'s `hasRealVerifier` previously read only `gates[].provider !== 'mock'`, never `providerSelection` — so a code-review/security-audit gate that ran a real provider against an empty diff (touched files already committed at settle time, or otherwise no working-tree delta) still counted as "real verification happened," even though nothing was actually judged. A mixed settle — one `empty-diff` gate alongside one genuinely `'configured'` (or untagged) non-mock gate — is unaffected and can still reach `'strong'` on the configured gate's own evidence. Measured against the full historical corpus (298 `SUMMARY.json` records) this changes 0 grades — no real settle has hit `providerSelection: 'empty-diff'` yet — but the gap was real and directly provable via a fixture. (Phase `287`.)

## [1.62.0] - 2026-08-21

> Published to npm via the `Release` workflow (provenance), tag `v1.62.0`. Per-package bumps managed by changesets, lockstep across all five published packages.

### Added

- A declared `files:` entry containing a wildcard (e.g. `.changeset/*.md`) now actually matches the files it describes, in both `warn` and `block` `boundaryEnforcement` modes. `runBoundaryCheck` previously compared declared entries against touched files via exact `Set` membership — no glob expansion at all, so a wildcard entry could never match anything; under dispatch-scoped `block` mode this produced a hard, surprising refusal on correctly-scoped work, and in `warn` mode a spurious `files-outside-boundary` anomaly even when the touched file was exactly what the pattern was written to cover. Declared entries containing `*` are now glob-expanded using the same matcher CADENCE's own coverage scanner already relies on (`globToRegExp`/`toMatcher`, extracted to a shared `packages/core/src/util/glob.ts` — no new runtime dependency); literal (non-wildcard) entries remain byte-identical to prior behavior. A declared wildcard entry that matches zero touched files now surfaces a new, additive, advisory-only `boundary-pattern-unmatched` anomaly at `severity: 'warn'`, structurally unable to escalate to a block-mode refusal. (Phase `286`.)

### Fixed

- `cadence verify coverage --explain` no longer silently double-qualifies an already-qualified AC id under `verification.coverageScheme: 'phase-qualified'`. Passing an already-qualified argument (e.g. `--explain 282-01/AC-4` when the active draft is already `282-01`) previously built an unmatchable search token (`282-01/282-01/AC-4`) and silently reported `NOT SATISFIED` at exit `0` with no warning. The command now detects and strips an already-qualified argument, searches the bare form instead, and prints a stderr notice naming both forms; a qualifier-only argument (e.g. `282-01/`) is now refused outright rather than searched as an empty pattern, which would have silently matched everywhere. The bare `--explain AC-N` form is byte-for-byte unchanged; the `bare` coverage scheme is unaffected. (Phase `285`.)

### Process

- Phase 282's AC-2/AC-4 `deep-verify` record reconciled without rewriting any historical `SUMMARY.json`: both verdicts had judged delivered artifacts against acceptance-criteria text that independent reviewers had already found and corrected in-flight (282's own As-built amendment blocks). AC-2's text is formally amended so no future reader is asked to reproduce a defect shape independent testing proved impossible; AC-4's objection is split into two independently-judged halves. The systemic finding — a legitimately amended AC currently has no path to reach `deep-verify`, so honest in-flight correction can still manufacture a verifier failure — is filed as a recommendation for future design work rather than fixed inline. (Phase `284`.)

## [1.61.1] - 2026-08-17

> Published to npm via the `Release` workflow (provenance), tag `v1.61.1`. Per-package bumps managed by changesets, lockstep across all five published packages.

### Docs

- Removed the `@manehorizons` → `@thomas-powers-jr` npm-scope migration callout from the three README-style entry points (`README.md`, `packages/core/README.md`, `docs/README.md`) — operator decision: download volume on the old scope no longer warrants surfacing the notice on the GitHub/npm landing pages. `docs/migration-npm-scope.md` (the full guide) is untouched. While syncing these entry points, also fixed a stale Providers description (two of three still named "OpenAI, Claude, Ollama" instead of the real provider ids) and reconciled each entry point's doc-index list against the others. (#440)
- Fixed the "Heads-up on the default verifier" callout in `README.md`/`packages/core/README.md`, which omitted `host-cli` as a real-verifier option alongside Anthropic and local models. (#441)

## [1.61.0] - 2026-08-16

> Published to npm via the `Release` workflow (provenance), tag `v1.61.0`. Per-package bumps managed by changesets, lockstep across all five published packages.

### Fixed

- Assurance grading no longer reports `assurance.overall: 'strong'` when a settle's gates were bypassed or a real verifier's AC failure was overridden. `deriveAssuranceRecord` gains an optional third argument, `{ gateBypasses, deepVerify }`: an error-severity `gateBypasses` entry caps `overall` at `'mixed'`; a `deepVerify` verdict with `pass: false` from a non-mock provider excludes that AC from `strongRatio`'s numerator. Neither ever touches `acResults[].pass`, and both stay gate-agnostic. Omitting the third argument is a no-op — every clean settle's grade is byte-identical to before this change. `cadence summary render` and the `SUMMARY.md` writer now surface the bypass state next to the grade line. A full read-only re-derivation across the historical corpus is documented in `.cadence/phases/283-bypass-aware-assurance/283-01-ASSURANCE-DRIFT-REPORT.md`: exactly 2 historical records drift from a stored `'strong'` grade to `'mixed'` under the new rule; no historical `SUMMARY.json` was modified. (Phase `283`.)
- Two defects in the test-coverage scanner (`scanTestCoverage`) that could make the coverage gate's verdict wrong or unstable: a qualifying occurrence could be shadowed by an earlier non-qualifying match of the same AC token in the same file (dedup ordering), and `listAllFiles`'s unsorted walk made cross-file `TestRef[]` array order unstable across processes/filesystems (walk-order determinism). Both fixes are coverage-monotone or verdict-neutral by construction. A full re-derivation across the historical corpus is documented in `.cadence/phases/282-coverage-scanner-determinism/282-01-COVERAGE-DRIFT-REPORT.md`. (Phase `282`.)

### Changed

- `cadence done <id>` is now a true alias for `cadence build task <id> --status=DONE`: it delegates entirely to `buildTaskService`, inheriting the per-task-verify gate, the record-time boundary/redundancy check, and a pre-existing unknown-task-id guard that it previously bypassed entirely. `done` can now refuse (no bypass flag of its own) where it previously always succeeded; a caller needing to bypass a refusal uses `build task` directly. (Phase `281`.)

## [1.60.0] - 2026-08-15

> Published to npm via the `Release` workflow (provenance), tag `v1.60.0`. Per-package bumps managed by changesets, lockstep across all five published packages.

### Added

- `cadence dispatch plan` now computes an advisory execution verdict per task — `{ execution: 'inline'|'dispatch', modelClass, model, reasons[] }` — giving `config.subagentPolicy` and `config.modelPerClass` their first consumer. A new optional `class:` DRAFT task field (`TaskZ.class`) lets an operator declare a task's execution class; a pure heuristic cross-checks it and a mismatch surfaces as a `cadence draft check` coherence warning. `--json` output gains the new per-task fields plus a top-level `signals.contextUtilization` (always `null` for now — no real context-utilization signal is wired in yet). The rendered dispatch packet gains an `**Execution:**` line (and a `**Model:**` line when dispatched). Read-only/advisory only — it does not spawn, schedule, or supervise agents. (Phase `279`.)
- Makes the dispatch contract enforceable at record time, closing the 2026-07-18 deja incident's three recommendations (`rec-20260718-003/004/005`). A new optional `stop:` DRAFT task field renders as a `**Stop condition:**` packet line, and `cadence draft check` warns (never blocks) when a task declares `files:` with no `stop:`. `cadence build task <id> --status=DONE` now runs a boundary + redundancy check at record time from real git diffs rather than agent self-report: a stray file outside the task's declared `files:` refuses the recording (exit 1, no mutation) once `boundaryEnforcement` resolves to `block`, unless `--allow-boundary-breach` is passed (records anyway, emits an error-severity anomaly). One task recorded with `--execution dispatch` escalates boundary enforcement to `block` for the rest of the phase and never de-escalates. `--isolation` and `--model-class` round out the new recording flags; all three carry through to `SUMMARY.json` on settle when present. (Phase `280`.)

### Fixed

- 11 open Dependabot alerts remediated in `website/` (docs site, not a published package).

### Changed

- Routine dependency bumps: `@anthropic-ai/sdk` 0.115.0 → 0.116.0, `eslint` 10.8.0 → 10.8.1, `turbo` 2.10.8 → 2.10.9, `tsx` 4.23.11 → 4.23.12, `@typescript-eslint/parser` 8.66.0 → 8.67.0, `github/codeql-action` 4.37.3 → 4.37.6.

## [1.59.0] - 2026-08-14

> Published to npm via the `Release` workflow (provenance), tag `v1.59.0`. Per-package bumps managed by changesets, lockstep across all five published packages.

### Added

- `cadence demo` — a fully non-interactive refuse-then-succeed walkthrough (a real DRAFT→BUILD→SETTLE loop against an assertion-mode gutted-but-green fixture, then the honest fix) that runs in an ephemeral sandbox and cleans up by default. `--keep` leaves the playground on disk, `--in-place` runs inside the current directory (refusing loudly instead of overwriting an existing `.cadence/` there), `--interactive`/`-i` opts into the tutorial's TTY-paced pauses. A bare `npx @thomas-powers-jr/cadence-core` or bare `cadence` invocation now dispatches straight into it. `cadence tutorial` keeps working unchanged, with one added stderr line pointing at `cadence demo`. A new progressive-disclosure onboarding-stage system (`~/.cadence/onboarding.json` or `$CADENCE_HOME/onboarding.json`, stages 0 First Contact through 3 Power User) hides `doctor` from `cadence help`/`cadence start` below stage 2, advanced to at least Driver by a successful `cadence demo` run; a new top-level `--advanced` flag forces the full surface at any stage, and every command stays directly invocable regardless of stage. (Phase `278`.)

### Fixed

- `--filter-regex` (on `recommendation list` / `decision list` / `assumption list`) now rejects patterns with nested quantifiers that can cause catastrophic backtracking (e.g. `(a+)+`) before compiling the operator-supplied pattern — closes a CodeQL `js/regex-injection` (ReDoS) finding on pre-existing phase-220 code, surfaced (not introduced) by phase 278's PR.

## [1.58.0] - 2026-08-13

> Published to npm via the `Release` workflow (provenance), tag `v1.58.0`. Per-package bumps managed by changesets, lockstep across all five published packages.

### Added

- `cadence doctor` gained a new check, `recommendation-archive-currency`, that warns when a recommendation in the active `recommendations[]` array carries a terminal `shipped`/`rejected` status without being moved into `archived[]` — the invariant phase 276 had to hand-backfill for 21 recommendations that predated phase 102/v1.24's auto-archive feature. `converted` and `settle-pending` are deliberately excluded from the flagged-status set: a converted recommendation's only schema-documented successor state is `settle-pending` (reached solely via the settle hook), not `archived`. Diverging from the two adjacent ledger-reading doctor checks (`recommendation-shipped-drift`, `orphaned-evidence`), a malformed/schema-invalid `recommendations.json` reports `indeterminate`, never a silent best-effort `ok`. `fixId` is always `null` — archiving is evidence-gated per record, not a safe blind auto-repair. (Phase `277`.)

### Internal

- Phase 276 archived 21 recommendations (20 shipped, 1 rejected) that already carried terminal status but predated auto-archive, entirely via the existing `cadence recommendation archive` CLI — zero new code. This closed out `HANDOFF-v1.58-ledger-truth.md`, an external audit whose central diagnosis (a missing recommendation-lifecycle terminal state) proved wrong on independent verification before any code was written; the corrected, much smaller replacement (`HANDOFF-archive-backfill-CORRECTED.md`, the auditor's own retraction) is what actually shipped. Both docs are preserved under `docs/handoffs/` as the narrative record, matching this repo's own convention of preserving rejected history. `rec-20260701-001` (status `converted`, no `shippedRef`) was excluded from the backfill and remains open for a future promotion once its shipping version is confirmed. Records `dec-20260814-001`: accept `archiveReason=manual` for the backfill cohort, identifiable by `archivedAt`, rather than add a new `--reason` CLI flag for a one-time migration. (Phase `276`.)
- Filed `rec-20260813-006` (reset --hard tracked-file data-loss guard) to the intelligence ledger for future work; not yet implemented.

## [1.57.0] - 2026-08-13

> Published to npm via the `Release` workflow (provenance), tag `v1.57.0`. Per-package bumps managed by changesets, lockstep across all five published packages.

### Added

- `deep-verify` and `per-task-verify` now persist the provider/model identity that actually ran them into a settle's `gates[]` array, via structurally separate `observedProvider`/`observedModel`/`taskId` fields on `GateProvenanceZ` that `deriveAssuranceRecord`'s rollup fold stays completely blind to (it only reads `.provider`/`.model` by field name, unchanged) — previously neither gate recorded any identity there at all, unlike `code-review`/`security-audit`. `per-task-verify`'s already-persisted per-task identity is now synthesized into `gates[]` at settle time, one entry per task, prepended to the front of the array. Closes `rec-20260808-007`. (Phase `275`.)
- `cadence resume` now warns when `state.json`'s `session.lastHandoff` pointer names a `SESSION-*.md` file that no longer exists, instead of silently falling back to the freshest-by-`generated_at` doc with no signal the pointer was dangling. `ResumeResult` gains an additive, optional `danglingHandoffPointer` field. (Phase `273`.)
- `settle run --deep` no longer refuses (or requires `--force`) on an Acceptance Criterion whose satisfaction condition is structurally circular — depending on the very `SUMMARY.md`/`SUMMARY.json` that settle produces. A new pure classifier (`classifyAcObservability`) routes this narrow shape to a distinct `unobservable` verdict, excluded from deep-verify's offenders list and the evidence-floor gate but never rolled up as a pass or allowed to move `assurance.overall` toward `strong`. `DeepVerdictZ` gains an additive, optional `unobservable` boolean field. (Phase `274`.)

### Fixed

- `nanoid` bumped to `3.3.18`, closing `GHSA-2v37-7h3g-55p8` (custom generators looping indefinitely when size is zero) — a transitive dev-only dependency via `vite`/`postcss`, never shipped to consumers, resolved as a targeted `pnpm-lock.yaml`-only change with zero `package.json` diff. Newly surfaced between this cut's own PRs, blocking every merge to `main` until fixed.

### Internal

- `security-audit`'s gate-matrix unreachability under the default `standard` profile, reaffirmed for v1.56, was reaffirmed again for v1.57 (`dec-20260812-003`) — making it reachable would land the first-ever real conduction of that gate in project history inside the same release that also changed deep-verify's verdict semantics, contradicting this release's own no-bundling principle. Revisit as its own release once v1.57 has run against a few normal phases. (v1.57 Phase U, skipped — `dec-20260813-002`.)
- Ledger reconciliation: `rec-20260812-004` merged into the earlier, more-advanced `rec-20260809-001` as a duplicate (`dec-20260813-001`); `O.3`'s conduction-drift-streak threshold re-measured against a real 35-settle corpus (66% would have warned historically) and its deferral reaffirmed with the corrected figure recorded rather than inventing a new threshold (`dec-20260813-003`); the documented-blocker posture on the milestone with no CLI closure path reaffirmed (`dec-20260813-004`); the coverage-scheme default split — existing-project upgrades stay `bare`, fresh `cadence init` recommended to default to `phase-qualified` in a future phase (`dec-20260813-005`). (v1.57 Phase W.)

## [1.56.0] - 2026-08-11

> Published to npm via the `Release` workflow (provenance), tag `v1.56.0`. Per-package bumps managed by changesets, lockstep across all five published packages.

### Added

- `cadence doctor` check `release-currency`: warns when the local repo's publishable content has drifted from what npm actually serves under the matching version — compares local `engines` against npm's published `engines` and independently flags any pending `.changeset/*.md` files awaiting release. (Phase `262`.)
- `cadence doctor` check `conduction-drift-streak`: counts consecutive most-recent settles that carried no non-mock provider identity in `assurance.verifierRollup`, escalating from `ok` to `warning` (never a settle refusal) once the streak reaches 3. Adds a fourth `DoctorSeverity` rung, `indeterminate`, for a check that could not assess the repo at all. (Phase `268`.)
- `cadence verify historical-coverage-audit`: a read-only diagnostic auditing every pre-phase-239 `SUMMARY.json` record's recorded AC PASS against genuine, attributable test evidence, closing `rec-20260729-006`. (Phase `261`.)
- `cadence summary verify-all`: an in-process sweep verifying every `<id>-SUMMARY.json` under `.cadence/phases/**` without spawning a subprocess per file, closing a growing Windows CI timeout risk in the corpus-wide verify test. (Phase `264`.)
- `cadence init` now asks explicitly which verifier provider (`mock`/`anthropic`/`local`/`host-cli`) should back deep-verify, unless an explicit flag/`--activate`/`--full` already settled it — with `mock` presented as a normal, first-class option. The resolution is always recorded as a retrievable decision in `cadence decision list`. (Phase `265`.)
- `providerSelection` added to persisted gate provenance (`configured` / `fallback` / `empty-diff`), distinguishing a deliberate provider choice from a silent mock fallback from an empty-diff no-op judgment, across five of seven verifier seams (`code-review`, `security-audit`, `spec-review`, `ui-spec-review`, `plan-review`). (Phase `263`.)

### Changed

- Rendered provider labels across `cadence summary render`, the `-SUMMARY.md` sidecar, `cadence doctor`, `cadence config explain`, and the phase-243 fallback banners now precisely convey what `mock` does and does not check, and surface Phase 263's `providerSelection` where available — all sourced from one shared formatter. (Phase `264`.)
- Mock no longer records a persisted `pass` for the five review-family gates (`code-review`, `security-audit`, `plan-review`, `spec-review`, `ui-spec-review`) — it abstains instead, closing the false-clean-pass gap where an empty or non-matching diff was recorded identically to a genuine review having run and found nothing. A mock-served refusal is never relabeled. This repo's own `.cadence/config.json` `profile` moves off `auto` to `standard` in this same release. (Phase `267`.)

### Fixed

- A raw NUL byte in `assurance-record.ts` (used as a `Map`-key delimiter) made the file `grep`/`file(1)`-classify as binary, silently suppressing every `grep` match in it. Replaced with an escaped Unicode NUL — the delimiter's runtime value is unchanged — and added a corpus-wide regression guard against recurrence. Also corrected `deriveAssuranceRecord`'s `'weak'`-classification docstring, which had never matched the code's actual (`'unverified'`) behavior. (Phase `272`.)
- Two confirmed Windows CI timeouts root-caused and fixed: the corpus-wide `summary verify` sweep (now single-process, see `cadence summary verify-all` above) and the `skill-invoke` FIFO-cap-at-100 test's 105 serial real-disk round trips (now a pure, I/O-free unit test). (Phase `266`.)
- `examples/demo-test-gutting/run-demo.sh`'s post-init config patch never set `verification.coverageScheme`, so every AC showed "has no linked test" and masked the demo's actual thesis — a gutted assertion-mode test caught by the coverage gate. (Phase `270`, `rec-20260810-001`.)

### Internal

- Backfilled `.cadence/ROADMAP.md` and `.cadence/MILESTONES.md` through phase 268, closing a 38-phase roadmap-currency drift down to well within threshold. Recorded the one remaining milestone/recommendation desync (`mil-rec-rec-20260808-003`) as a documented blocker rather than a hand-edit, since no CLI path exists to close it (`rec-20260803-001`). (Phase `271`.)
- Recorded `security-audit`'s gate-matrix unreachability (1 of 9 profile × tier cells; the `standard` default profile excludes it at every tier) as a deliberate, on-the-record decision for this release rather than shipping it unaddressed (`dec-20260811-001`). Reaffirmed `rec-20260808-007`'s `deep-verify`/`per-task-verify` provenance exclusion through v1.56, deferred to v1.57 (`dec-20260811-002`).

## [1.55.0] - 2026-08-07

> Published to npm via the `Release` workflow (provenance), tag `v1.55.0`. Per-package bumps managed by changesets, now enforced lockstep across all five published packages via a `fixed` group in `.changeset/config.json` (previously `fixed: []` — every prior release happened to land in lockstep by coincidence, not enforcement; this cut caught the drift when it first actually diverged).

### Added

- `cadence doctor` check `conduction-reachability`: reports, separately for `code-review` and `security-audit`, whether the current configuration can produce a real-provider (non-`mock`) finding at all, naming exactly which axis (gate profile, provider config, self-invocation guard) blocks each gate. Visibility only — no blockers are modified or bypassed. (Phase `251`.)
- `cadence doctor` check `roadmap-currency`: reports drift between the highest phase number under `.cadence/phases/` and the highest phase number referenced in `ROADMAP.md`/`MILESTONES.md` — an anti-recurrence check for the 113-phase/6-week drift fixed in PR #321. (Phase `259`.)
- `codeReview`/`securityAudit` findings on a `SUMMARY.json` are now rendered in both Markdown summary surfaces (the on-disk `-SUMMARY.md` sidecar and `cadence summary render`) under a shared `## Findings` section — previously JSON-only, giving no visibility into the finding that caused a refusal without opening the raw record. `code-review` findings are now redacted the same way `security-audit` findings already were. (Phase `257`.)

### Fixed

- The JS/TS `test-coverage` gate's regex-literal handling: an unrecognized `/regex/` containing a paren, quote, or backtick was read as a real structural character, corrupting paren matching and silently undercounting or dropping test-block spans. Affected 20 of this repo's own 446 JS/TS test files; all 20 confirmed resolved by the scanner fix alone (no file-content edits needed). A masker fallback that can't confidently classify a `/` is now surfaced via `cadence verify coverage --explain` instead of failing silently. (Phase `258`.)
- Stale `pnpm.overrides` targets refreshed against the resolved lockfile, plus a new drift detector (`scripts/check-lockfile-overrides.mjs`, wired into CI's `audit` job) so an override that stops covering every resolved instance of its package fails CI instead of silently no-op'ing. (Phase `253`.)
- Security advisory remediation: re-verified and re-justified the three then-documented `pnpm audit` exceptions (vitest/vite/postcss) against current repo state. (Phase `254`.)
- Major `vitest` 2 → 4 upgrade, closing the vitest/vite/postcss exceptions above for real (superseding the re-verification) — resolved as a byproduct, an undocumented HIGH `js-yaml` advisory (`GHSA-5p4m-2wfm-xmqj`) that surfaced separately (`rec-20260807-002`). (Phase `260`.)
- `security-success` and `codeql-success` (built in phase 255 specifically to be required branch-protection checks) were never actually registered as such — `main`'s `required_status_checks.contexts` was `["ci-success"]` only, so a red audit or CodeQL run could not block a merge despite phase 255's stated goal. Registered both. (`rec-20260807-002`.)
- `website/`'s separate pnpm lockfile synced off a vulnerable `brace-expansion`/`js-yaml` resolution.

### Internal

- Self-application config correction: raised this repo's own `evidenceFloor` to `assertion` and deferred a baseline-profile change to a later milestone, after live real-provider certification of `code-review`/`security-audit` surfaced it and two other engine/process gaps (each filed as its own recommendation) that no prior session had reached with an actual non-`mock` provider. (Phases `252`, `256`.)

## [1.54.0] - 2026-08-02

> Published to npm via the `Release` workflow (provenance), tag `v1.54.0`. Per-package bumps managed by changesets. First release published under the `@thomas-powers-jr` npm scope.

### Changed

- **npm scope renamed to `@thomas-powers-jr`** across all five published packages, matching the GitHub org rename (#360). The previously-published `@manehorizons` packages are not deleted — they stay resolvable and get `npm deprecate`d with a pointer to the new scope as a separate operator-run step; see [docs/migration-npm-scope.md](docs/migration-npm-scope.md) for the full migration path. `cadence doctor`'s host-hooks check and `cadence config explain`'s warnings now distinguish a hook entry that's missing entirely from one that's present but still pointing at the old scope. (Phase `250`.)

### Fixed

- Bypassed `code-review`/`security-audit` verifier **throws** (the call itself never returned) now record an honest `status: 'skipped'` SUMMARY entry with a `skipReason`, via a new `GateFlags.reviewVerifierFailure` flag — previously indistinguishable from a real provider pass. A verifier throw with no bypass flag still refuses identically to before. (Phase `248`, rec-20260801-004.)
- Three more silent-refusal gaps in `cadence settle run` — the AC-derivation, anomaly/skill-audit, and evidence-floor refusal families — now write a durable `SUMMARY.json`/`.md` via the existing `writeRefusedSettleSummary`, instead of exiting with only an ephemeral stderr line. (Phase `249`, rec-20260712-006.)
- A refused `cadence settle`'s `code-review`/`security-audit` findings are now recorded in the refused `SUMMARY.json` instead of silently dropped. A later settle attempt for the same draft no longer overwrites a prior refused attempt's findings — each findings-bearing refusal now also writes an immutable per-attempt snapshot sibling. (Phase `247`.)

## [1.53.0] - 2026-08-01

> Published to npm via the `Release` workflow (provenance), tag `v1.53.0`. Per-package bumps managed by changesets. Lands the `feat/kernel-assurance-v2` arc (phases 232-236, 241-245, open since 2026-07-27) merged whole into `main` per `dec-20260727-001`.

### Added

- **Gate provenance carries verifier identity** — settle can now tell a mock-verified `code-review`/`security-audit` gate from a real-provider one; `SUMMARY.schemaVersion` moves to `1 | 2`. Closes CADENCE's sole surviving P0. (Phase `232`, rec-20260727-001.)
- **Per-settle assurance record** — every settle derives a whole-run `assurance` record (`verifierRollup`, `evidenceTally`, `overall: strong|mixed|weak|unverified`) from gate provenance plus the per-AC evidence ladder. (Phase `233`, rec-20260728-001.)
- **Kernel/verifier/consumer boundary, lint-enforced** — the ~80%-already-built plugin architecture is named and published as `contracts/`; an ESLint rule fails the build on any module outside `verify/`/`contracts/` importing a verifier family directly. `spec-review`/`ui-spec-review` gain injection seams. (Phase `234`, rec-20260727-003.)
- **Criteria-anchored code-review findings** — every finding is tagged on a four-tier anchor ladder (`executable` > `structured` > `declared` > `undeclared`); an `undeclared` finding is a criteria gap with no new refusal path or bypass flag. (Phase `235`, rec-20260727-004/-005.)
- **Anchor ladder's `executable` tier reachable in a real settle** — `SettleContext` now threads prior-gate provenance (frozen, two levels deep) into `code-review`, closing phase 235's structurally-dead top rung. (Phase `241`, rec-20260729-002/-007.)
- **Finding identity, disposition, and Finding-type convergence** — findings carry a stable content-hash `id`, `target`, `disposition`, and `waiver`; `code-review`'s local 3-severity `Finding` type converges onto the shared, persisted 4-severity type (decision D9). (Phase `236`, rec-20260727-006/-011.)
- **Findings-to-ledger auto-routing** — identified `code-review` findings route into the recommendation ledger at settle time, deduped by `Finding.id`, batched under one `scoutId` per settle. New `recommendations.autoRoute` config field (default `true`). (Phase `242`, rec-20260731-003.)
- **Settle-time foreign-binary guard** — detects a settle actually executing through a `cadence` binary that resolves outside the repo's own checkout despite a local build (the exact bug that silently downgraded phases 233/234's SUMMARYs); loud stderr banner plus a `foreignBinaryMismatch` SUMMARY field. (Phase `244`, rec-20260729-001.)
- **Loud banner on every seam's credential-missing downgrade** — all 7 verifier seams, not just deep-verify, now emit the same loud multi-line banner on a selection-time mock fallback (missing API key, missing local-model config, unwired host-cli family). (Phase `243`, rec-20260731-002 follow-up.)

### Fixed

- Finding identity no longer hashes `anchor.kind`/`anchor.ref`/`severity` — both can legitimately change across settles for the same underlying defect (the DRAFT-amendment anchor-earning workflow re-anchors a previously-unanchored finding; severity is live LLM classification under real verifier providers), which was defeating phase 242's ledger dedup and minting duplicate recommendations. Identity is now a pure hash over `(file, normalized message)`. (Phase `245`, rec-20260801-009.)

## [1.52.0] - 2026-07-31

> Published to npm via the `Release` workflow (provenance), tag `v1.52.0`. Per-package bumps managed by changesets.

### Changed

- **BREAKING (engine floor): minimum supported Node.js raised from `>=20` to `>=22`.** Node 20 reaches end-of-life in April 2026; the Node 20 CI/test leg is retired across the monorepo and every published package's `package.json` now declares `"engines": { "node": ">=22" }`. Shipped as a minor bump, not major, per the precedent set by the Zod v3→v4 upgrade — CADENCE reserves 2.0.0 for full Cadence coupling. (Phase `238-drop-node20-support`.)
- **Phase-attributable AC coverage** — new opt-in `verification.coverageScheme` config field (`"bare"` | `"phase-qualified"`, default `"bare"`) closes a cross-phase AC-token collision: under `"phase-qualified"`, an `AC-N` token must carry its phase-slice prefix (`239-01/AC-3`) to count as evidence, and `cadence verify phase` matches by qualified token instead of file-scoping, eliminating false "drifted" verdicts on under-declared DRAFTs. (Phase `239`, closes the AC-token-collision gap.)
- **Gate-sealed docs + provenance parity** — `docs/reference/config.md`/`docs/concepts.md` now name all three gates that actually consult `isGateSealed` (`test-coverage`, `build-test-must-pass`, `boundary-scan`); gate-provenance now records which bypass flag fired for all three sealed gates, not just `test-coverage`. (rec-20260725-006.)
- `cadence doctor` gains a `ledger-remote-collision` check catching cross-branch/worktree id collisions in the four Praxis ledgers before push. (rec-20260726-003.)
- `SUMMARY.json` gains a settle-time sha256 `contentHash`; new `cadence summary verify <phase> <num>` detects post-settle hand-edits. (rec-20260724-006.)

### Fixed

- `cadence doctor`'s `verification-readiness` check now inspects every verifier seam, not just deep-verify — a seam configured to a real provider with missing credentials was silently classified as real and downgraded to `mock` at call time without warning. (#331.)
- Fresh `EnterWorktree`/clone `NotInitializedError` now points at `cadence onboard` (not `cadence init`, which correctly refuses) when `.cadence/` exists but `state.json` is missing. (rec-20260726-002.)
- Python coverage profile's opener regex now accepts a return-type annotation (`-> None:`) between the parameter list and colon — previously silently dropped the whole file's span table. 

### Internal

- Extracted a shared `runConvergentReview` primitive used by all 4 bounded-convergence call sites. (rec-20260725-008.)
- `settleService` decomposed from one ~555-line function into 9 named step functions; no behavior change. (rec-20260725-007.)

## [1.51.1] - 2026-07-25

> Published to npm 2026-07-25 via the `Release` workflow (provenance), tag `v1.51.1`. Per-package bumps managed by changesets.

### Added

- **`@manehorizons/cadence-host-toolkit`** — first npm publish. A new shared package holding the hook-event routing algorithm's shape, the slash-command catalog, `install.ts`'s managed-marker merge logic, and `locate-self.ts`, extracted out of `host-claude-code`/`host-codex` to fix drift between the two adapters' duplicated copies (including a bug where host-codex's local catalog had silently lost `cadence-dispatch`'s `DISPATCH_DIALOGUE` body). Core now enforces a `HostCapabilities.agentIdentification` flag so a host that can't supply `agentId`/`agentType` (Codex) is noticed loudly instead of silently treated as no-subagent. (Phase `222-shared-adapter-toolkit`.)
- **MCP/CLI parity** — `cadence_next`, `cadence_verify_coverage`, `cadence_verify_phase`, and `cadence_explain` are now registered as read-only MCP tools, backed by the same `services/*` functions as their CLI counterparts (tool count 18→22). `cadence_recommendation_promote` (MCP) now accepts a `ref` argument, matching the CLI's `--ref`. (Phase `221-mcp-cli-parity`, `rec-20260725-003`.)

### Changed

- **Unified Praxis intelligence ledgers** — the five ledgers (recommendations, evidence, assumptions, decisions, milestones) now share one read/write/id-minting module instead of five hand-rolled implementations, so a safeguard added for one subject applies to all. `cadence intelligence audit`/`reconcile`/`stats` gain a fifth `orphan-milestone` finding kind; `milestones.json` is now written with `{ mode: 0o600 }` like the other four ledgers. (Phase `220`.)

### Fixed

- **Recommendation id-minting cross-checks `evidence.json`** — `nextRecommendationId` previously derived the next `rec-YYYYMMDD-NNN` id only from `recommendations.json`, so a dangling `evidence.json` row (left by a bad rebase-conflict resolution or interrupted `add` call) could collide with a freshly minted id. `cadence doctor` gains an `orphaned-evidence` check. (Phase `219-recommendation-id-cross-check`, `rec-20260724-013`.)
- **Post-publish npm verification retry budget** — `scripts/release-integrity.mjs`'s post-publish registry check now retries up to 10 times (was 3) to absorb npm CDN propagation lag; the pre-publish idempotency check keeps its original fast default. Fixes a real false-red on the `v1.51.0` Release workflow run. No changeset (repo tooling only, no `packages/*/src` touched). (Phase `218-release-verify-retry-budget`, `rec-20260725-001`.)
- **CLI/MCP dedup** — the "did this `milestone propose` run produce a newly-proposed milestone" predicate, previously copy-pasted identically in `cli/commands/milestone.ts` and `services/milestone-propose.ts`, is now one exported `hasNewlyProposedMilestone()`. (Phase `221-mcp-cli-parity`.)

## [1.51.0] - 2026-07-25

> Published to npm 2026-07-25 via the `Release` workflow (provenance), tag `v1.51.0`. Per-package bumps managed by changesets.

### Added

- **Close the trust envelope for `cadence_settle`** — the MCP `cadence_settle` tool is now gated by the same trust-envelope pre-check as `cadence_draft_approve`/`cadence_spec_approve`; a call with no valid grant is refused before `settleService` runs. `enforceApprovalBypassGrant` renamed to `enforceGatedToolGrant`. (Phase `216-settle-capability-gate`.)
- **`gates.evidenceFloor`** — a new settle gate refuses `cadence settle run --auto` when any AC's `PASS` verdict rests on evidence ranked below a configured floor on the evidence ladder (`ai-verified` > `executed` > `assertion` > `mention` > `unverified`). Preset defaults: `solo` → `assertion`, `team`/`production` → `executed`. A named, per-AC, reason-required bypass (`--evidence-floor-bypass <AC-id:reason>`) is recorded in `SUMMARY.gateBypasses`. (Phase `214-evidence-floor-gate`.)
- **`cadence doctor` `phase-freshness` check** — warns when the active phase/draft's `PROGRESS.json` has a task updated within the last 10 minutes, naming the task and its age, to catch a concurrent session working the same phase/draft. Read-only, best-effort. (Phase `208`.)
- **`cadence retro feedback`** — matches recurring cross-phase retro friction (gate bypasses, rough task statuses, finding categories) to recommendations by `affectedAreas`/`affectedFiles` overlap and records each match as auditable evidence; `cadence recommend`/`context`/`next` now factor linked friction into a transparent `frictionPts` scoring term. (Phase `212`.)
- **CHANGELOG.md currency gate** — `.githooks/pre-commit`/`pre-push` now also refuse a version-bump commit whose `CHANGELOG.md` newest heading doesn't match, mirroring the existing `CLAUDE.md` check; re-asserted in CI via `doc-sync-hook.test.ts`. Closes the record-integrity gap that let this file itself fall 44 versions behind before today's backfill. (Phase `217-changelog-currency-gate`.)

### Changed

- **Minimum test-coverage thresholds enforced in CI** — `vitest.shared.ts` now wires real, per-package coverage thresholds (previously collected in `vitest.config.ts` but enforced nowhere), keyed by package cwd. (Phase `213`.)

### Fixed

- **Anthropic mock-fallback warning clarity** — the `anthropic`-provider mock-fallback warning and its `cadence config explain` counterpart now state plainly that being logged into Claude Code (or another host CLI session) does not satisfy `ANTHROPIC_API_KEY` — it's a separately-billed direct SDK call with no visibility into a host session's own credential store. (Phase `209`.)
- **CLAUDECODE-aware doctor/activate messaging** — `cadence doctor`'s verification-readiness check and `cadence activate`'s key-missing message now name the Claude-Code-login-doesn't-satisfy-this confusion directly when running inside a live Claude Code session, and suggest `cadence activate --provider host-cli` as the fix. (Phase `211`.)
- **GitHub Pages demo + this file** — the docs-portal homepage hero was still showing an old demo after `README.md` moved on; re-synced. This file itself is now current through `1.50.0` (44 previously-unrecorded versions backfilled) instead of stopping at `1.6.0`.

### Docs

- Anthropic provider auth documented as separate from a Claude Code login (`docs/providers.md`). (Phase `210`.)
- A mechanical ledger-diff step added to `CLAUDE.md`'s audit protocol, backed by a doc-content test. (Phase `215`.)

## [1.50.0] - 2026-07-22

> Published to npm 2026-07-22 via the `Release` workflow (provenance), tag `v1.50.0`. Per-package bumps managed by changesets.

### Added

- **`cadence verify phase [phase] [num]`** — a state-independent, phase-scoped re-derivation of whether a settled phase's recorded AC coverage still holds against the current working tree, using only the phase's committed `DRAFT.md`/`SUMMARY.json`. `--changed --base <ref>` discovers phases via `git diff` for CI use. `cadence init --ci` scaffolds a matching GitHub Actions workflow.
- **`cadence next`** — a read-only command answering "what now?" deterministically from live loop state: 1-3 ranked legal moves with exact commands, plus a stable `--json` contract for agent orchestrators. Registered as the 15th Claude Code slash command (`/cadence-next`) and matching Codex prompt.
- **`cadence draft add-task`'s empty-result/refusal messages** across the intelligence-layer CLI (`recommend`, `milestone propose`, `recommendation promote/convert/list`, `retro`) now state why a result is empty, the unmet precondition, the nearest-miss candidate, and the exact unblocking command.
- **`cadence milestone reopen <id>`** — moves a `deferred` milestone back to `proposed` so its claimed recommendations become eligible for re-clustering.
- **UI-SPEC design contracts** — `cadence spec new --ui` scaffolds an opt-in `<id>-UI-SPEC.md` sidecar for phases touching UI surfaces; `cadence spec approve` runs a new convergent `ui-spec-review` gate when one is present, and `cadence draft new` seeds its content into the DRAFT.

## [1.49.0] - 2026-07-20

> Published to npm 2026-07-20 via the `Release` workflow (provenance), tag `v1.49.0`.

### Added

- **`cadence summary render <phase> <num>`** — a read-only command that reads a settled phase's `SUMMARY.json` and prints a deterministic Markdown rendering (per-AC pass/fail with evidence level, per-task status, gate outcomes, bypasses) suitable for pasting into a PR. Refuses loudly on missing/invalid/schema-failing input.
- **`docs/team-rollout.md`** — a guide for adopting CADENCE across a team in PR review without replacing existing CI or human review.

## [1.48.0] - 2026-07-20

> Published to npm 2026-07-20 via the `Release` workflow (provenance), tag `v1.48.0`.

### Added

- **Operator-authored milestone pre-mortem fields** — `cadence milestone premortem <id>` accepts repeatable `--add-out-of-scope`/`--add-likely-failure-mode`/`--add-hidden-dependency` flags that append text without hand-editing `milestones.json`; entries survive later automatic refreshes.
- **`cadence recommendation evidence add <recId> --note <text>`** — appends a new evidence note to an existing recommendation and links it into `evidenceIds` atomically.

### Fixed

- **`.cadence/state.json`/`STATE.md` cross-worktree merge conflicts (#177)** — `cadence init` now gitignores the four CADENCE-owned ephemeral paths by default; `cadence doctor --fix` gains a `state-tracked` check and `untrack-state` auto-repair for existing repos. The audit-trail value a tracked `state.json` used to carry now lives in a new `stateAtSettle` field on `SUMMARY.json`/`SUMMARY.md`.

## [1.47.0] - 2026-07-18

> Published to npm 2026-07-18 via the `Release` workflow (provenance), tag `v1.47.0`.

### Added

- **`recommendedIsolation` on `cadence dispatch plan`** — every task in a dispatch plan now carries `'worktree'` or `'none'` based on whether it declares `files:`, surfaced in both `--json` output and the rendered packet text.

### Fixed

- **Dispatched-agent authorization overrun** — a real 2026-07-18 incident showed a dispatched fork agent running `cadence build`/`cadence settle` and `git commit` directly against `main`, self-authorized. Every rendered dispatch packet now includes a mandatory prohibition block forbidding state-mutating `cadence` subcommands, `git commit`/`push`, and network actions — the dispatched agent must stop and report, never self-record its own outcome.
- **`StateConflictError` false-positives under `host-cli` verifiers** — a `SubagentStop` hook's telemetry-only `session.subagentSpawns` bump was routed through the same revision-guarded commit path as structural writes, so a long-running `host-cli` verifier call reliably collided with any overlapping subagent spawn (#234). `StateBackend` gains a separate `bumpSessionCounter()` write path that never touches the optimistic-concurrency `revision` field.

## [1.46.0] - 2026-07-18

> Published to npm 2026-07-18 via the `Release` workflow (provenance), tag `v1.46.0`.

### Added

- **`cadence onboard`** — one-command setup for the 2nd-Nth teammate cloning a repo that already has `.cadence/` committed: installs host hooks and reports project/provider readiness without re-scaffolding config or state.
- **`cadence retro`** — read-only cross-phase rollup over every settled phase's retro artifact, splitting gate-bypass/task-status/finding-category friction into recurring (2+ phases) vs. one-off buckets.
- **`cadence doctor --fix` handoff-retention auto-remediation** — sets `handoff.retain` to the default and prunes the archive when it's grown past the warn threshold.
- **Real `host-cli` verifier wiring** — `spec-review`, `plan-review`, `code-review`, `security-audit`, and deep-verify now have working `host-cli` builders (previously only `per-task-verify` did; every other family with `provider: "host-cli"` silently fell back to `mock`).
- **`cadence init --full`** — composes `--wire-host`, `--demo`, and `--activate` into one call, printing a consolidated setup summary.

### Fixed

- **`--allow-auto-complex` soft-cap invisibility** — bypassing the auto×complex soft cap now records a `gateBypasses` entry in `SUMMARY.json` and emits a new `auto-complex-override` anomaly.

## [1.45.0] - 2026-07-15

> Published to npm 2026-07-15 via the `Release` workflow (provenance), tag `v1.45.0`.

### Added

- **MCP tool-trust envelope** — constrains `cadence_draft_approve` and `cadence_spec_approve`, the two MCP tools where the tool call itself previously acted as the approval with no expiry/capability-scope/revoke logic. Every registered MCP tool is now tagged with a `capabilityClass`; the two `APPROVAL_BYPASS` tools refuse unless the caller holds a trust grant matching the tool's live def-hash, running CADENCE version, and an unexpired TTL. Grants are issued exclusively via `cadence mcp trust grant/revoke/list`, a CLI-only, real-TTY surface — never reachable from any MCP tool call. `cadence_settle` is classified `SETTLE` but was deliberately left ungated this phase (closed in `216-settle-capability-gate`, see Unreleased). (Phase `181-mcp-tool-trust-envelope`.)
- **`cadence milestone status <id>`** — read-only reconciliation mapping a milestone's converted recommendations to their phases and each phase's live loop position, replacing N manual `cadence status` round-trips.

### Fixed

- **Verifier call cancellation + tracing** — an optional `{ signal, traceId }` now threads through the verifier call path so long verifier runs can be cancelled cleanly and correlated in logs (`security-audit` gate scoped first).
- **`host-cli` provider hardening** — guards against invisible host-CLI quota consumption, an unguarded self-invocation loop when `cadence` is already running inside the CLI it would spawn, and a subprocess hang (new `CADENCE_HOST_CLI_TIMEOUT_MS`, default 3 minutes).
- **Secret redaction in persisted ledgers** — `Evidence.summary` and `security-audit` findings now pass through a `redactSecrets` utility before being written; the four intelligence ledger JSON files are now written `0o600`.

## [1.44.1] - 2026-07-13

> Published to npm 2026-07-13 via the `Release` workflow (provenance), tag `v1.44.1`.

### Fixed

- **Uncaught gate-implementation exceptions** — a thrown exception from any settle gate previously escaped uncaught, printing to stderr and exiting 1 with no `SUMMARY` written (only `security-audit` normalized its own throws). All 9 settle-dispatched gates now funnel through a central wrapper that synthesizes a `refuse` outcome. Closes rec-20260712-007.
- **Optimistic concurrency for `state.json` writes** — `CadenceState` gains a `revision` field; `SimpleStateBackend.commit()` refuses with a new `StateConflictError` on a revision mismatch instead of silently overwriting a concurrent writer's change (`{ force: true }` overrides). Root-fixes a real incident where two concurrent Claude Code sessions in one checkout stomped each other's uncommitted work.
- **Post-settle retro artifact + GitHub issue offer** — every successful settle now writes a `<draftId>-RETRO.json`/`.md` friction digest (gate bypasses, rough task statuses, findings) and, when non-empty and interactive, offers to file a `needs-triage` GitHub issue for it.
- **Refused-gate provenance + SUMMARY on refusal** — a refusing gate no longer silently drops out of provenance; `GateProvenanceZ.status` gains `'refused'`, and a refused `settle run` now persists a populated `SUMMARY.{json,md}` instead of writing nothing.

## [1.44.0] - 2026-07-11

> Published to npm 2026-07-11 via the `Release` workflow (provenance), tag `v1.44.0`.

### Added

- **Multi-language assertion-mode test-coverage spans** — real span parsing for Python, Go, Rust, and PHP (previously js/ts only), via a shared profile-parameterized scanning engine. `verification.coverageProfiles` lets an operator define a custom profile for an unsupported language. `cadence verify coverage --explain AC-N` is a new read-only diagnostic.

### Fixed

- **`coverageMode` defaulted to `'assertion'` for every language** — `cadence init` now detects project language and only defaults to `'assertion'` for js/ts; other languages default to `'mention'` with language-aware `testGlobs`. Closes the "permanently unsatisfiable gate" failure mode for non-JS projects (real span parsing for those languages is the separate Added item above).
- **Skipped tests counted as covered in assertion mode** — an AC whose only linked test sits inside `test.skip`/`.todo`/`.failing` is no longer treated as covered; the gate now refuses with a distinct "only linked test is skipped" message.

## [1.43.0] - 2026-07-11

> Published to npm 2026-07-11 via the `Release` workflow (provenance), tag `v1.43.0`.

### Added

- **Codex zero-friction first run** — `cadence init --host codex` (with `--agents-md`) wires host hooks and generates `AGENTS.md` in one step; `cadence doctor` gained Codex readiness checks with `--fix` remediation.
- **`host-cli` verifier provider** — a 4th verifier provider that shells out to your already-authenticated `claude`/`codex` CLI in headless mode instead of requiring `ANTHROPIC_API_KEY`. Falls back to `mock` with a loud warning on a missing binary or auth failure. This release wires only the per-task-verify family; the other families accept the config value but still fall back to mock until a follow-up (closed across `1.45.0`/`1.46.0`).

### Fixed

- **Handoff/resume gaps** — `cadence resume` now runs a best-effort origin-freshness probe before replaying a doc and warns when origin has commits the clone lacks; `cadence resume`/`cadence handoff --check` (new) detect scaffolded `<!-- FILL IN -->` sections left unfinished by a prior session.
- **Verifier activation trustworthiness** — a verifier API key is now discovered from a repo-root `.env` file when not exported; `cadence activate`'s live check is no longer coincidentally skippable; the discovered-key path now reaches every real verifier-selection call site, including `cadence mcp serve --repo <path>`.

## [1.42.0] - 2026-07-07

> Published to npm 2026-07-07 via the `Release` workflow (provenance), tag `v1.42.0`.

### Added

- **`boundaryEnforcement: 'block'` mode** — `handlePreToolEdit` refuses an out-of-boundary edit at edit time instead of only warning (DRAFT-frontmatter overridable).
- **`boundary-scan` settle gate** — closes the blind spot edit-time blocking can't see (a subagent-driven edit invisible to the pre-tool-edit hook); enumerates every file touched by the whole phase via git diff and refuses on a real offender.
- **`redundantWorkEnforcement`** — catches a subagent (or human) touching a DRAFT task's declared files after that task is already DONE, live at edit time plus a `SubagentStop` safety net.
- **`cadence dispatch plan [--json]`** — wave-based subagent dispatch groups computed from the active BUILD draft's task list (topological leveling over `depends:` and `files:`-overlap edges), plus a new `/cadence-dispatch` Claude Code slash command.

### Fixed

- **Multi-line DRAFT/SPEC parsing** — `parseSpecMd`/`parseDraftMd` previously truncated a multi-line Objective or Given/When/Then clause at the first line break.

## [1.41.0] - 2026-07-04

> Published to npm 2026-07-04 via the `Release` workflow (provenance), tag `v1.41.0`.

### Added

- **Three MCP tools closing the scout-to-phase dead-end** — `cadence_recommendation_convert`, `cadence_milestone_propose`, and `cadence_recommendation_archive`, plus a per-phase `SUMMARY.json` MCP resource.

### Fixed

- **`cadence_recommendation_promote`'s description** pointed at a CLI-only `milestone propose` command an MCP client had no way to invoke.

## [1.40.0] - 2026-07-04

> Published to npm 2026-07-04 via the `Release` workflow (provenance), tag `v1.40.0`.

### Added

- **`cadence draft set-objective`/`add-ac`/`add-task`** — three subcommands that mutate a PENDING `DRAFT.md`'s Objective/Acceptance Criteria/Tasks sections directly, round-tripping through the DRAFT parser so a hand-typed heading typo can no longer silently corrupt AC/Task id sequencing.

### Fixed

- **`parseAcceptanceCriteria`/`parseTasks` heading-regex bug** — a name-less `### AC-N:` heading bled the next line into the parsed name.

## [1.39.0] - 2026-07-03

> Published to npm 2026-07-03 via the `Release` workflow (provenance), tag `v1.39.0`.

### Added

- **`settle-pending` recommendation status (#126)** — when a `converted` recommendation's phase settles, it now moves to a non-terminal `settle-pending` status instead of silently archiving. A new `cadence doctor` `recommendation-shipped-drift` check surfaces recommendations awaiting ship confirmation.
- **`/cadence-recommend` slash command + `cadence recommend --top <n>`** — caps the displayed ranked recommendation list.

## [1.38.0] - 2026-07-03

> Published to npm 2026-07-03 via the `Release` workflow (provenance), tag `v1.38.0`.

### Added

- **Cross-worktree handoff discovery for `cadence resume`** — discovers resumable handoff docs across all active git worktrees of a repo, not just the current checkout's own `.cadence/handoff/`, via a live `git worktree list` scan. New `--list`/`--pick <n>`/`--path <p>`/`--local` flags; a 2+-candidate nudge or (opt-in) auto-picker. Picking a sibling worktree's candidate is strictly read-only. (Phases `142`–`144`.)

## [1.37.0] - 2026-07-02

> Published to npm 2026-07-02 via the `Release` workflow (provenance), tag `v1.37.0`.

### Added

- **Assertion-mode coverage default for new inits** — `verification.coverageMode` now defaults to `assertion` for new inits across all three presets, closing the gap between what `cadence tutorial` demonstrates and what a fresh init delivers; `verification.testCommand` is derived from the target repo's `package.json` scripts.
- **Auditable settle-verdict evidence** — `SUMMARY.json` now records per-gate `ran`/`skipped` (+ reason) provenance, and each `acResults[]` row carries an evidence class (`ai-verified`/`executed`/`assertion`/`mention`/`unverified`) — the strongest real evidence found for that AC.

## [1.36.0] - 2026-07-02

> Published to npm 2026-07-02 via the `Release` workflow (provenance), tag `v1.36.0`.

### Fixed

Onboarding-honesty wave 1 — six small, high-trust fixes from the 2026-07-01 audit:

- `cadence doctor`'s git-hooks check now verifies `.githooks/` actually exists before flagging, and never auto-overwrites a pre-existing custom `hooksPath`. (Phase `133`.)
- `cadence progress --json` added, mirroring `recommend --json`'s pattern. (Phase `134`.)
- `init --demo` no longer prints the generic onboarding blocks (which immediately refuse in DRAFT) alongside the correct demo instructions. (Phase `135`.)
- README's real-phase walkthrough gets an inline `--no-approve` pointer. (Phase `136`.)
- BUILD-state `progress` now names the real first-pending task instead of an unrunnable compound command; `draft approve` on a missing `DRAFT.md` gives a clean guarded refusal instead of a raw `ENOENT`. (Phase `137`.)
- Slash-command count reconciled to the code-true count across docs. (Phase `138`.)

## [1.35.0] - 2026-06-27

> Published to npm 2026-06-27 via the `Release` workflow (provenance), tag `v1.35.0`.

### Added

- **`cadence init --dry-run`** — a non-destructive fit-check that resolves everything init would (project name, gate profile, layout, test globs, verification/provider status, host surface) and prints a preview without touching the repo.

## [1.34.0] - 2026-06-27

> Published to npm 2026-06-27 via the `Release` workflow (provenance), tag `v1.34.0`.

### Added

- **`cadence doctor --fix`** — applies safe, deterministic repairs for fixable doctor findings (git-hooks → `core.hooksPath=.githooks`; regenerate a missing `STATE.md`), with a `--wire-host` opt-in and a `--dry-run` preview. Risky findings stay manual guidance.

## [1.33.0] - 2026-06-26

> Published to npm 2026-06-26 via the `Release` workflow (provenance), tag `v1.33.0`.

### Added

- **`cadence agent-prompt`** — hands the user a copy-paste prompt to scaffold the first real CADENCE phase with an AI agent (testable ACs, stop at approval); also surfaced as an `init` output block.

## [1.32.0] - 2026-06-23

> Published to npm 2026-06-23 via the `Release` workflow (provenance), tag `v1.32.0`.

### Changed

- **`cadence tutorial` rebuilt around the catch (refuse → fix → pass)** — the tutorial now stages a lie and lets settle catch it: marks a task DONE with a real implementation but no test, `settle run --auto` refuses (naming `AC-1`), then a real test is written and the second settle passes. The previous manual `--ac AC-1=pass` assertion and coverage bypass are gone — the refusal a newcomer needs to see is now the demo's centerpiece.

## [1.31.0] - 2026-06-19

> Published to npm 2026-06-19 via the `Release` workflow (provenance), tag `v1.31.0`.

### Added

- **First-real-task DRAFT templates** — `bugfix`/`feature`/`refactor` templates for `cadence draft new --template` generate editable Objective/AC/Tasks/Boundaries sections from a supplied title.
- **Faster, more opinionated onboarding** — README leads with a no-install `npx` tutorial; `cadence init` prints template-first next steps; `cadence start` shows a state-aware recommended command before the full menu.

## [1.30.0] - 2026-06-19

> Published to npm 2026-06-19 via the `Release` workflow (provenance), tag `v1.30.0`.

### Added

- **`cadence draft new --title "..."`** can now derive the next free phase id and task number.
- **Settle bypass audit trails** — `cadence settle run` now records and prints explicit gate-bypass audit entries for force/coverage/verifier-failure paths, exposed through `SUMMARY`.
- **Codex host parity** — Codex prompts now source shared command guidance and install the `cadence-scout` prompt.

## [1.29.0] - 2026-06-18

> Published to npm 2026-06-18 via the `Release` workflow (provenance), tag `v1.29.0`.

### Fixed

- **Non-TTY hard-fail on the approve + interactive-verdict gates** — the two interactive loop gates no longer hard-fail in a non-TTY with `StdinPrompter: stdin is not a TTY`. `approve` now auto-passes loudly (stderr audit trail); `interactive-verdict` skips its walker and records `interactiveVerifySkipped: "non-tty"` in the SUMMARY — no human verdicts are fabricated. `CADENCE_REQUIRE_TTY=1` restores the strict refusal. (Phase `116`.)

## [1.28.0] - 2026-06-18

> Published to npm 2026-06-18 via the `Release` workflow (provenance), tag `v1.28.0`.

### Added

- **Coverage-gate assertion mode** (`verification.coverageMode: "assertion"`) — closes the test-coverage gate's "mentioned-but-not-tested" false positive: an `AC-N` token only counts when it sits inside an asserting `it()`/`test()` block. The default `mention` mode is unchanged. (Phase `108`.)
- **`cadence start` as the single onboarding front door** — README leads with `cadence start` alone; `cadence doctor` ends with a `Next:` line. (Phase `113`.)

### Fixed

- **`auto` gate-profile heads-up** — `cadence init` now warns when a young repo gets the `auto` gate profile, since `draft approve` flips to interactive once the repo passes ~20 commits. `cadence handoff` now honors a `CADENCE_NOW` env override for reproducible SESSION-doc dates. (Phase `114`.)

## [1.27.0] - 2026-06-17

> Published to npm 2026-06-17 via the `Release` workflow (provenance), tag `v1.27.0`.

### Added

- **Zero-friction `cadence init`** — derives project name and gate profile with no prompts. (Phase `108`.)
- **Auto-wire the host** — `--wire-host` runs the Claude Code adapter install in the same `init` step via subprocess spawn. (Phase `108`.)
- **`init --demo`** — seeds a ready-to-approve demo phase for a full `approve → done → settle` loop with no hand-edit. (Phase `109`.)
- **`init --activate`** — turns on real verification in the same `init` step when `ANTHROPIC_API_KEY` is present. (Phase `110`.)

## [1.26.0] - 2026-06-14

> Published to npm 2026-06-14 via the `Release` workflow (provenance), tag `v1.26.0`.

### Added

- **`cadence start`** — an interactive onboarding front door: "What are you doing?" → numbered pick → confirm → runs the matching setup command (tutorial, init, host install, MCP install, doctor). Scriptable via `--pick`/`--yes`/`--json`.

## [1.25.0] - 2026-06-12

> Published to npm 2026-06-12 via the `Release` workflow (provenance), tag `v1.25.0`.

### Changed

- **Mock verifier named honestly as a placeholder** — the `mock` verifier is now explicitly named a non-verifier placeholder across every surface (settle banner, `cadence doctor`, `cadence init`, `quickstart`/`config explain`, docs), closing the gap between the "real verification gate" pitch and the out-of-box mock default (the #1 finding of the 2026-06-11 competitive assessment; rec-20260611-003). Warning-only — mock stays the zero-config offline default.

## [1.24.0] - 2026-06-11

> Published to npm 2026-06-11 via the `Release` workflow (provenance), tag `v1.24.0`.

### Added

- **Recommendation retention** — `cadence recommendation archive <id>`/`unarchive <id>` and `recommendation list --archived` for manual soft-archival (recoverable, never deleted). A new `recommendations.autoArchive` config (default on) auto-archives a rec when it goes terminal.

## [1.23.0] - 2026-06-11

> Published to npm 2026-06-11 via the `Release` workflow (provenance), tag `v1.23.0`.

### Added

- **`shipped` terminal recommendation status** — a rec whose work has landed can now reach a truthful positive-terminal state via `cadence recommendation promote <id> --status=shipped [--ref "..."]`, instead of being stuck at `candidate`. (Phase `100`, from rec-20260611-001.)

## [1.22.1] - 2026-06-11

> Published to npm 2026-06-11 via the `Release` workflow (provenance), tag `v1.22.1`.

### Fixed

- **Phase-id ceiling** — widened the id schema from `^\d{2}-\d{2}$` to `^\d{2,}-\d{2,}$` and derived ids through a single `derivePhaseTaskId` helper, so phases >= 100 are representable end-to-end instead of being mangled into `10-100`. (rec-20260610-001.)

## [1.22.0] - 2026-06-11

> Published to npm 2026-06-11 via the `Release` workflow (provenance), tag `v1.22.0`.

### Added

- **`cadence activate`** — a guided command taking a project from all-mock verifiers to real verification: picks a provider, writes `verifier.provider`, validates the key with a minimal live ping, and never persists the key. `cadence doctor` gains a `verification-readiness` check.

## [1.21.0] - 2026-06-10

> Published to npm 2026-06-10 via the `Release` workflow (provenance), tag `v1.21.0`.

### Added

- **Quickstart-onboarding arc** — `cadence config explain` (in-CLI explanation of the active config), a deepened `config explain [field]`, `cadence config edit` (guided edit wizard), and `cadence quickstart` (state-aware onboarding front door that orients a user from any loop position).

## [1.20.0] - 2026-06-09

> Published to npm 2026-06-09 via the `Release` workflow (provenance), tag `v1.20.0`.

### Added

- **Handoff retention** — an opt-in `handoff.retain` config field keeps the N most-recent session handoffs and hard-deletes the rest at handoff-write time. A new `cadence doctor` `handoff-retention` check surfaces unmanaged accumulation.

## [1.19.0] - 2026-06-08

> Published to npm 2026-06-08 via the `Release` workflow (provenance), tag `v1.19.0`.

### Added

- **`cadence doctor` `worktree-phases` check** — warns when a sibling worktree claims a local phase number, naming the conflict and the next free number; the IDLE `draft new` suggestion now fills in the next free number automatically.

## [1.18.0] - 2026-06-08

> Published to npm 2026-06-08 via the `Release` workflow (provenance), tag `v1.18.0`.

### Added

- **Phase-collision guard** — observes ground truth (`git worktree list` + `origin/<integrationRef>`) and refuses to scaffold a phase number already claimed by a sibling worktree or upstream, naming the conflict and suggesting the next free number. Fires at `spec new`/`draft new` scaffold time and as a `settle run` backstop; `--allow-phase-collision` bypasses per-run.

## [1.17.0] - 2026-06-07

> Published to npm 2026-06-07 via the `Release` workflow (provenance), tag `v1.17.0`.

### Added

- **Structured operator-debugging logger** — a zero-dependency, default-off logger for diagnosing CADENCE itself, writing only to stderr, gated by `CADENCE_LOG_LEVEL`/`CADENCE_LOG_FORMAT`. Three seams instrumented: `gate`, `hook`, `verify` (including token usage; auth headers/keys never logged).

## [1.16.0] - 2026-06-07

> Published to npm 2026-06-07 via the `Release` workflow (provenance), tag `v1.16.0`.

### Added

- **MCP surface deepening** across four dimensions: `.cadence/` artifacts exposed as read-on-demand `cadence://` resources (Phase `75`); five more commands join the MCP tool set for session continuity and the full scout → rec → promote path over MCP, 15 tools total (Phase `76`); canonical command guidance and the `cadence-scout` dialogue move into a shared `cadence-types` module powering both the Claude Code slash commands and new MCP prompts (Phase `77`); `cadence mcp install [--print] [--client <c>]` non-destructively writes/merges a project `.mcp.json` (Phase `78`).

## [1.15.0] - 2026-06-06

> Published to npm 2026-06-06 via the `Release` workflow (provenance), tag `v1.15.0`.

### Added

- **Verifier provider hardening** — `anthropic` gains configurable `verifier.timeoutMs`/`maxRetries` so a transient 429/5xx/network blip in a settle gate retries before failing; `local` gains bearer-token auth. (Phase `72`.)
- **Verifier selection + cost visibility** — `cadence settle run --verifier <mock|anthropic|local>` overrides the config-only provider selection; `SUMMARY`'s `deepVerifyMeta` gains optional token usage. (Phase `73`.)

## [1.14.0] - 2026-06-06

> Published to npm 2026-06-06 via the `Release` workflow (provenance), tag `v1.14.0`.

### Fixed

- **`deep-verify` sent an empty diff** — the gate now sends the AI verifier the actual phase diff (shared with `code-review`), bounded by a new `verifier.diffCapBytes` config, so deep verification judges the implementation rather than test-linkage alone. A `deepVerifyMeta` provenance record makes a verdict auditable; the mock-fallback banner now fires on gate-set membership too, not just `--deep`.

## [1.13.0] - 2026-06-06

> Published to npm 2026-06-06 via the `Release` workflow (provenance), tag `v1.13.0`.

### Added

- **`@manehorizons/cadence-host-codex`** — the second published consumer of the host-adapter contract (`ADAPTER_CONTRACT_VERSION = 1`, unchanged), proving the contract isn't Claude-Code-shaped. Ships `codexAdapter satisfies HostAdapter`, `cadence-host-codex install` (project `.codex/hooks.json` + global prompt files), and the runtime hook shim.

## [1.12.0] - 2026-06-05

> Published to npm 2026-06-05 via the `Release` workflow (provenance), tag `v1.12.0`.

### Added

- **`cadence tutorial`** — runs one real DRAFT→BUILD→SETTLE loop inside a throwaway sandbox, printing each step's command and real output. (Phase `63`.)
- **`cadence explain [concept]`** — prints curated, terminal-sized explanations of core concepts from content embedded in the binary. (Phase `64`.)

## [1.11.0] - 2026-06-05

> Published to npm 2026-06-05 via the `Release` workflow (provenance), tag `v1.11.0`.

### Added

- **Scout-session grouping (`scoutId`)** — an optional `scoutId` on recommendations groups the recs landed by one `/cadence-scout` session, queryable via `--scout-id` on `recommendation add` and `recommend --scout-id`. (Phase `61`.)
- **Guided first-loop nudge in `cadence init`** — a numbered "Your first loop" block (draft new → edit → approve → done → settle) replaces the thin `Next: edit ROADMAP.md` line. (Phase `62`.)

## [1.10.0] - 2026-06-05

> Published to npm 2026-06-05 via the `Release` workflow (provenance), tag `v1.10.0`.

### Added

- **Explicit, versioned host-adapter contract** — `@manehorizons/cadence-types` exports a first-class `HostAdapter` interface plus `HostCapabilitiesZ`, `ADAPTER_CONTRACT_VERSION`, and `ExtractedPayload`; `claudeCodeAdapter` conforms to it, and the docs portal gains a "write your own adapter" guide.

## [1.9.0] - 2026-06-05

> Published to npm 2026-06-05 via the `Release` workflow (provenance), tag `v1.9.0`.

### Added

- **`cadence resume` brief/full modes** — defaults to brief output when live state matches the handoff doc, and auto-promotes to full output (whole doc + live-context replay) on drift. `--full`/`--brief` force a mode; `--json` gains a `mode` field.

## [1.8.0] - 2026-06-05

> Published to npm 2026-06-05 via the `Release` workflow (provenance), tag `v1.8.0`.

### Added

- **`cadence mcp serve`** — a local Model Context Protocol server over stdio, so any MCP-capable host (Claude Desktop, Cursor, other agents) can drive the DRAFT→BUILD→SETTLE loop with no bespoke adapter. A third surface on the single engine (CLI · Claude-Code hooks · MCP), exposing 10 curated tools wrapping the same engine the CLI uses. Command-boundary gates run exactly as on the CLI; ambient edit-time gates require host hooks and aren't available over MCP. (Phase `58`.)

## [1.7.0] - 2026-06-04

> Published to npm 2026-06-04 via the `Release` workflow (provenance), tag `v1.7.0`.

### Added

- **`cadence doctor`** — a deterministic, offline, report-only command that health-checks a project (Node floor, `.cadence/` + config validity, state-file integrity, `.githooks` pre-push gate, Claude Code managed hooks, slash-command path portability), reporting `ok`/`warning`/`error` with remediation. `--json` for CI. (Phase `56`.)
- **`cadence recommendation promote`** — advance a recommendation's status and/or readiness independently of `convert`, closing the gap where `milestone propose` was unreachable for manually-added recommendations. (Phase `57`.)

### Fixed

- **`install --local`'s machine-absolute-path warning** — previously named only `.claude/settings.json`; now enumerates every surface actually written (settings file and/or command files), since the slash-command files under `--local` were a silent offender.

## [1.6.1] - 2026-06-04

> Published to npm 2026-06-04 via the `Release` workflow (provenance), tag `v1.6.1`. Internal-only patch.

### Changed

- **Internal refactor: split `intelligence/store`** — the 985-LOC god-module was decomposed into ten single-responsibility modules under `intelligence/store/`, with `store.ts` kept as a thin re-export barrel. No user-facing or API change. (Phase `54`.)

## [1.6.0] - 2026-06-04

> Published to npm 2026-06-04 via the `Release` workflow (provenance), tag `v1.6.0`. Per-package bumps managed by changesets.

### Added

- **`cadence init --preset <preset>`** — new primary flag selecting a config preset (`solo | team | production`). (Phase `52-preset-flag-rename`.)
- **`/cadence-scout`** — twelfth Claude Code slash command installed by `cadence-host-claude-code` (host command count 11 → 12): a divergent→convergent ideation dialogue that lands survivors as Praxis recommendations via `cadence recommendation add`, then hands back to the rec → milestone → SPEC seam. Host-side only — zero core-engine change, no new gate / loop position / record type. (Phase `53-cadence-scout`.)
- **Documentation portal** — a standalone Astro + Starlight site at <https://manehorizons.github.io/cadence/>, built from the canonical docs plus typedoc API docs and deployed via `.github/workflows/docs.yml`. (Phase `51-docs-portal`.)
- **Cross-platform CI** — the `CI` workflow now runs on Ubuntu + macOS + Windows across Node 20 + 22. (Phases `49-cross-platform-ci`, `50-windows-ci-leg`.)

### Deprecated

- **`cadence init --profile`** — now a deprecated alias for `--preset`. It still works (applies the preset) but emits a one-line stderr notice. The name was a misnomer: it sets a config preset, not a gate profile (which is `--gate-profile`). (Phase `52-preset-flag-rename`.)

### Fixed

- **Intermittent `windows-latest` CI timeouts** — seven heavy CLI-spawning test suites carried inline `{ timeout: 30_000 }` overrides that shadowed the platform-aware 60s win32 global in `vitest.shared.ts`. Removed so every heavy test inherits the single source of truth (60s on Windows, 20s elsewhere).

## [1.5.1] - 2026-06-03

> Published to npm 2026-06-03 via the `Release` workflow (provenance), tag `v1.5.1`. The onboarding-hardening patch (Phase `48-onboarding-hardening`).

### Added

- **`NotInitializedError`** — a distinct error raised when a command runs outside an initialized `.cadence/` project, replacing the prior generic failure.
- **Node `>=20` floor** with a fast-fail guard that exits with a clear message on older runtimes.
- **Loud mock-fallback banner** under `settle --deep` when the verifier falls back to the deterministic mock provider, so a silent downgrade is never mistaken for a real verification.

### Fixed

- Two scaffold/doc fixes surfaced by the onboarding shakedown.

## [1.5.0] - 2026-06-03

> Published to npm 2026-06-03 via the `Release` workflow (provenance), tag `v1.5.0`. Per-package bumps managed by changesets.

### Added

- **`cadence handoff [label]`** — scaffolds `.cadence/handoff/SESSION-<YYYY-MM-DD>[-<label>].md` with machine facts pre-filled (loop state, read-only git facts, and the `cadence context handoff` intelligence packet) plus empty narrative sections. Flags: `--label`, `--force`, `--no-stamp`, `--no-git`, `--json`. By default stamps `state.session.lastHandoff`. (Phase `46-handoff-resume`.)
- **`cadence resume`** — read-only replay of the freshest SESSION doc alongside a freshly recomputed live context packet, with a drift note when the doc's loop position diverges from live state. Mutates nothing.
- **`/cadence-handoff` + `/cadence-resume`** host slash commands installed by `cadence-host-claude-code install` (host command count 9 → 11).

### Fixed

- **`files-outside-boundary` false positives** — `runBoundaryCheck` now normalizes absolute touched paths to repo-relative before comparing against the DRAFT's relative `files:` declarations (optional `root`, threaded from settle and the PreToolEdit hook). (Phase `47-boundary-path-fix`.)

## [1.4.0] - 2026-06-02

> **BREAKING (dependencies): `zod` upgraded `^3 → ^4`.** `@manehorizons/cadence-types` exports its Zod schemas, so consumers that import them must be on Zod 4. The npm `1.1.1` artifact shipped Zod 3; `1.4.0` is the first published version on Zod 4. (No external adopters were affected at release time.)
>
> **Version-drift reconciliation.** npm `1.1.1` (published 2026-05-30) lagged the shipped v1.2 feature-expansion and v1.3 architecture-deepening work. `1.4.0` is the first published version that matches `main`, cut with a corresponding `v1.4.0` git tag and npm provenance. Future releases are managed via [changesets](https://github.com/changesets/changesets). The earlier `1.1.1` publish is left as-is (fix-forward, not retroactively churned).

### Added

- `intelligence audit` `stale-converted-phase` finding kind (Praxis Slice 34.2). Detection counterpart to Slice 34.1's recommendation convert transition — scans every recommendation; when `r.convertedToPhaseId !== undefined && !existingPhaseIds.has(r.convertedToPhaseId)`, emits `{ kind: 'stale-converted-phase', recommendationId, missingPhaseId }`. Phase existence is a filesystem fact computed once by the CLI via `readdir('.cadence/phases', { withFileTypes: true })` filtered to `isDirectory`; `computeIntelligenceAudit` gains a new `existingPhaseIds: Set<string> = new Set()` parameter so the pure helper stays pure-sync (Slice 34 DL §10). Missing `.cadence/phases/` is benign — treated as empty set, which correctly flags every converted rec as stale (the right signal when no phases exist). Markdown render gains a new `## Stale converted-to-phase Refs (N)` section placed LAST in `SECTION_ORDER`, just before `## Remediation`; per-finding bullet shape is `- <recommendationId> convertedToPhaseId missing phase: <missingPhaseId>` (mirrors Slice 30's stale-supersededby shape). Remediation block gains a new bullet — "verify the phase id is correct (typo?), OR hand-edit the rec to clear `convertedToPhaseId` then run `cadence intelligence reconcile`"; clear-path is explicit hand-edit per Slice 34 DL §11 (reconcile does NOT auto-clear `convertedToPhaseId` — that would erase an operator-recorded historical fact). `IntelligenceAuditFinding` union extended additively; `AUDIT_KINDS` array extended; `byKind['stale-converted-phase']` initialized to `[]` on every report. The new `existingPhaseIds` parameter defaults to `new Set()` so all pre-Slice-34.2 callers (17 existing test call sites + any programmatic use) keep working unchanged — they get the "no phases" worldview, which is the conservative-stale interpretation. No new CLI flags; the new kind flows through `cadence intelligence audit` transparently. `intelligence reconcile` UNCHANGED — it re-derives inverse rec-link arrays only; clearing `convertedToPhaseId` is operator-explicit per design. CLI-reference drift guard UNCHANGED. Closes Slice 34 § Follow-On `Slice 34.2 audit dim` entry. Design: `2026-05-25-cadence-rec-phase-linkage-design.md` (Praxis Slice 34).
- `cadence recommendation convert <recId> --to-phase <phaseId>` subcommand (Praxis Slice 34.1). Wires the `cadence/backend.ts` "To promote: run `cadence spec new ...`" hint to a concrete operator action — records the historical fact that a Praxis recommendation was implemented as a CADENCE phase. Schema-additive: `Recommendation.convertedToPhaseId?: z.string().optional()` on `RecommendationZ` (exact-optional, Slice 28 pattern). Transition is **terminal** — no `unconvert`; mistakes surface in Slice 34.2's audit dim (next slice). Cardinality is **1:1**: one rec converts to exactly one phase. FK validation is **strict**: phase directory `.cadence/phases/<phaseId>/` must exist at convert time — refused with `cannot convert: phase <phaseId> not found` on miss (mirrors Slice 28's `--by` FK pattern); the `fs.stat` lives in the I/O wrapper, not the pure helper, so the pure layer stays disk-free. Allowed from `'candidate'` or `'accepted'`; refused from `'deferred'`, `'rejected'`, `'converted'` with `cannot convert recommendation in status <status>` (idempotency-by-refusal — re-convert is naturally blocked). On success: `status='converted'`, `convertedToPhaseId=<phaseId>`, `updatedAt` bumped; `RECOMMENDATIONS.md` re-renders via the Slice 15 hook so the status bullet flips. `render-recommendation-detail.ts` gains a `- converted-to-phase: <phaseId>` bullet between `- status:` and `- ready:` when the field is set; render stays pure (no disk reads — drift detection is the audit dim's job per Slice 34 DL §7). `RECOMMENDATIONS.md` bucket render NOT extended (Slice 15's `- status: converted` already surfaces the conversion; adding inline `<phaseId>` would be visual noise per Slice 34 DL §8). Stdout on success: `recommendation <recId> → converted (to <phaseId>)\n` (exit 0). Refusal stderr prefixed `recommendation convert refused: <error>` (exit 1); no ledger mutation on refusal. CLI-reference drift guard UNCHANGED (drift guard checks top-level commands; new subcommand on existing parent doesn't trip it). Layering preserved: Praxis records the conversion event; the CADENCE engine stays Praxis-unaware (no phase-side metadata file, no `state.json`/`STATE.md` touch, no `cadence spec new` integration — Slice 34 Approach A per Decision Log §5). Audit dim, `--from-rec` ergonomic flag on `spec new`, and `--filter-converted-to` reverse-lookup are deferred to Slices 34.2/34.3/34.4 respectively. Design: `2026-05-25-cadence-rec-phase-linkage-design.md` (Praxis Slice 34).
- `--filter-regex <pattern>` flag on all three list commands (`recommendation list`, `assumption list`, `decision list`) — power-user regex variant of Slice 25's `--filter-text` (Praxis Slice 33). Pattern is compiled via `new RegExp(...)` and tested via `.test()` against the same multi-field text scope `--filter-text` searches per subject (rec → title+summary; assumption → text; decision → title+rationale). Mutually exclusive with `--filter-text` — both set on the same invocation refuses with exit 1 + stderr `<cmd> list failed: cannot combine --filter-text and --filter-regex`. Invalid patterns refuse with exit 1 + stderr `<cmd> list failed: invalid regex: <SyntaxError message>` (Node's RegExp constructor message preserved). **Always case-sensitive** — Node 20 / V8 does NOT support inline regex modifier groups: neither PCRE-style `(?i)foo` nor TC39 regexp-modifiers' `(?i:foo)` (Stage 3) compiles today. Operators wanting case-insensitive matching use character classes (`[Cc]ycle`, `[Ff]oo`); a future `--filter-regex-flags <flags>` channel is named in the Follow-On if real use cases warrant. Apply order unchanged: `status → rec → text-or-regex → reverse → offset → limit`; both --filter-text and --filter-regex branches occupy the same pipeline stage (mutual exclusion enforced before either runs). Empty-result message gains `regex="<pattern>"` dim mirroring the existing `text="..."` style. Composes with `--filter-status`, `--filter-rec`, `--include-untied` (decision only), `--reverse`, `--offset`, `--limit`, `--format json`. CLI-reference drift guard UNCHANGED. Closes Slice-25 + Slice-27 § Follow-On `--filter-regex` entries.
- `--include-untied` boolean flag on `cadence decision list` (Slice 32). When combined with `--filter-rec <recId>`, the result expands to include decisions with no `recommendationId` (untied), in addition to those tied to the named recommendation: predicate becomes `recommendationId === <recId> OR recommendationId === undefined`. Useful for "show me rec-X's decisions plus the untied scratch decisions in one query." Without `--filter-rec`, the flag is a no-op — the bare `decision list` already includes untied decisions (matches Slice-26 `--offset 0` precedent of accepting redundant-but-valid input). Predicate composition, not a new filter stage: Slice-27 filter order (`status → rec → text → reverse → offset → limit`) preserved; `--include-untied` softens the rec predicate rather than introducing a new pipeline stage. Empty-result message gains `untied=incl` dim when both flags are set and result is empty (the dim appears only when meaningful — paired with `--filter-rec`). Composes with `--filter-status`, `--filter-text`, `--reverse`, `--offset`, `--limit`, `--format json`. Decision-only: `assumption.recommendationId` and `evidence.recommendationId` are required by schema (no untied subjects exist for those kinds). Slice-23 contract preserved: `--filter-rec` alone (without `--include-untied`) still excludes untied. No schema change, no store changes, no other commands touched. CLI-reference drift guard UNCHANGED. Closes Slice-8 + Slice-27 § Follow-On `--include-untied` entries (Praxis Slice 32).
- `IntelligenceDecisionZ.supersedes: string[]` derived inverse-link field (Slice 31). For every decision X, `X.supersedes` holds the ids of decisions whose `supersededBy === X.id`. Mirrors Slice 11's `Recommendation.assumptionIds`/`decisionIds`/`evidenceIds` pattern: always-present array with `z.array(z.string()).default([])`, recomputed on every write — not user-input. Pure helper `deriveDecisionInverseLinks(ledger)` is exported; idempotent; tolerates stale `supersededBy` refs (target missing → does not contribute to any `supersedes` array). Wired into three call sites: `addIntelligenceDecision` (new decision starts with `supersedes: []`; full ledger re-derived after push so any inverse relationships from manual JSON edits surface; new decisions are constructed in schema-declaration property order so persisted bytes match what `runIntelligenceReconcile` produces after Zod parse — preserves the Slice-17 AC-6 byte-equality invariant), `applyDecisionTransition` (re-derive runs as the final step before returning the ledger, so the target's `supersededBy` update propagates to the replacement's `supersedes` array and `reactivate`-cleared targets drop out), and `runIntelligenceReconcile` (re-derive joins the existing rec-link rederive sweep; reconcile becomes the operator's clear-path for manually-stale `supersedes` arrays). `render-decision-detail.ts` gains a `- supersedes: <ids>` bullet between `- superseded-by:` and the rationale when the array is non-empty; missing-id fallback `<id> (not found)` matches Slice-28/16 convention; bullet omitted when array is empty. `cadence decision show <id> --format json` envelope's `decision.supersedes` is always a present array (possibly empty). Pre-Slice-31 `decisions.json` files parse cleanly via `.default([])`; first post-Slice-31 write rewrites every decision with the explicit field. `render-decision.ts` (DECISIONS.md bucket render) deliberately UNCHANGED — inverse view lives in `decision show`/`decision graph` to avoid visual noise. Slice-29 graph viewer (`walkAncestorTree`) NOT optimized to use the new field this slice — current inverse-lookup works on any ledger including ones where `supersedes` arrays drifted; optimization would couple correctness to field consistency and is deferred. No new audit dim — `supersedes` is fully derived from `supersededBy`, so reconcile fixes any drift, and Slice 30's `stale-supersededby` finding already audits the underlying integrity. No new CLI flags. CLI-reference drift guard UNCHANGED. Closes Slice-28 + Slice-29 § Follow-On bidirectional-backfill entries (Praxis Slice 31).
- `intelligence audit` `stale-supersededby` finding kind (Slice 30). Scans every decision; when `d.supersededBy !== undefined && !decIds.has(d.supersededBy)`, emits `{ kind: 'stale-supersededby', decisionId, missingTargetId }` — the same drift the Slice-29 graph viewer surfaces visually as `(not found)` on a forward chain, now enumerable from `cadence intelligence audit`. Markdown render gains a new `## Stale supersededBy Refs (N)` section placed last in section order (before `## Remediation`); per-finding bullet shape is `- <decisionId> supersededBy missing decision: <missingTargetId>`. Remediation block gains a new bullet pointing operators at `cadence decision reactivate <id>` as the clear-path (reactivate clears the field per Slice 28). `IntelligenceAuditFinding` union extended additively; `AUDIT_KINDS` array extended; `byKind['stale-supersededby']` initialized to `[]` on every report (so consumers can rely on the key existing). No new CLI flags — the new kind flows through `cadence intelligence audit` transparently. Soft hint for "superseded without `--by`" deliberately NOT a finding: would contradict Slice 28's optional-by-design `--by` flag (Slice 28 DL #1). Cycle findings also deferred — Slice 28 refuses NEW cycles at write time, Slice 29 renders pre-existing cycles with `(cycle)` markers, audit doesn't need to be a third surface. CLI-reference drift guard UNCHANGED. Closes Slice-28 + Slice-29 § Follow-On entries for the audit dim (Praxis Slice 30).
- `cadence decision graph <id>` subcommand: ASCII chain viewer for the supersededBy graph introduced in Slice 28. Pure read; no writes. Terminal output prints two sections — `## Supersedes` (ancestors, indented bullets, transitive backward tree via inverse-supersededBy lookup; one-to-many branching) and `## Superseded by` (descendants, arrow chain starting from the queried id; linear). Empty sections render `(none)`. Cycles in persisted data (manual JSON edits) are tolerated via `seen`-set safety belt — the revisited node is marked `(cycle)` and walking stops. Broken forward links (`supersededBy` points to non-existent id) render `(not found)`, matching Slice-28/16 convention. `--format json` emits a structured envelope: `{ decision, ancestors: [{ decision, ancestors, cycle?: true }, …], descendants: [{ decision, cycle?: true } | { missingId }, …] }` — nested ancestors tree (preserves branching structure), flat descendants array (linear chain). Cycle nodes carry `cycle: true` (exact-optional; never `false`); broken forward links carry `missingId` with no `decision` field (discriminates from cycle-truncated). Missing root id → exit 1 + stderr `decision graph failed: decision <id> not found`. Invalid `--format` → exit 1 + stderr `decision graph failed: unsupported format: <value>`. `packages/core/src/intelligence/store.ts` is byte-equal to Slice 28: Slice-28's `walkSupersededByChain` is shaped for cycle refusal (returns `ok: false` on hit, stops silently on missing-id), so Slice 29 uses an inline forward walk that emits cycle and missing-id signals for the renderer. CLI-reference drift guard UNCHANGED. Closes Slice-28 § Follow-On `cadence decision graph <id>` entry (Praxis Slice 29).
- `supersededBy?: string` optional field on `IntelligenceDecisionZ` (schema additive — pre-Slice-28 `decisions.json` parses cleanly via `.optional()`; first post-Slice-28 write of a superseded decision without `--by` keeps the field omitted entirely, exact-optional pattern mirroring `recommendationId`). New optional `--by <newId>` flag on `cadence decision supersede <oldId>` records WHICH decision replaced the superseded one. Validations: FK-checked (`cannot supersede: decision <newId> not found`), self-ref refused (`cannot supersede: decision cannot supersede itself`), cycle detection walks the `supersededBy` chain from `<newId>` and refuses if it would loop back to `<oldId>` (`cannot supersede: would create cycle (dec-A → dec-B → ...)`). Pre-existing cycles in the persisted data (manual JSON edits) are tolerated by the walk — refuses only NEW cycles. `cadence decision reactivate <id>` now CLEARS `supersededBy` (reactivation means the supersession edge no longer applies). `cadence decision rescind` is unchanged (no `--by` — rescind has no replacement). `DECISIONS.md` superseded bucket entries gain a `- superseded-by: <id>` bullet between `- decided:` and the rationale when the field is set; missing-id renders `(not found)` (self-documenting drift signal). `cadence decision show <id>` surfaces the same bullet in terminal mode and includes `supersededBy` in the `--format json` envelope's `decision` field. `cadence intelligence reconcile` picks up the new annotation automatically (no special-case code — existing re-render flows through). CLI-reference drift guard UNCHANGED. Closes Slice-26/27 § Follow-On `supersededBy <id>` entries (Praxis Slice 28).
- `--reverse` boolean flag on all three `list` commands (`recommendation`/`assumption`/`decision`). Reverses the underlying entry order AFTER filters apply and BEFORE `--offset`/`--limit` page the reversed view. Filter order: status → rec → text → reverse → offset → limit. Completes the pagination trio (`--limit` + `--offset` + `--reverse`). Insertion order = chronological in these ledgers (id prefixes encode date), so `--reverse` gives "newest first" without needing a `--sort-by` flag. `.slice().reverse()` copies first (defensive — survives a future reader returning a shared/cached array). No `filterDims` extension (reverse changes order, not membership; empty-after-filter message stays unchanged). Works in both terminal and JSON modes. CLI-layer slice; store helpers unchanged. Closes Slice-24/25/26 § Follow-On `--reverse` entries (Praxis Slice 27).
- `--offset <n>` flag on all three `list` commands (`recommendation`/`assumption`/`decision`). Skips the first N entries AFTER all filters apply and BEFORE `--limit` caps. Pagination companion to Slice-24 `--limit`: page N of size K = `--offset (N-1)*K --limit K`. Validated as non-negative integer (`Number.isInteger && >= 0`); `--offset 0` is a valid no-op (mirrors array-slice semantics; operator-friendly for templated pagination loops, unlike `--limit 0` which is refused). Negative, fractional, or non-numeric → exit 1 + stderr `<cmd> list failed: invalid offset: <value>`. Offset beyond total → empty result + exit 0 (terminal mode emits `No <subject> matching offset=<n> recorded.\n` since offset is a structural dim; JSON mode → `[]`). Works in both terminal and JSON modes. Filter order: status → rec → text → offset → limit. CLI-layer slice; store helpers unchanged. Closes Slice-24 + Slice-25 § Follow-On `--offset` / `--skip` entries (Praxis Slice 26).
- Added the first CADENCE strategic-intelligence ledger: typed recommendation records, rendered `.cadence/intelligence/RECOMMENDATIONS.md`, and `cadence recommendation add/list` for manual intake.
- `local` LLM gate provider: targets any OpenAI-compatible `/v1/chat/completions` endpoint (Ollama et al.). Set `CADENCE_LOCAL_BASE_URL` (e.g. `http://localhost:11434/v1`) and `CADENCE_LOCAL_MODEL` (e.g. `qwen3-coder:30b`); a per-gate `model` key in config overrides `CADENCE_LOCAL_MODEL` for that gate. If the base URL or effective model is unset when `provider: 'local'` is configured, the gate warns on stderr and falls back to `mock`. No API key required. Cadence's own loop defaults to `mock`; the `local` provider only activates on gates where it is explicitly set. Applies across all five gates (`verifier`, `perTaskVerifier`, `codeReview`, `planReview`, `securityAudit`). (Phase 30.1.)
- `docs/` user guide for adopters — quickstart, concepts, the two usage surfaces (CLI engine + Claude Code host adapter), providers, and CLI/config reference; plus a command-reference drift-guard test. (Phase 31.1.)
- Publish pipeline (reversible proof): `@manehorizons/cadence-{core,types,host-claude-code}` carry `license`/`publishConfig.access:public`/`repository` + per-package `LICENSE`/`README`; `@manehorizons/cadence-testkit` is `private` (dev-only). `scripts/publish-proof.mjs` proves the path end-to-end against an ephemeral local verdaccio (real `pnpm publish` of the 3 packages → clean-dir install → no `workspace:` leak → both bins run → Windows-safe unconditional teardown); `pnpm publish --dry-run` + `npm pack` inspection prove the public-npm shape (tarballs = dist/bin/package.json/LICENSE/README only). No public-registry footprint. Real public publish, npm provenance, `release.yml`, and changesets are deferred to a named v1.2 public-release milestone. (Phase 33.1.)
- Required-skill enforcement gate: a phase declares `requiredSkills:` in DRAFT frontmatter and/or `config.skillAudit.required`; the deduped union is written to `state.skillAudit.required` (making `SUMMARY.skillAudit.required` truthful — previously always `[]`). `cadence settle run` refuses when a required skill was not invoked (per `state.skillAudit.invoked`, matched exactly or by namespace suffix e.g. `superpowers:brainstorming` satisfies `brainstorming`), emitting a new `skill-audit-miss` anomaly; `--allow-skill-audit-miss` downgrades it to a warn (`bypassed:true`) and settles. Inert when nothing is declared (declaration is the opt-in — not a gate-matrix cell); skips with a warn (never false-refuses) when `telemetry.skillInvocations` is off or config failed to load. Anomaly emission is unconditional/profile-independent (deliberate divergence from the `anomaly-notify`-gated `code-review-high`/`loop-violation`). `AnomalyTypeZ` gains `skill-audit-miss` (additive schema bump). Closes ROADMAP open-question 23.4. (Phase 34.1.)
- Review-convergence loop: `plan-review` (at `cadence draft approve`, strict×complex) is now a bounded loop instead of stateless one-shot. A pure `nextConvergence` primitive classifies each review pass/reloop/escalate; attempts + an append-only `history` are tracked in the existing `<id>-PLAN-REVIEW.json` sidecar (no `state.json` change; legacy 29.7-shape sidecars read as 0 attempts). After `config.convergence.maxAttempts` failing attempts (default 3) `draft approve` hard-escalates ("a human decision is required"), emits a new `plan-review-unconverged` anomaly **unconditionally** (un-gated on `anomaly-notify` — strict cells lack it, mirroring `skill-audit-miss`), and refuses unless the existing `--allow-plan-review-failure` (which then proceeds and records `bypassed:true` in history). The fix between attempts is external (host/agent edits the DRAFT) — an in-core auto-fixer is the deferred survey item #4, which reuses `nextConvergence`. `AnomalyTypeZ` gains `plan-review-unconverged` (additive). (Phase 35.1.)
- brainstorm→spec stage: a new pre-DRAFT `SPEC` loop position with `cadence spec new` (scaffolds `<id>-SPEC.md`: objective / acceptance criteria / constraints / open questions), `cadence spec check` (structural sanity), and `cadence spec approve` — which runs a **convergent** spec-review gate reusing the Phase 35.1 `nextConvergence` primitive verbatim (attempts/history in a `<id>-SPEC-REVIEW.json` sidecar; reloop on fail; hard-escalate at `config.convergence.maxAttempts` with an unconditional `spec-review-unconverged` anomaly; `--allow-spec-review-failure` bypasses any fail → proceed, `bypassed:true` in history — same semantics as plan-review's `--allow-plan-review-failure`). `cadence draft new` refuses while a spec is active. Host-agnostic: cadence scaffolds + validates; the host agent/human authors the SPEC externally. `LoopPositionZ` gains `SPEC`, `state.activeSpec` added, `AnomalyTypeZ` gains `spec-review-unconverged`, `config.specReview` added (all additive/back-compat). The SPEC→DRAFT content auto-seed is deferred (#1b). (Phase 36.1.)
- Code-review convergence loop: `code-review` (at `cadence settle run`; cells strict×standard, strict×complex, standard×complex) is now a bounded loop instead of a stateless one-shot. It reuses the Phase 35.1 `nextConvergence` primitive verbatim; attempts + an append-only `history` are tracked in a new `<id>-CODE-REVIEW.json` sidecar (plan-review shape; `pass := no HIGH finding`; `findingsCount`/`findings` record the HIGH count; legacy/absent sidecars read as 0 attempts). After `config.convergence.maxAttempts` failing attempts (default 3 — the shared knob, no new config) `settle run` hard-escalates ("a human decision is required"), emits a new `code-review-unconverged` anomaly **unconditionally** (un-gated on `anomaly-notify` — code-review's strict cells lack it, mirroring `skill-audit-miss`/`plan-review-unconverged`), and refuses unless `--force` or the existing `--allow-code-review-failure` (which then proceeds, records `SUMMARY.codeReview`, and stamps `bypassed:true` in history). The Phase 24.3 bypass contract — including `--force` — is preserved verbatim; the sibling `code-review-high` anomaly keeps its `anomaly-notify` guard. The fix between attempts is external (host/agent edits the flagged code) — an in-core auto-fixer remains the parked survey item #3/#5. `AnomalyTypeZ` gains `code-review-unconverged` (additive). This completes the v1.2 feature-expansion sequence (#6→#2→#1→#4). (Phase 37.1.)
- SPEC→DRAFT auto-seed: `cadence draft new <phase> <num>` now pre-fills the new DRAFT's Objective + Acceptance Criteria from the sibling **same-id** `APPROVED` `<id>-SPEC.md` (lossless — each AC's name is carried via a new additive `AcceptanceCriterionZ.name`, default `''`, back-compat for every existing Spec/Draft/Plan consumer; `spec-parser` and `draft-parser` populate it from the AC head they already capture). Body construction moved to a pure `renderDraftBody`; with no / non-`APPROVED` / unparseable sibling SPEC it is **byte-identical** to the previous scaffold and warns to stderr (never refuses, no new flag, no state/config/gate change). Closes survey #1 fully (the auto-seed deferred from #1's minimal v1 as #1b); v1.2 feature-expansion now has no non-parked work remaining. (Phase 38.1.)
- Added `cadence inspect`: read-only strategic-status synthesis (project scanner, thin CADENCE backend adapter, four conservative flags) writing `.cadence/intelligence/inspection.json` + `STRATEGY.md`.
- Added `cadence recommend`: read-only ranked next-moves over the recommendation ledger — a transparent additive 0–100 score (leverage/confidence/risk + status/readiness/decay/priority adjustments, every term shown in a per-item why-line), ledger partition (rejected/converted excluded, superseded/contradicted surfaced as needs-attention, deferred parked, candidate/accepted ranked), and one loop-aware next-action advisory; writes `.cadence/intelligence/recommend.json` + `RECOMMEND.md`.
- Added `cadence milestone propose | accept | defer | list`: read-only, backend-free milestone shaping over the recommendation ledger — clusters `accepted` + `ready-for-*` recommendations by `suggestedMilestoneId` (singleton fallback) into proposed milestone candidates with a deterministically-seeded scaffolded pre-mortem; re-propose refreshes only `proposed` records and never clobbers or re-proposes human-decided ones; guarded `accept`/`defer` transitions; writes `.cadence/intelligence/milestones.json` + `MILESTONES.md`.
- Added `cadence milestone export <id> --to cadence`: renders a deterministic CADENCE SPEC scaffold from an `accepted` milestone (Objective verbatim; one Given/When/Then-stub AC per clustered recommendation; Constraints/Open-Questions seeded from the pre-mortem), writes it to the Praxis-owned `.cadence/intelligence/exports/<id>/SPEC.md`, records an `exportTarget`, and flips the milestone to `exported` — never invokes `cadence spec new`, allocates a loop id, or touches `state.json`; the operator promotes the staged SPEC manually.
- `cadence context <scope>` — compact read-only context packets (`phase` + `handoff`) for the strategic-intelligence layer (Praxis Slice 5).
- `cadence context review` + `cadence context agent` — two additional read-only context-packet scopes: `review` is a backward-looking audit packet that surfaces a `needsAttention` bucket of superseded/contradicted recs and carries open assumptions + decisions in full; `agent` is a subagent dispatch brief that filters to the dispatchable subset (`status=accepted` ∩ `readiness ∈ {ready-for-milestone, ready-for-cadence-spec}`) and renders without the operator-facing loop chrome (`nextAction`, `stateError`) a worker subagent doesn't need (Praxis Slice 7).
- `cadence assumption add | list` + `cadence decision add | list` — two new top-level intake commands that populate the strategic-intelligence `assumptions.json` + `decisions.json` ledgers Slice 5 wired readers for and Slices 5/7 documented as honest-empty. Assumption `--rec` is required + FK-checked; decision `--rec` is optional (untied decisions valid + `recommendationId` field omitted entirely on the persisted entity). Status transitions for assumptions deferred to a follow-up slice (Slice-1 minimalism precedent). Closes the honest-empty gap — Slice-5/7 `review` + `agent` + `phase` + `handoff` packets now densify automatically (Praxis Slice 8).
- `cadence assumption validate <id>` + `cadence assumption reject <id>` — two new transition subcommands on the existing assumption parent. Strict allowed-status: both transitions from `'open'` only; refused with `cannot <action> assumption in status <s>` on wrong source or `assumption <id> not found` on unknown id; no write side effects on refusal. ALSO partitions `ASSUMPTIONS.md` render into 3 always-emit bucket sections (`## Open` / `## Validated` / `## Rejected`) with per-entry heading demoted to `###`. Slice-5/7 context packets automatically respect transitioned status via existing `status === 'open'` filter (Praxis Slice 9).
- `--filter-text <substr>` flag on all three `list` commands. Case-insensitive substring match via `String.prototype.toLowerCase().includes()`. Per-subject match fields: `recommendation` searches `title || summary`; `assumption` searches `text`; `decision` searches `title || rationale`. Filter order: status → rec → text → limit (text after structural narrowing, before output cap). Combines with all other filters via AND semantics. Empty `--filter-text ""` matches all (no special case). Empty-after-filter terminal message extends to include `text="<substr>"` dimension. Closes Slice-24 § Follow-On `--filter-text` entry (Praxis Slice 25).
- `--limit <n>` flag on all three `list` commands (`recommendation`/`assumption`/`decision`). Caps output to first N entries AFTER all filters apply. Validated as positive integer (`Number.isInteger && >= 1`); `--limit 0`, negative, fractional, or non-numeric → exit 1 + stderr `<cmd> list failed: invalid limit: <value>`. Limit larger than total entries → returns all (no error). Works in both terminal and JSON modes (JSON array length = `min(limit, totalAfterFilters)`). No "showing X of Y" footer; operator can re-run unbounded for counts. CLI-layer slice; store helpers unchanged. Closes Slice-23 § Follow-On `--limit` entry (Praxis Slice 24).
- `--filter-rec <recId>` flag on `cadence assumption list` and `cadence decision list`. Filters entries to those whose `recommendationId === <recId>`. For `decision list`, untied decisions (`recommendationId === undefined`) are EXCLUDED — operator scoped the query to a specific rec. Combines with `--filter-status` via AND semantics. Works in both terminal and JSON modes. No rec-id validation against ledger (avoids extra read; empty result speaks for itself). Empty-after-filter terminal message unified across both lists: `No <subject> matching <dim1>, <dim2> recorded.\n` listing every active filter dimension. `recommendation list` does NOT gain `--filter-rec` (no FK to filter on). Slice-22 single-dim message also unified to `matching` wording for consistency. Closes Slice-22 § Follow-On `--filter-rec` entry (Praxis Slice 23).
- `--filter-status <status>` flag on the three `list` commands: `cadence recommendation list`, `cadence assumption list`, `cadence decision list`. Filter validates against each subject's status enum via `<Subject>Z.shape.status.safeParse(value)` (single source of truth). Invalid → exit 1 + stderr `<cmd> list failed: invalid status: <value>`. Works in both terminal and JSON modes. Empty-after-filter terminal output emits status-aware message `No <subject> with status=<X> recorded.\n` (distinguishes from "no entries at all"); JSON mode emits `[]`. Filter applied at CLI layer; store helpers unchanged. Closes Slice-21 § Follow-On `--filter-status` entry (Praxis Slice 22).
- `--format <terminal|json>` flag now also covers the three `list` commands: `cadence recommendation list`, `cadence assumption list`, `cadence decision list`. Default terminal mode preserves existing compact-line output verbatim. JSON mode emits full entity array (`Recommendation[]` / `Assumption[]` / `IntelligenceDecision[]`). Empty ledger + `--format json` → `[]` (consistent with "list = sequence" semantics, distinct from `stats`/`audit` empty-workspace `null`). Invalid `--format <foo>` exit 1 + stderr matching Slice-20 error path. CI/scripting can now `jq` over full entity arrays without parsing terminal one-liners. Closes Slice-20 § Follow-On `--format json on list commands` entry (Praxis Slice 21).
- `--format <terminal|json>` flag on five read-only commands: `cadence recommendation show <id>`, `cadence assumption show <id>`, `cadence decision show <id>`, `cadence intelligence stats`, `cadence intelligence audit`. Default remains `terminal` (existing markdown contract preserved verbatim — all Slice-14/16/18/19 tests pass unchanged). `--format json` emits pretty-printed JSON envelope per command: `recommendation show` → `{recommendation, linkedEvidence, linkedAssumptions, linkedDecisions, filters}` (linked arrays PRE-filter; `filters` block documents which flags were active); `assumption show` / `decision show` → `{<subject>, recommendation}` with `recommendation: null` for untied/orphan; `intelligence stats` → full `IntelligenceStats` object or JSON `null` on empty workspace; `intelligence audit` → full `IntelligenceAuditReport` object or JSON `null` on empty workspace (exit 1 on findings unless `--quiet`). Invalid `--format <foo>` → exit 1 + stderr `<command> failed: unsupported format: <foo>`. Unknown id paths preserve terminal-mode stderr + exit 1 (no partial JSON on stdout). Enables CI/scripting workflows. Closes Slice-14/18/19 § Follow-On `--format json` entries (Praxis Slice 20).
- `cadence intelligence audit [--quiet]` — read-only integrity enumeration across the 4 intelligence ledgers. Surfaces six finding kinds — broken assumption/decision/evidence links (rec references missing subject id) + orphan assumption/decision/evidence (subject's `recommendationId` references missing rec). Untied decisions are NOT orphans (Slice-8 contract). Where Slice-18 `stats` surfaces broken-link COUNTS, `audit` ENUMERATES the specific refs with full id paths and includes a Remediation block referencing `cadence intelligence reconcile` for broken-link auto-repair. Exit 1 on findings (script-friendly with `--quiet` to suppress). Clean → `Audit clean: no integrity issues.\n` exit 0. Empty workspace → `No intelligence ledgers present.\n` exit 0. Strict read-only — no auto-fix (orphan subjects require operator decision). Sibling subcommand on the Slice-17 `intelligence` parent. Closes Slice-17 + Slice-18 § Follow-On `audit` entries (Praxis Slice 19).
- `cadence intelligence stats [--by-rec]` — read-only summary counts across all 4 intelligence ledgers. Aggregate mode (default) prints 5 sections — Recommendations (by status / by readiness), Evidence (by kind), Assumptions (by status), Decisions (by status + untied count), Links (broken assumption / decision / evidence reference counts). All enum values are explicitly listed even when count = 0 for diff-stability. `--by-rec` mode prints a markdown table with one row per recommendation showing per-status linked-assumption + linked-decision + evidence counts; titles longer than 40 chars truncated with `…`. Broken-link counts surface drift between rec link arrays and subject ledgers (rec references id not present in target ledger). Strict read-only; no file writes. Empty workspace → exit 0 `No intelligence ledgers present.\n`. Sibling subcommand on the Slice-17 `intelligence` parent — no new top-level command. Closes Slice-17 § Follow-On `stats` entry (Praxis Slice 18).
- `cadence intelligence reconcile` — new top-level admin subcommand that operator-initiates a full re-derive of `Recommendation.assumptionIds[]`/`decisionIds[]` (via the same `deriveRecommendationLinks` helper Slice-11 wires into intake) and re-renders all three intelligence MD files (`RECOMMENDATIONS.md` with Slice-15 status-annotated bullets; `ASSUMPTIONS.md`/`DECISIONS.md` with bucket sections). Useful when operator hand-edits a subject ledger without going through `addX` — reconcile picks up the drift and refreshes both the rec link arrays and all MD renders. Idempotent (second pass byte-equal). Read-only on `assumptions.json` + `decisions.json` (operator source of truth). On empty workspace → exit 0 with `No intelligence ledgers present.\n`. NEW top-level command `intelligence`; `docs/reference/commands.md` marker block + cli-reference drift guard test updated in lockstep. Closes Slice-11/12/13/15 § Follow-On `cadence intelligence reconcile` entries (Praxis Slice 17).
- `cadence assumption show <id>` and `cadence decision show <id>` — symmetric single-subject deep-dive subcommands on the existing parents. Each reads its subject ledger + the recommendation ledger (for one-line cross-ref annotation) and prints the subject's full envelope: assumption → `id`, `text`, `status`, `recorded`, optional tied-rec cross-ref (`- recommendation: rec-X — <title>`); decision → `id`, `title`, `status`, optional tied-rec cross-ref, `decided`, rationale. Refuses unknown id with exit 1 + `<subject> <id> not found\n`. Untied decisions omit the recommendation bullet entirely. Missing-rec fallback emits `- recommendation: <recId> (rec not found)` — self-documenting drift signal. Strict read-only; no file writes. NO new top-level commands; cli-reference drift guard untripped. Closes Slice-14 § Follow-On parallel-show entry (Praxis Slice 16).
- `RECOMMENDATIONS.md` per-rec `- assumptions:` / `- decisions:` bullets are now status-annotated inline: `- assumptions: as-1 (open), as-2 (validated)` and `- decisions: dec-1 (active), dec-2 (superseded)`. `renderRecommendationsMd` signature gains two optional params `asLedger?` + `decLedger?`; external 2-arg callers fall back to Slice-12 bare-id form (back-compat). `writeIntelligenceLedgers` reads both sibling ledgers internally so the persisted MD always reflects current status. `runAssumptionTransition` + `runDecisionTransition` now propagate the status flip into `RECOMMENDATIONS.md` via a new `rerenderRecommendationsMdIfPresent` helper — superseding/reactivating a decision (or validate/reject/reopen on an assumption) immediately updates the parenthesised status on the linked rec's MD entry. Missing-id fallback emits the bare id with no parens (self-documenting drift signal). Link arrays remain status-agnostic per Slice-11 precedent. Closes Slice-12 Decision Log #2 + Slice-12 § Follow-On + Slice-13 § Follow-On status-aware-bullet entries (Praxis Slice 15).
- `cadence recommendation show <id>` — new read-only deep-dive subcommand consolidating a single recommendation's full envelope plus all linked assumptions, decisions, and evidence in one operator-facing terminal output. Reads `recommendations.json` + `evidence.json` + `assumptions.json` + `decisions.json`. Default: show every linked child regardless of status. `--open-assumptions-only` narrows to `status === 'open'`; `--active-decisions-only` narrows to `status === 'active'`. Header counts surface filtering as `## Assumptions (N shown / M total linked)`. Refuses unknown id with exit 1 + `recommendation <id> not found\n`. No file writes (strict read-only). NO new top-level commands; subcommand on existing `cadence recommendation` parent (cli-reference drift guard untripped). First consumer surface for Slice-11 backfill + Slice-13 decision status. Closes Slice-12 + Slice-13 § Follow-On `recommendation show` entries (Praxis Slice 14).
- `cadence decision` now carries a `status` field (`'active' | 'superseded' | 'rescinded'`, default `'active'`) with three new transition verbs `supersede`/`rescind`/`reactivate` (mirrors Slice-9/10 assumption transition matrix). Schema additive via Zod `.default('active')` — pre-Slice-13 `decisions.json` files on disk parse cleanly without migration; first post-Slice-13 write normalizes. `DECISIONS.md` now bucket-partitions into 3 always-emit sections `## Active` / `## Superseded` / `## Rescinded` with `_(none)_` empty markers (mirrors Slice-9 assumption render). Context packets (`phase`/`handoff`/`review`/`agent`) filter decisions to `status === 'active'` for parity with Slice-5's assumption `status === 'open'` filter — superseded/rescinded decisions disappear from packets and re-enter on reactivate. `cadence decision list` line gains a status column: `${id}  ${status}  ${rec ?? '—'}  ${title}`. The Slice-12 `- decisions:` MD bullet on `RECOMMENDATIONS.md` continues to render all linked ids regardless of status (link arrays + render bullet remain status-agnostic per Slice-11/12 precedent — operator cross-references `DECISIONS.md` buckets for status-aware views). Closes Slice-8/9/10/11 cross-slice decision-status follow-refs. No new top-level CLI commands; `cli-reference.test.ts` drift guard unchanged (Praxis Slice 13).
- `RECOMMENDATIONS.md` per-rec entry now surfaces Slice-11's backfilled link arrays inline via two conditional bullets: `- assumptions: as-1, as-2` and `- decisions: dec-1, dec-2`. Bullets are slotted between `- files:` and `- evidence:` (slot order: areas → files → assumptions → decisions → evidence) and are omitted entirely when the underlying array is empty (mirrors `affectedAreas`/`affectedFiles` precedent). All linked ids are rendered regardless of assumption status (open/validated/rejected) — status partitioning lives in `ASSUMPTIONS.md` (Slice-9 buckets); the operator cross-references the two files for status-aware views. Ledger-insertion order preserved within each bullet (no sort). No CLI surface change. No `@manehorizons/cadence-types` schema change (arrays exist on `RecommendationZ` since Slice 1). First observable consumer of Slice-11 backfill plumbing. Closes Slice-11 § Follow-On render-extension entry (Praxis Slice 12).
- Auto-backfill `Recommendation.assumptionIds[]` and `Recommendation.decisionIds[]` arrays on every `cadence assumption add` and tied `cadence decision add --rec` via the new pure helper `deriveRecommendationLinks(recLedger, asLedger, decLedger)`. Pure full-ledger re-derivation per add means **no migration is needed**: pre-Slice-11 entries (or any manual JSON edit of `assumptions.json` / `decisions.json`) are picked up automatically on the next add against ANY rec — the recommendation ledger self-heals. Untied decisions skip the rec write entirely (recLedger byte-equal). No `@manehorizons/cadence-types` schema change (the arrays have been on `RecommendationZ` since Slice 1 — they just stayed `[]`). No CLI surface change. No `RECOMMENDATIONS.md` render extension (consumer-side surface is a future slice). Closes the cross-slice forward-ref family from Slice-5 / Slice-6 / Slice-8 / Slice-10 designs (all now strike+annotate "SHIPPED Slice 11") (Praxis Slice 11).
- `cadence assumption reopen <id>` — third transition verb completing the assumption status matrix (`open ↔ {validated, rejected}`). Allowed source statuses: `'validated' | 'rejected'`; target: `'open'`. Refused with `cannot reopen assumption in status open` on `'open'` source (idempotent same-state refused, mirroring Slice-9 strictness) or `assumption <id> not found` on unknown id; no write side effects on refusal. Renders the reopened entry back under `## Open` via Slice-9's bucket render (zero render-layer change). Slice-5/7 context packets automatically RE-ADMIT the reopened assumption via the existing `status === 'open'` filter. Internal `nextStatus` ternary in `applyAssumptionTransition` and the parallel CLI past-tense/description ternaries are replaced with exhaustive `Record<AssumptionTransitionAction, ...>` maps (`ASSUMPTION_TRANSITION_ALLOWED` / `ASSUMPTION_TRANSITION_NEXT` in `store.ts`; `ASSUMPTION_TRANSITION_DESCRIPTIONS` / `ASSUMPTION_TRANSITION_PAST` in `cli/commands/assumption.ts`) — same shape and behavior for `validate`/`reject` (Slice-9 tests unchanged). No `@manehorizons/cadence-types` schema change. No new top-level commands. Closes Slice-9 § Out-of-scope + § Follow-On `reopen` entries (Praxis Slice 10).
- `cadence milestone premortem <id>` — re-runnable deterministic milestone pre-mortem (decay/erosion/open-assumption/overestimated-value signals; refreshes in place; `outOfScope` operator-owned).

### Fixed

- `cadence draft approve` manual y/n prompt now gives feedback on unrecognized/empty input — re-prompts `Please answer y or n (attempt N/3):` instead of silently consuming retries (Phase 29.3 finding T2). (Phase 29.8.)
- `cadence build task <id>` now validates the id against the active DRAFT's declared tasks: an unknown/typo'd id (e.g. `T1--status=DONE` from a missing space) errors with exit 2 and records nothing, instead of silently creating a ghost task (Phase 29.3 finding T3). (Phase 29.8.)
- `cadence settle run --interactive` without `--auto` now still falls through to structural derivation for skipped/unverdicted ACs — an AC whose linked task is incomplete refuses settle unless `--force` (the walker's "Skip falls through to other gates" was previously false without `--auto`) (Phase 29.3 finding T4). (Phase 29.8.)
- Deep-verify on `local` providers (Phase 29.2 finding G1): the verifier prompt now lists the exact AC ids, requires one verdict per id, and embeds a schema-conforming JSON example, and `localChatJSON` allows two repair retries (was one). Local models (verified: Ollama `qwen3-coder:30b`) previously returned verdicts with missing/misnamed `id` → `VerifierResponseSchema` rejected past the single retry, making `--deep` unusable on local; now passes. Anthropic path unaffected (prompt only clarified). (Phase 29.7, G1.)
- A failed deep verifier now records the configured `verifier.provider` (and `model` when set) in `SUMMARY.deepVerify` instead of `"unknown"` (Phase 29.2 finding G2). (Phase 29.7.)
- `cadence draft approve` now persists `.cadence/phases/<phase>/<id>-PLAN-REVIEW.json` `{draftId,pass,provider,model?,findings,at}` on plan-review pass AND fail — previously a passing plan-review left no artifact, so a loop run could not later prove it ran / which provider / verdict (Phase 29.2 finding G3). (Phase 29.7.)
- `cadence init` now detects repo layout and writes a matching `verification.testGlobs`: a `packages/` directory → the workspace glob (`packages/**/*.test.ts(x)`, unchanged for cadence's own monorepo), any other shape → a depth-agnostic `**/*.test.ts(x)`. Previously the monorepo glob was written unconditionally, leaving the test-coverage gate unsatisfiable on every single-package repo (F2 — Phase 29.1 shakedown publish-blocker). The post-init summary now reports the detected layout and effective globs. (Phase 29.4, F2.)
- `cadence-host-claude-code install --local` now prints a stderr warning that the settings file contains machine-absolute paths and must not be committed (gitignore it; re-run per machine). README documents it. (Phase 29.6, F1.)
- `cadence init` post-init summary now prints a non-TTY `draft approve` / `--no-approve` hint when the resolved gate profile is `standard` or `strict`; the README quickstart adds a ≥20-commits → `standard` heads-up. (Phase 29.6, F6.)
- `cadence init` summary now disambiguates the config preset row ("workflow defaults: solo|team|production") from the gate-profile row ("gate strictness: strict|standard|auto"), removing the overlapping "profile" vocabulary. (Phase 29.6, F4.)
- Test infra: the recurring full-`turbo`-parallel pre-push flake (`Test timed out in 5000ms` + Windows `EBUSY`/`ENOTEMPTY rmdir` on spawn-CLI / heavy-`tempRepo` tests) is root-fixed. New repo-root `vitest.shared.ts` centralizes `testTimeout`/`hookTimeout` (20000ms) and caps the worker pool (`pool:'forks'`, `minForks:1`/`maxForks:12`); all five package vitest configs `mergeConfig` it (ends the 5-config drift). `tempRepo().cleanup()` now passes `maxRetries`/`retryDelay` to `fs.rm` so the Windows handle-release race is absorbed for every consumer. The Phase 29.5 (`dispatcher.test.ts`) and Phase 30.2 (`build-per-task.test.ts`) per-test `{timeout:20000}` band-aids are reverted — the global budget supersedes them. Pulled forward from the v1.2+ deferred test-infra lane after a 3rd recurrence. (Phase 32.1.)

### Changed

- CI: added a `ci-success` aggregator job (`needs: [test]`) so a single stable status context can gate `main` instead of the six brittle per-matrix-cell names.
- CI gate enforced client-side via a tracked `.githooks/pre-push` hook (`core.hooksPath=.githooks`): pushes updating `refs/heads/main` run `pnpm turbo run lint typecheck test build` and abort on failure. Server-side branch protection / rulesets are unavailable on this GitHub Free repo tier, so the hook honors the "failing CI blocks main" intent client-side; bypass with `git push --no-verify`.

## [1.0.0] - 2026-05-15

### Added

- Manual approve gate at `cadence draft approve`: when `'approve'` is in the effective gate set (strict-any-tier, standard×standard, standard×complex), the command prompts `Approve and enter BUILD? [y/n]:` before transitioning to BUILD. Reuses the Phase 16 `Prompter` abstraction (`StdinPrompter` + `ScriptedPrompter`) and `CADENCE_PROMPTER_SCRIPT` env-var test seam. `--no-approve` bypasses per-invocation (required for non-TTY runs when the gate is on). `n` / retry-exhaustion refuses with exit 1 and no state change (Phase 24.1).
- Per-task verifier gate at `cadence build task <id> --status=DONE`: when `'per-task-verify'` is in the effective gate set (strict×standard, strict×complex), runs `PerTaskVerifier` against the task's files+diff (`git diff HEAD -- <files>`) and records a `pass | concerns | refuse` verdict into `PROGRESS.json tasks[id].perTaskVerify`. `MockPerTaskVerifier` (deterministic floor) and `AnthropicPerTaskVerifier` (prompt-cached `claude-sonnet-4-6` by default) ship; `config.perTaskVerifier.provider` selects. `refuse` blocks DONE recording unless `--allow-per-task-failure` (recorded as `bypassed: true`). Non-DONE statuses skip the gate (Phase 24.2).
- Code-review verifier gate at `cadence settle run`: when `'code-review'` is in the effective gate set (strict×standard, strict×complex, standard×complex), runs `CodeReviewVerifier` against `git diff HEAD -- <files>` for the union of touched files and records per-file `Finding[]` into `SUMMARY.codeReview`. `MockCodeReviewVerifier` flags every added `console.log` as HIGH; `AnthropicCodeReviewVerifier` reviews via prompt-cached `claude-sonnet-4-6`. HIGH findings refuse settle unless `--force` / `--allow-code-review-failure` (Phase 24.3).
- Plan-review verifier gate at `cadence draft approve`: when `'plan-review'` is in the effective gate set (strict×complex), runs `PlanReviewVerifier` against the parsed DRAFT (objective + ACs + tasks + boundaries) after the manual-approve gate and before the BUILD transition. `MockPlanReviewVerifier` is a deterministic floor (pass iff ≥1 AC and every AC has non-empty Given/When/Then); `AnthropicPlanReviewVerifier` does a holistic prompt-cached `claude-sonnet-4-6` review returning `{ pass, findings[] }` with optional per-finding `suggestedEdit`. `pass=false` refuses approve with exit 1 and no state change unless `--allow-plan-review-failure` (Phase 25.1).
- Security-audit verifier gate at `cadence settle run`: when `'security-audit'` is in the effective gate set (strict×complex only), runs `SecurityAuditVerifier` against `git diff HEAD -- <files>` for the union of touched files — after code-review and before SUMMARY write. `MockSecurityAuditVerifier` flags hardcoded `Authorization:` headers and JWT-shaped strings in added lines as CRITICAL; `AnthropicSecurityAuditVerifier` runs an OWASP-aware prompt-cached `claude-sonnet-4-6` pass. All findings (any severity) land on `SUMMARY.securityAudit`; CRITICAL findings refuse settle unless `--force` / `--allow-security-audit-failure`. Closes the v0.6.0 expensive-gate milestone (Phase 25.2).
- `cadence init` UX polish: interactive project-name prompt when `--name` is omitted (TTY or `CADENCE_PROMPTER_SCRIPT` seam; empty → `unnamed`), a gate-profile suggestion from git history (≥20 commits → `standard`, else `auto`; git failure → `auto`) with interactive accept/override and a `--gate-profile` flag written to `config.profile`, and a one-screen post-init summary. Non-TTY without flags applies defaults and never prompts/hangs; the legacy `Initialized CADENCE …` line is retained (Phase 26.1).
- `cadence init` writes a managed `CLAUDE.md` at the repo root (loop, gate profile, state locations, core commands) wrapped in `<!-- cadence:managed:start/end -->` markers. New `cadence init --claude-md` regenerates only the managed block — allowed on an already-initialized project, reading project name/profile from existing `state.json`/`config.json`; content outside the markers is preserved byte-for-byte and a marker-less user file is left untouched (Phase 26.2).
- `cadence status anomalies --tail [--follow]`: `--tail` prints the last N events oldest→newest (default listing stays newest-first); `--follow` keeps the NDJSON log open and streams appended events (offset-tracked, 200ms poll), honouring `--type`/`--since` on both the initial tail and streamed appends, exiting cleanly on SIGINT, and falling back to one-shot tail on a non-TTY. Closes the v0.7.0 operator-ergonomics milestone (Phase 26.3).
- GitHub Actions CI (`.github/workflows/ci.yml`): `pnpm install --frozen-lockfile` + `lint typecheck test build` on every PR and push to `main`, Node 20 + 22 × {ubuntu, windows, macos}; pnpm pinned to `9.12.0`. `.github/dependabot.yml` schedules weekly `github-actions` + `npm` update PRs. Branch protection documented as a manual GitHub setting (no API automation). No publish/release automation. Closes the v0.8.0 CI milestone (Phase 27.1).

### Changed

- `AnomalyTypeZ` schema bump — new `per-task-fail` member emitted on `refuse` verdicts (with or without bypass). Legacy `.cadence/anomalies.log` files predating the new type continue to parse via the existing newest-first reader (Phase 24.2).
- `AnomalyTypeZ` + `SummaryZ` schema bumps — new `code-review-high` anomaly type (one event per HIGH finding when bypassed) and new optional `Summary.codeReview: Record<file, Finding[]>` field (Phase 24.3).
- `CadenceConfigZ` schema bump — new optional `config.planReview: { provider: 'mock' | 'anthropic'; model?: string }` block (defaults to `{ provider: 'mock' }`) selecting the Phase 25.1 plan-review verifier (Phase 25.1).
- `FindingZ` + `CadenceConfigZ` + `SummaryZ` schema bumps — `Finding.severity` enum gains `'critical'` (additive; code-review still emits only high/medium/low), new optional `config.securityAudit: { provider; model? }` block (defaults to `{ provider: 'mock' }`), and new optional `Summary.securityAudit: Finding[]` field recorded whenever the gate ran (Phase 25.2).
- `cadence init` `--name` no longer carries a hardcoded `unnamed` default (absence is now detectable so it can prompt); new `--gate-profile` and `--claude-md` options added (Phase 26.1 / 26.2).
- `cadence status anomalies` gained `--tail` / `--follow`; `--limit` help text de-scoped from "newest first" since ordering now depends on `--tail` (Phase 26.3).

### Fixed

- Two pre-existing `@typescript-eslint/consistent-type-imports` lint errors (`packages/core/src/notify/loop-violation.ts`, `packages/core/src/verify/coverage.ts`) so `pnpm turbo run lint` is green and CI can gate on it (Phase 27.1).

## [0.3.0] - 2026-05-14

### Added

- Profile system foundation (strict / standard / auto) wired into `.cadence/config.json` + DRAFT frontmatter override (Phase 13).
- `--auto` settle's structural verifier — pass/blocked/needs-context derivation from `PROGRESS.json` task statuses (Phase 13).
- Test-coverage gate: each AC must be referenced by ≥1 test file via `AC-N` token scan; `--allow-missing-coverage` bypass (Phase 14).
- `--deep` independent verifier agent with `mock` (offline, linked-test rule) and `anthropic` providers; per-AC verdicts recorded into `SUMMARY.json deepVerify`; `--allow-verifier-failure` for transport gating (Phase 15).
- `--interactive` human-verdict walker — per-AC `pass | fail | skip` prompt via stdin; `CADENCE_PROMPTER_SCRIPT` env-var seam for tests; non-TTY refusal + `--no-interactive` bypass (Phase 16).
- Anomaly-notify transport contract with `stderr` (default) / `file` (NDJSON) / `none` transports + `selectNotifier` factory + `collectAnomalies` walker (Phase 17.1).
- Hook-side `files-outside-boundary` emission at `pre-tool-edit`; `cadence status anomalies [--type --limit]` reader for `.cadence/anomalies.log` (Phase 17.2).
- `AnomalyEvent.ts` required ISO8601 field + live `--since` filter on `status anomalies` (Phase 17.3).
- `webhook` transport — POSTs `{events: [...]}` JSON to a user-provided URL; optional `headers` + `timeoutMs`; failure-safe (stderr warn, URL never logged) (Phase 19.1).
- `auto × complex` soft cap enforcement (DESIGN.md §4 M2): both `settle run` and `draft approve` refuse without `--allow-auto-complex` (Phase 21.1).

### Changed

- DESIGN.md §6 deferred-items table reconciled — F1, F2, F3, F4, F5, F6 all marked resolved with phase pointers (Phase 20.1).
- Physical KEEL → CADENCE rename rollout: slash commands `keel-*.md` → `cadence-*.md`, `.claude/settings.json` regenerated, root `package.json` `cadence-monorepo`, `.cadence/config.json` `templates.dir`, `.cadence/PROJECT.md`, testkit fixture prefix, CONTRIBUTING.md (Phase 18.1). Pre-Phase-12 hook entries with `_managedBy: 'keel'` now evicted on re-install (Phase 18.1).

### Removed

- `packages/host-codex/` archived to the `keel-codex-archive` git tag and removed from `main` (Phase 11; pre-`0.2.0-rc.1` but cited here for traceability).

## [0.2.0-rc.1] - 2026-05-14

- KEEL → CADENCE rename rollout in source: `@manehorizons/cadence-*` package scopes, `.cadence/` state dir, `cadence` CLI binary (Phase 12).

## [0.1.0] - earlier

- Initial KEEL release. Phases 1–11 shipped under the KEEL name. Superseded by `0.2.0-rc.1`.

[0.3.0]: https://github.com/manehorizons/cadence/releases/tag/v0.3.0
[0.2.0-rc.1]: https://github.com/manehorizons/cadence/releases/tag/v0.2.0-rc.1
[0.1.0]: https://github.com/manehorizons/cadence/releases/tag/v0.1.0-rc.1
