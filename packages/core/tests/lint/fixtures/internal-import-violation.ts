/**
 * Phase 234 (T4) — deliberate boundary violation fixture.
 *
 * Reaches into `verify/verifier.js` (a kernel-internal verifier-family
 * module) for `VerifyResult` instead of importing it from the published
 * contract at `packages/core/src/contracts/index.ts` (Phase 234 T1). This is
 * the exact violation shape the `no-restricted-imports` zone in
 * `eslint.config.js` exists to catch — the pre-T3 shape of
 * `services/spec-approve.ts` imported verifier internals the same way.
 *
 * This file lives under `tests/`, not `src/`, so `pnpm lint` (which only
 * ever runs `eslint src`) never lints it directly.
 * `packages/core/tests/lint/boundary-rule.test.ts` lints its contents
 * programmatically, under a virtual `src/` path so the zone's `files` glob
 * matches, to prove the rule actually fires on this shape.
 */
import type { VerifyResult } from '../../../src/verify/verifier.js';

export function isFullyPassing(result: VerifyResult): boolean {
  return Object.values(result.verdicts).every((verdict) => verdict.pass);
}
