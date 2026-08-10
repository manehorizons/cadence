import { describe, it, expect } from 'vitest';
import { runPlanReviewGate } from '../../src/gates/plan-review.js';
import { MockPlanReviewVerifier } from '../../src/verify/plan-review.js';
import type { PlanReviewInput, PlanReviewResult } from '../../src/verify/plan-review.js';
import type { DraftGateContext } from '../../src/gates/draft-types.js';
import type { Draft } from '@thomas-powers-jr/cadence-types';

/**
 * Phase 267 (267-01, T1 — corrected per dec-20260809-004/-005, supersedes
 * dec-20260809-003) — corpus-first adversarial fixtures for the plan-review
 * family. `plan-review` is a DRAFT-time gate (`DraftGateImpl`), NOT
 * dispatched through `registry.ts`'s `SettleGate` machinery — it is one of
 * the five members `SettleGate` explicitly excludes (`registry.ts:26-29`) —
 * so it carries no `GateProvenance`/`status` field at all (`GateResult` has
 * only `outcome`/`summaryPatch`/`flags`/`reason`; see `gates/types.ts`), and
 * its outcome is consumed only for the `draft-approve` exit code
 * (`services/draft-approve.ts:95-97`) — no SUMMARY, no `GateProvenance`
 * entry, and no abstain marker exist for a plan-review pass today.
 *
 * CORRECTION (dec-20260809-005): this file previously claimed "no provenance
 * record of any kind exists" — that overstated the gap. `provider` IS
 * already persisted today, via a primitive plan-review shares with
 * code-review and both spec-approve seams: `verify/converge.ts`'s
 * `ConvergentReviewHistoryEntry` + `runConvergentReview`'s `sidecarJson`,
 * which `gates/plan-review.ts` writes to `*-PLAN-REVIEW.json` on every
 * attempt. What's actually missing is only an *abstain marker* on that
 * already-shared shape — T2 is extending an existing primitive, not
 * inventing a recording surface from scratch. dec-20260809-005 directs T2 to
 * add an optional field to `ConvergentReviewHistoryEntry` (populated when
 * the resolved identity is mock and `pass` is true) rather than a
 * plan-review-specific mechanism. This file still does not guess at the
 * exact field name/shape T2 will land on — see the RED-block comment below
 * for what IS assertable today without guessing, and what is deliberately
 * left unasserted.
 *
 * `plan-review` also has no `diff` concept — it reviews the parsed DRAFT
 * itself (objective/ACs/tasks/boundaries), not a git diff. The honest analog
 * of "empty diff" (case 2) here is a VACUOUS-BUT-STRUCTURALLY-VALID plan: one
 * AC whose given/when/then are non-empty strings but say nothing
 * (`MockPlanReviewVerifier`'s rule only checks non-empty trimmed text — see
 * `verify/plan-review.ts:51-80` — so a minimal plan passes exactly as
 * cleanly as a thorough one). That is the same false-clean-pass shape as an
 * empty diff: nothing was meaningfully reviewed, yet a pass is recorded.
 *
 * `[GREEN regression]` pins the real-provider carve-out, untouched by this
 * correction.
 */

const WELL_FORMED_DRAFT: Draft = {
  acceptanceCriteria: [
    {
      id: 'AC-1',
      name: 'demo',
      given: 'a user has an active session',
      when: 'they submit the form with all required fields',
      then: 'the record is persisted and a confirmation is shown',
    },
  ],
  tasks: [],
  boundaries: [],
} as unknown as Draft;

/** Vacuous-but-structurally-valid — the plan-review analog of an empty diff
 *  (case 2): non-empty trimmed text that reviews nothing meaningfully. */
const VACUOUS_DRAFT: Draft = {
  acceptanceCriteria: [{ id: 'AC-1', name: 'x', given: 'a', when: 'b', then: 'c' }],
  tasks: [],
  boundaries: [],
} as unknown as Draft;

function spyVerifier(
  impl: (input: PlanReviewInput) => Promise<PlanReviewResult>,
): { calls: number; verify: (input: PlanReviewInput) => Promise<PlanReviewResult> } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    verify: async (input: PlanReviewInput) => {
      state.calls += 1;
      return impl(input);
    },
  };
}

function ctx(over: {
  draft: Draft;
  /** `ctx.config?.planReview?.provider` — omit entirely to exercise the
   *  defaulted-to-mock path. */
  configProvider?: string;
  verifierPort: { verify: (input: PlanReviewInput) => Promise<PlanReviewResult> };
  /** Phase 267 (267-01, T2): captures the raw JSON string
   *  `runPlanReviewGate` writes to the `*-PLAN-REVIEW.json` sidecar, so a
   *  test can assert on the persisted `mockAbstained` marker without a real
   *  filesystem. */
  onWrite?: (json: string) => void;
}): DraftGateContext {
  return {
    cwd: '/x',
    state: {} as never,
    draft: over.draft,
    config: {
      convergence: { maxAttempts: 3 },
      ...(over.configProvider ? { planReview: { provider: over.configProvider } } : {}),
    } as never,
    gateSet: { gates: ['plan-review'], softCap: false } as never,
    phase: '01-foundation',
    id: '01-01',
    opts: {},
    coherence: () => ({ issues: [] }),
    verifiers: { planReview: over.verifierPort },
    emit: { coherenceWarn: async () => {}, planReviewUnconverged: async () => {} },
    prompter: { create: () => ({ ask: async () => '' }) },
    planReviewSidecar: {
      read: async () => ({ attemptsSoFar: 0, history: [] }),
      write: async (json: string) => {
        over.onWrite?.(json);
      },
    },
    io: { err: () => {} },
  } as unknown as DraftGateContext;
}

describe('Phase 267 — MockPlanReviewVerifier current behavior (documents the bug T2 fixes)', () => {
  // verify/plan-review.ts is OUT OF SCOPE for T2 — these pins stay green
  // forever, proving today's mock verifier returns a clean pass for both a
  // well-formed plan and a vacuous-but-valid one.
  it('case 1: a well-formed plan passes cleanly today (no findings)', async () => {
    const result = await new MockPlanReviewVerifier().verify({ draft: WELL_FORMED_DRAFT });
    expect(result).toEqual({ pass: true, findings: [], provider: 'mock' });
  });

  it('case 2: a vacuous-but-structurally-valid plan (non-empty G/W/T saying nothing) ALSO passes cleanly today — nothing meaningful was reviewed', async () => {
    const result = await new MockPlanReviewVerifier().verify({ draft: VACUOUS_DRAFT });
    expect(result).toEqual({ pass: true, findings: [], provider: 'mock' });
  });
});

describe('Phase 267 AC-1 — plan-review dispatch under mock (abstention-record mechanism RESOLVED by T2: converge.ts shared sidecar, mockAbstained field — see new describe block below for the assertions)', () => {
  // dec-20260809-004 corrects AC-1's bar to "dispatch happens normally,
  // abstention is recorded elsewhere" — but plan-review has no `registry.ts`
  // involvement and no other known recording surface (see docstring above),
  // so there is no guess-free second assertion to add here the way
  // `mock-abstention-code-review.test.ts`/`-security-audit.test.ts` do via
  // `runSettleGates`. These cases now assert ONLY that dispatch continues
  // (already true today — NOT a red assertion) and are deliberately left
  // without a status/skip assertion rather than fabricate one. T2 must
  // either (a) design and implement a concrete plan-review abstention record
  // and this file gets a follow-up correction to assert it, or (b) the DRAFT
  // needs an explicit amendment narrowing AC-1 to the two registry-routed
  // families. Not tagged `267-01/AC-1` — dispatch-continuity alone does not
  // evidence AC-1's abstention-recording claim.
  it('[case 1] well-formed plan, DEFAULTED mock (no planReview config at all): verify() dispatches normally (unchanged)', async () => {
    const real = new MockPlanReviewVerifier();
    const spy = spyVerifier((input) => real.verify(input));
    const res = await runPlanReviewGate(ctx({ draft: WELL_FORMED_DRAFT, verifierPort: spy }));
    expect(spy.calls).toBe(1);
    expect(res.outcome).toBe('pass');
  });

  it('[case 1] well-formed plan, EXPLICIT config.planReview.provider = "mock": verify() dispatches normally (unchanged)', async () => {
    const real = new MockPlanReviewVerifier();
    const spy = spyVerifier((input) => real.verify(input));
    const res = await runPlanReviewGate(
      ctx({ draft: WELL_FORMED_DRAFT, configProvider: 'mock', verifierPort: spy }),
    );
    expect(spy.calls).toBe(1);
    expect(res.outcome).toBe('pass');
  });

  it('[case 2] vacuous-but-valid plan, defaulted mock: verify() dispatches normally (unchanged) — the false-clean-pass shape with no known recording surface to assert against', async () => {
    const real = new MockPlanReviewVerifier();
    const spy = spyVerifier((input) => real.verify(input));
    const res = await runPlanReviewGate(ctx({ draft: VACUOUS_DRAFT, verifierPort: spy }));
    expect(spy.calls).toBe(1);
    expect(res.outcome).toBe('pass');
  });

  it('[case 2] vacuous-but-valid plan, EXPLICIT config.planReview.provider = "mock": verify() dispatches normally (unchanged)', async () => {
    const real = new MockPlanReviewVerifier();
    const spy = spyVerifier((input) => real.verify(input));
    const res = await runPlanReviewGate(
      ctx({ draft: VACUOUS_DRAFT, configProvider: 'mock', verifierPort: spy }),
    );
    expect(spy.calls).toBe(1);
    expect(res.outcome).toBe('pass');
  });

  it('[GREEN regression, case 3] real provider (anthropic): verify() must still be dispatched — abstention must not fire for a non-mock provider', async () => {
    const spy = spyVerifier(async () => ({ pass: true, findings: [], provider: 'anthropic', model: 'claude-x' }));
    const res = await runPlanReviewGate(
      ctx({ draft: WELL_FORMED_DRAFT, configProvider: 'anthropic', verifierPort: spy }),
    );
    expect(spy.calls).toBe(1);
    expect(res.outcome).toBe('pass');
  });
});

/**
 * Phase 267 (267-01, T2, dec-20260809-005) — the RESOLVED recording surface:
 * plan-review's abstain marker is `mockAbstained: true` on the history entry
 * `runConvergentReview` appends to `*-PLAN-REVIEW.json` (see
 * `verify/converge.ts`'s `ConvergentReviewHistoryEntry.mockAbstained` and
 * `gates/plan-review.ts`'s `mockAbstained = res.provider === 'mock' &&
 * res.pass === true` computation). This describe block is what supersedes
 * the "marker shape TBD by T2" describe block above with a concrete,
 * guess-free assertion, tagged `267-01/AC-1` since it is real coverage
 * evidence for plan-review's abstention-recording half of AC-1.
 */
describe('Phase 267 AC-1 — plan-review: mock-identified clean pass is marked mockAbstained:true on the persisted sidecar history entry', () => {
  it('267-01/AC-1 [marker] well-formed plan, defaulted mock, clean pass: sidecar history[0].mockAbstained is true', async () => {
    const real = new MockPlanReviewVerifier();
    const spy = spyVerifier((input) => real.verify(input));
    let written: string | null = null;
    const res = await runPlanReviewGate(
      ctx({ draft: WELL_FORMED_DRAFT, verifierPort: spy, onWrite: (json) => (written = json) }),
    );
    expect(res.outcome).toBe('pass');
    const sidecar = JSON.parse(written!);
    expect(sidecar.history[0].mockAbstained).toBe(true);
  });

  it('267-01/AC-1 [marker, GREEN regression] real provider (anthropic), clean pass: sidecar history[0].mockAbstained is absent — the marker must never fire for a real provider', async () => {
    const spy = spyVerifier(async () => ({ pass: true, findings: [], provider: 'anthropic', model: 'claude-x' }));
    let written: string | null = null;
    const res = await runPlanReviewGate(
      ctx({
        draft: WELL_FORMED_DRAFT,
        configProvider: 'anthropic',
        verifierPort: spy,
        onWrite: (json) => (written = json),
      }),
    );
    expect(res.outcome).toBe('pass');
    const sidecar = JSON.parse(written!);
    expect(sidecar.history[0].mockAbstained).toBeUndefined();
  });

  it('267-01/AC-1 [marker, GREEN regression] mock provider, a REAL finding (pass:false, reloop): sidecar history[0].mockAbstained is absent — a refusal is never relabeled abstained, mirroring registry.ts (dec-20260809-004)', async () => {
    const spy = spyVerifier(async () => ({
      pass: false,
      findings: [{ severity: 'high', message: 'scope creep' }],
      provider: 'mock',
    }));
    let written: string | null = null;
    const res = await runPlanReviewGate(
      ctx({ draft: WELL_FORMED_DRAFT, verifierPort: spy, onWrite: (json) => (written = json) }),
    );
    expect(res.outcome).toBe('refuse');
    const sidecar = JSON.parse(written!);
    expect(sidecar.history[0].mockAbstained).toBeUndefined();
  });
});
