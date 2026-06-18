import type { DoctorReport } from './model.js';

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
