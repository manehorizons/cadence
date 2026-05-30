import type { AnomalyEvent } from '@cadence/types';

/** The single line both emission points use for a stray file. */
export const boundaryMessage = (file: string): string =>
  `${file} touched but not declared in any task's files:`;

export interface BoundaryCheckInput {
  /** The allow-set: every file declared across all task `files:` lists. */
  declaredFiles: Iterable<string>;
  /**
   * Candidate files to test against the boundary. Iterated as-given — the
   * caller owns dedup/order: the PreToolEdit hook passes raw `ctx.raw.files`
   * (keeps order + dups); settle passes a deduped `Set` of touched files.
   */
  touchedFiles: Iterable<string>;
  /**
   * Stamps each event's `ts`. The hook precomputes one ISO string and returns
   * it for every event; settle stamps per-event from its injectable clock.
   */
  stamp: () => string;
  /**
   * Merged into each event's `context` AFTER the `file` key (e.g. the hook's
   * `{ source: 'hook.preToolEdit' }`; settle supplies none).
   */
  extraContext?: Record<string, unknown>;
}

/**
 * Phase 43.1 — the single home for files-outside-boundary detection. One rule
 * ("a touched file not in the union of task `files:` is an outsider"), two
 * emission points: the PreToolEdit hook (`hooks/handlers.ts`) and settle's
 * `collectAnomalies` (`notify/collect.ts`). Pure — no I/O. Each outsider yields
 * one `warn` `files-outside-boundary` event; emission (gate membership, notify,
 * stderr-degrade) stays at each call site. NOT a `Gate` enum member — it is a
 * hook-time + settle-time anomaly check, so it lives in `checks/` alongside
 * skill-audit (39.6), OUTSIDE the Phase 44.1 registry.
 */
export function runBoundaryCheck(input: BoundaryCheckInput): AnomalyEvent[] {
  const declared = new Set(input.declaredFiles);
  const events: AnomalyEvent[] = [];
  for (const file of input.touchedFiles) {
    if (declared.has(file)) continue;
    events.push({
      type: 'files-outside-boundary',
      severity: 'warn',
      message: boundaryMessage(file),
      context: { file, ...input.extraContext },
      ts: input.stamp(),
    });
  }
  return events;
}
