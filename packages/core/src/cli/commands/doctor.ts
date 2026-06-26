import type { Command } from 'commander';
import { runDoctor } from '../../doctor/run.js';
import {
  doctorNextStep,
  renderFixPlan,
  renderFixOutcomes,
} from '../../doctor/render.js';
import { planFixes, applyFixes } from '../../doctor/fix.js';
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
    .option('--fix', 'apply safe, deterministic repairs for fixable findings')
    .option(
      '--wire-host',
      'with --fix, also re-run the Claude Code host install for host findings',
    )
    .option('--dry-run', 'with --fix, print the repair plan without writing anything')
    .action(
      async (opts: {
        json?: boolean;
        fix?: boolean;
        wireHost?: boolean;
        dryRun?: boolean;
      }) => {
        const cwd = process.cwd();
        const env = {
          nodeVersion: process.versions.node,
          platform: process.platform,
        };
        try {
          // --wire-host / --dry-run only mean something alongside --fix.
          if (!opts.fix && (opts.wireHost || opts.dryRun)) {
            process.stderr.write(
              'note: --wire-host/--dry-run are ignored without --fix.\n',
            );
          }

          const report = await runDoctor(cwd, env);

          if (!opts.fix) {
            process.stdout.write(
              opts.json ? JSON.stringify(report) + '\n' : renderHuman(report),
            );
            process.exitCode = report.ok ? 0 : 1;
            return;
          }

          const fixPlan = planFixes(report);

          if (opts.dryRun) {
            // Preview only — nothing is written. Exit reflects the current report.
            if (opts.json) {
              process.stdout.write(JSON.stringify({ report, fixPlan }) + '\n');
            } else {
              process.stdout.write(renderHuman(report));
              process.stdout.write('\n' + renderFixPlan(fixPlan));
            }
            process.exitCode = report.ok ? 0 : 1;
            return;
          }

          const fixesApplied = await applyFixes(cwd, fixPlan, {
            wireHost: !!opts.wireHost,
          });
          const postFixReport = await runDoctor(cwd, env);

          if (opts.json) {
            process.stdout.write(
              JSON.stringify({ report, fixPlan, fixesApplied, postFixReport }) + '\n',
            );
          } else {
            process.stdout.write(renderFixOutcomes(fixesApplied));
            process.stdout.write('\n' + renderHuman(postFixReport));
          }
          // Exit reflects the post-fix state.
          process.exitCode = postFixReport.ok ? 0 : 1;
        } catch (err) {
          process.stderr.write(
            `doctor failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      },
    );
}
