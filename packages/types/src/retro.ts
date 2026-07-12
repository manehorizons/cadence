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
