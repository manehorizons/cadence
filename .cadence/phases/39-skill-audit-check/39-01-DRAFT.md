---
phase: 39-skill-audit-check
id: 39-01
tier: standard
status: DONE
---

# 39-01 — Lift the skill-audit check into `checks/skill-audit.ts`

## Objective

Pull the Phase 34.1 required-skill enforcement (skill-audit-miss anomaly + `--allow-skill-audit-miss` bypass) out of `settle.ts` into a NEW `packages/core/src/checks/` namespace, bit-identical. `skill-audit` is NOT a `Gate` enum member (declaring required skills IS the opt-in), so it is an anomaly check dispatched explicitly by settle and stays OUTSIDE the Phase 44.1 registry — the first inhabitant of `checks/` (boundary, 43.1, joins later). It reuses `SettleContext` + a `GateResult`-style outcome for a uniform return but is never placed in a `Record<Gate, GateImpl>`.

## Acceptance Criteria

### AC-1: one module under `checks/`
Given the Phase 34.1 enforcement block in `settle.ts`
When it is extracted to `checks/skill-audit.ts` exposing `runSkillAuditCheck(ctx): Promise<SkillAuditResult>`
Then the check is one module under `checks/` and `settle.ts` no longer runs the enforcement inline — it dispatches explicitly (`refuse → exitCode = 1; return`, else `state.skillAudit.required = res.effectiveRequired`)

### AC-2: union semantics preserved
Given a DRAFT `requiredSkills` set and `config.skillAudit.required`
When the effective required set is computed
Then `dedup(config.skillAudit.required ∪ draft.requiredSkills)` semantics (dedup, order) are preserved verbatim, including the null-config skip that still records the effective set and never false-refuses on a degraded-config path

### AC-3: bypass preserved
Given `--allow-skill-audit-miss`
When a real shortfall exists
Then the bypass is preserved: warn anomaly with `bypassed: true`, the `skill-audit: --allow-skill-audit-miss set; proceeding past N …` proceed stderr, and exit 0

### AC-4: invoked[] source of truth unchanged
Given `state.skillAudit.invoked`
When satisfaction is evaluated
Then `state.skillAudit.invoked` remains the source of truth and satisfaction uses `missingSkills` (suffix-tolerant) unchanged

### AC-5: behavior bit-identical
Given the existing `tests/cli/settle-skill-audit.test.ts` E2E suite
When the extraction lands
Then behavior is bit-identical — stderr, exit codes, anomaly payloads, `SUMMARY.skillAudit.required` — and the E2E suite passes unchanged

### AC-6: checks/ outside the registry
Given the new `checks/` namespace
When the registry and engine are inspected
Then `checks/` is not referenced by `gates/engine.ts` or the registry; the check is dispatched explicitly from settle and reaches the notifier only via `ctx.emit.skillAuditMiss`

## Tasks

### T1: EmitPort.skillAuditMiss + SettleOpts.allowSkillAuditMiss
- files: `packages/core/src/gates/types.ts`
- action: add `SettleOpts.allowSkillAuditMiss?: boolean` and `EmitPort.skillAuditMiss(payload)` (payload mirrors `emitSkillAuditMiss`'s arg: `required/invoked/missing: string[]`, `severity: 'warn' | 'error'`, optional `bypassed`/`unenforceable`)
- verify: `pnpm -C packages/core typecheck`
- done: AC-1, AC-6

### T2: checks/skill-audit.ts + test (TDD red→green)
- files: `packages/core/src/checks/skill-audit.ts`, `packages/core/tests/checks/skill-audit.test.ts`
- action: port the enforcement verbatim reading `ctx.config`, `ctx.draft.requiredSkills`, `ctx.state.skillAudit.invoked`, `ctx.opts.allowSkillAuditMiss`, emitting via `ctx.emit.skillAuditMiss`; cover branches (effective-empty → pass no emit; null-config → pass record; satisfied → pass no emit; telemetry-off → unenforceable warn; shortfall no bypass → error emit + refuse; shortfall + bypass → warn bypassed + proceed; dedup union surfaced in `effectiveRequired`) with a fake-ctx emit spy
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run checks/skill-audit`
- done: AC-2, AC-3, AC-4, AC-6

### T3: settle.ts wiring
- files: `packages/core/src/cli/commands/settle.ts`
- action: add the `skillAuditMiss` emit adapter; thread `allowSkillAuditMiss` into `ctx.opts`; replace the inline block with the explicit `runSkillAuditCheck(ctx)` dispatch; drop the now-unused `missingSkills` import (keep `emitSkillAuditMiss`, now used by the adapter)
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run cli/settle-skill-audit`
- done: AC-1, AC-5

### T4: full gate + two-commit settle
- files: (none — gate run)
- action: run the full `pnpm turbo run lint typecheck test build` gate; existing `settle-skill-audit` E2E passes unchanged; substantive feat commit
- verify: full gate green; existing E2E unchanged; registry coverage stays 8/13
- done: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6

## Boundaries

- DO NOT add `skill-audit` to the `Gate` enum, `gates/engine.ts` matrix, or `registry-coverage.test.ts` — it is an anomaly check, not a profile×tier gate; registry coverage stays 8/13.
- DO NOT make `runSkillAuditCheck` a `GateImpl` or place it in a `Record<Gate, GateImpl>` — it returns the effective set settle records on `state`, outside the `GateResult`/`summaryPatch` contract.
- DO NOT mutate `state` inside the check — return `effectiveRequired`; the settle adapter owns the `state.skillAudit.required` write.
- DO NOT change the unconditional emission rule — `skill-audit-miss` is emitted regardless of the `anomaly-notify` guard (a strict phase that fails must still leave an audit trail).
- DO NOT alter stderr lines, exit codes, anomaly payloads, or `SUMMARY.skillAudit.required` — bit-identical.
