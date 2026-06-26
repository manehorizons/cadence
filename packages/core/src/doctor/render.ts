import type { DoctorReport } from './model.js';
import type { FixPlan, FixOutcome } from './fix.js';

/**
 * The single `Next:` step a `cadence doctor` run should hand the user (113 AC-2),
 * keeping doctor on the same guided rail as the other onboarding commands.
 *
 * Pure: when any check is non-ok, point at the FIRST problem's remediation (in
 * check order — an earlier error outranks a later warning); when everything is
 * ok, point at the loop's next action. Returns the command/sentence only; the
 * renderer prefixes `Next: `.
 */
export function doctorNextStep(report: DoctorReport): string {
  const firstProblem = report.checks.find((c) => c.severity !== 'ok');
  if (firstProblem && firstProblem.remediation !== null) {
    return firstProblem.remediation;
  }
  return 'cadence progress';
}

const KIND_TAG = { auto: 'auto', 'wire-host': 'wire-host', manual: 'manual' } as const;

/**
 * Render the planned fixes for a `--fix --dry-run` (writes nothing). Phase 131.
 */
export function renderFixPlan(plan: FixPlan): string {
  const lines: string[] = ['Fix plan (dry-run — nothing written):'];
  if (plan.actions.length === 0) {
    lines.push('  (no actionable findings)');
    return lines.join('\n') + '\n';
  }
  for (const a of plan.actions) {
    lines.push(`  [${KIND_TAG[a.kind]}] ${a.check}: ${a.title}`);
    if (a.kind === 'manual') lines.push(`      → ${a.detail}`);
  }
  if (plan.actions.some((a) => a.kind === 'wire-host')) {
    lines.push('');
    lines.push('  wire-host fixes need: cadence doctor --fix --wire-host');
  }
  return lines.join('\n') + '\n';
}

/** Render applied/failed/skipped outcomes after a `--fix` run. Phase 131. */
export function renderFixOutcomes(outcomes: FixOutcome[]): string {
  const lines: string[] = ['Fixes:'];
  if (outcomes.length === 0) {
    lines.push('  (nothing to fix)');
    return lines.join('\n') + '\n';
  }
  for (const o of outcomes) {
    const mark = o.status === 'applied' ? '✓' : o.status === 'failed' ? '✗' : '·';
    lines.push(`  ${mark} ${o.status.padEnd(7)} ${o.check}: ${o.message}`);
  }
  return lines.join('\n') + '\n';
}
