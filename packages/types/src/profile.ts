import { z } from 'zod';

export const ProfileZ = z.enum(['strict', 'standard', 'auto']);
export type Profile = z.infer<typeof ProfileZ>;

/**
 * Universe of gate names CADENCE understands. The matrix in
 * DESIGN.md Section 4.1 enumerates each gate's cost class; the engine in
 * `@manehorizons/cadence-core/gates/engine.ts` decides which fire per (tier × profile).
 */
export const GateZ = z.enum([
  // Free — always fire
  'coherence-check',
  'structural-verifier',
  'boundary-scan',
  'build-test-must-pass',
  // Cheap
  'draft-read',
  'test-coverage',
  'anomaly-notify',
  // Medium
  'approve',
  'per-task-verify',
  'code-review',
  // Expensive
  'deep-verify',
  'interactive-verdict',
  'plan-review',
  'security-audit',
]);
export type Gate = z.infer<typeof GateZ>;

export const GateSetZ = z.object({
  gates: z.array(GateZ),
  /** Soft cap on auto×complex per DESIGN.md M2 — gate impls refuse without `--allow-auto-complex`. */
  softCap: z.boolean(),
});
export type GateSet = z.infer<typeof GateSetZ>;
