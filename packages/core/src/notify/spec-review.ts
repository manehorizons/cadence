import type { selectNotifier } from './factory.js';
import { emitUnconverged } from './emit-unconverged.js';

/**
 * Phase 36.1 — emits a single `spec-review-unconverged` anomaly when
 * spec-review fails to converge after maxAttempts. UNCONDITIONAL by design
 * (mirrors emitPlanReviewUnconverged / emitSkillAuditMiss): spec-review is
 * not a gate-matrix cell at all, so there is no `anomaly-notify` gate to key
 * off, and a hard human-escalation must still leave an audit trail. Phase 42.1
 * — transport/ts-stamp/degrade live in the shared `emitUnconverged` spine;
 * this is now just the payload builder.
 */
export function emitSpecReviewUnconverged(
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
  const { specId, ...rest } = ctx;
  return emitUnconverged(notifier, 'spec-review', { entityId: specId, ...rest });
}
