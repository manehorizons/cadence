import type { AnomalyEvent } from '@thomas-powers-jr/cadence-types';
import type { selectNotifier } from './factory.js';

/**
 * Phase 34.1 — emits a single `skill-audit-miss` anomaly. UNCONDITIONAL by
 * design: unlike `emitCodeReviewHigh`/`emitLoopViolation` the caller does NOT
 * gate this on the `anomaly-notify` gate (strict cells lack it; a strict
 * phase that fails the skill requirement must still leave an audit trail).
 * Transport failure → one stderr warning, never throws (refusal is computed
 * independently of whether the anomaly write succeeded).
 */
export async function emitSkillAuditMiss(
  notifier: ReturnType<typeof selectNotifier>,
  ctx: {
    required: string[];
    invoked: string[];
    missing: string[];
    severity: 'warn' | 'error';
    bypassed?: boolean;
    unenforceable?: boolean;
  },
): Promise<void> {
  const event: AnomalyEvent = {
    type: 'skill-audit-miss',
    severity: ctx.severity,
    message:
      ctx.unenforceable === true
        ? `skill-audit unenforceable — telemetry.skillInvocations disabled; required [${ctx.required.join(', ')}] not verified`
        : `skill-audit miss — required skill(s) not invoked: ${ctx.missing.join(', ')}`,
    context: {
      required: ctx.required,
      invoked: ctx.invoked,
      missing: ctx.missing,
      ...(ctx.bypassed !== undefined ? { bypassed: ctx.bypassed } : {}),
      ...(ctx.unenforceable !== undefined ? { unenforceable: ctx.unenforceable } : {}),
    },
    ts: new Date().toISOString(),
  };
  try {
    await notifier.notify([event]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `cadence-notify: ${notifier.name} transport failed — ${msg} (continuing)\n`,
    );
  }
}
