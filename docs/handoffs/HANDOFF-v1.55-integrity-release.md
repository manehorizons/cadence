# HANDOFF — CADENCE v1.55.0 Integrity Release & Forward Roadmap

**To:** Claude Code
**From:** Thomas, 2026-08-04
**Repo:** `thomas-powers-jr/cadence` @ `main`
**Audit reference commit:** `e218206ecfbd69d5f7e111482adbcfcb7f7da45b`
**Current release:** v1.54.0 → **Target:** v1.55.0
**Scout ID for this batch:** `scout-20260804-integrity-release`

This document supersedes two prior assessments and merges them. Where they
conflicted, the conflict has been resolved empirically and the resolution is
recorded inline.

---

## 1. Mission

v1.55.0 is an **integrity, trust, and consolidation release**. It closes known
gaps in security enforcement, assurance visibility, coverage correctness, and
static verification.

Do not start a feature arc. Do not expand the product surface. The release makes
existing guarantees *more accurate, more visible, and more consistently enforced*.

---

## 2. Standing rules

1. **Measure, then write.** No predicted figures anywhere — not in DRAFTs, SUMMARYs,
   or commit messages. Every number carries the command that produced it.
2. **Citations live in the artifact.** Evidence goes in DRAFT/SUMMARY text, not in
   report-back prose. Recurring failure across ten-plus phases.
3. **Corpus before code.** Adversarial fixtures proven red before implementation.
4. **Dedup before filing.** `cadence recommendation list` first. §10 names existing recs.
5. **Vertical slices, hard bars.** Phase N does not start until N−1 meets its bar.
6. **TDD is house style.** Failing test → implementation → commit.
7. **Verify flags before use.** Run `cadence <cmd> --help`; correct this doc where it drifts.
8. **Use CADENCE to build CADENCE.** Next available phase numbers; do not assume numbers from this doc.
9. **One narrowly scoped phase and PR per concern.** Do not silently fix unrelated findings — file a rec.
10. **Never weaken a test or gate to restore green.**
11. **Independent whole-branch review before each phase settles.**
12. **Do not cut the release while any required CI, security, docs, or release-integrity workflow is red.**

### Out of scope — previously considered and rejected

- **Do not create a new repository.** A greenfield repo that ports this code and re-settles it under real verifiers produces a git history claiming clean conduction from commit 1. That history would be false — it converts a perceived provenance problem into an actual one.
- **Do not unpublish from npm.** `cadence-types` has four public dependents, `cadence-core` two. Unpublish is mechanically blocked. `npm deprecate` is the correct instrument if a version ever needs retiring.
- **Do not rewrite, revert, or re-settle phases 232–251.** Unverified ≠ defective. Reverting deletes the foreign-binary guard (244), three silent-refusal fixes (247/248/249), and the conduction check (251), and produces zero real findings.
- **Do not hand-edit historical `SUMMARY.json`.** They are the corpus of record; `dec-20260801-003` load-bears on them. `contentHash` makes edits detectable via `cadence summary verify`.

### Non-goals for v1.55

New host adapters · new verifier families · new profiles or tiers · new
intelligence-ledger concepts · public SDK redesign · CLI restructuring · README
redesign · schema v3 · MCP trust changes · remote telemetry · new notification
transports · semantic gate-matrix changes · a general AST framework for every
language · v2.0 architecture.

If one becomes necessary, record a decision explaining why and keep it minimal.

---

## 3. First-session orientation

```bash
git status --short --branch
git fetch origin
git switch main
git pull --ff-only
git rev-parse HEAD

pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test

cadence status
cadence doctor
cadence recommend
```

Then read: `CLAUDE.md`, `AGENTS.md`, `DESIGN.md`, `SECURITY.md`,
`docs/security/audit-exceptions.md`, `.cadence/config.json`,
`.cadence/intelligence/RECOMMENDATIONS.md`.

The audited commit is a reference point, not permission to overwrite newer work.
`main` carries a pending minor changeset for the Phase 251 `conduction-reachability`
check — preserve and include it in v1.55.

**Re-verify every finding in this document against current source before
implementing.** This doc was written from a static tarball read. Correcting it is
a deliverable.

---

## 4. Resolved conflict — read before Workstream A

Two prior assessments disagreed on whether `pnpm.overrides` remediated the
`fast-uri` and `brace-expansion` advisories. **Corrected by phase 253's
empirical re-investigation: the prior diagnosis — that the mechanism
doesn't work — was itself wrong.** `pnpm.overrides` works correctly under
this repo's pinned `packageManager` (`pnpm@9.12.0`); the real defect was
stale override targets, not the mechanism itself.

`docs/security/audit-exceptions.md:33` previously recorded a misdiagnosis:
that pnpm 9.12.0 deprecated reading `pnpm.overrides` from `package.json` and
does not implement its documented replacement either. That was based on
a `[WARN] The "pnpm" field in package.json is no longer read by pnpm...`
message which, empirically re-derived by two independent operators in
phase 253 (transcripts in
`.cadence/phases/253-dependency-override-remediation/253-01-T3-EVIDENCE.md`),
is printed by a **globally-installed newer pnpm launcher** (e.g. v11.2.2)
self-switching and warning about its own irrelevant behavior *before* it
delegates to this repo's `packageManager`-pinned `pnpm@9.12.0`, which then
reads and applies `pnpm.overrides` correctly. `corepack pnpm@9.12.0` never
prints the warning, even at debug loglevel.

The real mechanism: an override key `"pkg@<selector>": "<target>"` fires
only when `<selector>` intersects the *declared* range of the dependent
requesting the package — not whatever version would naturally resolve. A
selector that no longer intersects any declaring dependent's range is
**silently ignored, no error** — a real, distinct failure mode, but **not**
what happened here. This repo's `brace-expansion@5.0.6 → ^5.0.7` and
`fast-uri@3.1.2 → ^3.1.4` entries *did* fire and pin the tree to those exact
targets (confirmed against the pre-phase-253 lockfile) — the defect was that
those targets were themselves stale, pinned below the current patched floor,
not that the overrides went unmatched.

**Consequences:**

- The `fast-uri@3.1.2 → ^3.1.4` and `brace-expansion@5.0.6 → ^5.0.7` entries in root `package.json` were stale — pinned below the current patched floor — and the `brace-expansion` 2.x resolved line and `ip-address` had no override of their own at all. Nothing detected the drift.
- `brace-expansion@5.0.7` was still resolved and the exception text states patched is `>=5.0.8` — so it remained vulnerable. A second copy at `2.1.2` is also present, with no override targeting it.
- Any remediation plan that assumed overrides were broken and reached for a pnpm major-version upgrade or a devDependency-pin workaround would have solved the wrong problem. **`rec-20260724-012`, filed under the mistaken diagnosis, is superseded by phase 253's correction**, which refreshed the four override targets to their real patched floors, added the missing `ip-address` override, and added `scripts/check-lockfile-overrides.mjs` — a CI detector that fails the build the next time a target drifts below what's actually resolved.

Verify this independently before acting on it.

---

## 5. The clock

Three documented exceptions expire **2026-08-13 — nine days from this handoff**:

| Advisory | Package | Expires |
|---|---|---|
| GHSA-5xrq-8626-4rwp | vitest | 2026-08-13 |
| GHSA-fx2h-pf6j-xcff | vite | 2026-08-13 |
| GHSA-r28c-9q8g-f849 | postcss | 2026-08-13 |
| GHSA-mh99-v99m-4gvg | brace-expansion | 2026-08-20 |
| GHSA-88fw-hqm2-52qc | hono | 2026-08-28 |
| GHSA-xxxx-xxxx-xxxx | some-package | 2026-12-31 |

The audit job fails on any high/critical advisory not listed, **or listed but past
expiry**. So the security gate goes red on its own schedule in nine days, on top of
the three undocumented advisories already failing it. Security leads the release
for this reason.

**Also verify:** the final row is a template placeholder sitting in a live policy
table that `scripts/check-audit-exceptions.mjs` parses. Confirm the script skips
it. If it can match a real advisory, that is a hole in the exception mechanism and
is a P0 in its own right — file it immediately.

---

## 6. Priority order

Ordered by **hard deadline, then dependency, then risk.**

| # | Phase | Priority | Blocks / blocked by |
|---|---|---|---|
| A | Dependency-control mechanism repair | **P0** | Prerequisite for B |
| B | Security advisory remediation | **P0** | 9-day clock; blocked by A |
| C | Self-application config correction | **P0** | One line; unblocks conduction for all later phases |
| D | Security merge-blocking | **P1** | Must land after B or reds `main` |
| E | Real-provider certification | **P1** | **Operator-executed**; validates F |
| F | Findings rendering in Markdown | **P1** | Best validated after E |
| G | JS/TS assertion-span scanner | **P2** | Independent |
| H | Website security audit coverage | **P2** | Independent |
| I | Test-source typecheck and lint | **P2** | Independent; largest blast radius |
| J | Honesty layer | **P2** | Partially blocked by E |
| K | Release cut | — | All of the above |

**Scope recommendation.** A–F plus K is a coherent, shippable v1.55.0 with the
hard deadline met. G–J are real but not deadline-driven, and I in particular
(bringing 73,026 LOC of test code under typecheck and lint) will surface a long
tail of corrections. **Consider cutting v1.55.0 at F and shipping G–J as v1.56.0.**
Present this split as a decision before starting G. Do not decide unilaterally.

---

## 7. Phases A–F — required for v1.55.0

### Phase A — Repair the dependency-control mechanism

**Corrected (phase 253, `253-dependency-override-remediation`):** the original
diagnosis below, that pnpm 9.12.0 does not read `pnpm.overrides` at all, was
wrong. Root `package.json`'s `pnpm.overrides` mechanism works correctly under
this repo's pinned
`packageManager` (`pnpm@9.12.0`); the misleading warning came from a
globally-installed newer pnpm launcher self-switching before delegating to the
pinned binary (see §4). The real, much smaller defect: four override targets
were stale — pinned below the current patched floor — `brace-expansion`'s 2.x
resolved line had no override of its own, `ip-address` had no override at
all, and nothing detected the drift.

**Rec:** `rec-20260724-012`, filed under a mistaken premise this phase
disproves; superseded by phase 253's correction.

**Tasks — corrected to what the real defect actually required:**

- **A.1** — Empirically determine the override key grammar (there was no unreachable, dead-on-arrival config to reproduce). Capture the misleading launcher warning's real source, and confirm overrides fire on declared-range intersection with the requesting dependent, not natural resolution. Do not accept §4 on faith — verify independently.
- **A.2** — Refresh the four override targets to their real patched floors (fast-uri >=3.1.5, brace-expansion 5.x line >=5.0.9, brace-expansion 2.x line as its own new override >=2.1.4, ip-address as a new override >=10.3.1). No pnpm major-version upgrade and no devDependency-pin workaround are needed once the true mechanism is understood — and pnpm 11.0.0–11.0.8 has its own separate, worse override-ignoring regression, so an upgrade is a net-worse path, not a shortcut. `security.yml`'s separate `corepack pnpm@11.x` shell-out for the audit itself (working around npm's retired legacy audit endpoint, pnpm/pnpm#11265) is orthogonal to `pnpm.overrides` correctness — do not conflate the two.
- **A.3** — Do NOT remove any of the four existing overrides — they are load-bearing and functional; correct their targets in place.
- **A.4** — Prove every resolved instance (including both brace-expansion lines) satisfies its refreshed target directly against `pnpm-lock.yaml`.
- **A.5** — Add a detector that fails when a resolved instance no longer satisfies its override target. This defect existed *because* nothing detected drift, not because the mechanism was broken.
- **A.6** — The `packageManager`-pinned `pnpm@9.12.0` that actually governs install/build/test/lint behavior is consistent across workflows, `.githooks/`, and docs; leave that pin untouched (no upgrade). This is separate from `.github/workflows/docs.yml:44`'s `pnpm/action-setup@v4` pin, which is inconsistent with every other workflow's `@v6` (`ci.yml`, `security.yml`, `release.yml`) — a real, known, minor discrepancy in the action-setup step version, not the `packageManager` pin itself. Phase 253's task T7 files a low-priority recommendation for that mismatch rather than fixing it inline.

**Bar:** every override target names its current patched floor; every resolved
instance (including both `brace-expansion` lines) satisfies its target in the
lockfile; clean install and `--frozen-lockfile` install both succeed; a
deliberately-reverted target fails the new detector, and passes again once
restored.

---

### Phase B — Security advisory remediation

**Rec:** `rec-20260803-003`. **Blocked by A.**

Three undocumented high-severity advisories: `GHSA-7p8r-x3mc-p8w7` (fast-uri),
`GHSA-mwp4-54f8-5fhr` (ip-address), `GHSA-rgw5-rvv9-x895` (brace-expansion —
a different ID from the already-documented GHSA-mh99-v99m-4gvg).

**Tasks**

- **B.1** — Reproduce the failure: `node scripts/check-audit-exceptions.mjs`. Capture output verbatim.
- **B.2** — For each advisory: complete dependency path, reachability analysis in CADENCE's actual usage, and a remediation decision.
- **B.3** — **Prefer real upgrade or re-resolution over exception.** Exceptions only where remediation is currently impossible.
- **B.4** — Address the residual `brace-expansion@2.1.2` and the `5.0.7` resolution against the documented `>=5.0.8` patch floor.
- **B.5** — Triage the three exceptions expiring 2026-08-13 (vitest, vite, postcss). Renew with fresh reachability analysis or remediate. Do not blanket-extend expiry dates.
- **B.6** — Every retained exception carries: advisory ID, package, reachability analysis, risk justification, **firm expiry**, tracked remediation dependency.
- **B.7** — Verify the placeholder row cannot match a real advisory (§5).
- **B.8** — Never dismiss a path as "dev-only" without verifying the actual package path.

**Bar:** `node scripts/check-audit-exceptions.mjs` green from a clean checkout;
zero undocumented high/critical advisories; every exception time-bounded and
evidence-based; documentation matches the resolved graph.

---

### Phase C — Self-application config correction

**No existing rec — file under the scout ID.**

`.cadence/config.json` sets `profile: "auto"`. Per the `DELTAS` matrix in
`packages/core/src/gates/engine.ts`, `auto` excludes `code-review` and
`security-audit` from **every** tier. This single value is the primary cause of
the conduction gap. `cadence init` gives a repo with ≥20 commits `standard`; this
repo is on `auto` because it was initialized when it was young and the profile was
never revisited.

**This phase is small and high-leverage: it makes every subsequent v1.55 phase a
conduction data point**, naturally accumulating the three real-provider settles
`dec-20260801-003`'s revisit trigger requires — without artificial runs.

**Tasks**

- **C.1** — Move `profile` off `"auto"`. `standard` includes `code-review` at tier complex; `strict` includes it at standard and complex. Propose the value with reasoning and **stop for approval** — this changes gate cost for every future phase.
- **C.2** — Raise `gates.evidenceFloor` from `"mention"` to at least `"assertion"`, matching the `solo` preset default documented at `packages/core/src/tutorial/fixtures.ts:51`. The repo currently runs its own gate a rung looser than the preset it ships to users.
- **C.3** — `securityAudit.provider` is `"mock"`. Flag for operator decision; do not change silently.
- **C.4** — Re-run `cadence doctor` and record the `conduction-reachability` delta verbatim, before and after.

**Bar:** `conduction-reachability` reports strictly fewer blocked axes than before,
with the before/after output recorded in the DRAFT.

---

### Phase D — Make security merge-blocking

**No existing rec — file under the scout ID. Must land after B.**

`.github/workflows/ci.yml:47-49`: `ci-success` has `needs: [test]`. The Security
and CodeQL workflows are not aggregated. `rec-20260803-003` states the
consequence: the audit job is red and PRs still merge. A red gate that permits
merge is a shape with gate ceremony.

**Tasks**

- **D.1** — Aggregate security into a stable required check. Preserve the existing `if: always()` plus explicit-result-check pattern; do not rely on `needs` short-circuiting.
- **D.2** — **A skipped security job must not count as success.** Assert this explicitly with a test.
- **D.3** — Order after B, or `main`'s required check goes red on merge.
- **D.4** — Test asserting the aggregation, following the `doc-sync-hook.test.ts` precedent for CI-shape invariants.

**Bar:** a deliberately-failing security job demonstrably fails the required check;
a deliberately-*skipped* security job also fails it. Show both.

---

### Phase E — Real-provider certification **(OPERATOR-EXECUTED)**

**Unblocks:** `dec-20260801-003`, `rec-20260801-010`, phase 241's `executable`
anchor tier, phase 242's ledger auto-routing, and the `strong` assurance rung.

#### You cannot run this yourself

`cadence`'s self-invocation guard forces a `mock` verifier fallback whenever
`cadence` runs inside a headless Claude Code session with a `host-cli` provider.
`codeReview.provider` is `host-cli`. **If you attempt this, you will get a silent
mock fallback and produce a settle that looks successful and proves nothing** —
precisely the failure this release exists to correct.

Your role is preparation. Thomas executes.

**Tasks**

- **E.1** — Confirm blockers: run `cadence doctor`, report `conduction-reachability` verbatim. If it reports `ok`, **stop** — that contradicts the baseline.
- **E.2** — Build a **disposable fixture with an intentionally seeded defect** of known severity. A seeded finding makes certification deterministic; relying on a real phase to happen to produce a finding does not.
- **E.3** — Scaffold with explicit DRAFT frontmatter (`profile: strict`, `tier: complex` — the only cell including both review gates; verify against `DELTAS`, do not restate from this doc).
- **E.4** — Write `CONDUCTION-RUNBOOK.md` (do not commit permanently) with the exact paste-ready commands. Source from `docs/providers.md:539`, which already documents the procedure — cite it, do not reinvent it. Must state: real interactive terminal, `CLAUDECODE` unset, credentials present.
- **E.5** — **Do not alter safety guards to enable certification.** Use the phase-level profile override and the documented operator procedure only. Modifying `isSelfInvocation`, `SELF_INVOCATION_ENV_VAR`, or `DELTAS` to make this easier is out of scope and would invalidate the result.
- **E.6** — Build through BUILD. **Stop before settle.** Hand off at the settle boundary.

**Bar** — met only after Thomas runs the settle from a real terminal and the
`SUMMARY.json` shows:

- `assurance.verifierRollup` with at least one **non-`mock`** provider entry
- persisted verifier identity including provider and model
- the seeded finding persisted, causing refusal at the configured severity
- the finding rendered in Markdown (couples to Phase F)
- the corrected fixture settling cleanly on a second run

**Three outcomes:** clean → proceed. Bugs in the real path → stop, file each under
the scout ID, re-prioritize. Structurally wrong → stop entirely, report, do not
attempt repair.

---

### Phase F — Render findings in Markdown summaries

**Rec:** `rec-20260802-002`. **Best validated after E.**

`SUMMARY.json` persists `codeReview` and `securityAudit` findings, but neither
`packages/core/src/parse/summary-writer.ts` nor
`packages/core/src/services/summary-render.ts` surfaces them. A user can receive a
refused settle summary without seeing the finding that caused the refusal, unless
they read JSON.

**Section order:** Acceptance Criteria → Tasks → Findings → Gates → Gate bypasses →
Assurance → Decisions and deferred work.

Render code-review and security findings separately. Include when present:
severity, file, line, message, stable finding ID, target, anchor kind/ref/tier,
disposition, waiver expiry. Do not dump raw JSON — optimize for a human reading a
refused settle or a PR.

**Tasks**

- **F.1** — Implement in both renderers.
- **F.2** — Omit empty finding sections. Deterministic ordering.
- **F.3** — **Historical summaries without finding fields render byte-compatibly** except where an intentionally added section applies. `contentHash` verification must remain valid; no default may inject fields into parsed historical summaries before hashing.
- **F.4** — Tests covering critical/high/medium/low, missing optional fields, anchors, disposition, waivers.
- **F.5** — No provider credentials, webhook values, or local absolute paths rendered. Route through the existing `redactSecrets` utility.
- **F.6** — **Assurance section caveat:** `overall: 'strong'` is currently structurally unreachable (see J.1). Do not render Assurance in a way that implies `strong` is attainable until J.1 resolves. Coordinate with J.

**Bar:** both renderers show all persisted findings of both kinds; a refused
summary visibly shows the causing finding; every historical summary in
`.cadence/phases/` still passes `cadence summary verify`.

---

## 8. Phases G–J — v1.55 if scope allows, else v1.56

### Phase G — JS/TS assertion-span scanner

**Rec:** `rec-20260803-002`

The handwritten masker does not model regex literals. Parentheses or backticks
inside a regex can corrupt block-span detection, reporting valid assertions as
outside test blocks. Reproduced in the repo's own tests.

Evaluate in order: (1) a parser already in the dependency graph; (2) a narrowly
scoped parser dependency if security and bundle cost are acceptable; (3) improve
the masker only if it can reliably distinguish regex from division in supported
contexts; (4) if full parsing is disproportionate, **fail loudly on ambiguous
syntax rather than silently misclassifying coverage** — refusal over false
confidence, consistent with house doctrine.

Do not accept a heuristic that only fixes the single reproduced case. Test a
corpus: regex, division, templates, comments, nested calls, multiline expressions,
escaped characters.

**Bar:** known reproduction passes; regex parens do not alter block depth; regex
backticks do not toggle template masking; division not misclassified; existing
JS/TS coverage green; `cadence verify coverage --explain` gives a useful
diagnostic on unparseable syntax; **no AC receives assertion credit from a token
outside a real test block.**

**Couples to `rec-20260729-006`** (retroactive audit of historical AC PASS
records). Run a repo-wide coverage audit to determine whether historical files
were undercounted. Report; do not remediate history in this phase.

---

### Phase H — Website security audit coverage

**Rec:** `rec-20260802-006`

`website/` has its own `package.json` and `pnpm-lock.yaml`. The audit job covers
the root workspace only; the Docs workflow installs and builds the website without
auditing it.

Either a `website-audit` job in `security.yml`, or a generalized script evaluating
both lockfiles independently. **Do not merge the workspaces to simplify the audit**
unless separately justified.

**Bar:** both lockfiles audited independently; a high/critical website advisory
fails the Security workflow unless documented with an unexpired exception;
exceptions identify their workspace; the website audit runs on the weekly
schedule; docs no longer imply root coverage extends to `website/`; a test proves
the website audit cannot silently disappear.

---

### Phase I — Typecheck and lint test sources

**Rec:** `rec-20260728-002`

Package tsconfigs build and typecheck only `src/**/*`; lint scripts target `src`.
Test files run through Vitest but sit outside the formal TypeScript and ESLint
gates — **73,026 LOC across 393 test files in core alone.**

Approach: package-level or shared `tsconfig.tests.json` including test files and
test-only helpers, `noEmit`; an explicit root or Turbo task for test typechecking;
lint expanded to tests with narrowly documented exceptions.

**Bar:** a deliberate type error in a test fails CI; a deliberate lint error in a
test fails CI; production builds still emit production source only; **current tests
are corrected, not excluded wholesale**; cross-package fixtures resolve; one stable
required CI context covers production and test static checks; Windows, macOS,
Linux green.

**Warning:** highest blast radius in the release. Bringing 73k previously
unchecked LOC under a type gate will surface a long tail. Timebox, report early,
and be prepared to split across two phases.

---

### Phase J — Honesty layer

Several items, each small. File individually under the scout ID.

- **J.1 — `overall: 'strong'` structurally unreachable.** `packages/core/src/gates/assurance-record.ts` gates `strong` behind `hasRealVerifier`, which reads only `verifierRollup`, populated only from `code-review`/`security-audit` provenance. Phase 250 settled 8/8 ACs at `executed` and was still capped at `mixed`. **Same defect class as phase 241's "structurally-dead top rung," one layer up.** If E and C succeed, this may resolve with no code change — in which case the deliverable is the regression test whose absence let it ship. Do not implement before E reports.
- **J.2 — `DoctorSeverity` lacks an indeterminate rung.** `packages/core/src/doctor/model.ts:6` is `'ok' | 'warning' | 'error'`. Checks that cannot determine their answer return `pass(...)`, so "couldn't determine" renders as `ok`. At least three checks collapse this way. **Note the release dependency:** the Definition of Done requires `cadence doctor` to report no untriaged release-blocking warning — a check that says `ok` when it means "unknown" weakens that gate. Treat as a published contract change.
- **J.3 — Claim-surface precision.** The public claim is **not false**: `website/src/content/docs/index.mdx:23` names the always-fire build/test gate as its proof point, and `README.md:93` discloses in bold that mock is "**not real verification**." The gap is an unclosed inference — a reader seeing "uses that same loop on itself" alongside the full gate matrix could infer the AI gates were exercised. Add a short paragraph stating which gate families carried development and which have not conducted, pointing at `conduction-reachability`. **Every number measured by you, command recorded in the DRAFT.** Quiet, data-forward register; no apology, no hedging.
- **J.4 — ROADMAP currency.** Rec `rec-20260727-012` (`ready-for-cadence-spec`, high) — promote, do not re-file. `.cadence/ROADMAP.md` is anchored to "v0.3.0 → v1.0" from 2026-05-14, newest phase reference 242, and two anchor decisions are false: hand-cut releases (superseded by the Release workflow) and **"v1.0 = feature-complete. Every gate in DESIGN.md §4.1 fires."** That is the only materially overreaching claim in the repo, and it is unmet at v1.54.
- **J.5 — Coverage thresholds stale.** `vitest.shared.ts` last measured 2026-07-25 (phase 222), ~26 phases ago. Re-measure. Preserve the existing comment discipline: measured values, dates, reasoning. **Do this after G**, since scanner correction may change measured coverage.
- **J.6 — Raw `\x00` in `assurance-record.ts`** at offset 3045, used as a composite map-key delimiter. Technique is correct; the cost is that `file` reports the source as `data` and grep silently skips it. Replace with `\u0000` (identical runtime value, ASCII on disk) or mark `text` in `.gitattributes`. A tooling blind spot in the file computing your assurance verdict.
- **J.7 — Backfill `## [Unreleased]`** for the pending `conduction-reachability` changeset.

---

## 9. Cross-cutting requirements

Every phase must satisfy:

- No existing refusal becomes a pass without an explicit recorded decision.
- No skipped or mock verifier is reported as a real pass.
- Gate provenance remains truthful.
- Historical `SUMMARY` schema versions still parse; `contentHash` verification remains valid.
- No default injects fields into parsed historical summaries before hashing.
- No credential, API key, webhook secret, or local absolute path persisted or logged.
- File writes remain atomic where the current service contract requires it.
- No release artifact generated from a dirty or unverified tree.
- Any bypass used during development is recorded and justified with a named reason.

### Per-phase verification

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

Plus phase-specific checks.

---

## 10. Ledger

**Dedup first — mandatory.**

```bash
cadence recommendation list
cadence decision show dec-20260801-003
cadence intelligence audit
```

**Existing — reference, do not duplicate:**

| Id | Covers | Phase |
|---|---|---|
| `rec-20260724-012` | dead pnpm overrides | A |
| `rec-20260803-003` | security advisories | B |
| `rec-20260802-002` | findings not rendered in Markdown | F |
| `rec-20260803-002` | JS/TS regex-literal scanner defect | G |
| `rec-20260802-006` | website audit coverage | H |
| `rec-20260728-002` | tests outside typecheck/lint | I |
| `rec-20260727-012` | roadmap currency | J.4 |
| `rec-20260729-006` | retroactive coverage audit | G (report only) |
| `rec-20260729-004` | AC-token collision | context |
| `rec-20260801-010` | finding message-drift dedup | unblocked by E |
| `dec-20260801-003` | the deferral E unblocks | E |

**Candidates to file** — verify absent first:

| Finding | Priority / readiness | Phase |
|---|---|---|
| `overall: 'strong'` structurally unreachable | high / needs-decision | J.1 |
| `ci-success` does not aggregate security/CodeQL | high / ready-for-cadence-spec | D |
| Repo `profile: "auto"` contradicts `cadence init`'s own maturity heuristic | high / ready-for-cadence-spec | C |
| Placeholder row in live exceptions table | **verify — P0 if matchable** | B.7 |
| `DoctorSeverity` lacks indeterminate rung | medium / needs-decision | J.2 |
| `gates.evidenceFloor` below solo preset default | medium / needs-decision | C.2 |
| Claim surface does not state which gate families conducted | medium / ready-for-cadence-spec | J.3 |
| Coverage thresholds stale since 2026-07-25 | low / ready-for-cadence-spec | J.5 |
| Raw `\x00` defeats grep/diff tooling | low / ready-for-cadence-spec | J.6 |

```bash
cadence recommendation add \
  --scout-id scout-20260804-integrity-release \
  --readiness <readiness> --priority <priority> --area <area> \
  --evidence "<measured fact + the command that produced it>"
```

`--evidence` carries a measured fact and its derivation command — not a
description of the problem.

**After E completes**, re-read `dec-20260801-003`. Its revisit trigger is three
settles under a non-mock provider each persisting ≥1 code-review finding. E
produces the first; Phase C makes subsequent v1.55 phases produce the rest
naturally. **Record progress against the trigger explicitly**; do not silently
treat the decision as superseded.

---

## 11. Release cut (Phase K)

Before triggering publication:

1. Every changeset maps to a shipped phase.
2. No changeset references the deprecated `@manehorizons` scope.
3. All public packages resolve to `1.55.0`; private `testkit` unpublished.
4. Pending `conduction-reachability` changeset included.
5. Release workflow dry-run passes.
6. Every generated tarball inspected.
7. Security and Docs workflows green.
8. No open release-blocking recommendation.
9. Trigger real publish only after all checks pass.
10. Verify npm, tag, release title, notes, provenance.
11. Record and settle the release phase.

### Pre-cut verification matrix

```bash
pnpm install --frozen-lockfile
pnpm clean
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

Verify: CI on Ubuntu / macOS / Windows · Security workflow · CodeQL · Docs build
and deploy · website tests and build · root dependency audit · website dependency
audit · release dry run · tarball contents · lockstep versions · npm scope
migration behavior · existing v1.54 install path · fresh v1.55 install path · CLI
`--version` · `cadence doctor` · `cadence tutorial` · `cadence init --dry-run` ·
`cadence summary verify` · `cadence summary render` · MCP startup and
representative read/write tool calls · Claude Code host install · Codex host
install.

---

## 12. Definition of done

v1.55.0 is done when:

- Security workflow green; both dependency trees audited *(if H lands)*; security merge-blocking.
- Dependency-control mechanism actually functions and is proven in the lockfile.
- Human-readable summaries show persisted findings.
- A real-provider review path has been demonstrated end-to-end with a seeded finding, rendered, causing refusal, then settling clean once fixed.
- The repo's own gate profile exercises the gates it ships.
- Documentation matches actual behavior.
- All supported operating systems green.
- All public packages published at `1.55.0` with provenance; GitHub tag and Release match npm.
- The release phase settles without undisclosed bypasses.

### Final deliverables

Release summary · PR links per phase · final SHA and tag · published packages and
versions · CI/Security/CodeQL/Docs results · root and website audit results · the
real-provider certification SUMMARY · before-and-after Markdown finding rendering ·
scanner regression corpus and results · evidence that test type and lint failures
are enforced · deferred recommendations with rationale · confirmation that
`cadence doctor` reports no untriaged release-blocking warning.

---

## 13. Report-back protocol

Report at **every phase boundary** and immediately on any structural surprise:

1. **What ran** — verbatim commands and exit codes.
2. **What was measured** — actual output; no summaries of numbers you did not print.
3. **Bar status** — met / not met against the stated bar, with evidence.
4. **Divergences** — anything in this document that proved wrong. Correcting it is a deliverable.
5. **Blocked on operator** — named explicitly.

**Do not proceed past an unmet bar.** Report and stop. **Do not self-authorize
scope** — file adjacent findings as recommendations and continue.

---

## 14. Begin here

**Phase A**, not Phase B — corrected by phase 253: the dependency-control
mechanism already works (`pnpm.overrides` under `pnpm@9.12.0` applies
correctly; see §4). What had to happen before advisory remediation could be
trusted was empirically confirming the real mechanism (declared-range
intersection, and the misleading warning's true source — a globally
installed newer pnpm launcher self-switching, not pnpm 9.12.0 itself), then
refreshing the four stale override targets to their real patched floors,
adding the missing `ip-address` override, and adding a CI detector so a
future stale target fails the build instead of silently going dead again —
no pnpm-upgrade path was needed or taken.

Do not edit the exceptions table until the corrected mechanism and refreshed
targets are independently verified.

---

## 15. Framing

CADENCE developed itself under a mock verifier — a deterministic placeholder that
checks each AC links to a real test. The gates that carried 263 settles were the
deterministic ones: `build-test-must-pass`, `test-coverage` with CI-enforced
thresholds, `structural-verifier`, `evidence-floor`, `task-verify-required`. The
result is 393 test files, a ~2:1 test-to-source ratio in core, and machine-enforced
AC-to-test traceability.

What went unexercised is the LLM verifier layer — the softest, most drift-prone
signal in the stack. That is a coverage gap in the optional layer, not a
foundation problem.

v1.55 closes it. Nothing here requires rebuilding anything.
