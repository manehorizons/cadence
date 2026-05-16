import type { AnomalyEvent } from '@cadence/types';
import type { selectNotifier } from './factory.js';

/**
 * Phase 36.1 — emits a single `spec-review-unconverged` anomaly when
 * spec-review fails to converge after maxAttempts. UNCONDITIONAL by design
 * (mirrors emitPlanReviewUnconverged / emitSkillAuditMiss): spec-review is
 * not a gate-matrix cell at all, so there is no `anomaly-notify` gate to key
 * off, and a hard human-escalation must still leave an audit trail. Transport
 * failure → one stderr warning, never throws (the approve refusal/exit is
 * computed independently).
 */
export async function emitSpecReviewUnconverged(
  notifier: ReturnType<typeof selectNotifier>,
  ctx: {
    specId: string;
    attempts: number;
    maxAttempts: number;
    findings: number;
    provider: string;
    model?: string;
    bypassed?: boolean;
  },
): Promise<void> {
  const event: AnomalyEvent = {
    type: 'spec-review-unconverged',
    severity: 'error',
    message: `spec-review did not converge for ${ctx.specId} after ${ctx.attempts}/${ctx.maxAttempts} attempts (${ctx.findings} finding(s))`,
    context: {
      specId: ctx.specId,
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
