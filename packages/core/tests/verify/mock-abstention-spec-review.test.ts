import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyState } from '@thomas-powers-jr/cadence-types';
import type { Spec, UiSpec } from '@thomas-powers-jr/cadence-types';
import { MockSpecReviewVerifier } from '../../src/verify/spec-review.js';
import { MockUiSpecReviewVerifier } from '../../src/verify/ui-spec-review.js';
import { specApproveService } from '../../src/services/spec-approve.js';
import type { CommandIO } from '../../src/services/io.js';

/**
 * Phase 267 (267-01, T1 — corrected per dec-20260809-004/-005, supersedes
 * dec-20260809-003) — corpus-first adversarial fixtures for the spec-review
 * and ui-spec-review families. Both run through `services/spec-approve.ts`'s
 * `specApproveService` (NOT a `GateImpl`, and not dispatched via
 * `registry.ts`) — `resolveSpecReviewPort`/`resolveUiSpecReviewPort`
 * (`services/spec-approve-ports.ts`) pick the concrete verifier from config
 * exactly the way `selectCodeReviewVerifier` etc. do. Like `plan-review`
 * (`tests/gates/mock-abstention-plan-review.test.ts`), there is no
 * `GateProvenance`/`status` field to assert on here, and the returned
 * `CommandResult` (`{exitCode, data}`) and the `*-REVIEW.json` convergence
 * sidecar carry no abstention/skip marker of any kind today.
 *
 * CORRECTION (dec-20260809-005): dec-20260809-004 stated the abstention
 * mechanism only in terms of `registry.ts`'s `GateProvenance` derivation,
 * which spec-review/ui-spec-review never touch. dec-20260809-005 corrects
 * this: like plan-review, both families already persist `provider` via the
 * SAME shared primitive (`verify/converge.ts`'s `ConvergentReviewHistoryEntry`
 * + `runConvergentReview`'s `sidecarJson`, written to `*-SPEC-REVIEW.json`/
 * `*-UI-SPEC-REVIEW.json`) — T2 is directed to add the abstain marker to
 * that shared shape, not invent a per-family mechanism. This file still does
 * not guess at the exact field name T2 will land on. What IS assertable
 * without guessing: dispatch continues to happen under mock (dec-20260809-004's
 * "dispatches normally" bar), which is already true today — so these cases
 * are no longer red on their own; see the RED-block comment below.
 *
 * Cases 1/2 let `specApproveService` resolve its verifier normally (no
 * `ports` override, no `.cadence/config.json` — same as several existing
 * fixtures in `tests/services/spec-approve.test.ts`), so the resolution path
 * is the real, config-driven, defaulted-to-mock one production uses; `vi.spyOn`
 * on the concrete Mock*Verifier's own prototype method observes whether
 * dispatch happened without needing to intercept the factory. Case 3 injects
 * a fake real-provider port directly via `specApproveService`'s `ports`
 * parameter (a supported injection seam — see `resolveSpecReviewPort`'s
 * `injected ?? select...Verifier(...)` — importing that internal detail is
 * why this fixture is guess-free even though `VerifierPort` itself carries no
 * `name` field).
 */

const WELL_FORMED_SPEC = `---
phase: 267-mock-abstention
id: 267-01
status: PENDING
---

# 267-01 — demo

## Objective

Prove the mock-abstention fixture end to end.

## Acceptance Criteria

### AC-1: it works
Given a user has an active session
When they submit the form with all required fields
Then the record is persisted and a confirmation is shown

## Constraints

- host-agnostic

## Open Questions

- none
`;

/** Vacuous-but-structurally-valid — the spec-review analog of an empty diff
 *  (case 2): every field non-empty, nothing meaningfully reviewed.
 *  `MockSpecReviewVerifier`'s rule (`verify/spec-review.ts:45-86`) only
 *  checks non-empty trimmed text, so this passes exactly as cleanly as the
 *  well-formed spec above. */
const VACUOUS_SPEC = `---
phase: 267-mock-abstention
id: 267-01
status: PENDING
---

# 267-01 — demo

## Objective

x

## Acceptance Criteria

### AC-1: x
Given a
When b
Then c

## Constraints

- x

## Open Questions

- none
`;

const WELL_FORMED_UI_SPEC = `---
phase: 267-mock-abstention
id: 267-01
status: PENDING
---

# 267-01 — demo

## Components

### X
- new

#### Layout & Tokens
- spacing-4, 16px gutter

## Responsive & Interaction

- collapses to a single column below 768px; focus ring on all interactive elements
`;

/** Vacuous-but-structurally-valid UI-SPEC (case 2 analog): non-empty
 *  layoutTokens/responsiveInteraction bullets that say nothing. */
const VACUOUS_UI_SPEC = `---
phase: 267-mock-abstention
id: 267-01
status: PENDING
---

# 267-01 — demo

## Components

### X
- new

#### Layout & Tokens
- x

## Responsive & Interaction

- x
`;

function captureIO(): { io: CommandIO } {
  return { io: { out: () => {}, err: () => {} } };
}

async function mktemp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cadence-267-spec-review-'));
}

async function writeFixture(
  root: string,
  specBody: string,
  opts: { uiSpecBody?: string } = {},
): Promise<void> {
  const phaseDir = join(root, '.cadence', 'phases', '267-mock-abstention');
  await mkdir(phaseDir, { recursive: true });
  await writeFile(join(phaseDir, '267-01-SPEC.md'), specBody);
  if (opts.uiSpecBody) {
    await writeFile(join(phaseDir, '267-01-UI-SPEC.md'), opts.uiSpecBody);
  }
  await writeFile(
    join(root, '.cadence', 'state.json'),
    JSON.stringify({ ...emptyState('267-spec-review'), loopPosition: 'SPEC', activeSpec: '267-01' }, null, 2),
  );
}

let root: string | null = null;
afterEach(async () => {
  vi.restoreAllMocks();
  if (root) {
    await rm(root, { recursive: true, force: true }).catch(() => {});
    root = null;
  }
});

const WELL_FORMED_SPEC_INPUT: Spec = {
  schemaVersion: 1,
  id: '267-01',
  phase: '267-mock-abstention',
  objective: 'Prove the mock-abstention fixture end to end.',
  acceptanceCriteria: [
    {
      id: 'AC-1',
      name: 'it works',
      given: 'a user has an active session',
      when: 'they submit the form with all required fields',
      then: 'the record is persisted and a confirmation is shown',
    },
  ],
  constraints: ['host-agnostic'],
  openQuestions: [],
  status: 'PENDING',
};

const VACUOUS_SPEC_INPUT: Spec = {
  ...WELL_FORMED_SPEC_INPUT,
  objective: 'x',
  acceptanceCriteria: [{ id: 'AC-1', name: 'x', given: 'a', when: 'b', then: 'c' }],
  constraints: ['x'],
};

const WELL_FORMED_UI_SPEC_INPUT: UiSpec = {
  schemaVersion: 1,
  id: '267-01',
  phase: '267-mock-abstention',
  components: [
    { name: 'X', detail: ['new'], layoutTokens: ['spacing-4, 16px gutter'], precedent: [] },
  ],
  responsiveInteraction: ['collapses to a single column below 768px'],
  status: 'PENDING',
};

const VACUOUS_UI_SPEC_INPUT: UiSpec = {
  ...WELL_FORMED_UI_SPEC_INPUT,
  components: [{ name: 'X', detail: ['new'], layoutTokens: ['x'], precedent: [] }],
  responsiveInteraction: ['x'],
};

describe('Phase 267 — MockSpecReviewVerifier / MockUiSpecReviewVerifier current behavior (documents the bug T2 fixes)', () => {
  // verify/spec-review.ts and verify/ui-spec-review.ts are OUT OF SCOPE for
  // T2 — these four pins stay green forever.
  it('spec-review case 1: a well-formed spec passes cleanly today', async () => {
    const result = await new MockSpecReviewVerifier().verify({ spec: WELL_FORMED_SPEC_INPUT });
    expect(result).toEqual({ pass: true, findings: [], provider: 'mock' });
  });

  it('spec-review case 2: a vacuous-but-structurally-valid spec ALSO passes cleanly today', async () => {
    const result = await new MockSpecReviewVerifier().verify({ spec: VACUOUS_SPEC_INPUT });
    expect(result).toEqual({ pass: true, findings: [], provider: 'mock' });
  });

  it('ui-spec-review case 1: a well-formed UI-SPEC passes cleanly today', async () => {
    const result = await new MockUiSpecReviewVerifier().verify({ uiSpec: WELL_FORMED_UI_SPEC_INPUT });
    expect(result).toEqual({ pass: true, findings: [], provider: 'mock' });
  });

  it('ui-spec-review case 2: a vacuous-but-structurally-valid UI-SPEC ALSO passes cleanly today', async () => {
    const result = await new MockUiSpecReviewVerifier().verify({ uiSpec: VACUOUS_UI_SPEC_INPUT });
    expect(result).toEqual({ pass: true, findings: [], provider: 'mock' });
  });
});

describe('Phase 267 AC-1 — spec-review dispatch under mock (abstention-record mechanism RESOLVED by T2: converge.ts shared sidecar, mockAbstained field — see new describe block below for the assertions)', () => {
  // dec-20260809-004 corrects AC-1's bar to "dispatch happens normally,
  // abstention is recorded elsewhere" — but spec-review has no `registry.ts`
  // involvement and no other known recording surface (see docstring above).
  // These cases now assert ONLY that dispatch continues (already true
  // today — NOT a red assertion) rather than fabricate a status/skip
  // assertion. Not tagged `267-01/AC-1` — dispatch-continuity alone does not
  // evidence AC-1's abstention-recording claim.
  it('[case 1] well-formed SPEC, defaulted mock (no config.json at all): verify() dispatches normally (unchanged)', async () => {
    root = await mktemp();
    await writeFixture(root, WELL_FORMED_SPEC);
    const spy = vi.spyOn(MockSpecReviewVerifier.prototype, 'verify');
    const { io } = captureIO();
    const res = await specApproveService(root, { phase: '267-mock-abstention', num: '01' }, io);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.exitCode).toBe(0);
  });

  it('[case 2] vacuous-but-valid SPEC, defaulted mock: verify() dispatches normally (unchanged)', async () => {
    root = await mktemp();
    await writeFixture(root, VACUOUS_SPEC);
    const spy = vi.spyOn(MockSpecReviewVerifier.prototype, 'verify');
    const { io } = captureIO();
    const res = await specApproveService(root, { phase: '267-mock-abstention', num: '01' }, io);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.exitCode).toBe(0);
  });

  it('[GREEN regression, case 3] real provider (anthropic), injected directly via the ports seam: verify() must still be dispatched', async () => {
    root = await mktemp();
    await writeFixture(root, WELL_FORMED_SPEC);
    let calls = 0;
    const { io } = captureIO();
    const res = await specApproveService(root, { phase: '267-mock-abstention', num: '01' }, io, {
      specReview: {
        verify: async () => {
          calls += 1;
          return { pass: true, findings: [], provider: 'anthropic', model: 'claude-x' };
        },
      },
    });
    expect(calls).toBe(1);
    expect(res.exitCode).toBe(0);
  });
});

describe('Phase 267 AC-1 — ui-spec-review dispatch under mock (abstention-record mechanism RESOLVED by T2: converge.ts shared sidecar, mockAbstained field — see new describe block below for the assertions)', () => {
  // Same open-question status as spec-review above and plan-review
  // (tests/gates/mock-abstention-plan-review.test.ts) — no known recording
  // surface, so only dispatch-continuity is asserted. Not tagged
  // `267-01/AC-1`.
  it('[case 1] well-formed UI-SPEC, defaulted mock: verify() dispatches normally (unchanged)', async () => {
    root = await mktemp();
    await writeFixture(root, WELL_FORMED_SPEC, { uiSpecBody: WELL_FORMED_UI_SPEC });
    const uiSpy = vi.spyOn(MockUiSpecReviewVerifier.prototype, 'verify');
    const { io } = captureIO();
    // spec-review itself also resolves to mock in this same run — its own
    // dispatch is covered by the describe block above; this block asserts
    // ui-spec-review's dispatch independently of whatever spec-review ends
    // up doing, using the real MockUiSpecReviewVerifier prototype spy.
    const res = await specApproveService(root, { phase: '267-mock-abstention', num: '01' }, io);
    expect(uiSpy).toHaveBeenCalledTimes(1);
    expect(res.exitCode).toBe(0);
  });

  it('[case 2] vacuous-but-valid UI-SPEC, defaulted mock: verify() dispatches normally (unchanged)', async () => {
    root = await mktemp();
    await writeFixture(root, WELL_FORMED_SPEC, { uiSpecBody: VACUOUS_UI_SPEC });
    const uiSpy = vi.spyOn(MockUiSpecReviewVerifier.prototype, 'verify');
    const { io } = captureIO();
    const res = await specApproveService(root, { phase: '267-mock-abstention', num: '01' }, io);
    expect(uiSpy).toHaveBeenCalledTimes(1);
    expect(res.exitCode).toBe(0);
  });

  it('[GREEN regression, case 3] real provider (anthropic), injected directly via the ports seam: verify() must still be dispatched', async () => {
    root = await mktemp();
    await writeFixture(root, WELL_FORMED_SPEC, { uiSpecBody: WELL_FORMED_UI_SPEC });
    let calls = 0;
    const { io } = captureIO();
    const res = await specApproveService(root, { phase: '267-mock-abstention', num: '01' }, io, {
      uiSpecReview: {
        verify: async () => {
          calls += 1;
          return { pass: true, findings: [], provider: 'anthropic', model: 'claude-x' };
        },
      },
    });
    expect(calls).toBe(1);
    expect(res.exitCode).toBe(0);
  });
});

/**
 * Phase 267 (267-01, T2, dec-20260809-005) — the RESOLVED recording surface:
 * spec-review/ui-spec-review's abstain marker is `mockAbstained: true` on the
 * history entry `runConvergentReview` appends to `*-SPEC-REVIEW.json`/
 * `*-UI-SPEC-REVIEW.json` (see `verify/converge.ts`'s
 * `ConvergentReviewHistoryEntry.mockAbstained` and `services/spec-approve.ts`'s
 * `mockAbstained = res.provider === 'mock' && res.pass === true` computation
 * at both call sites). These describe blocks supersede the "marker shape TBD
 * by T2" blocks above with concrete, guess-free assertions on the real
 * on-disk sidecar, tagged `267-01/AC-1` since they are real coverage
 * evidence for these two families' abstention-recording half of AC-1.
 */
async function readSidecar(root: string, name: string): Promise<Record<string, unknown>> {
  const raw = await readFile(
    join(root, '.cadence', 'phases', '267-mock-abstention', name),
    'utf8',
  );
  return JSON.parse(raw);
}

describe('Phase 267 AC-1 — spec-review: mock-identified clean pass is marked mockAbstained:true on the persisted sidecar history entry', () => {
  it('267-01/AC-1 [marker] well-formed SPEC, defaulted mock, clean pass: 267-01-SPEC-REVIEW.json history[0].mockAbstained is true', async () => {
    root = await mktemp();
    await writeFixture(root, WELL_FORMED_SPEC);
    const { io } = captureIO();
    const res = await specApproveService(root, { phase: '267-mock-abstention', num: '01' }, io);
    expect(res.exitCode).toBe(0);
    const sidecar = await readSidecar(root, '267-01-SPEC-REVIEW.json');
    const history = sidecar.history as Array<Record<string, unknown>>;
    expect(history[0]!.mockAbstained).toBe(true);
  });

  it('267-01/AC-1 [marker, GREEN regression] real provider (anthropic), injected via the ports seam, clean pass: history[0].mockAbstained is absent — the marker must never fire for a real provider', async () => {
    root = await mktemp();
    await writeFixture(root, WELL_FORMED_SPEC);
    const { io } = captureIO();
    const res = await specApproveService(root, { phase: '267-mock-abstention', num: '01' }, io, {
      specReview: {
        verify: async () => ({ pass: true, findings: [], provider: 'anthropic', model: 'claude-x' }),
      },
    });
    expect(res.exitCode).toBe(0);
    const sidecar = await readSidecar(root, '267-01-SPEC-REVIEW.json');
    const history = sidecar.history as Array<Record<string, unknown>>;
    expect(history[0]!.mockAbstained).toBeUndefined();
  });

  it('267-01/AC-1 [marker, GREEN regression] mock-identified REAL finding (pass:false), injected via the ports seam: history[0].mockAbstained is absent — a refusal is never relabeled abstained, mirroring registry.ts (dec-20260809-004)', async () => {
    root = await mktemp();
    await writeFixture(root, WELL_FORMED_SPEC);
    const { io } = captureIO();
    const res = await specApproveService(
      root,
      { phase: '267-mock-abstention', num: '01', allowSpecReviewFailure: true },
      io,
      {
        specReview: {
          verify: async () => ({
            pass: false,
            findings: [{ severity: 'high', message: 'spec has an empty objective' }],
            provider: 'mock',
          }),
        },
      },
    );
    expect(res.exitCode).toBe(0);
    const sidecar = await readSidecar(root, '267-01-SPEC-REVIEW.json');
    const history = sidecar.history as Array<Record<string, unknown>>;
    expect(history[0]!.mockAbstained).toBeUndefined();
  });
});

describe('Phase 267 AC-1 — ui-spec-review: mock-identified clean pass is marked mockAbstained:true on the persisted sidecar history entry', () => {
  it('267-01/AC-1 [marker] well-formed UI-SPEC, defaulted mock, clean pass: 267-01-UI-SPEC-REVIEW.json history[0].mockAbstained is true', async () => {
    root = await mktemp();
    await writeFixture(root, WELL_FORMED_SPEC, { uiSpecBody: WELL_FORMED_UI_SPEC });
    const { io } = captureIO();
    const res = await specApproveService(root, { phase: '267-mock-abstention', num: '01' }, io);
    expect(res.exitCode).toBe(0);
    const sidecar = await readSidecar(root, '267-01-UI-SPEC-REVIEW.json');
    const history = sidecar.history as Array<Record<string, unknown>>;
    expect(history[0]!.mockAbstained).toBe(true);
  });

  it('267-01/AC-1 [marker, GREEN regression] real provider (anthropic), injected via the ports seam, clean pass: history[0].mockAbstained is absent', async () => {
    root = await mktemp();
    await writeFixture(root, WELL_FORMED_SPEC, { uiSpecBody: WELL_FORMED_UI_SPEC });
    const { io } = captureIO();
    const res = await specApproveService(root, { phase: '267-mock-abstention', num: '01' }, io, {
      uiSpecReview: {
        verify: async () => ({ pass: true, findings: [], provider: 'anthropic', model: 'claude-x' }),
      },
    });
    expect(res.exitCode).toBe(0);
    const sidecar = await readSidecar(root, '267-01-UI-SPEC-REVIEW.json');
    const history = sidecar.history as Array<Record<string, unknown>>;
    expect(history[0]!.mockAbstained).toBeUndefined();
  });

  it('267-01/AC-1 [marker, GREEN regression] mock-identified REAL finding (pass:false), injected via the ports seam: history[0].mockAbstained is absent — a refusal is never relabeled abstained', async () => {
    root = await mktemp();
    await writeFixture(root, WELL_FORMED_SPEC, { uiSpecBody: WELL_FORMED_UI_SPEC });
    const { io } = captureIO();
    const res = await specApproveService(
      root,
      { phase: '267-mock-abstention', num: '01', allowUiSpecReviewFailure: true },
      io,
      {
        uiSpecReview: {
          verify: async () => ({
            pass: false,
            findings: [{ severity: 'high', message: 'no responsive/interaction notes' }],
            provider: 'mock',
          }),
        },
      },
    );
    expect(res.exitCode).toBe(0);
    const sidecar = await readSidecar(root, '267-01-UI-SPEC-REVIEW.json');
    const history = sidecar.history as Array<Record<string, unknown>>;
    expect(history[0]!.mockAbstained).toBeUndefined();
  });
});
