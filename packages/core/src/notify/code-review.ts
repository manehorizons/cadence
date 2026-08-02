import type { AnomalyEvent } from '@thomas-powers-jr/cadence-types';
import type { CodeReviewFinding } from '../contracts/index.js';
import type { selectNotifier } from './factory.js';
import { emitUnconverged } from './emit-unconverged.js';

/**
 * Phase 24.3 — emits one `code-review-high` anomaly per HIGH finding via
 * the supplied notifier. Transport failures degrade to a single stderr
 * warning (URL never logged). Bounded by `'anomaly-notify'` gate at the
 * caller.
 */
export async function emitCodeReviewHigh(
  notifier: ReturnType<typeof selectNotifier>,
  findings: Record<string, CodeReviewFinding[]>,
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
 * independently). Phase 42.1 — transport/ts-stamp/degrade live in the shared
 * `emitUnconverged` spine; this is now just the payload builder.
 */
export function emitCodeReviewUnconverged(
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
  return emitUnconverged(notifier, 'code-review', { entityId: draftId, ...rest });
}
