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
});
export type AnomalyEvent = z.infer<typeof AnomalyEventZ>;
