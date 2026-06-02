# Reconciliation — 2026-06-01

A forensic pass found CADENCE's planning records badly out of sync with what had
actually shipped (and been published). This note records what was wrong, what
was true, and the decisions taken to fix it. Written during a docs/grilling
session; the code was not touched — only records.

## What triggered it

While picking "the next milestone" (assumed to be v1.3.0 Architecture deepening),
the code already contained the entire v1.3.0 implementation — `gates/registry.ts`,
the `GateImpl` pattern, `settle.ts` dispatching through `runSettleGates`. The
planning layer, however, said none of it had started.

## What was actually true (verified against git + npm)

- **v1.3.0 Architecture deepening (Phases 39.1 → 44.1) was fully built and on
  `main`.** Each phase shipped as a paired `docs(planning)` + `feat(core)`
  commit on **2026-05-29**, full turbo gate green at each commit. The registry
  endgame (44.1, `42db8db`) is live.
- **It never went through CADENCE's own settle ceremony.** No `chore: settle`
  commits, no `.cadence/phases/39–44` artifacts. The work was driven through the
  superpowers design→plan→feat workflow, which does not write CADENCE artifacts.
- **The repo is public and npm has a release.** `@manehorizons/cadence-{core,
  types,host-claude-code}@1.1.1` was published **2026-05-30**. The published
  tarball contains the arch-deepening code (`dist/gates/registry.js` etc.) —
  confirmed by download.
- **The old `@cadence/*` scope was never published** (404 on npm). The scope
  rename `@cadence/*` → `@manehorizons/cadence-*` therefore broke no consumer;
  `@manehorizons/*@1.1.1` is genuinely the first public release.

## What was wrong (records, not code)

1. **Version/provenance collision.** The npm `1.1.1` artifact (published 05-30,
   new scope, *with* arch deepening, zod 4 on `main` but the published deps pin
   zod ^3) does **not** match the git tag `v1.1.1` (`eed08ec`, 05-27, old scope,
   Praxis-polish-only, **no** arch code). A breaking rename + a major internal
   refactor shipped under a reused patch version, with no git tag matching the
   published commit and no npm provenance/`gitHead`.
2. **Stale planning records.** `MILESTONES.md` filed the shipped v1.2/v1.3 under
   `## Planned`; `ROADMAP.md`'s entry-point line said "start with Phase 39.1";
   `state.json`/`STATE.md` pointed at phase 38; no phase artifacts for 39–44.
3. **Root cause.** Big work bypassed CADENCE's own loop. CADENCE does not
   enforce settle via hook (operator-owned by design — see `CONTEXT.md` /
   `DESIGN.md`), so the drift accumulated silently across two milestones.

The code itself was never in question: the full gate (lint + typecheck + test +
build) was green on `main` at reconciliation time (FULL TURBO, 16/16).

## Decisions taken

- **Version/provenance → fix forward.** Leave the existing npm `1.1.1` alone (it
  works and broke nobody). The *next* release gets: a correct version bump for
  the arch + zod 4 changes, a git tag matching the published commit, and npm
  provenance (via the existing `release.yml`). Do not retroactively churn npm.
- **Records → full dogfood backfill.** Reconstructed `.cadence/phases/39–44`
  (12 dirs, 48 artifacts) from the design/plan/feat commits. Each SUMMARY uses
  the real 2026-05-29 feat-commit date as `completedAt` and carries a backfill
  marker — these are honest reconstructions, **not** claims of live settles.
  `MILESTONES.md` moved v1.2/v1.3 to `## Shipped`; `ROADMAP.md` entry-point line
  corrected; `state.json` advanced off phase 38 (→ `44-gate-registry`, IDLE).

## Follow-ups still open

- **Version-hygiene release** (the v1.4.0 "real next work" — see MILESTONES §v1.4.0).
- **Praxis filter-flag slices** (the Praxis "Slice 37/38" work — `--filter-regex-flags`,
  `--filter-kind`) shipped on `main` post-1.1.1 on the Praxis numbering scheme;
  they were not part of this 39–44 backfill. Confirm whether they need their own
  records.
- **Process guard (optional).** Decide whether to add a guard so a milestone
  can't ship without settling, or consciously keep the operator-owned model and
  rely on discipline. (`rec-20260602-001` already tracks a separate CLI fix.)
