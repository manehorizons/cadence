import type { Gate, GateProvenance } from '@manehorizons/cadence-types';
import { NO_TEST_COMMAND_NOTICE } from '@manehorizons/cadence-types';
import type { GateImpl, GateResult, SettleAccumulator, SettleContext } from './types.js';
import { mergeInto } from './types.js';
import { runDraftReadGate } from './draft-read.js';
import { runStructuralVerifierGate } from './structural-verifier.js';
import { runBoundaryScanGate } from './boundary-scan.js';
import { runBuildTestGate } from './build-test-must-pass.js';
import { runCoverageGate } from './coverage.js';
import { runInteractiveGate, isInteractiveRequested } from './interactive.js';
import { runDeepVerifyGate, isDeepVerifyRequested } from './deep-verify.js';
import { runCodeReviewGate } from './code-review.js';
import { runSecurityAuditGate } from './security-audit.js';
import { runTaskVerifyRequiredGate } from './task-verify-required.js';
import { effectiveBoundaryEnforcement } from './engine.js';
import { getLogger } from '../logging/logger.js';

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
   * and no-ops when not requested. `deep-verify` (`--deep`) and
   * `interactive-verdict` (`--interactive`) can fire WITHOUT the gate being in
   * the set; `boundary-scan` (Phase 156) instead self-guards on
   * `effectiveBoundaryEnforcement === 'block'`, orthogonal to gate-set
   * membership entirely. A pure membership intersection would drop all three.
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
  'boundary-scan': { impl: runBoundaryScanGate, selfGuarded: true },
  'task-verify-required': { impl: runTaskVerifyRequiredGate },
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
 * `boundary-scan` sits right after `structural-verifier` — early, no external
 * services, cheap to no-op when not in `block` mode.
 */
export const GATE_ORDER: SettleGate[] = [
  'draft-read',
  'structural-verifier',
  'boundary-scan',
  'task-verify-required',
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
  /** Phase 140: per-gate ran/skipped provenance, in GATE_ORDER. Partial on
   *  refusal — only entries computed before the halting gate. */
  readonly gates: GateProvenance[];
}

/**
 * Phase 140: the two self-guarded gates are always invoked by the driver
 * regardless of membership (see `selfGuarded` above), but internally no-op
 * when not actually requested. These predicates — the gate impls' own exported
 * "am I requested" checks — let the provenance collection below tell
 * "invoked but no-op" apart from "actually ran" without re-deriving the
 * condition a second time.
 */
const SELF_GUARD_PREDICATES: Partial<Record<SettleGate, (ctx: SettleContext) => boolean>> = {
  'deep-verify': isDeepVerifyRequested,
  'interactive-verdict': isInteractiveRequested,
  'boundary-scan': (ctx) => effectiveBoundaryEnforcement(ctx.config, ctx.draft) === 'block',
};

/**
 * Per-gate provenance message for a self-guarded gate that no-opped. Keyed so
 * each self-guarded gate can explain its own trigger rather than sharing
 * `deep-verify`/`interactive-verdict`'s flag-shaped wording, which would be
 * misleading for `boundary-scan` (Phase 156, whose trigger is
 * `boundaryEnforcement`, not a CLI flag).
 */
const SELF_GUARD_SKIP_REASON: Partial<Record<SettleGate, string>> = {
  'deep-verify': 'not requested (no --deep / --interactive, not in gate set)',
  'interactive-verdict': 'not requested (no --deep / --interactive, not in gate set)',
  'boundary-scan': 'boundaryEnforcement is not "block"',
};

/**
 * Drive the settle gate sequence (Phase 44.1). Walks `GATE_ORDER`, invoking a
 * gate iff it is `selfGuarded` or present in `ctx.gateSet.gates`, merging each
 * `GateResult` into the accumulator. The first refusing gate halts the loop —
 * it has already written its own stderr; the caller sets `process.exitCode`.
 * Bit-identical to the former hand-wired settle.ts dispatch block.
 *
 * Phase 176: a gate impl that throws (rather than returning `{outcome:
 * 'refuse'}`) is caught here and normalized into the same refuse path, so
 * settle.ts's refusal branch always gets a chance to persist a SUMMARY —
 * previously only `security-audit` self-normalized its own throws this way;
 * every other gate's throw escaped uncaught to settle.ts's outer catch, which
 * writes no SUMMARY at all.
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
  const log = getLogger().child({ seam: 'gate' });
  const acc: SettleAccumulator = { flags: {} };
  const gates: GateProvenance[] = [];
  for (const gate of order) {
    const entry = registry[gate];
    if (!entry.selfGuarded && !ctx.gateSet.gates.includes(gate)) {
      log.debug('gate skipped', { gate });
      gates.push({ gate, status: 'skipped', skipReason: 'not in the active tier × profile gate set' });
      continue;
    }
    let res: GateResult;
    try {
      res = await entry.impl(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const reason = `${gate}: threw — ${message}`;
      log.warn('gate threw', { gate, error: message });
      gates.push({ gate, status: 'refused', reason });
      return { acc, refused: true, gates };
    }
    mergeInto(acc, res);
    if (res.outcome === 'refuse') {
      log.warn('gate refused', { gate, outcome: res.outcome });
      gates.push({ gate, status: 'refused', ...(res.reason !== undefined ? { reason: res.reason } : {}) });
      return { acc, refused: true, gates };
    }
    const predicate = SELF_GUARD_PREDICATES[gate];
    if (predicate && !predicate(ctx)) {
      gates.push({
        gate,
        status: 'skipped',
        skipReason: SELF_GUARD_SKIP_REASON[gate] ?? 'not requested',
      });
    } else if (gate === 'build-test-must-pass' && res.summaryPatch?.buildTestRan === false) {
      gates.push({ gate, status: 'skipped', skipReason: NO_TEST_COMMAND_NOTICE.message });
    } else if (gate === 'test-coverage' && res.flags?.coverageBypassed === true) {
      gates.push({ gate, status: 'skipped', skipReason: 'bypassed via --allow-missing-coverage' });
    } else {
      gates.push({ gate, status: 'ran' });
    }
    log.debug('gate passed', { gate, outcome: res.outcome });
  }
  return { acc, refused: false, gates };
}
