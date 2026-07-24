import { presets, type CadenceConfig } from '@manehorizons/cadence-types';
import { derivePhaseTaskId } from '../phases/id.js';

/**
 * Pure fixtures for the `cadence tutorial` sandbox (phase 129). Kept separate
 * from the command shell so the draft, sources, and config are unit-testable
 * and the walkthrough can never drift from the artifacts it stages.
 *
 * The arc the tutorial stages: a task is marked DONE and `sum.mjs` exists, but
 * no test references AC-1 — so settle's `test-coverage` gate REFUSES, naming
 * AC-1. Adding the real `sum.test.mjs` makes `build-test-must-pass` execute
 * `node --test` for real and the loop close. Nothing here is tutorial-specific
 * cheating: the verdict is never hand-asserted and the coverage gate is never
 * waved through.
 */

/** The sandbox demo phase coordinates (matches the historical 00-01 id). */
export const DEMO_PHASE = '00-demo';
export const DEMO_NUM = '01';
export const DEMO_ID = derivePhaseTaskId(DEMO_PHASE, DEMO_NUM); // 00-01

/** Implementation written at BUILD (before any test exists — stages the lie). */
export const IMPL_FILE = 'sum.mjs';
/** The real test written at FIX (references AC-1 and genuinely runs). */
export const TEST_FILE = 'sum.test.mjs';

/**
 * Sandbox config: `solo`'s gentle loop posture, but `profile: 'standard'` so the
 * `test-coverage` gate fires at the demo's `quick-fix` tier, plus a real
 * offline `testCommand` so `build-test-must-pass` actually executes the test.
 * `testGlobs` is `**\/*.test.mjs` to match the root-level sandbox test. The
 * walkthrough never hand-asserts a verdict and never waves the coverage gate
 * through — the gates decide on real state alone.
 */
export const SANDBOX_CONFIG: CadenceConfig = {
  ...presets.solo,
  profile: 'standard',
  verification: {
    testGlobs: ['**/*.test.mjs'],
    coverageMode: 'mention',
    testCommand: 'node --test',
    coverageProfiles: [],
  },
  // Phase 214: solo's evidenceFloor default is 'assertion', but this sandbox
  // deliberately runs coverageMode: 'mention' (a real AC-1 reference, not the
  // assertion-mode span check) — deriveAcEvidence can never report better
  // than 'mention' evidence here. Override the floor to match the sandbox's
  // own intentional coverage mode so the tutorial's real gates (test-coverage,
  // build-test-must-pass) stay the ones doing the refusing, not a floor
  // mismatch unrelated to the walkthrough.
  gates: { ...presets.solo.gates, evidenceFloor: 'mention' },
};

/** `sum.mjs` — the genuine, minimal implementation. */
export const SUM_IMPL = `export const sum = (a, b) => a + b;\n`;

/**
 * `sum.test.mjs` — a real `node:test` that references AC-1 and asserts the sum.
 * Both the AC-1 token (for the coverage gate) and a passing assertion (for the
 * build-test gate via `node --test`) are required to close the loop honestly.
 */
export const SUM_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sum } from './sum.mjs';

test('AC-1: sum(a, b) returns a + b', () => {
  assert.equal(sum(2, 3), 5);
  assert.equal(sum(-1, 1), 0);
});
`;

/**
 * Render the sum-based demo DRAFT — a coherent quick-fix phase with one
 * objective, one genuinely test-verifiable AC, and one task linked to it.
 * Pure: `(phase, num) → { id, content }`.
 */
export function renderSumDraft(
  phase: string = DEMO_PHASE,
  num: string = DEMO_NUM,
): { id: string; content: string } {
  const id = derivePhaseTaskId(phase, num);
  const content = `---
phase: ${phase}
id: ${id}
tier: quick-fix
status: PENDING
---

# ${id} — Add a sum() helper

## Objective

Add a tiny pure function and prove it with a real test — so you can watch the
loop refuse a claim the state does not back, then accept it once a test does.

## Acceptance Criteria

### AC-1: sum(a, b) returns a + b
Given two numbers a and b
When sum(a, b) is called
Then it returns their arithmetic sum.

## Tasks

### T1: implement sum()
- files: \`${IMPL_FILE}\`
- action: export sum = (a, b) => a + b
- verify: a test calls sum and asserts the result
- done: AC-1

## Boundaries

- DO NOT rely on this demo phase outside the tutorial.
`;
  return { id, content };
}
