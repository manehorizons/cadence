import { z } from 'zod';
import { TaskStatusZ } from './state.js';
import { GateBypassZ, FindingZ } from './summary.js';

/**
 * Phase 174 (rec-20260712-001). One entry per task whose terminal status
 * wasn't a clean DONE — the "rough" tasks a retro digest surfaces.
 */
export const RetroTaskZ = z.object({
  id: z.string(),
  status: TaskStatusZ,
  notes: z.string(),
});
export type RetroTask = z.infer<typeof RetroTaskZ>;

export const RetroFindingsZ = z
  .object({
    codeReview: z.record(z.string(), z.array(FindingZ)).optional(),
    securityAudit: z.array(FindingZ).optional(),
    boundaryScan: z.object({ offenders: z.array(z.string()) }).optional(),
  })
  .default({});
export type RetroFindings = z.infer<typeof RetroFindingsZ>;

/**
 * Phase 174: friction digest synthesized purely from an already-assembled
 * `Summary` — gate bypasses, non-DONE tasks, and any present code-review /
 * security-audit / boundary-scan findings. Written as `<draftId>-RETRO.json`
 * alongside SUMMARY on every successful settle.
 */
export const RetroDigestZ = z.object({
  bypasses: z.array(GateBypassZ).default([]),
  roughTasks: z.array(RetroTaskZ).default([]),
  findings: RetroFindingsZ,
});
export type RetroDigest = z.infer<typeof RetroDigestZ>;

/**
 * Phase 186 (rec-20260712-002). One settled phase's retro digest, tagged
 * with the identity a cross-phase rollup needs to attribute friction back
 * to its source phase/draft.
 */
export const PhaseRetroEntryZ = z.object({
  phaseId: z.string(),
  draftId: z.string(),
  digest: RetroDigestZ,
});
export type PhaseRetroEntry = z.infer<typeof PhaseRetroEntryZ>;

/**
 * Phase 186: one frequency bucket entry — a distinct key (gate-bypass name,
 * rough-task status, or finding category) with its count and the phase ids
 * it was seen in. Shared across all three frequency-bucket kinds below.
 */
export const RetroFrequencyEntryZ = z.object({
  key: z.string(),
  count: z.number().int().positive(),
  phaseIds: z.array(z.string()),
});
export type RetroFrequencyEntry = z.infer<typeof RetroFrequencyEntryZ>;

/**
 * Phase 186: a frequency-bucket kind split into `recurring` (seen in 2+
 * distinct phases) and `oneOff` (seen in exactly 1 phase) — the "recurring
 * signal, not just totals" distinction from AC-2.
 */
export const RetroFrequencyBucketsZ = z.object({
  recurring: z.array(RetroFrequencyEntryZ).default([]),
  oneOff: z.array(RetroFrequencyEntryZ).default([]),
});
export type RetroFrequencyBuckets = z.infer<typeof RetroFrequencyBucketsZ>;

/**
 * Phase 186: output of `computeRetroRollup` — the pure aggregation across
 * every scanned phase's retro digest.
 */
export const RetroRollupZ = z.object({
  totalPhases: z.number().int().nonnegative(),
  phasesWithFriction: z.number().int().nonnegative(),
  bypasses: RetroFrequencyBucketsZ.default({ recurring: [], oneOff: [] }),
  roughTaskStatuses: RetroFrequencyBucketsZ.default({ recurring: [], oneOff: [] }),
  findingCategories: RetroFrequencyBucketsZ.default({ recurring: [], oneOff: [] }),
});
export type RetroRollup = z.infer<typeof RetroRollupZ>;
