import { presets, type CadenceConfig } from '@thomas-powers-jr/cadence-types';
import { derivePhaseTaskId } from '../phases/id.js';

/**
 * Pure fixtures for the `cadence demo` sandbox (phase 278). Kept separate
 * from the command shell so the draft, sources, and config are unit-testable
 * and the refuse-then-succeed narrative can never drift from the artifacts
 * it stages.
 *
 * The arc the demo stages: a task is marked DONE and `greet.mjs` exists, and
 * `greet.test.mjs` DOES reference AC-1 — but only by calling `greet()`
 * without asserting on the result (the GUTTED_TEST variant, modeled on this
 * repo's own `examples/demo-test-gutting/files/prorate.test.gutted.mjs`). In
 * `coverageMode: 'assertion'` a bare mention inside a non-asserting test
 * block does not qualify, so settle's `test-coverage` gate REFUSES, naming
 * AC-1 as "mentioned but not inside a recognized asserting test block".
 * Swapping in the HONEST_TEST variant — the same test with a real assertion
 * restored — makes `build-test-must-pass` execute `node --test` for real and
 * the loop close. Nothing here is demo-specific cheating: the verdict is
 * never hand-asserted and the coverage gate is never waved through.
 */

/** The sandbox demo phase coordinates (distinct from the tutorial's `00-demo`). */
export const DEMO_PHASE = '00-cli-demo';
export const DEMO_NUM = '01';
export const DEMO_ID = derivePhaseTaskId(DEMO_PHASE, DEMO_NUM); // 00-01

/** Implementation written at BUILD (before any test exists — stages the lie). */
export const IMPL_FILE = 'greet.mjs';
/** The test file path both the gutted and honest variants are staged under. */
export const TEST_FILE = 'greet.test.mjs';

/**
 * Sandbox config: `solo`'s gentle loop posture, but `profile: 'standard'` so
 * the `test-coverage` gate fires at the demo's `quick-fix` tier, plus a real
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
    coverageMode: 'assertion',
    // Phase 239: the sandbox stays on the bare (unqualified) coverage scheme
    // for the same reason the tutorial sandbox does — its walkthrough
    // fixture test carries a plain `AC-1` token, and the demo teaches the
    // loop rather than this repo's phase-numbering convention. A fresh
    // `cadence init` still writes 'phase-qualified' explicitly via its
    // verification overlay — defaultConfig itself holds 'bare'.
    coverageScheme: 'bare',
    testCommand: 'node --test',
    coverageProfiles: [],
  },
  // Phase 214 (tutorial precedent): the sandbox's evidenceFloor must match
  // what its own coverageMode can actually produce, or the evidence-floor
  // gate refuses for a reason unrelated to the walkthrough. Unlike the
  // tutorial (which runs coverageMode: 'mention' and had to LOWER solo's
  // default 'assertion' floor to 'mention'), this sandbox runs
  // coverageMode: 'assertion' — the SAME strength as solo's default floor —
  // so no override is needed: `deriveAcEvidence` can reach 'assertion' (or
  // 'executed', once `build-test-must-pass` runs the suite) once the honest
  // fixture is staged, which already meets solo's inherited floor. Kept
  // explicit (not omitted) so this reasoning stays visible next to the
  // config it justifies, matching the tutorial fixture's own precedent.
  gates: { ...presets.solo.gates },
};

/** `greet.mjs` — the genuine, minimal implementation. */
export const GREET_IMPL = `export const greet = (name) => \`Hello, \${name}!\`;\n`;

/**
 * `greet.test.mjs` — gutted variant (BUILD-time). References AC-1 and calls
 * `greet()`, but the assertion has been commented out — a plausible-looking
 * "was passing, now flaky, disabled for now" excuse, same shape as this
 * repo's own `examples/demo-test-gutting/files/prorate.test.gutted.mjs`. The
 * call executes (so `node --test` itself stays green), but the assertion-mode
 * coverage scan finds no qualifying span for AC-1 in this file — only a
 * mention inside a non-asserting test block.
 */
export const GUTTED_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greet } from './greet.mjs';

test('AC-1: greet(name) returns a friendly greeting', () => {
  // was: assert.equal(greet('Ada'), 'Hello, Ada!');
  // flaky on some locales? disabling assertion for now -- TODO revisit
  greet('Ada');
});
`;

/**
 * `greet.test.mjs` — honest variant (FIX-time). Same test, same AC-1
 * reference, with the real assertion restored. Both the AC-1 token (for the
 * coverage gate) and a passing assertion (for the build-test gate via
 * `node --test`) are required to close the loop honestly.
 */
export const HONEST_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greet } from './greet.mjs';

test('AC-1: greet(name) returns a friendly greeting', () => {
  assert.equal(greet('Ada'), 'Hello, Ada!');
});
`;

/**
 * Render the greet-based demo DRAFT — a coherent quick-fix phase with one
 * objective, one genuinely test-verifiable AC, and one task linked to it.
 * Pure: `(phase, num) → { id, content }`.
 */
export function renderGreetDraft(
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

# ${id} — Add a greet() helper

## Objective

Add a tiny pure function and prove it with a real test — so you can watch the
loop refuse a claim the state does not back, then accept it once a test does.

## Acceptance Criteria

### AC-1: greet(name) returns a friendly greeting
Given a name
When greet(name) is called
Then it returns a friendly greeting containing that name.

## Tasks

### T1: implement greet()
- files: \`${IMPL_FILE}\`
- action: export greet = (name) => \`Hello, \${name}!\`
- verify: a test calls greet and asserts the result
- done: AC-1

## Boundaries

- DO NOT rely on this demo phase outside \`cadence demo\`.
`;
  return { id, content };
}
