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
