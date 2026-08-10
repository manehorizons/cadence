import { runDoctor } from '../doctor/run.js';
import { summarizeDoctorReport, renderDoctorServiceSummaryLine } from '../doctor/render.js';
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
    // Shared with `cli/commands/doctor.ts` (`summarizeDoctorReport` +
    // `renderDoctorServiceSummaryLine`, phase 268) -- single source of truth
    // for both the tally and its text, so this MCP seam and the CLI renderer
    // can't drift.
    io.out(renderDoctorServiceSummaryLine(summarizeDoctorReport(report)));
    return { exitCode: report.ok ? 0 : 1, data: report };
  } catch (err) {
    io.err(`doctor failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
