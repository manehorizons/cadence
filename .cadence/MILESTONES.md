# Milestones

> Version → phase mapping. ROADMAP.md is the substance; this file is the index.

## Shipped

### v0.1.0 — Initial KEEL release
Phases 1–11 under the KEEL name. Host-codex archived to `keel-codex-archive` tag at Phase 11.

### v0.2.0-rc.1 — Rename
- **Phase 12** — KEEL → CADENCE source rename (packages, state dir, CLI).

### v0.3.0 — Behavioral verifier hybrid + anomaly notify (2026-05-14)
- **Phase 13** — Profile system foundation.
- **Phase 14** — Test-coverage proof gate (F5 resolved).
- **Phase 15** — `--deep` independent verifier agent (F6 resolved).
- **Phase 16** — `--interactive` human-verdict walker.
- **Phase 17.1** — Anomaly notify transport (stderr/file/none).
- **Phase 17.2** — Hook-side `files-outside-boundary` + `status anomalies` reader.
- **Phase 17.3** — `AnomalyEvent.ts` + live `--since` filter.
- **Phase 18.1** — F2 physical KEEL → CADENCE rename rollout.
- **Phase 19.1** — F4 webhook transport.
- **Phase 20.1** — F5 + F6 deferred-item strikethrough.
- **Phase 21.1** — auto × complex soft cap (M2 shipped).
- **Phase 22.1** — Release ceremony.

### v0.4.0 — Cheap gates + telemetry truth
- **Phase 23.1** — DRAFT-read mtime gate.
- **Phase 23.2** — coherence-warn anomaly emission.
- **Phase 23.3** — loop-violation anomaly emission.
- **Phase 23.4** — skillAudit wiring (invoked tracking).

### v0.5.0 — Medium gates
- **Phase 24.1** — Manual approve gate (interactive Y/N).
- **Phase 24.2** — Per-task verifier gate.
- **Phase 24.3** — Code-review verifier gate.

### v0.6.0 — Expensive gates
- **Phase 25.1** — plan-review verifier gate.
- **Phase 25.2** — security-audit verifier gate.

### v0.7.0 — Operator ergonomics
- **Phase 26.1** — `cadence init` UX polish.
- **Phase 26.2** — CLAUDE.md scaffold.
- **Phase 26.3** — `status anomalies --tail/--follow`.

### v0.8.0 — CI
- **Phase 27.1** — GitHub Actions tests-on-PR (Node 20 + 22 matrix).

### v1.0.0 — Feature-complete (2026-05-15)
- **Phase 28.1** — Cut v1.0.0 release. DESIGN.md §4.1 gate universe fully shipped.

### v1.1 milestone work (delivered, NOT separately tagged — see v1.1.0 below for the tagged release)
The v1.1 milestone bundle (Phases 29.x → 33.1) shipped reversibly but was never cut as its own tag. See ROADMAP.md §v1.1.0 sections for the substance.
- **Phase 29.x** — Shakedown (foreign-repo dogfood, expensive-gate live exercise, TTY exercise, remediation).
- **Phase 30.1 / 33.1** — Publish pipeline (reversible proof via ephemeral verdaccio; metadata hardened on 3 publishable packages; `@cadence/testkit` → private).
- **Phase 31.1** — User-facing docs (`docs/` guide + CLI-reference drift guard).
- **Phase 32.1** — Test infra (shared `vitest.shared.ts`, `tempRepo` rmdir retry; reverted per-test band-aids).
- **Phase 32.2** — Lint registration.
- **Phase 34.1** — Required-skill gate (resolves the deferred 23.4 question).
- **Phase 35** — Review-convergence primitive.
- **Phase 36** — `spec` stage (pre-DRAFT IDLE→SPEC).
- **Phase 37** — Codereview convergence.
- **Phase 38** — `spec-draft` autoseed.

### v1.1.0 — Praxis: strategic-intelligence layer (2026-05-26)
The first post-v1.0 named tag. 225 commits across 33 numbered slices on `praxis-intelligence-ledger`; merged to main as commit `e34be04`, tagged `v1.1.0`. Praxis sits ABOVE the CADENCE loop — the engine stays Praxis-unaware (no `state.json`/`STATE.md` touch, no phase-side metadata, no loop transition changes). Architecture: Approach A loose coupling, locked in Slice 34's upstream design doc.

Praxis used a different planning surface (`docs/superpowers/specs/`) than the CADENCE-engine `.cadence/phases/` indexed elsewhere in this file. Slice numbering is internal to the Praxis branch.

- **Slices 4–18** — Ledger surfaces: recommendation/assumption/decision/evidence add+list+show; bucket-partitioned MD renders; transition matrices (validate/reject/reopen on assumptions; supersede/rescind/reactivate on decisions); status-annotated link bullets in `RECOMMENDATIONS.md`.
- **Slices 19–22** — Intelligence admin: `cadence intelligence reconcile/stats/audit` with 6 baseline finding kinds (broken-link + orphan-subject).
- **Slices 23–27** — List ergonomics round one: `--filter-status`, `--filter-rec`, `--filter-text`, `--limit`, `--offset`, `--reverse` on all three list commands.
- **Slice 28** — `Decision.supersededBy` FK with cycle detection (`decision supersede --by`).
- **Slice 29** — `cadence decision graph <id>` ASCII viewer.
- **Slice 30** — `intelligence audit` stale-supersededby finding kind.
- **Slice 31** — `Decision.supersedes` derived inverse-link backfill.
- **Slices 32–33** — List ergonomics round two: `--include-untied` (decision only), `--filter-regex`.
- **Slice 34** — Upstream design doc for rec↔phase linkage (no code; design slice).
- **Slice 34.1** — `cadence recommendation convert <recId> --to-phase <phaseId>` transition + `convertedToPhaseId` schema field + detail-render bullet.
- **Slice 34.2** — `intelligence audit` stale-converted-phase finding kind (8th audit kind).

Test count: `@cadence/core` 1034, `@cadence/types` 124 (up from ~620 and 80 at v1.0.0 respectively).

Deferred to v1.2+: Slice 34.3 (`--from-rec` ergonomic on `spec new`), Slice 34.4 (`--filter-converted-to` reverse-lookup), `--sort-by`, `--filter-text-exact`, `--filter-regex-flags`, `--filter-kind` on audit, graph-viewer optimization.

## Planned

### v1.2.0 — Feature expansion (superpowers-inspired) — COMPLETE
Per ROADMAP entry-point note: #6 → #2 → #1 → #4 → #1b shipped; #3/#5 parked (host-agnostic-anchor conflict). v1.2 feature-expansion track has no non-parked work remaining; the residue rolls into v1.3 or later named milestones.

### v1.3.0 — Architecture deepening
Source: `/tmp/architecture-review-20260525-103233.html` (6-candidate review run on 2026-05-25 against `praxis-intelligence-ledger` branch via the `improve-codebase-architecture` skill). Theme: pull policy out of CLI commands into reusable deep modules; collapse adapter farms into one generic factory; close half-leaking seams. No new user-facing features.

- **Phase 39.1** — Lift coverage gate out of `settle.ts`.
- **Phase 39.2** — Lift deep-verify gate out of `settle.ts`.
- **Phase 39.3** — Lift interactive AC-walker out of `settle.ts`.
- **Phase 39.4** — Lift code-review gate (+ convergence sidecar) out of `settle.ts`.
- **Phase 39.5** — Lift security-audit gate out of `settle.ts`.
- **Phase 39.6** — Lift skill-audit gate out of `settle.ts`.
- **Phase 39.7** — Lift draft + build command gates (`approve`, `plan-review`, `coherence`, `per-task-verify`).
- **Phase 40.1** — Verifier factory consolidation (6 factories → 1 generic + 6 thin bindings).
- **Phase 41.1** — Backend `commit(state)` seam (closes the 23-call-site two-step).
- **Phase 42.1** — `emitUnconverged` notify spine (3 emitters → 1 spine + 3 payloads).
- **Phase 43.1** — Drain gate logic from `handlePreToolEdit` (depends on 39.x).

### v1.4.0 — Public release (deferred, named; renumbered from v1.2.0 on 2026-05-25)
- Real public-npm publish of `@cadence/{core,types,host-claude-code}`.
- npm provenance (gated on a conscious repo-visibility decision).
- `.github/workflows/release.yml` gated on `ci-success`.
- changesets adoption (or hand-rolled release runbook).
- `@cadence/testkit` publish-vs-private re-decision.

## Post-v1.0 (not scheduled)

- Multi-host adapter re-introduction (Codex / Aider / OpenCode).
- Continuity-runtime direct integration (currently abstract via webhook).
- DESIGN.md §4.4 softCap tightening (notification-target cap once continuity-runtime ships).
- Performance benchmarks of the gate stack.
- Structured logging / OpenTelemetry export.
- Server-side CI enforcement (currently client-side only via `.githooks/pre-push`).
- Backlog parking lot file (`.cadence/BACKLOG.md` or similar).
- Deferred open questions: 23.1 follow-ups, 24.3 timing, 26.2 CLAUDE.md content.
- Intelligence module internal seams (architecture review 2026-05-25 candidate #6 — *speculative*). Trigger: first markdown-render change touching ≥ 4 files in `packages/core/src/intelligence/`.
