# 261-01 — Historical AC-coverage audit findings

Real run of the `cadence verify historical-coverage-audit` tool (built under
AC-1 through AC-6) against this repo's own corpus, per AC-7. Run on
2026-08-07, worktree `261-historical-ac-coverage-audit`, built from source
under this worktree — the local `node packages/core/bin/cadence.cjs`, not
the global `cadence` on PATH.

## What this audit is

This audits every pre-phase-239 (`coverageScheme` absent) `SUMMARY.json`
under `.cadence/phases/**` and classifies each of its recorded ACs into one
of four confidence buckets, based only on each phase's own DRAFT-declared,
literal (non-wildcard), on-disk `.test.ts`/`.test.tsx` paths:

- **`self-attested`** — the AC's token was found, in an asserting block,
  inside a literal declared test file that *only this phase's* DRAFT
  declares anywhere in the corpus. High confidence.
- **`self-attested-shared`** — found, but only inside a literal declared
  test file that 2+ phases' DRAFTs also declare literally. This bucket
  cannot distinguish a genuine match from another phase's
  identically-numbered AC sharing the same file — it is not treated as a
  confirmed genuine match anywhere in this document.
- **`not-found-in-declared-files`** — the phase declares at least one
  literal, existing test file, it was scanned, but the token wasn't found
  there in an asserting way. No repo-wide fallback scan is performed, so
  this bucket does not claim the AC is uncovered elsewhere in the repo —
  it is not treated as a confirmed false positive anywhere in this
  document.
- **`unreachable`** — the phase's DRAFT declares no literal, existing test
  file at all (no task files declared, only non-test files, only wildcard
  globs, or paths that no longer exist on disk). No evidence exists to
  classify these ACs at all.

Full methodology, the two dead ends this design avoided, and the precise
rules for literal-path derivation and the corpus-wide declaration index are
in `.cadence/phases/261-historical-ac-coverage-audit-pre-phase-239/261-01-DRAFT.md`
(Objective + AC-1 through AC-4) and the implementation itself,
`packages/core/src/verify/historical-coverage-audit.ts` — not re-explained
at length here.

## Commands run

From the repo root, using the local worktree build (not the global `cadence`
on PATH, per this repo's convention):

```
pnpm --filter @thomas-powers-jr/cadence-core build

node packages/core/bin/cadence.cjs verify historical-coverage-audit --json \
  > .cadence/phases/261-historical-ac-coverage-audit-pre-phase-239/261-01-FINDINGS.json
node packages/core/bin/cadence.cjs verify historical-coverage-audit
```

Terminal (non-JSON) output:

```
cadence verify historical-coverage-audit

phases audited: 243
bucket totals:
  self-attested: 150
  self-attested-shared: 319
  not-found-in-declared-files: 351
  unreachable: 257
unreadable SUMMARY/DRAFT records: 12

run with --json for full per-phase detail
```

## Real aggregate numbers

| Bucket | Count |
|---|---:|
| `self-attested` | 150 |
| `self-attested-shared` | 319 |
| `not-found-in-declared-files` | 351 |
| `unreachable` | 257 |
| **Total ACs examined** | **1077** |

- Phases successfully classified (appear in `perPhase`): **243**
- Records that failed to parse (`unreadableRecords`): **12**
- 243 + 12 = **255**, matching the Objective's stated corpus size of 255
  pre-239 settled `SUMMARY.json` records.

### AC-4 invariant check

`self-attested + self-attested-shared + not-found-in-declared-files +
unreachable` must equal the total number of `acResults` entries summed
across every entry in `perPhase`.

```
bucketTotals sum = 150 + 319 + 351 + 257 = 1077
sum(perPhase[].perAc.length) across all 243 phases = 1077
1077 == 1077  -> invariant holds
```

(Verified programmatically against the real `--json` output, not by hand.)

One corpus edge case worth flagging: phase `112-coverage-assertion-mode`
(`112-01`) has a genuinely empty `acResults` array in its own
`SUMMARY.json` (`coverageScheme` key absent — the field is `.optional()`, not
nullable — and `acResults: []`) — it contributes 0
ACs to every bucket and counts as phase-level `unreachable` under Step 3's
rule (`declaredTestFiles.length === 0`) purely because it declares no test
files, not because any AC was actually classified. It is still one of the
243 successfully-parsed phases.

## Phase-level rollup vs. the Objective's ~112/79/64 ballpark

The Objective's hand-estimate was done at the **phase** level (roughly 112
of 255 phases have "a dedicated file" / self-attested-reachable, 79 have
"only shared-file matches", 64 are "unreachable") — coarser than the tool's
real per-AC output. To compare like with like, this section derives a
phase-level rollup from the real per-AC results using exactly this
methodology (per the task spec, not an invented alternative):

- **`unreachable`** (phase-level) iff `declaredTestFiles.length === 0`
  (equivalently: every `perAc` entry for that phase is `unreachable` — by
  construction these always coincide).
- **`dedicated`** (phase-level) iff `declaredTestFiles.length > 0` AND at
  least one `perAc` entry is `self-attested`.
- **`shared-only`** (phase-level) iff `declaredTestFiles.length > 0` AND no
  `perAc` entry is `self-attested` (every AC that was found at all landed
  in `self-attested-shared`, and/or some ACs are
  `not-found-in-declared-files`, but none reached the high-confidence
  dedicated bucket).

Computed by counting over the real `perPhase` data (243 classified phases;
the 12 `unreadableRecords` phases don't appear in `perPhase` and are
excluded from this rollup, consistent with the 243 + 12 = 255 split above):

| Bucket | Real (n=243) | Ballpark (Objective, n≈255) | Delta |
|---|---:|---:|---:|
| dedicated | **60** | ~112 | -52 |
| shared-only | **119** | ~79 | +40 |
| unreachable | **64** | ~64 | 0 |

60 + 119 + 64 = 243, matching the classified-phase count exactly.

**Discrepancy discussion.** The `unreachable` count lines up with the
ballpark almost exactly (64 vs. ~64) — that part of the manual estimate
holds up well. The `dedicated`/`shared-only` split, however, diverges
substantially: the real run finds roughly half as many phases in the
high-confidence `dedicated` bucket as the hand-estimate guessed, with the
difference landing in `shared-only`. Two plausible, non-exclusive reasons
(stated without overclaiming certainty about the exact cause, per the
DRAFT's own hedging language for these buckets):

1. The manual pass was likely a skim for "does this phase's DRAFT list a
   file that looks dedicated to it," which is a much looser bar than the
   tool's actual rule — the tool requires that literal path to be declared
   by *no other* phase's DRAFT anywhere in the whole 255-phase corpus, and
   requires the specific `AC-N` token to actually be found there in an
   asserting block. A file that *looks* phase-specific by name (e.g. a file
   under a phase-specific-sounding directory) can still be declared
   literally by a second phase elsewhere in history, which alone
   reclassifies every AC that resolves to it from `dedicated` to
   `shared-only`.
2. This repo's test suite makes heavy reuse of certain shared files across
   many phases' DRAFTs (the Objective's own point 2 calls out
   `packages/core/tests/cli/init.test.ts` being declared literally by 11
   different phases) — the corpus may simply have more real file-sharing
   than a human skim would surface, since checking "is this file declared
   by anyone else" against 255 other DRAFTs isn't something a manual pass
   can feasibly do exhaustively.

Neither `self-attested-shared` nor `not-found-in-declared-files` is being
treated here as a confirmed genuine match or a confirmed false positive —
per the DRAFT's own Boundaries, this discrepancy is reported as an honest
gap between a rough manual skim and a stricter, reproducible rule, not as
evidence the manual estimate or the tool's classification was "wrong."

## Per-phase detail

243 phases were successfully classified. Full detail for every phase is
below (`self-attested` / `self-attested-shared` / `not-found` /
`unreachable` are AC counts within that phase; `Declared files` is the
count of literal, on-disk test files that phase's DRAFT declares;
`Phase-level` is the Step 3 rollup bucket).

The complete raw `--json` output (identical data, full per-AC IDs and
buckets, not just per-phase counts) is saved alongside this file at
`.cadence/phases/261-historical-ac-coverage-audit-pre-phase-239/261-01-FINDINGS.json`.

<details>
<summary>Full per-phase table (243 rows) — click to expand</summary>

| Phase | ID | Declared files | self-attested | self-attested-shared | not-found | unreachable | Phase-level |
|---|---|---:|---:|---:|---:|---:|---|
| 02-host-codex | 02-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 03-local-dogfood | 03-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 04-host-capabilities | 04-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 05-status-command | 05-01 | 1 | 0 | 1 | 4 | 0 | shared-only |
| 06-settle-auto | 06-01 | 1 | 0 | 2 | 3 | 0 | shared-only |
| 07-done-shortcut | 07-01 | 2 | 2 | 0 | 1 | 0 | dedicated |
| 08-block-shortcuts | 08-01 | 2 | 2 | 0 | 2 | 0 | dedicated |
| 09-host-shortcut-commands | 09-01 | 2 | 0 | 4 | 0 | 0 | shared-only |
| 10-smoke-test-fixes | 10-01 | 5 | 4 | 0 | 0 | 0 | dedicated |
| 100-rec-shipped-status | 100-01 | 0 | 0 | 0 | 0 | 7 | unreachable |
| 101-rec-archive-core | 101-01 | 1 | 0 | 2 | 7 | 0 | shared-only |
| 102-rec-auto-archive | 102-01 | 1 | 0 | 2 | 6 | 0 | shared-only |
| 103-rec-retention-release | 103-01 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 104-real-verification-default | 104-104 | 1 | 0 | 0 | 5 | 0 | shared-only |
| 105-start-menu-core | 105-01 | 2 | 0 | 4 | 0 | 0 | shared-only |
| 106-start-shell | 106-01 | 2 | 1 | 8 | 0 | 0 | dedicated |
| 107-start-release | 107-01 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 108-zero-prompt-init | 108-01 | 1 | 0 | 4 | 1 | 0 | shared-only |
| 109-init-demo | 109-01 | 1 | 5 | 0 | 0 | 0 | dedicated |
| 11-codex-archive | 11-01 | 0 | 0 | 0 | 0 | 4 | unreachable |
| 110-init-activate | 110-01 | 1 | 5 | 0 | 0 | 0 | dedicated |
| 111-release-v1.27 | 111-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 112-coverage-assertion-mode | 112-01 | 0 | 0 | 0 | 0 | 0 | unreachable |
| 113-onboarding-front-door | 113-01 | 1 | 0 | 0 | 0 | 0 | shared-only |
| 114-onboarding-papercuts | 114-01 | 3 | 0 | 0 | 0 | 0 | shared-only |
| 115-release-v1.28 | 115-01 | 0 | 0 | 0 | 0 | 4 | unreachable |
| 116-non-tty-gate-bypass | 116-01 | 1 | 0 | 0 | 5 | 0 | shared-only |
| 117-release-v1.29 | 117-01 | 0 | 0 | 0 | 0 | 4 | unreachable |
| 118-hardening-review | 118-01 | 7 | 1 | 3 | 1 | 0 | dedicated |
| 119-auto-phase-id | 119-01 | 0 | 0 | 0 | 0 | 4 | unreachable |
| 12-rename-cadence | 12-01 | 0 | 0 | 0 | 0 | 7 | unreachable |
| 120-loud-bypass-audit-trail | 120-01 | 1 | 0 | 1 | 3 | 0 | shared-only |
| 121-competitive-objection-faq | 121-01 | 0 | 0 | 0 | 0 | 4 | unreachable |
| 122-codex-host-adapter-parity-tests | 122-01 | 2 | 3 | 0 | 0 | 0 | dedicated |
| 123-draft-templates | 123-01 | 0 | 0 | 0 | 0 | 6 | unreachable |
| 124-release-integrity-github-releases-stay-in-sync | 124-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 129-tutorial-rebuild-catch | 129-01 | 2 | 0 | 0 | 5 | 0 | shared-only |
| 13-profile-system | 13-01 | 5 | 0 | 2 | 4 | 0 | shared-only |
| 130 | 130-01 | 4 | 1 | 0 | 4 | 0 | dedicated |
| 131-doctor-fix-for-safe-onboarding-repairs | 131-01 | 4 | 3 | 0 | 2 | 0 | dedicated |
| 132-init-dry-run-fit-check | 132-01 | 2 | 4 | 0 | 1 | 0 | dedicated |
| 133-onboarding-honesty | 133-01 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 134-progress-json | 134-01 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 135-init-demo-next-steps | 135-01 | 0 | 0 | 0 | 0 | 4 | unreachable |
| 136-readme-approve-inline-note | 136-01 | 1 | 0 | 2 | 0 | 0 | shared-only |
| 137-refusal-trio | 137-01 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 138-docs-truth-pass | 138-01 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 139-default-install-enforces-what-the-tutorial-demonstrates | 139-01 | 3 | 0 | 4 | 1 | 0 | shared-only |
| 14-test-coverage | 14-01 | 3 | 1 | 2 | 3 | 0 | dedicated |
| 140-summary-gate-provenance | 140-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 141-sealed-gates-production-preset-makes-named-gates-non-bypassable | 141-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 142-extract-worktree-discovery-cross-worktree-handoff-candidates | 142-01 | 3 | 1 | 2 | 2 | 0 | dedicated |
| 143-cli-service-integration-picker-for-cadence-resume | 143-01 | 4 | 0 | 7 | 1 | 0 | shared-only |
| 144-docs-release-for-cross-worktree-handoff-picker-v1-38-0 | 144-01 | 1 | 0 | 0 | 6 | 0 | shared-only |
| 145-settle-pending-recommendation-status | 145-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 146-cadence-recommend-slash-command-top-flag | 146-01 | 4 | 0 | 5 | 0 | 0 | shared-only |
| 147-upstream-self-authorship-exemption-for-phase-collision-guard | 147-01 | 1 | 1 | 0 | 4 | 0 | dedicated |
| 148-settle-run-ship-ref-shortcut | 148-01 | 1 | 2 | 0 | 2 | 0 | dedicated |
| 149-milestone-close-verb | 149-01 | 1 | 0 | 0 | 5 | 0 | shared-only |
| 15-deep-verifier | 15-01 | 5 | 1 | 3 | 2 | 0 | dedicated |
| 150-ac-ref-parser-drops-ids-after-trailing-annotation | 150-01 | 1 | 4 | 0 | 0 | 0 | dedicated |
| 151-structured-draft-editing-draft-add-ac-add-task-set-objective | 151-01 | 2 | 4 | 0 | 1 | 0 | dedicated |
| 152-release-v1-40-0 | 152-01 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 153-mcp-parity-intelligence-lifecycle | 153-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 154-release-v1-41-0 | 154-01 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 155-boundary-enforcement-block-mode | 155-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 156-settle-time-boundary-diff-scan | 156-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 157-fix-multi-line-truncation-in-spec-draft-parsers | 157-01 | 3 | 0 | 1 | 4 | 0 | shared-only |
| 158-subagent-task-redundancy-monitoring | 158-01 | 16 | 1 | 3 | 1 | 0 | dedicated |
| 159-wave-based-subagent-dispatch | 159-01 | 7 | 0 | 5 | 1 | 0 | shared-only |
| 16-interactive-verdict | 16-01 | 3 | 0 | 1 | 5 | 0 | shared-only |
| 160-release-v1-42-0 | 160-01 | 0 | 0 | 0 | 0 | 4 | unreachable |
| 161-portfolio-readiness-doc-sync | 161-01 | 1 | 7 | 0 | 0 | 0 | dedicated |
| 162-codex-first-run-bootstrap | 162-01 | 2 | 0 | 4 | 0 | 0 | shared-only |
| 163-handoff-resume-hardening | 163-01 | 0 | 0 | 0 | 0 | 7 | unreachable |
| 164-trustworthy-verifier-activation | 164-01 | 2 | 0 | 3 | 0 | 0 | shared-only |
| 165-host-cli-headless-verifier | 165-01 | 9 | 0 | 4 | 0 | 0 | shared-only |
| 166-language-aware-coverage-defaults | 166-01 | 4 | 0 | 4 | 0 | 0 | shared-only |
| 167-multi-language-coverage-engine | 167-01 | 0 | 0 | 0 | 0 | 10 | unreachable |
| 168-land-test-gutting-demo-as-a-committed-example | 168-01 | 1 | 1 | 0 | 2 | 0 | dedicated |
| 169-assertion-mode-coverage-refuses-the-skip-todo-failing-dodge | 169-01 | 3 | 4 | 0 | 0 | 0 | dedicated |
| 17-anomaly-notify | 17-01 | 6 | 1 | 3 | 2 | 0 | dedicated |
| 17-anomaly-notify | 17-02 | 2 | 1 | 0 | 2 | 0 | dedicated |
| 17-anomaly-notify | 17-03 | 4 | 1 | 1 | 3 | 0 | dedicated |
| 170-refusing-gate-provenance | 170-01 | 0 | 0 | 0 | 0 | 4 | unreachable |
| 171-installer-settings-parse-failure-recovery | 171-01 | 1 | 0 | 1 | 3 | 0 | shared-only |
| 173-optimistic-concurrency-for-cadence-state-writes | 173-01 | 4 | 0 | 5 | 0 | 0 | shared-only |
| 174-post-settle-retro-artifact | 174-01 | 6 | 0 | 2 | 2 | 0 | shared-only |
| 176-audit-trail-for-settle-gate-throws | 176-01 | 1 | 0 | 1 | 1 | 0 | shared-only |
| 177-readme-embeds-the-animated-test-gutting-demo-svg | 177-01 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 178-headless-verifier-guardrails | 178-01 | 4 | 0 | 3 | 0 | 0 | shared-only |
| 179-milestone-fan-in-worktree-status | 179-01 | 2 | 0 | 3 | 0 | 0 | shared-only |
| 18-f2-rename | 18-01 | 1 | 0 | 1 | 6 | 0 | shared-only |
| 180-redact-secrets-from-evidence-quotes-and-security-audit-findings | 180-01 | 5 | 1 | 3 | 0 | 0 | dedicated |
| 181-mcp-tool-trust-envelope | 181-01 | 4 | 1 | 0 | 0 | 0 | dedicated |
| 182-ci-security-automation | 182-01 | 1 | 0 | 0 | 5 | 0 | shared-only |
| 183-docs-drift-check | 183-01 | 3 | 1 | 1 | 1 | 0 | dedicated |
| 184-gate-verifier-abort-signal | 184-01 | 6 | 0 | 3 | 0 | 0 | shared-only |
| 185-smoke-test-the-packed-npm-tarball | 185-01 | 2 | 3 | 0 | 0 | 0 | dedicated |
| 186-cross-phase-retro-rollup | 186-01 | 2 | 3 | 2 | 1 | 0 | dedicated |
| 187-gate-bypass-auto-complex-override | 187-01 | 2 | 0 | 2 | 2 | 0 | shared-only |
| 188-cadence-quickstart | 188-01 | 1 | 5 | 0 | 0 | 0 | dedicated |
| 189-cadence-onboard | 189-01 | 2 | 0 | 2 | 1 | 0 | shared-only |
| 19-f4-webhook | 19-01 | 2 | 0 | 2 | 3 | 0 | shared-only |
| 190-doctor-fix-handoff-retention | 190-01 | 3 | 0 | 3 | 0 | 0 | shared-only |
| 191 | 191-00 | 5 | 0 | 0 | 6 | 0 | shared-only |
| 192-dispatch-action-boilerplate | 192-01 | 1 | 0 | 0 | 4 | 0 | shared-only |
| 193-dispatch-isolation-recommendation | 193-01 | 2 | 0 | 1 | 3 | 0 | shared-only |
| 194-settle-telemetry-revision-conflict | 194-01 | 1 | 0 | 4 | 0 | 0 | shared-only |
| 195-settle-refuses-bare-tn-done-with-no-verify-evidence | 195-01 | 1 | 0 | 0 | 4 | 0 | shared-only |
| 196-worktree-safe-state-tracking-issue-177 | 196-01 | 5 | 0 | 6 | 1 | 0 | shared-only |
| 197-bootstrap-missing-state-json-in-an-already-scaffolded-cadence-dir-fresh-worktrees-dead-end-since-phase-196 | 197-01 | 1 | 0 | 2 | 1 | 0 | shared-only |
| 198-bound-filter-regex-complexity-to-prevent-redos | 198-01 | 0 | 0 | 0 | 0 | 4 | unreachable |
| 199-recommendation-evidence-add-cli-writer | 199-01 | 2 | 0 | 3 | 0 | 0 | shared-only |
| 20-f5-f6-cleanup | 20-01 | 0 | 0 | 0 | 0 | 1 | unreachable |
| 200-fix-recommendation-id-collision-with-archived-ids | 200-01 | 1 | 0 | 2 | 1 | 0 | shared-only |
| 201-milestone-premortem-cli-writer-for-operator-authored-fields | 201-01 | 2 | 0 | 3 | 0 | 0 | shared-only |
| 202-team-rollout-kit | 202-01 | 1 | 1 | 0 | 2 | 0 | dedicated |
| 203-milestone-reopen-transition | 203-01 | 1 | 0 | 0 | 4 | 0 | shared-only |
| 204-cadence-init-ci-ci-gate-re-verification-for-consumer-repos | 204-01 | 8 | 0 | 1 | 7 | 0 | shared-only |
| 205-ui-spec-gate | 205-01 | 11 | 4 | 4 | 1 | 0 | dedicated |
| 206-cadence-next | 206-01 | 4 | 1 | 0 | 3 | 0 | dedicated |
| 207-empty-states-name-precondition-and-command | 207-01 | 6 | 3 | 4 | 0 | 0 | dedicated |
| 208-doctor-check-guidance-for-concurrent-session-collision-safety | 208-01 | 2 | 0 | 2 | 1 | 0 | shared-only |
| 209-anthropic-fallback-warning-claude-code-distinction | 209-01 | 2 | 0 | 2 | 0 | 0 | shared-only |
| 21-auto-complex-cap | 21-01 | 2 | 3 | 0 | 2 | 0 | dedicated |
| 210-anthropic-docs-callout-claude-code-vs-api-key | 210-01 | 0 | 0 | 0 | 0 | 1 | unreachable |
| 211-claudecode-aware-provider-messaging | 211-01 | 4 | 0 | 1 | 1 | 0 | shared-only |
| 212-retro-scoring-feedback | 212-01 | 3 | 3 | 1 | 0 | 0 | dedicated |
| 213-coverage-thresholds-ci | 213-01 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 214-evidence-floor-gate | 214-01 | 1 | 0 | 2 | 2 | 0 | shared-only |
| 215-p0-escape-retro-ledger-diff | 215-01 | 1 | 0 | 0 | 2 | 0 | shared-only |
| 216-settle-capability-gate | 216-01 | 2 | 0 | 0 | 1 | 0 | shared-only |
| 217-changelog-currency-gate | 217-01 | 1 | 0 | 0 | 1 | 0 | shared-only |
| 218-release-verify-retry-budget | 218-01 | 1 | 0 | 1 | 0 | 0 | shared-only |
| 219-recommendation-id-cross-check | 219-01 | 1 | 0 | 2 | 0 | 0 | shared-only |
| 22-v030-release | 22-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 220-praxis-ledger-unify | 220-01 | 5 | 0 | 3 | 3 | 0 | shared-only |
| 221-mcp-cli-parity | 221-01 | 3 | 0 | 0 | 3 | 0 | shared-only |
| 222-shared-adapter-toolkit | 222-01 | 3 | 0 | 0 | 3 | 0 | shared-only |
| 223-summary-hash-attestation | 223-01 | 1 | 0 | 0 | 3 | 0 | shared-only |
| 224-ledger-remote-collision-doctor | 224-01 | 1 | 0 | 3 | 0 | 0 | shared-only |
| 225-convergent-review-runner | 225-01 | 4 | 0 | 3 | 1 | 0 | shared-only |
| 226-centralize-gate-bypass-seal-policy | 226-01 | 2 | 0 | 2 | 1 | 0 | shared-only |
| 227-bootstrap-missing-state-json-in-fresh-worktrees | 227-01 | 2 | 0 | 3 | 0 | 0 | shared-only |
| 228-split-settleservice-into-named-step-functions | 228-01 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 229-readme-mermaid-diagram-doc-test | 229-01 | 1 | 2 | 0 | 0 | 0 | dedicated |
| 23-coherence-warn | 23-01 | 0 | 0 | 0 | 0 | 1 | unreachable |
| 23-draft-read-gate | 23-01 | 3 | 0 | 1 | 5 | 0 | shared-only |
| 23-loop-violation | 23-01 | 0 | 0 | 0 | 0 | 1 | unreachable |
| 23-skill-audit | 23-01 | 0 | 0 | 0 | 0 | 1 | unreachable |
| 230-python-coverage-opener-misses-return-type-annotations | 230-01 | 1 | 1 | 0 | 0 | 0 | dedicated |
| 232-gate-provenance-verifier-identity | 232-01 | 1 | 0 | 3 | 2 | 0 | shared-only |
| 233-per-settle-assurance-record | 233-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 234-kernel-verifier-consumer-boundary | 234-01 | 5 | 0 | 3 | 2 | 0 | shared-only |
| 235-criteria-anchored-review-input | 235-01 | 6 | 1 | 5 | 1 | 0 | dedicated |
| 236-finding-identity-disposition-ledger-routing | 236-01 | 4 | 0 | 4 | 1 | 0 | shared-only |
| 238-drop-node20-support | 238-01 | 9 | 0 | 6 | 2 | 0 | shared-only |
| 24-code-review | 24-03 | 2 | 0 | 3 | 3 | 0 | shared-only |
| 24-manual-approve | 24-01 | 1 | 5 | 0 | 1 | 0 | dedicated |
| 24-per-task-verify | 24-02 | 2 | 0 | 2 | 4 | 0 | shared-only |
| 240-doctor-multi-seam-readiness | 240-01 | 2 | 0 | 2 | 4 | 0 | shared-only |
| 241-anchor-ladder-reachability | 241-01 | 5 | 2 | 1 | 2 | 0 | dedicated |
| 242-findings-to-ledger-auto-routing | 242-01 | 3 | 0 | 6 | 1 | 0 | shared-only |
| 244-settle-time-guard-for-global-cli-shadowing-branch-build | 244-01 | 2 | 3 | 0 | 0 | 0 | dedicated |
| 245-finding-identity-stability | 245-01 | 3 | 0 | 1 | 4 | 0 | shared-only |
| 25-plan-review | 25-01 | 2 | 0 | 2 | 3 | 0 | shared-only |
| 25-security-audit | 25-02 | 2 | 0 | 2 | 3 | 0 | shared-only |
| 26-anomalies-tail | 26-03 | 1 | 3 | 0 | 2 | 0 | dedicated |
| 26-claude-md | 26-02 | 1 | 1 | 0 | 4 | 0 | dedicated |
| 26-init-ux | 26-01 | 1 | 0 | 4 | 1 | 0 | shared-only |
| 27-ci | 27-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 28-release | 28-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 29-expensive-gate | 29-02 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 29-f2-testglobs | 29-04 | 1 | 0 | 3 | 0 | 0 | shared-only |
| 29-gate-remediation | 29-07 | 3 | 0 | 5 | 0 | 0 | shared-only |
| 29-shakedown | 29-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 29-shakedown-docs | 29-06 | 2 | 2 | 3 | 0 | 0 | dedicated |
| 29-testinfra-timeout | 29-05 | 1 | 0 | 0 | 1 | 0 | shared-only |
| 29-tty | 29-03 | 0 | 0 | 0 | 0 | 2 | unreachable |
| 29-tty-remediation | 29-08 | 2 | 0 | 1 | 2 | 0 | shared-only |
| 30-local-provider | 30-01 | 4 | 1 | 4 | 1 | 0 | dedicated |
| 30-testinfra-build-per-task | 30-02 | 1 | 0 | 0 | 1 | 0 | shared-only |
| 31-user-docs | 31-01 | 1 | 0 | 3 | 3 | 0 | shared-only |
| 32-lint-register | 32-02 | 0 | 0 | 0 | 0 | 1 | unreachable |
| 32-testinfra-flake | 32-01 | 2 | 0 | 2 | 4 | 0 | shared-only |
| 33-publish-pipeline | 33-01 | 0 | 0 | 0 | 0 | 6 | unreachable |
| 34-required-skills | 34-01 | 5 | 0 | 5 | 1 | 0 | shared-only |
| 35-review-convergence | 35-01 | 4 | 3 | 0 | 3 | 0 | dedicated |
| 36-spec-stage | 36-01 | 6 | 0 | 5 | 1 | 0 | shared-only |
| 37-codereview-convergence | 37-01 | 2 | 0 | 2 | 4 | 0 | shared-only |
| 38-spec-draft-autoseed | 38-01 | 4 | 2 | 1 | 2 | 0 | dedicated |
| 45-public-release | 45-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 46-handoff-resume | 46-01 | 9 | 10 | 17 | 0 | 0 | dedicated |
| 47-boundary-path-fix | 47-01 | 2 | 3 | 1 | 0 | 0 | dedicated |
| 48-onboarding-hardening | 48-01 | 6 | 0 | 2 | 3 | 0 | shared-only |
| 49-cross-platform-ci | 49-01 | 3 | 0 | 2 | 1 | 0 | shared-only |
| 50-windows-ci-leg | 50-01 | 3 | 0 | 2 | 1 | 0 | shared-only |
| 51-docs-portal | 51-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 52-preset-flag-rename | 52-01 | 1 | 0 | 4 | 0 | 0 | shared-only |
| 53-cadence-scout | 53-01 | 1 | 0 | 4 | 0 | 0 | shared-only |
| 54-intelligence-store-split | 54-01 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 55-intelligence-store-deep-imports | 55-01 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 56-cadence-doctor | 56-01 | 3 | 0 | 6 | 0 | 0 | shared-only |
| 57-rec-promote | 57-01 | 2 | 6 | 0 | 1 | 0 | dedicated |
| 58-mcp-server | 58-01 | 0 | 0 | 0 | 0 | 7 | unreachable |
| 59-brief-resume | 59-01 | 4 | 3 | 5 | 0 | 0 | dedicated |
| 60-host-adapter-contract | 60-01 | 0 | 0 | 0 | 0 | 6 | unreachable |
| 61-scout-session-grouping | 61-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 62-first-run-nudge | 62-01 | 1 | 0 | 2 | 0 | 0 | shared-only |
| 63-cadence-tutorial | 63-01 | 1 | 0 | 0 | 5 | 0 | shared-only |
| 64-explain | 64-01 | 1 | 0 | 0 | 5 | 0 | shared-only |
| 65-codex-spike | 65-01 | 0 | 0 | 0 | 0 | 1 | unreachable |
| 66-codex-adapter | 66-01 | 2 | 3 | 0 | 1 | 0 | dedicated |
| 67-codex-install | 67-01 | 4 | 1 | 0 | 3 | 0 | dedicated |
| 68-codex-shim | 68-01 | 2 | 1 | 0 | 2 | 0 | dedicated |
| 69-codex-docs | 69-01 | 1 | 0 | 0 | 2 | 0 | shared-only |
| 70-deep-verify-diff | 70-01 | 3 | 0 | 0 | 0 | 0 | shared-only |
| 71-banner-honesty-docs | 71-01 | 1 | 0 | 0 | 0 | 0 | shared-only |
| 72-provider-hardening | 72-01 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 73-verifier-selection | 73-01 | 0 | 0 | 0 | 0 | 5 | unreachable |
| 75-mcp-resources | 75-01 | 1 | 0 | 0 | 5 | 0 | shared-only |
| 76-mcp-tool-parity | 76-01 | 1 | 0 | 0 | 6 | 0 | shared-only |
| 77-mcp-prompts | 77-01 | 1 | 0 | 0 | 4 | 0 | shared-only |
| 78-mcp-install | 78-01 | 1 | 0 | 0 | 4 | 0 | shared-only |
| 80-logger-foundation | 80-01 | 5 | 0 | 3 | 4 | 0 | shared-only |
| 81-seam-instrumentation | 81-01 | 3 | 1 | 1 | 4 | 0 | dedicated |
| 83-phase-collision-guard | 83-01 | 3 | 3 | 0 | 4 | 0 | dedicated |
| 85-doctor-worktree-line | 85-85 | 1 | 0 | 4 | 0 | 0 | shared-only |
| 86-proactive-next-free | 86-86 | 1 | 2 | 0 | 1 | 0 | dedicated |
| 87-release-v1.19.0 | 87-87 | 0 | 0 | 0 | 0 | 3 | unreachable |
| 88-handoff-retention-core | 88-88 | 4 | 0 | 4 | 1 | 0 | shared-only |
| 89-doctor-handoff-retention | 89-89 | 1 | 0 | 5 | 0 | 0 | shared-only |
| 90-release-v1.20.0 | 90-90 | 0 | 0 | 0 | 0 | 4 | unreachable |
| 91-config-explain-core | 91-91 | 3 | 0 | 0 | 3 | 0 | shared-only |
| 92-config-explain-cli | 92-92 | 3 | 0 | 0 | 4 | 0 | shared-only |
| 93-explain-deepening | 93-93 | 1 | 0 | 0 | 4 | 0 | shared-only |
| 94-config-edit-core | 94-94 | 5 | 0 | 0 | 8 | 0 | shared-only |
| 95-config-edit-cli | 95-95 | 1 | 0 | 0 | 5 | 0 | shared-only |
| 96-quickstart | 96-96 | 3 | 0 | 0 | 7 | 0 | shared-only |
| 97-release-v1.21 | 97-97 | 0 | 0 | 0 | 0 | 2 | unreachable |
| 98-activate | 98-98 | 5 | 1 | 1 | 4 | 0 | dedicated |
| 99-activate-doctor | 99-99 | 2 | 0 | 1 | 4 | 0 | shared-only |

</details>

## Unreadable records (12)

These 12 `SUMMARY.json`/`DRAFT.md` pairs failed to parse and were excluded
from the per-AC classification above (counted separately, not silently
dropped, per AC-4). All 12 share the identical root cause: their DRAFT's
YAML frontmatter has `status: DONE`, a value the current DRAFT schema
doesn't accept (it now only allows `PENDING` / `APPROVED` / `IN_PROGRESS` /
`SETTLED`) — these are phases 39 through 44, an early-history schema
generation predating the current status enum. Recorded here for a human to
investigate later if desired; per this task's Boundaries, no historical
DRAFT/SUMMARY file was modified to work around this.

| Phase | ID |
|---|---|
| 39-code-review-gate | 39-01 |
| 39-draft-build-gates | 39-01 |
| 39-enum-gate-coverage | 39-01 |
| 39-gate-contract | 39-01 |
| 39-interactive-gate | 39-01 |
| 39-security-audit-gate | 39-01 |
| 39-skill-audit-check | 39-01 |
| 40-verifier-factory | 40-01 |
| 41-backend-commit | 41-01 |
| 42-emit-unconverged | 42-01 |
| 43-boundary-check | 43-01 |
| 44-gate-registry | 44-01 |

Full parse-error detail (the raw Zod validation error) for each is in the
`unreadableRecords` array of `261-01-FINDINGS.json`.
