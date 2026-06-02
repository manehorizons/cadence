---
phase: 39-security-audit-gate
id: 39-01
tier: standard
status: DONE
---

# 39-01 — Lift the security-audit gate into gates/security-audit.ts

## Objective

Extract the Phase 25.2 security-audit gate from `settle.ts` (`:413–471`) into `gates/security-audit.ts` against the 39.1 contract — **bit-identical**. The simplest expensive-gate extraction: no convergence sidecar, no emit (unlike 39.4); just the verifier port plus the reused `ctx.diff()`. The OWASP-aware auditor runs over the touched-file git diff; CRITICAL findings refuse settle unless `--force` / `--allow-security-audit-failure`; all findings land on `SUMMARY.securityAudit`. `settle.ts` becomes a router for this gate.

## Acceptance Criteria

### AC-1: single home for the gate
Given the extracted module
When `runSecurityAuditGate` runs the auditor
Then it is the single home and `settle.ts` no longer runs the auditor inline

### AC-2: gate depends only on injected ports
Given the gate module
When it needs the auditor or the diff
Then it reads the auditor via `ctx.verifiers.securityAudit` and the diff via `ctx.diff()` — with no direct factory/git import in the gate

### AC-3: GateImpl-conformant via summaryPatch
Given the 39.1 gate contract
When the gate completes
Then it is `GateImpl`-conformant and contributes `securityAudit` to SUMMARY via `summaryPatch`

### AC-4: unit-testable branches without the CLI stack
Given fake verifier/diff ports
When the gate is exercised
Then tests cover clean / non-critical / critical-refuse / both bypass arms / verifier-throw without the CLI stack

### AC-5: bit-identical
Given the extraction
When the existing settle-security-audit E2E suite runs
Then per-critical stderr, the refusal summary line, both proceed arms, exit codes, and SUMMARY.securityAudit are unchanged and the suite passes unchanged

### AC-6: registry coverage
Given the gate registry
When `security-audit` is implemented
Then the registry marks it IMPLEMENTED (8 of 13; `anomaly-notify` exception; 4 pending for 39.7 — coherence-check, approve, per-task-verify, plan-review)

## Tasks

### T1: types.ts port + opt
- files: `packages/core/src/gates/types.ts`
- action: add `VerifierPorts.securityAudit` and `SettleOpts.allowSecurityAuditFailure`; import `SecurityAuditInput`/`SecurityAuditResult` from `../verify/security-audit.js`
- verify: `pnpm -C packages/core typecheck`
- done: AC-2

### T2: gates/security-audit.ts + test (TDD red→green)
- files: `packages/core/src/gates/security-audit.ts`, `packages/core/tests/gates/security-audit.test.ts`
- action: port the block verbatim reading `ctx.diff()` + `ctx.verifiers.securityAudit`; return `{ outcome, summaryPatch: { securityAudit } }`; use `@cadence/types` `Finding` throughout (no disambiguation); fake-port tests cover no-findings pass, non-critical pass, CRITICAL refuse, both bypass arms, verifier-throw
- verify: `pnpm -C packages/core test -- run gates/security-audit`
- done: AC-1, AC-3, AC-4

### T3: settle.ts wiring
- files: `packages/core/src/cli/commands/settle.ts`
- action: add the lazy `verifiers.securityAudit` adapter; replace the inline block with `runSecurityAuditGate(ctx)` + merge + bridge `securityAuditFindings`; thread `allowSecurityAuditFailure` into SettleOpts; drop the direct `Finding` import (now unneeded); reuse the 39.4 `ctx.diff()` (one git invocation now serves both gates)
- verify: `pnpm -C packages/core test -- run cli/settle-security-audit`
- done: AC-1, AC-5

### T4: registry coverage
- files: `packages/core/tests/gates/registry-coverage.test.ts`
- action: flip `security-audit` → IMPLEMENTED (8 of 13; 4 pending)
- verify: `pnpm -C packages/core test -- run gates/registry-coverage`
- done: AC-6

### T5: full gate + two-commit settle
- files: (none — verification only)
- action: run the full `pnpm turbo run lint typecheck test build` gate; substantive feat commit; settle
- verify: full gate green; settle-security-audit E2E (4 tests) passes unchanged = bit-identical proof
- done: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6

## Boundaries

- DO NOT add an emit port member or a sidecar for this gate — the block neither notifies nor persists; adding them would be dead surface.
- DO NOT add a new diff collaborator — reuse the memoized `ctx.diff()` introduced in 39.4.
- DO NOT change per-critical stderr, the refusal summary line, the `--force`-vs-`--allow-security-audit-failure` arm, exit codes, or SUMMARY.securityAudit — existing E2E must pass unchanged.
- DO NOT disambiguate `Finding` — `SecurityAuditResult.findings` and `SettleAccumulator.securityAudit` already agree on `@cadence/types` `Finding`.
