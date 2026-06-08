---
phase: 87-release-v1.19.0
id: 87-87
tier: standard
status: PENDING
---

# 87-87 — Release v1.19.0 (worktree-safety polish)

## Objective

Cut the v1.19.0 release: record the two closed §13 deferrals (and the dropped lowest-gap
decision) in DESIGN.md, document the new `doctor` line + proactive allocation, bump all four
published packages `1.18.0 → 1.19.0` in lockstep via a changeset, and keep the doc-sync +
full CI gate pipeline green — leaving only the manual `Release` workflow (tag + provenance) for
the operator post-merge.

## Context (verified 2026-06-08)

- DESIGN.md **§13** (`DESIGN.md:338-339`) still lists all three follow-ups under "Deferred":
  the doctor line (phase 85, shipped), proactive allocation (phase 86, shipped), and lowest-gap
  (dropped). This phase rewrites that closing block.
- The **doc-sync gate** (`.githooks/pre-commit` + `check-doc-sync.sh`) fires when
  `packages/core/package.json` version changes and aborts unless `CLAUDE.md` mentions the new
  version. So the `CLAUDE.md` v1.19.0 paragraph must land **in the same commit** as the version
  bump (or earlier). `doc-sync-hook.test.ts`'s live-guard case also fails CI on a stale CLAUDE.md.
- Releases are cut with **changesets**: add a changeset → `pnpm changeset version` rewrites the
  four `package.json` versions + CHANGELOGs → commit `chore(release): version 1.19.0`. Tag
  `v1.19.0` + npm provenance happen later via the manual `Release` workflow (`workflow_dispatch`)
  — **out of scope for this phase** (operator-run post-merge).
- Lockstep precedent (v1.14–v1.18): all four packages bump together;
  `host-claude-code`/`host-codex` are version-alignment only (no functional change).
- Landing: milestone work merges to `main` via **PR** (admin-enforced `ci-success`); never a
  direct push.

## Acceptance Criteria

### AC-1: DESIGN.md §13 records the closed deferrals + the dropped decision
Given §13's "Deferred (clean additive follow-ups)" block
When the release lands
Then it no longer lists the doctor line or proactive allocation as deferred (both noted shipped
in v1.19), and it records that **lowest-gap numbering was evaluated and dropped** — monotonic
`max+1` stays locked, with the YAGNI rationale — so §13 reflects the true post-v1.19 state.

### AC-2: New behavior is documented in the reference docs
Given the v1.18 docs describe the guard but not the v1.19 surfaces
When the release lands
Then the `doctor` `worktree-phases` check and the proactive next-free suggestion in
`progress`/`recommend` are documented where the other doctor checks + commands live
(`docs/reference/commands.md` and/or the doctor/concepts docs), consistent with existing style.

### AC-3: Lockstep version bump to 1.19.0 with all gates green
Given a changeset describing the v1.19 minor bump
When `pnpm changeset version` runs and the release is committed
Then all four published packages (`core`, `types`, `host-claude-code`, `host-codex`) read
`1.19.0`, `CLAUDE.md` mentions `1.19.0` (doc-sync gate passes), and the full pipeline
`pnpm turbo run lint typecheck test build` is green.

## Tasks

### T1: Docs + DESIGN.md §13 + CLAUDE.md + changeset
- files: `DESIGN.md`, `docs/reference/commands.md` (+ doctor/concepts docs as needed),
  `CLAUDE.md`, `.changeset/<name>.md`
- action: Rewrite §13's closing "Deferred" block per AC-1 (doctor line + proactive allocation →
  shipped in v1.19; lowest-gap → evaluated & dropped, `max+1` locked, rationale). Document the
  `worktree-phases` doctor check + the proactive next-free `progress`/`recommend` suggestion in
  the reference docs (AC-2). Add the v1.19.0 paragraph to `CLAUDE.md`'s release narrative (the
  "latest version" prose) summarizing the milestone (phases 85–87). Write a changeset: minor
  bump for all four published packages with a one-line summary.
- verify: `git grep -n "1.19.0" CLAUDE.md` shows the mention; `.changeset/*.md` lists the four
  packages as `minor`; DESIGN.md §13 no longer lists the two shipped items as deferred.
- done: AC-1, AC-2

### T2: Lockstep version bump + full gate pipeline
- files: `packages/*/package.json` + `packages/*/CHANGELOG.md` (written by changesets)
- action: Run `pnpm changeset version`; confirm all four published packages are `1.19.0`
  (`cadence-testkit` stays private/unbumped as usual). Commit the release. Run the full pipeline
  and the doc-sync hook check.
- verify: `grep '"version"' packages/{core,types,host-claude-code,host-codex}/package.json` all
  show `1.19.0`; `pnpm turbo run lint typecheck test build` green; `.githooks/check-doc-sync.sh`
  passes (or the version-bump commit is accepted by the pre-commit hook).
- done: AC-3

## Boundaries

- DO NOT run the `Release` workflow / create the `v1.19.0` git tag / publish to npm — that is the
  operator's manual post-merge step.
- DO NOT push to `main` directly — land via PR (admin-enforced `ci-success`).
- DO NOT bump `cadence-testkit` (private, never published).
- No engine/behavior changes in this phase — docs, DESIGN.md, version metadata, changeset only.
- Keep the lockstep convention: `host-claude-code`/`host-codex` are version-alignment only.
