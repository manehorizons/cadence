import type { Command } from 'commander';
import { runDoctor } from '../../doctor/run.js';
import { doctorNextStep } from '../../doctor/render.js';
import type { DoctorCheck, DoctorReport } from '../../doctor/model.js';

function renderHuman(report: DoctorReport): string {
  const lines: string[] = ['cadence doctor', ''];
  const mark = (c: DoctorCheck): string =>
    c.severity === 'ok' ? '✓' : c.severity === 'warning' ? '!' : '✗';
  for (const c of report.checks) {
    lines.push(`  ${mark(c)} ${c.severity.padEnd(7)} ${c.name}: ${c.detail}`);
    if (c.remediation !== null) lines.push(`      → ${c.remediation}`);
  }
  const problems = report.checks.filter((c) => c.severity !== 'ok');
  lines.push('');
  lines.push(
    problems.length === 0
      ? `All ${report.checks.length} checks passed.`
      : `${problems.length} problem(s) across ${report.checks.length} checks.`,
  );
  lines.push('');
  lines.push(`Next: ${doctorNextStep(report)}`);
  return lines.join('\n') + '\n';
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose this project’s CADENCE setup and report problems')
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      try {
        const report = await runDoctor(process.cwd(), {
          nodeVersion: process.versions.node,
          platform: process.platform,
        });
        if (opts.json) {
          process.stdout.write(JSON.stringify(report) + '\n');
        } else {
          process.stdout.write(renderHuman(report));
        }
        // Exit non-zero iff an error-severity problem exists, so `doctor` is
        // usable as a CI gate. Warnings do not fail.
        process.exitCode = report.ok ? 0 : 1;
      } catch (err) {
        process.stderr.write(
          `doctor failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
