import { z } from 'zod';

/**
 * Anomaly event types. Phase 17 introduced the first six; Phase 23.2 adds
 * `coherence-warn` (emitted from `cadence draft check`/`draft approve` per
 * warn issue). DESIGN.md §3.3 is the canonical list. Phase 187 adds
 * `auto-complex-override` (emitted when `--allow-auto-complex` bypasses the
 * settle/draft-approve soft cap).
 *
 * Fired when the `'anomaly-notify'` gate is in the effective gate set
 * (auto + standard×{standard,complex} cells). Informational only —
 * never block the emitting command.
 */
export const AnomalyTypeZ = z.enum([
  'ac-blocked',
  'ac-needs-context',
  'coverage-bypassed',
  'files-outside-boundary',
  'verifier-failure',
  'force-used',
  'coherence-warn',
  'loop-violation',
  'per-task-fail',
  'code-review-high',
  'skill-audit-miss',
  'plan-review-unconverged',
  'spec-review-unconverged',
  'code-review-unconverged',
  'redundant-task-work',
  'auto-complex-override',
]);
export type AnomalyType = z.infer<typeof AnomalyTypeZ>;

export const AnomalySeverityZ = z.enum(['info', 'warn', 'error']);
export type AnomalySeverity = z.infer<typeof AnomalySeverityZ>;

export const AnomalyEventZ = z.object({
  type: AnomalyTypeZ,
  severity: AnomalySeverityZ,
  /** One-line human-readable description. */
  message: z.string(),
  /** Type-specific free-form payload. */
  context: z.record(z.string(), z.unknown()),
  /**
   * Wall-clock when the event was constructed. ISO8601 with offset
   * (e.g., `"2026-05-14T22:30:00.000Z"`). Emitters stamp via
   * `new Date().toISOString()`. Phase 17.3.
   */
  ts: z.string().datetime({ offset: true }),
});
export type AnomalyEvent = z.infer<typeof AnomalyEventZ>;
