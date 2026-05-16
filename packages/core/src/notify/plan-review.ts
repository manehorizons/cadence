import type { AnomalyEvent } from '@cadence/types';
import type { selectNotifier } from './factory.js';

/**
 * Phase 35.1 — emits a single `plan-review-unconverged` anomaly when
 * plan-review fails to converge after maxAttempts. UNCONDITIONAL by design
 * (mirrors emitSkillAuditMiss): plan-review fires only `strict×complex`, and
 * strict cells carry NO `anomaly-notify` gate — a hard human-escalation must
 * still leave an audit trail, so the caller does NOT gate this on
 * `anomaly-notify`. Transport failure → one stderr warning, never throws
 * (the approve refusal/exit is computed independently).
 */
export async function emitPlanReviewUnconverged(
  notifier: ReturnType<typeof selectNotifier>,
  ctx: {
    draftId: string;
    attempts: number;
    maxAttempts: number;
    findings: number;
    provider: string;
    model?: string;
    bypassed?: boolean;
  },
): Promise<void> {
  const event: AnomalyEvent = {
    type: 'plan-review-unconverged',
    severity: 'error',
    message: `plan-review did not converge for ${ctx.draftId} after ${ctx.attempts}/${ctx.maxAttempts} attempts (${ctx.findings} finding(s))`,
    context: {
      draftId: ctx.draftId,
      attempts: ctx.attempts,
      maxAttempts: ctx.maxAttempts,
      findings: ctx.findings,
      provider: ctx.provider,
      ...(ctx.model !== undefined ? { model: ctx.model } : {}),
      ...(ctx.bypassed !== undefined ? { bypassed: ctx.bypassed } : {}),
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
