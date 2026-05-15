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

## Planned

### v0.4.0 — Cheap gates + telemetry truth
- **Phase 23.1** — DRAFT-read mtime gate.
- **Phase 23.2** — coherence-warn anomaly emission.
- **Phase 23.3** — loop-violation anomaly emission.
- **Phase 23.4** — skillAudit wiring + real tokenUtilization.

### v0.5.0 — Medium gates
- **Phase 24.1** — Manual approve gate (interactive Y/N).
- **Phase 24.2** — Per-task verifier agent.
- **Phase 24.3** — code-review verifier agent.

### v0.6.0 — Expensive gates
- **Phase 25.1** — plan-review verifier agent.
- **Phase 25.2** — security-audit verifier agent.

### v0.7.0 — Operator ergonomics
- **Phase 26.1** — `cadence init` UX polish.
- **Phase 26.2** — CLAUDE.md scaffold.
- **Phase 26.3** — `status anomalies --tail --follow`.

### v0.8.0 — CI
- **Phase 27.1** — GitHub Actions tests-on-PR (Node 20 + 22 matrix).

### v1.0.0 — Feature-complete
- **Phase 28.1** — Cut v1.0.0 release. DESIGN.md §4.1 gate universe fully shipped.

## Post-v1.0 (not scheduled)

- Multi-host adapter re-introduction (Codex / Aider / OpenCode).
- Release automation (changesets / np / auto-publish on tag).
- Continuity-runtime direct integration (currently abstract via webhook).
- DESIGN.md §4.4 softCap tightening (notification-target cap once continuity-runtime ships).
- Performance benchmarks of the gate stack.
- Structured logging / OpenTelemetry export.
