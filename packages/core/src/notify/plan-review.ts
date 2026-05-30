import type { selectNotifier } from './factory.js';
import { emitUnconverged } from './emit-unconverged.js';

/**
 * Phase 35.1 — emits a single `plan-review-unconverged` anomaly when
 * plan-review fails to converge after maxAttempts. UNCONDITIONAL by design
 * (mirrors emitSkillAuditMiss): plan-review fires only `strict×complex`, and
 * strict cells carry NO `anomaly-notify` gate — a hard human-escalation must
 * still leave an audit trail, so the caller does NOT gate this on
 * `anomaly-notify`. Phase 42.1 — transport/ts-stamp/degrade live in the shared
 * `emitUnconverged` spine; this is now just the payload builder.
 */
export function emitPlanReviewUnconverged(
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
  const { draftId, ...rest } = ctx;
  return emitUnconverged(notifier, 'plan-review', { entityId: draftId, ...rest });
}
