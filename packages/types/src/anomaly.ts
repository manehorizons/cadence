import { z } from 'zod';

/**
 * Anomaly event types per Phase 17 / DESIGN.md D4.
 *
 * Fired by settle when the `'anomaly-notify'` gate is in the effective gate
 * set (auto + standard×{standard,complex} cells). Informational only —
 * never block settle.
 */
export const AnomalyTypeZ = z.enum([
  'ac-blocked',
  'ac-needs-context',
  'coverage-bypassed',
  'files-outside-boundary',
  'verifier-failure',
  'force-used',
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
  context: z.record(z.unknown()),
  /**
   * Wall-clock when the event was constructed. ISO8601 with offset
   * (e.g., `"2026-05-14T22:30:00.000Z"`). Emitters stamp via
   * `new Date().toISOString()`. Phase 17.3.
   */
  ts: z.string().datetime({ offset: true }),
});
export type AnomalyEvent = z.infer<typeof AnomalyEventZ>;
