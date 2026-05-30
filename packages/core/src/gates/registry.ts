import type { Gate } from '@manehorizons/cadence-types';
import type { GateImpl, GateResult, SettleAccumulator, SettleContext } from './types.js';
import { mergeInto } from './types.js';
import { runDraftReadGate } from './draft-read.js';
import { runStructuralVerifierGate } from './structural-verifier.js';
import { runBuildTestGate } from './build-test-must-pass.js';
import { runCoverageGate } from './coverage.js';
import { runInteractiveGate } from './interactive.js';
import { runDeepVerifyGate } from './deep-verify.js';
import { runCodeReviewGate } from './code-review.js';
import { runSecurityAuditGate } from './security-audit.js';

/**
 * The settle-dispatched gate subset (Phase 44.1). The four 39.7 gates
 * (`coherence-check`, `approve`, `plan-review`, `per-task-verify`) fire in
 * DRAFT/BUILD with their own `DraftGateImpl`/`BuildGateImpl` shapes, and
 * `anomaly-notify` is a post-gates notify predicate, not a dispatched gate — so
 * none of them belong in this `GateImpl` registry. Excluding them at the type
 * level is what makes `GATE_REGISTRY` total over exactly what settle runs.
 */
export type SettleGate = Exclude<
  Gate,
  'coherence-check' | 'approve' | 'plan-review' | 'per-task-verify' | 'anomaly-notify'
>;

export interface GateEntry {
  readonly impl: GateImpl;
  /**
   * Invoked unconditionally — the impl self-guards on `opts.* OR membership`
   * and no-ops when not requested. Only `deep-verify` (`--deep`) and
   * `interactive-verdict` (`--interactive`), which can fire WITHOUT the gate
   * being in the set; a pure membership intersection would drop those runs.
   */
  readonly selfGuarded?: boolean;
}

/**
 * Total over `SettleGate` — a missing entry is a COMPILE error. The single
 * source of truth for which settle gates exist; `GATE_ORDER` owns the order.
 */
export const GATE_REGISTRY: Record<SettleGate, GateEntry> = {
  'draft-read': { impl: runDraftReadGate },
  'structural-verifier': { impl: runStructuralVerifierGate },
  'build-test-must-pass': { impl: runBuildTestGate },
  'test-coverage': { impl: runCoverageGate },
  'interactive-verdict': { impl: runInteractiveGate, selfGuarded: true },
  'deep-verify': { impl: runDeepVerifyGate, selfGuarded: true },
  'code-review': { impl: runCodeReviewGate },
  'security-audit': { impl: runSecurityAuditGate },
};

/**
 * Canonical settle EXECUTION order — cheap→expensive, so the first refusal is
 * the cheapest. This is NOT the gate-matrix order (`[...ALWAYS_FIRE, ...DELTAS]`
 * in engine.ts): settle runs deep-verify before code-review, draft-read before
 * coverage, etc. The driver walks THIS, never `gateSet.gates` array order.
 */
export const GATE_ORDER: SettleGate[] = [
  'draft-read',
  'structural-verifier',
  'build-test-must-pass',
  'test-coverage',
  'interactive-verdict',
  'deep-verify',
  'code-review',
  'security-audit',
];

export interface RunGatesResult {
  readonly acc: SettleAccumulator;
  readonly refused: boolean;
}

/**
 * Drive the settle gate sequence (Phase 44.1). Walks `GATE_ORDER`, invoking a
 * gate iff it is `selfGuarded` or present in `ctx.gateSet.gates`, merging each
 * `GateResult` into the accumulator. The first refusing gate halts the loop —
 * it has already written its own stderr; the caller sets `process.exitCode`.
 * Bit-identical to the former hand-wired settle.ts dispatch block.
 *
 * `deps` is a test seam (production callers pass only `ctx`): it lets a test
 * drive the real loop over recording stubs. The defaults ARE the real registry
 * and order — the object identity wired here is what settle runs.
 */
export async function runSettleGates(
  ctx: SettleContext,
  deps: { registry?: Record<SettleGate, GateEntry>; order?: SettleGate[] } = {},
): Promise<RunGatesResult> {
  const registry = deps.registry ?? GATE_REGISTRY;
  const order = deps.order ?? GATE_ORDER;
  const acc: SettleAccumulator = { flags: {} };
  for (const gate of order) {
    const entry = registry[gate];
    if (!entry.selfGuarded && !ctx.gateSet.gates.includes(gate)) continue;
    const res: GateResult = await entry.impl(ctx);
    mergeInto(acc, res);
    if (res.outcome === 'refuse') return { acc, refused: true };
  }
  return { acc, refused: false };
}
