import type { selectNotifier } from './factory.js';
import { emitUnconverged } from './emit-unconverged.js';

/**
 * rec-20260711-004 — emits a single `ui-spec-review-unconverged` anomaly when
 * ui-spec-review fails to converge after maxAttempts. UNCONDITIONAL by design
 * (mirrors emitSpecReviewUnconverged): ui-spec-review is opt-in by UI-SPEC
 * presence, not a gate-matrix cell, so there is no `anomaly-notify` gate to
 * key off, and a hard human-escalation must still leave an audit trail.
 */
export function emitUiSpecReviewUnconverged(
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
  return emitUnconverged(notifier, 'ui-spec-review', { entityId: specId, ...rest });
}
