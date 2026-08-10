import type { Command } from 'commander';
import { runDoctor } from '../../doctor/run.js';
import {
  doctorNextStep,
  renderFixPlan,
  renderFixOutcomes,
  renderDoctorSummaryLine,
  summarizeDoctorReport,
} from '../../doctor/render.js';
import { planFixes, applyFixes } from '../../doctor/fix.js';
import type { DoctorReport, DoctorSeverity } from '../../doctor/model.js';

/**
 * One glyph per `DoctorSeverity` rung, exhaustive over the type (not a
 * fallthrough default) so a future rung fails typecheck here instead of
 * silently inheriting another rung's mark. `indeterminate` (phase 268) gets
 * its own glyph — distinct from `error`'s `✗` — since it means "couldn't
 * assess", not "found a problem". Exported for direct unit coverage.
 */
export function severityMark(severity: DoctorSeverity): string {
  switch (severity) {
    case 'ok':
      return '✓';
    case 'warning':
      return '!';
    case 'error':
      return '✗';
    case 'indeterminate':
      return '?';
    default: {
      const _exhaustive: never = severity;
      return _exhaustive;
    }
  }
}

function renderHuman(report: DoctorReport): string {
  const lines: string[] = ['cadence doctor', ''];
  // Column width: 7 (== 'warning'.length) unless a wider severity is
  // actually present, so pre-existing output is byte-for-byte unchanged in
  // every repo that never encounters `indeterminate` (phase 268, AC-2).
  const severityWidth = Math.max(7, ...report.checks.map((c) => c.severity.length));
  for (const c of report.checks) {
    lines.push(`  ${severityMark(c.severity)} ${c.severity.padEnd(severityWidth)} ${c.name}: ${c.detail}`);
    if (c.remediation !== null) lines.push(`      → ${c.remediation}`);
  }
  // Shared with `services/doctor.ts` (`summarizeDoctorReport` +
  // `renderDoctorSummaryLine`, phase 268) -- single source of truth for both
  // the tally and its text, so this renderer and the MCP seam can't drift.
  lines.push('');
  lines.push(renderDoctorSummaryLine(summarizeDoctorReport(report)));
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
      'with --fix, also re-run host installs for host findings',
    )
    .option('--dry-run', 'with --fix, print the repair plan without writing anything')
    .option(
      '--resolve-state-conflict <side>',
      "resolve an unresolved state.json git conflict: 'local' or 'incoming' (requires --fix)",
    )
    .action(
      async (opts: {
        json?: boolean;
        fix?: boolean;
        wireHost?: boolean;
        dryRun?: boolean;
        resolveStateConflict?: string;
      }) => {
        const cwd = process.cwd();
        const env = {
          nodeVersion: process.versions.node,
          platform: process.platform,
        };
        try {
          // --resolve-state-conflict is a hard validation error (not a silent
          // no-op like --wire-host/--dry-run without --fix): acting on a
          // stale/wrong side would be actively harmful, so refuse loudly
          // rather than ignore it.
          let resolveStateConflictSide: 'local' | 'incoming' | undefined;
          if (opts.resolveStateConflict !== undefined) {
            if (!opts.fix) {
              process.stderr.write(
                '--resolve-state-conflict requires --fix (e.g. `cadence doctor --fix --resolve-state-conflict=local`).\n',
              );
              process.exitCode = 1;
              return;
            }
            if (opts.resolveStateConflict !== 'local' && opts.resolveStateConflict !== 'incoming') {
              process.stderr.write(
                `--resolve-state-conflict must be 'local' or 'incoming' (got '${opts.resolveStateConflict}').\n`,
              );
              process.exitCode = 1;
              return;
            }
            resolveStateConflictSide = opts.resolveStateConflict;
          }

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
            ...(resolveStateConflictSide !== undefined
              ? { resolveStateConflict: resolveStateConflictSide }
              : {}),
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
