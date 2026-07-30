import { z } from 'zod';
import { TaskStatusZ, DecisionZ, DeferredItemZ, LoopPositionZ } from './state.js';
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
 * Phase 235 (§7.1): the anchor ladder — how strongly a finding is tied to a
 * criterion the phase actually declared, strongest to weakest. `executable`
 * requires both that the AC is referenced by a task with a runnable
 * `verify` command AND that `build-test-must-pass` actually ran (phase 232
 * gate provenance corroborates it — never assumed from the DRAFT alone).
 * `structured` is an AC with non-empty `given`/`when`/`then`. `declared` is
 * a prose-only or empty-G/W/T AC, or a `boundaries[]` string. `undeclared`
 * means no citable criterion — a criteria gap. Deliberately a peer schema
 * to `AcEvidenceZ` (D5) — mirrors its five-tier shape without reusing or
 * extending it; the two rank different things (evidence quality for an AC
 * that already passed vs. how strongly a *finding* ties back to any
 * criterion at all) and must stay independently evolvable.
 */
export const AnchorTierZ = z.enum(['executable', 'structured', 'declared', 'undeclared']);
export type AnchorTier = z.infer<typeof AnchorTierZ>;

/**
 * Phase 235 (§7.1, AC-2): what a code-review finding is anchored to.
 * `kind` is deliberately narrower than §7.2's future `Finding identity`
 * shape (`'ac' | 'boundary' | 'invariant' | 'none'`) — `invariant` plus
 * stable `id`/`disposition`/`waiver` are phase 236 scope, gated on the
 * shared fingerprint primitive (`rec-20260727-007`); this phase declares
 * only the three kinds AC-2 specifies. `ref` is optional because a `'none'`
 * anchor (or an `undeclared`-tier gap) cites nothing.
 */
export const AnchorZ = z.object({
  kind: z.enum(['ac', 'boundary', 'none']),
  ref: z.string().optional(),
  tier: AnchorTierZ,
});
export type Anchor = z.infer<typeof AnchorZ>;

/**
 * Per-file / per-diff finding. Introduced for code-review (Phase 24.3,
 * high/medium/low). Phase 25.2 added `critical` for the security-audit
 * gate — additive; code-review still only emits high/medium/low.
 */
export const FindingZ = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  message: z.string(),
  line: z.number().int().positive().optional(),
  /** Phase 235: which criterion (if any) this finding is anchored to, and
   *  how strongly. Optional — absent for every pre-phase-235 record and for
   *  findings emitted by gates this phase deliberately does not touch
   *  (`spec-review`, `ui-spec-review`, `plan-review`; `dec-20260729-003`). */
  anchor: AnchorZ.optional(),
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
 * Phase 170: a refusing gate now also gets a persisted entry (`status:
 * 'refused'`) before settle halts, alongside every earlier gate's ran/skipped
 * entry — see `reason` below. `gate` uses the full `GateZ` enum (unlike
 * `GateBypassZ.gate`, which is a loose `z.string()` because it also carries
 * the pseudo-gate name `'settle'` for the `--force` bypass case) since every
 * entry here is a real, settle-dispatched gate.
 */
export const GateProvenanceZ = z.object({
  gate: GateZ,
  status: z.enum(['ran', 'skipped', 'refused']),
  /** Present iff status === 'skipped'. */
  skipReason: z.string().optional(),
  /** Present iff status === 'refused'. */
  reason: z.string().optional(),
  /** Phase 232: verifier family/model that actually ran this gate (currently
   *  populated only for `code-review` and `security-audit`; every other
   *  gate's provenance entry omits both). Optional — not every gate's
   *  provenance carries verifier identity. Named to match `DeepVerifyMetaZ`'s
   *  `provider`/`model` and `GateFlags.verifierFailure.provider`. */
  provider: z.string().optional(),
  model: z.string().optional(),
});
export type GateProvenance = z.infer<typeof GateProvenanceZ>;

/**
 * Phase 140: strongest evidence class found for an AC, independent of its
 * pass/fail verdict, ranked ai-verified > executed > assertion > mention >
 * unverified. See `gates/ac-evidence.ts` for the derivation.
 */
export const AcEvidenceZ = z.enum(['ai-verified', 'executed', 'assertion', 'mention', 'unverified']);
export type AcEvidence = z.infer<typeof AcEvidenceZ>;

/**
 * Phase 233: derived, whole-run rollup over per-gate verifier identity
 * (`GateProvenanceZ.provider`/`model`, phase 232) and per-AC evidence class
 * (`AcEvidenceZ`, phase 140). Attached to `SummaryZ` as `assurance` —
 * reported only; it adds no refusal path and no bypass flag. Deliberately
 * gate-agnostic: `verifierRollup` groups by the `(provider, model)` pairs
 * that already exist on `gates` entries, and `evidenceTally` counts by the
 * `AcEvidenceZ` values already on `acResults[].evidence` — neither keys on a
 * specific gate name or AC id, so the same shape covers any settle
 * regardless of which gates ran or how many ACs exist.
 */
export const AssuranceRecordZ = z.object({
  /** One entry per distinct `(provider, model)` pair observed across
   *  `gates` provenance entries that carried verifier identity, with how
   *  many gate entries carried it. `provider` mirrors
   *  `GateProvenanceZ.provider` (e.g. `'mock'`, `'anthropic'`); `model`
   *  mirrors `GateProvenanceZ.model` and is optional for the same reason. */
  verifierRollup: z.array(
    z.object({
      provider: z.string(),
      model: z.string().optional(),
      gateCount: z.number().int().positive(),
    }),
  ),
  /** Count of ACs at each evidence class, keyed by `AcEvidenceZ` itself
   *  (ai-verified > executed > assertion > mention > unverified) rather than
   *  a bare `z.string()` key, so a typo'd or otherwise bogus class name is
   *  rejected at parse time instead of silently accepted. Sums to the
   *  number of `acResults` entries that carried an `evidence` value; every
   *  class key is present (0 for classes with no ACs) since `z.record` over
   *  an enum key schema is exhaustive under zod v4. */
  evidenceTally: z.record(AcEvidenceZ, z.number().int().nonnegative()),
  /** Single deterministic label summarizing the two rollups above — the
   *  weakest signal wins. `'unverified'` when no verifier identity was
   *  found and no evidence stronger than `'unverified'` was recorded
   *  anywhere in the settle. */
  overall: z.enum(['strong', 'mixed', 'weak', 'unverified']),
});
export type AssuranceRecord = z.infer<typeof AssuranceRecordZ>;

export const SummaryZ = z.object({
  /** Phase 232: 2 adds `provider`/`model` identity onto `code-review` and
   *  `security-audit` GateProvenanceZ entries — additive, not breaking.
   *  Writers emit 2; readers still accept pre-phase-232 records at 1. */
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
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
  /** issue #177: point-in-time loop-state snapshot, captured just before
   *  settle resets state to IDLE. Replaces the audit-trail value a tracked
   *  state.json used to carry incidentally. */
  stateAtSettle: z
    .object({
      loopPositionBeforeSettle: LoopPositionZ,
      revision: z.number().int().nonnegative(),
      sessionSubagentSpawns: z.number().int().nonnegative(),
    })
    .optional(),
  /** Phase 223 (rec-20260724-006): settle-time content-hash provenance, so a
   *  hand-edited settled SUMMARY.json is detectable instead of rendering
   *  faithfully as if genuine. Optional — absent for pre-phase-223 records,
   *  which `cadence summary verify` reports as a distinct "unverifiable"
   *  outcome rather than a false MATCH. `algorithm` is a literal because only
   *  sha256 is supported for now; `value` is the hex digest, format
   *  unconstrained here. Detection only — no signing, no keys (dec-20260726-001;
   *  full signing deferred to rec-20260726-001). */
  contentHash: z
    .object({
      algorithm: z.literal('sha256'),
      value: z.string(),
    })
    .optional(),
  /** Phase 233: derived, whole-run assurance rollup over per-gate verifier
   *  identity and per-AC evidence class — reported only, adds no refusal
   *  path or bypass flag. Optional; absent for pre-phase-233 records. */
  assurance: AssuranceRecordZ.optional(),
});
export type Summary = z.infer<typeof SummaryZ>;
