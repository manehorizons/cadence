import type { Gate, GateProvenance } from '@thomas-powers-jr/cadence-types';
import { NO_TEST_COMMAND_NOTICE } from '@thomas-powers-jr/cadence-types';
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
 * Phase 232 (T3), widened by Phase 263 (T3): lifts a gate's reported
 * `flags.verifierIdentity` (populated only by `code-review`/`security-audit`,
 * see T2/263-01 T4) onto the `provider`/`model`/`providerSelection` fields of
 * the `GateProvenance` entry being pushed for it. Checked generically by flag
 * presence rather than gate name — any future gate that starts reporting
 * `verifierIdentity` picks this up for free, and every gate that doesn't set
 * it (all of them today, besides those two) gets back `{}`, so no stray keys
 * land on its provenance entry (AC-5, `exactOptionalPropertyTypes` safe:
 * never spreads an explicit `undefined`). `providerSelection` lifts the same
 * way `model` already does — present only when the gate actually computed
 * one.
 */
function verifierIdentityProvenance(
  res: GateResult,
): Pick<GateProvenance, 'provider' | 'model' | 'providerSelection'> {
  const identity = res.flags?.verifierIdentity;
  if (!identity) return {};
  return {
    provider: identity.family,
    ...(identity.model !== undefined ? { model: identity.model } : {}),
    ...(identity.providerSelection !== undefined
      ? { providerSelection: identity.providerSelection }
      : {}),
  };
}

/**
 * Phase 275 (275-01, T3): mirrors `verifierIdentityProvenance()` above
 * exactly, but for `GateFlags.observedVerifierIdentity` (populated by
 * `deep-verify` per T2, and structurally distinct from `verifierIdentity`
 * above) onto `observedProvider`/`observedModel` — a field pair
 * `deriveAssuranceRecord`'s `verifierRollup`/`overall` fold never reads (see
 * `gates/types.ts`'s doc comment on `observedVerifierIdentity` and AC-3).
 * Checked generically by flag presence, never by gate name, matching
 * `verifierIdentityProvenance()`'s own convention: any future gate that
 * starts reporting `observedVerifierIdentity` picks this up for free.
 */
function observedVerifierIdentityProvenance(
  res: GateResult,
): Pick<GateProvenance, 'observedProvider' | 'observedModel'> {
  const identity = res.flags?.observedVerifierIdentity;
  if (!identity) return {};
  return {
    observedProvider: identity.family,
    ...(identity.model !== undefined ? { observedModel: identity.model } : {}),
  };
}

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
    // Phase 241 (T1): a per-gate context carrying a frozen snapshot of the
    // provenance recorded so far (never including this gate's own
    // not-yet-computed entry). Shallow-spread deliberately: `coverage()`,
    // `draftMtimeMs()`, and `diff()` on `ctx` are plain object properties
    // holding closures (not `this`-bound method shorthand — see
    // `buildSettleContext` in services/settle.ts), so the spread copies
    // those function references BY IDENTITY rather than re-creating them —
    // their per-settle memoization survives.
    //
    // The freeze is deliberately TWO-LEVEL, and the second level is the
    // load-bearing one. Freezing only the array would leave its elements as
    // the very same object references this loop's `gates` accumulator holds,
    // so `ctx.gateProvenance[0].status = 'refused'` from inside any gate
    // would rewrite the live entry. Copying defends against that even for a
    // gate that casts away the compile-time guard: the field is declared
    // `readonly Readonly<GateProvenance>[]` in `types.ts`, which already makes
    // the bare assignment a type error, so the two guards are belt and
    // braces rather than one doing both jobs. (A plain `readonly T[]` would
    // NOT be enough — it constrains the array's shape, not its elements'
    // fields, which is why the element type is wrapped.) That
    // accumulator is persisted as `SUMMARY.json.gates` and feeds the phase-233
    // assurance record, so a gate-writable audit trail would undercut exactly
    // the integrity record this seam exists to strengthen. Copying each entry
    // (`{ ...g }`) and freezing the copy means a gate can mutate nothing that
    // outlives its own invocation.
    const gateCtx: SettleContext = {
      ...ctx,
      gateProvenance: Object.freeze(gates.map((g) => Object.freeze({ ...g }))),
    };
    let res: GateResult;
    try {
      res = await entry.impl(gateCtx);
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
      gates.push({
        gate,
        status: 'refused',
        ...(res.reason !== undefined ? { reason: res.reason } : {}),
        ...verifierIdentityProvenance(res),
        ...observedVerifierIdentityProvenance(res),
      });
      return { acc, refused: true, gates };
    }
    // Phase 241 (T1): every read below goes through `gateCtx`, the same
    // context the impl was handed, not the outer `ctx`. The two are
    // interchangeable today (`opts` is shared by reference through the
    // spread, and no self-guard predicate reads `gateProvenance`), but a
    // future predicate that does would silently observe `undefined` if it
    // were still passed the outer context.
    const predicate = SELF_GUARD_PREDICATES[gate];
    if (predicate && !predicate(gateCtx)) {
      gates.push({
        gate,
        status: 'skipped',
        skipReason: SELF_GUARD_SKIP_REASON[gate] ?? 'not requested',
        ...verifierIdentityProvenance(res),
        ...observedVerifierIdentityProvenance(res),
      });
    } else if (gate === 'build-test-must-pass' && res.summaryPatch?.buildTestRan === false) {
      gates.push({ gate, status: 'skipped', skipReason: NO_TEST_COMMAND_NOTICE.message, ...verifierIdentityProvenance(res), ...observedVerifierIdentityProvenance(res) });
    } else if (gate === 'build-test-must-pass' && res.flags?.buildTestBypassed === true) {
      // Phase 226: buildTestBypassed is true for either --allow-failing-build
      // or bare --force (see build-test-must-pass.ts) — name whichever one
      // actually fired instead of always naming the gate's own flag.
      const flag = gateCtx.opts.allowFailingBuild === true ? '--allow-failing-build' : '--force';
      gates.push({ gate, status: 'skipped', skipReason: `bypassed via ${flag}`, ...verifierIdentityProvenance(res), ...observedVerifierIdentityProvenance(res) });
    } else if (gate === 'boundary-scan' && res.flags?.boundaryScanBypassed === true) {
      const flag = gateCtx.opts.allowBoundaryScanFailure === true ? '--allow-boundary-scan-failure' : '--force';
      gates.push({ gate, status: 'skipped', skipReason: `bypassed via ${flag}`, ...verifierIdentityProvenance(res), ...observedVerifierIdentityProvenance(res) });
    } else if (gate === 'test-coverage' && res.flags?.coverageBypassed === true) {
      gates.push({ gate, status: 'skipped', skipReason: 'bypassed via --allow-missing-coverage', ...verifierIdentityProvenance(res), ...observedVerifierIdentityProvenance(res) });
    } else if (res.flags?.reviewVerifierFailure) {
      // Phase 248 (T4): a code-review/security-audit verifier THROW (the call
      // itself never returned) bypassed via --force or the gate-specific
      // --allow-*-failure flag. No gate-name disjunction needed in the
      // condition — only these two gates ever set reviewVerifierFailure (see
      // gates/types.ts) — but the flag-naming ternary below still needs one,
      // mirroring the build-test-must-pass/boundary-scan precedent above:
      // name the gate-specific flag when it was explicitly set, --force only
      // when it alone triggered the bypass.
      const { message, provider } = res.flags.reviewVerifierFailure;
      const flag =
        gate === 'code-review'
          ? gateCtx.opts.allowCodeReviewFailure === true
            ? '--allow-code-review-failure'
            : '--force'
          : gateCtx.opts.allowSecurityAuditFailure === true
            ? '--allow-security-audit-failure'
            : '--force';
      gates.push({
        gate,
        status: 'skipped',
        // `provider` is optional on `reviewVerifierFailure` only because the
        // `GateFlags` field shape mirrors `verifierFailure`'s; in practice
        // both code-review.ts and security-audit.ts always populate it
        // (`ctx.config?.<gate>?.provider ?? 'mock'`), so this fallback is
        // unreachable today. If it ever weren't set, 'mock' would fabricate
        // a specific configured provider nobody configured — 'unknown' is
        // the honest gap-filler, matching this phase's own provenance-
        // honesty thesis.
        skipReason: `bypassed via ${flag} — verifier failure bypassed (${message}), configured provider: ${provider ?? 'unknown'}`,
        ...verifierIdentityProvenance(res),
        ...observedVerifierIdentityProvenance(res),
      });
    } else if (
      res.flags?.verifierIdentity?.family === 'mock' &&
      res.flags?.reviewFindingsBypassed !== true
    ) {
      // Phase 267 (267-01, T2, dec-20260809-004/-005): a mock-identified
      // CLEAN PASS is not real verification — relabel what would otherwise be
      // recorded 'ran' as 'skipped'+skipReason instead. Checked generically
      // by flag presence, same convention as `verifierIdentityProvenance`
      // itself and the `reviewVerifierFailure` branch above: only
      // code-review/security-audit ever populate `verifierIdentity` today
      // (gates/code-review.ts, gates/security-audit.ts), so this reaches
      // exactly those two without a gate-name disjunction. A mock-identified
      // 'refuse' never reaches here — the refuse branch above (line ~218)
      // already returned before this point, so a real flagged finding keeps
      // its normal refusal recording, never relabeled (dec-20260809-004: a
      // refusal is never false confidence, regardless of provider).
      //
      // The `reviewFindingsBypassed !== true` guard closes a second case the
      // refuse-branch check alone misses: --force/--allow-*-failure turns a
      // real HIGH/CRITICAL finding into `outcome:'pass'` (see the bypass
      // fall-through in code-review.ts/security-audit.ts) — that is NOT a
      // clean pass either, and must keep its pre-267 `status:'ran'`
      // recording (falls to the final `else` below) rather than being
      // mislabeled "abstained" alongside a genuinely empty result.
      gates.push({
        gate,
        status: 'skipped',
        skipReason: `${gate}: mock-identified clean pass abstained — the mock provider is not real verification, recorded as skipped rather than a persisted pass`,
        ...verifierIdentityProvenance(res),
        ...observedVerifierIdentityProvenance(res),
      });
    } else {
      gates.push({ gate, status: 'ran', ...verifierIdentityProvenance(res), ...observedVerifierIdentityProvenance(res) });
    }
    log.debug('gate passed', { gate, outcome: res.outcome });
  }
  return { acc, refused: false, gates };
}
