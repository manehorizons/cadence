---
phase: 65-codex-spike
id: 65-01
tier: quick-fix
status: PENDING
---

# 65-01 — Codex adapter spike — resolve command-surface + apply_patch unknowns

## Objective

De-risk the v1.13 Codex-adapter milestone before scaffolding the package:
produce a written findings doc that resolves the four unknowns and returns a
go/no-go on whether `ADAPTER_CONTRACT_VERSION = 1` is sufficient for a Codex
`HostAdapter`. (Spike — the deliverable is knowledge, not tested code; the
test-coverage gate is bypassed at settle with `--allow-missing-coverage`.)

## Acceptance Criteria

### AC-1: Findings doc resolves the four spike questions + go/no-go
Given Codex CLI's extensibility surface and the host-adapter contract
When the spike investigates Codex's commands, `apply_patch` payload, hook
install/trust flow, and event map
Then `65-01-FINDINGS.md` resolves each with cited evidence — (1) command surface
(path, format, project-vs-user level, deprecation status → `slashCommands` /
`skillSystem` decision); (2) `apply_patch` path recovery and whether
`ExtractedPayload` expresses it on contract v1; (3) hook install target + blocking
+ non-TTY/trust flow; (4) event-name → `AbstractEvent` map coverage — and returns
a clear go/no-go on `ADAPTER_CONTRACT_VERSION = 1` with an ordered phase plan for
the rest of v1.13.

## Tasks

### T1: Investigate Codex extensibility and write findings
- files: `.cadence/phases/65-codex-spike/65-01-FINDINGS.md`
- action: Resolve the command-surface, apply_patch-payload, install/trust, and
  go/no-go questions from official Codex docs + the host-adapter contract; write
  the findings doc with an evidence/sources section and a recommended phase plan.
- verify: findings doc answers the four spike questions with cited evidence and a
  clear go/no-go on contract v1.
- done: AC-1

## Boundaries

- DO NOT scaffold the `cadence-host-codex` package yet — that is the next phase.
- DO NOT change the contract (`packages/types/src/host.ts`) in this spike; only
  record whether a v2 bump is needed.
- DO NOT write into `~/.codex/` or install anything on this machine.
