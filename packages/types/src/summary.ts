import { z } from 'zod';
import { TaskStatusZ, DecisionZ, DeferredItemZ } from './state.js';
import { GateZ } from './profile.js';

export const DeepVerdictZ = z.object({
  pass: z.boolean(),
  reason: z.string(),
  provider: z.string(),
  model: z.string().optional(),
});
export type DeepVerdict = z.infer<typeof DeepVerdictZ>;

/**
 * Phase 70: run-level provenance for a `--deep` verifier pass — records what
 * the verifier was actually given, so a verdict is auditable. `diffProvided`
 * is false only when no diff could be collected; `truncated` flags that the
 * diff was clipped to `verifier.diffCapBytes` before the verifier saw it.
 */
export const DeepVerifyMetaZ = z.object({
  diffProvided: z.boolean(),
  diffBytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
  filesCount: z.number().int().nonnegative(),
  provider: z.string(),
  model: z.string().optional(),
  /** Phase 73: token usage when a real provider reported it. Optional —
   *  absent for `mock` and for v1.14-shaped records. Dollar cost is not
   *  derived (no price table; v1.15 scope guard). */
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
});
export type DeepVerifyMeta = z.infer<typeof DeepVerifyMetaZ>;

/**
 * Per-file / per-diff finding. Introduced for code-review (Phase 24.3,
 * high/medium/low). Phase 25.2 added `critical` for the security-audit
 * gate — additive; code-review still only emits high/medium/low.
 */
export const FindingZ = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  message: z.string(),
  line: z.number().int().positive().optional(),
});
export type Finding = z.infer<typeof FindingZ>;

export const GateBypassZ = z.object({
  gate: z.string(),
  flag: z.string(),
  reason: z.string(),
  severity: z.enum(['warn', 'error']),
});
export type GateBypass = z.infer<typeof GateBypassZ>;

/**
 * Phase 140: per-gate ran/skipped provenance for one settle, in `GATE_ORDER`.
 * A refusing gate halts settle before SUMMARY is ever written, so a
 * persisted record only ever shows `'ran' | 'skipped'` — never a refusal.
 * `gate` uses the full `GateZ` enum (unlike `GateBypassZ.gate`, which is a
 * loose `z.string()` because it also carries the pseudo-gate name `'settle'`
 * for the `--force` bypass case) since every entry here is a real,
 * settle-dispatched gate.
 */
export const GateProvenanceZ = z.object({
  gate: GateZ,
  status: z.enum(['ran', 'skipped']),
  /** Present iff status === 'skipped'. */
  skipReason: z.string().optional(),
});
export type GateProvenance = z.infer<typeof GateProvenanceZ>;

/**
 * Phase 140: strongest evidence class found for an AC, independent of its
 * pass/fail verdict, ranked ai-verified > executed > assertion > mention >
 * unverified. See `gates/ac-evidence.ts` for the derivation.
 */
export const AcEvidenceZ = z.enum(['ai-verified', 'executed', 'assertion', 'mention', 'unverified']);
export type AcEvidence = z.infer<typeof AcEvidenceZ>;

export const SummaryZ = z.object({
  schemaVersion: z.literal(1),
  draftId: z.string(),
  completedAt: z.string(),
  acResults: z.array(
    z.object({
      id: z.string(),
      pass: z.boolean(),
      note: z.string().optional(),
      /** Phase 140: absent for pre-phase-140 records and explicit-only human declarations with no derivable evidence. */
      evidence: AcEvidenceZ.optional(),
    }),
  ),
  taskResults: z.array(
    z.object({ id: z.string(), status: TaskStatusZ, notes: z.string() }),
  ),
  decisions: z.array(DecisionZ),
  deferred: z.array(DeferredItemZ),
  skillAudit: z.object({ required: z.array(z.string()), invoked: z.array(z.string()) }),
  /** Phase 15: per-AC `--deep` verifier output. Present only when `--deep` ran. */
  deepVerify: z.record(z.string(), DeepVerdictZ).optional(),
  /** Phase 70: run-level provenance for the `--deep` pass (what the verifier saw). */
  deepVerifyMeta: DeepVerifyMetaZ.optional(),
  /** Phase 16: per-AC `--interactive` walker output. Present only when the walker ran. */
  interactiveVerify: z
    .record(
      z.string(),
      z.object({
        verdict: z.enum(['pass', 'fail']),
        note: z.string().optional(),
      }),
    )
    .optional(),
  /** Phase 116: set when the interactive-verdict walker was auto-skipped in a
   *  non-TTY (auto-bypass). Mutually exclusive with `interactiveVerify` — no
   *  per-AC human verdicts are fabricated; the other verification gates decide. */
  interactiveVerifySkipped: z.literal('non-tty').optional(),
  /** Phase 24.3: per-file code-review findings. Present only when the gate ran. */
  codeReview: z.record(z.string(), z.array(FindingZ)).optional(),
  /** Phase 25.2: flat security-audit findings. Present only when the gate ran. */
  securityAudit: z.array(FindingZ).optional(),
  /** Phase 156: audit trail for a bypassed boundary-scan refusal. Present only
   *  when the gate refused and a bypass flag let settle proceed anyway. */
  boundaryScan: z.object({ offenders: z.array(z.string()) }).optional(),
  /** Phase 120: durable audit trail for settle-time gate bypasses. */
  gateBypasses: z.array(GateBypassZ).optional(),
  /** Phase 140: per-gate ran/skipped provenance. Optional for back-compat with
   *  pre-phase-140 records; every settle from this phase forward populates it. */
  gates: z.array(GateProvenanceZ).optional(),
});
export type Summary = z.infer<typeof SummaryZ>;
