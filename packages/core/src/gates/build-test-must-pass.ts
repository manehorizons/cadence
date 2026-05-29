import type { GateImpl, GateResult } from './types.js';

/**
 * Build/test-must-pass gate (DESIGN.md §4.1 always-fire). Wired for real in
 * Phase 39.2: runs `config.verification.testCommand` via the injected runner
 * port and refuses on a non-zero exit, unless --allow-failing-build / --force.
 * When no testCommand is configured (`ran:false`), the gate cannot enforce and
 * passes *silently* — like any other gate that passes, it adds no output, so a
 * settle on an unconfigured repo stays bit-identical (AC-7). The subprocess is
 * reached only through `ctx.runner` — the gate never imports child_process.
 */
export const runBuildTestGate: GateImpl = async (ctx): Promise<GateResult> => {
  const res = await ctx.runner.test();
  if (!res.ran) {
    return { outcome: 'pass' };
  }
  if (!res.ok && !ctx.opts.allowFailingBuild && !ctx.opts.force) {
    ctx.io.err(`build-test-must-pass: ${res.command} exited ${res.exitCode}\n`);
    ctx.io.err(
      'settle run refused: the test suite must pass before settle. ' +
        'Pass --allow-failing-build to bypass, or --force to settle anyway.\n',
    );
    return { outcome: 'refuse' };
  }
  return { outcome: 'pass' };
};
