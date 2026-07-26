import { NO_TEST_COMMAND_NOTICE } from '@manehorizons/cadence-types';
import { isGateSealed } from './types.js';
import type { GateImpl, GateResult } from './types.js';

/**
 * Build/test-must-pass gate (DESIGN.md §4.1 always-fire). Wired for real in
 * Phase 39.2: runs `config.verification.testCommand` via the injected runner
 * port and refuses on a non-zero exit, unless --allow-failing-build / --force.
 * When no testCommand is configured (`ran:false`), the gate cannot enforce —
 * it still passes (Phase 139 keeps this a pass, not a refusal — a repo may
 * legitimately run tests outside cadence), but is no longer *silent*: it
 * writes the single-source-of-truth `NO_TEST_COMMAND_NOTICE` to stderr so the
 * gap is visible instead of hidden. The subprocess is reached only through
 * `ctx.runner` — the gate never imports child_process.
 *
 * Phase 141 (T6, AC-4/AC-5): when 'build-test-must-pass' is in
 * `config.gates.sealed` (`isGateSealed`), neither --allow-failing-build nor
 * --force can bypass a failing test run — the refusal message is a distinct
 * "sealed, cannot be bypassed" message naming `gates.sealed` instead of the
 * normal bypass hint. Unsealed behavior (AC-5) is byte-for-byte unchanged.
 *
 * Phase 226 (T3): when a failing run is genuinely let through (unsealed,
 * --allow-failing-build or --force set), the result now also carries
 * `flags.buildTestBypassed: true` — mirroring `test-coverage`'s
 * `coverageBypassed` — so the registry's gate-provenance collection can
 * report this as "skipped (bypassed)" instead of a misleading "ran". Not set
 * on a genuinely passing run or a sealed refusal.
 */
export const runBuildTestGate: GateImpl = async (ctx): Promise<GateResult> => {
  const res = await ctx.runner.test();
  if (!res.ran) {
    ctx.io.err(`build-test-must-pass: ${NO_TEST_COMMAND_NOTICE.message}\n`);
    return { outcome: 'pass', summaryPatch: { buildTestRan: false } };
  }
  const sealed = isGateSealed(ctx, 'build-test-must-pass');
  if (!res.ok && (sealed || (!ctx.opts.allowFailingBuild && !ctx.opts.force))) {
    ctx.io.err(`build-test-must-pass: ${res.command} exited ${res.exitCode}\n`);
    const reason = sealed
      ? 'settle run refused: the test suite must pass before settle. ' +
          'This gate is sealed (gates.sealed) and cannot be bypassed with ' +
          '--allow-failing-build or --force.'
      : 'settle run refused: the test suite must pass before settle. ' +
          'Pass --allow-failing-build to bypass, or --force to settle anyway.';
    ctx.io.err(`${reason}\n`);
    return { outcome: 'refuse', reason };
  }
  if (!res.ok) {
    // Reaching here with a failing run means the refusal above did NOT fire —
    // by that branch's condition, that only happens when unsealed AND a
    // bypass flag was set. A genuine bypass, not a passing run.
    return { outcome: 'pass', flags: { buildTestBypassed: true } };
  }
  return { outcome: 'pass' };
};
