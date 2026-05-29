import type { SettleContext } from '../gates/types.js';
import { missingSkills } from '../verify/skill-match.js';

/**
 * Result of the required-skill enforcement check. NOT a `GateResult`: it carries
 * `effectiveRequired` so the settle adapter can record it on
 * `state.skillAudit.required` (outside the `summaryPatch` contract), which is why
 * this check is intentionally not a `GateImpl`.
 */
export interface SkillAuditResult {
  readonly outcome: 'pass' | 'refuse';
  /** config.skillAudit.required ∪ DRAFT requiredSkills, deduped, order-preserved.
   *  settle records it on state.skillAudit.required on every non-refuse path. */
  readonly effectiveRequired: string[];
}

/**
 * Required-skill enforcement check (Phase 34.1 — ROADMAP 23.4). Extracted from
 * settle.ts verbatim (Phase 39.6). NOT a `Gate` enum member — declaring required
 * skills IS the opt-in, so it is an anomaly check, not a profile×tier gate. Lives
 * in `checks/` and is dispatched EXPLICITLY by settle, OUTSIDE the Phase 44.1
 * registry. It reuses `SettleContext` and reaches the notifier only through
 * `ctx.emit.skillAuditMiss`.
 *
 * `config` is `… | null` (null when loadConfig failed). Deliberate null-config
 * behavior: still compute + return the effective required set (so SUMMARY stays
 * truthful) but SKIP enforcement — cannot read telemetry reliably; never
 * false-refuse on a degraded-config path. The `skill-audit-miss` anomaly is
 * UNCONDITIONAL (not under the `anomaly-notify` guard).
 */
export const runSkillAuditCheck = async (
  ctx: SettleContext,
): Promise<SkillAuditResult> => {
  const config = ctx.config;
  const effectiveRequired = [
    ...new Set([
      ...(config?.skillAudit?.required ?? []),
      ...(ctx.draft.requiredSkills ?? []),
    ]),
  ];
  if (effectiveRequired.length > 0 && config) {
    const invoked = ctx.state.skillAudit.invoked;
    if (!config.telemetry.skillInvocations) {
      await ctx.emit.skillAuditMiss({
        required: effectiveRequired,
        invoked,
        missing: effectiveRequired,
        severity: 'warn',
        unenforceable: true,
      });
    } else {
      const missing = missingSkills(effectiveRequired, invoked);
      if (missing.length > 0) {
        const bypass = ctx.opts.allowSkillAuditMiss === true;
        await ctx.emit.skillAuditMiss({
          required: effectiveRequired,
          invoked,
          missing,
          severity: bypass ? 'warn' : 'error',
          ...(bypass ? { bypassed: true } : {}),
        });
        if (!bypass) {
          ctx.io.err(
            `settle run refused: required skill(s) not invoked: ${missing.join(', ')}. ` +
              `Invoke them, or pass --allow-skill-audit-miss to override.\n`,
          );
          return { outcome: 'refuse', effectiveRequired };
        }
        ctx.io.err(
          `skill-audit: --allow-skill-audit-miss set; proceeding past ${missing.length} missing skill(s).\n`,
        );
      }
    }
  }
  return { outcome: 'pass', effectiveRequired };
};
