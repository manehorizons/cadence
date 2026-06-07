import { runDoctor } from '../doctor/run.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence doctor` as a service seam (phase 76) — read-only MCP adapter over
 * the shared `runDoctor` core. `data` is the full `DoctorReport`; exit code is
 * non-zero iff an error-severity check failed (warnings do not fail).
 */
export async function doctorService(repoRoot: string, io: CommandIO): Promise<CommandResult> {
  try {
    const report = await runDoctor(repoRoot, {
      nodeVersion: process.versions.node,
      platform: process.platform,
    });
    const problems = report.checks.filter((c) => c.severity !== 'ok').length;
    io.out(
      problems === 0
        ? `doctor: all ${report.checks.length} checks passed\n`
        : `doctor: ${problems} problem(s) across ${report.checks.length} checks\n`,
    );
    return { exitCode: report.ok ? 0 : 1, data: report };
  } catch (err) {
    io.err(`doctor failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
