import type { AnomalyEvent } from '@cadence/types';
import type { Finding } from '../verify/code-review.js';
import type { selectNotifier } from './factory.js';

/**
 * Phase 24.3 — emits one `code-review-high` anomaly per HIGH finding via
 * the supplied notifier. Transport failures degrade to a single stderr
 * warning (URL never logged). Bounded by `'anomaly-notify'` gate at the
 * caller.
 */
export async function emitCodeReviewHigh(
  notifier: ReturnType<typeof selectNotifier>,
  findings: Record<string, Finding[]>,
  ctx: { provider: string; bypassed: boolean },
): Promise<void> {
  const events: AnomalyEvent[] = [];
  const now = new Date().toISOString();
  for (const [file, list] of Object.entries(findings)) {
    for (const f of list) {
      if (f.severity !== 'high') continue;
      events.push({
        type: 'code-review-high',
        severity: 'error',
        message: `code-review HIGH at ${file}${f.line !== undefined ? `:${f.line}` : ''} — ${f.message}`,
        context: {
          file,
          ...(f.line !== undefined ? { line: f.line } : {}),
          message: f.message,
          provider: ctx.provider,
          bypassed: ctx.bypassed,
        },
        ts: now,
      });
    }
  }
  if (events.length === 0) return;
  try {
    await notifier.notify(events);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `cadence-notify: ${notifier.name} transport failed — ${msg} (continuing)\n`,
    );
  }
}

/**
 * Phase 37.1 — emits a single `code-review-unconverged` anomaly when
 * code-review@settle fails to converge after maxAttempts. UNCONDITIONAL by
 * design (mirrors emitPlanReviewUnconverged / emitSkillAuditMiss): code-review's
 * gate cells include `strict×*`, which carry NO `anomaly-notify` gate — a hard
 * human-escalation must still leave an audit trail, so the caller does NOT gate
 * this on `anomaly-notify` (unlike the sibling `emitCodeReviewHigh`, whose
 * Phase 24.3 `anomaly-notify` guard is preserved unchanged). Transport failure
 * → one stderr warning, never throws (the settle refusal/exit is computed
 * independently).
 */
export async function emitCodeReviewUnconverged(
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
    type: 'code-review-unconverged',
    severity: 'error',
    message: `code-review did not converge for ${ctx.draftId} after ${ctx.attempts}/${ctx.maxAttempts} attempts (${ctx.findings} finding(s))`,
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
