import { execSync } from 'node:child_process';
import type { TestRunResult } from '../gates/types.js';

/**
 * Runs the configured `verification.testCommand` and reports the outcome as
 * a `TestRunResult`. Extracted from settle.ts's formerly-inline
 * `runner.test` collaborator (Phase 39.2's build-test-must-pass gate) so
 * `cadence verify phase` can reuse the same subprocess-spawn logic without
 * duplicating it.
 */
export async function runTestCommand(
  cwd: string,
  command: string | undefined,
): Promise<TestRunResult> {
  if (!command) return { ran: false, ok: true };
  try {
    execSync(command, { cwd, stdio: 'ignore' });
    return { ran: true, ok: true, exitCode: 0, command };
  } catch (e) {
    const status = (e as { status?: number }).status;
    const exitCode = typeof status === 'number' ? status : 1;
    return { ran: true, ok: false, exitCode, command };
  }
}
