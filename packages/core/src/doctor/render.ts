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
 *
 * `indeterminate` (phase 268) is deliberately excluded from "problem" here —
 * it means the check couldn't assess the repo, not that it found something to
 * fix, so it must not displace real Next-step guidance or a healthy repo's
 * `cadence progress` pointer.
 */
export function doctorNextStep(report: DoctorReport): string {
  const firstProblem = report.checks.find(
    (c) => c.severity !== 'ok' && c.severity !== 'indeterminate',
  );
  if (firstProblem && firstProblem.remediation !== null) {
    return firstProblem.remediation;
  }
  return 'cadence progress';
}

/**
 * The three ways a `DoctorReport` can summarize (phase 268): some checks are
 * real problems (`warning`/`error`), or none are but at least one is
 * `indeterminate` (couldn't be assessed), or everything is genuinely `ok`.
 * `indeterminate` is never counted as a problem AND never folded into
 * `'clean'` — conflating the two was the false-confidence overclaim this
 * type exists to make structurally unrepresentable.
 */
export type DoctorSummary =
  | { kind: 'problems'; problemCount: number; total: number }
  | { kind: 'indeterminate'; indeterminateCount: number; total: number }
  | { kind: 'clean'; total: number };

/**
 * Single source of truth for `DoctorReport` summarization (phase 268) —
 * both `cadence doctor`'s human/JSON renderer (`cli/commands/doctor.ts`) and
 * the MCP `doctorService` seam (`services/doctor.ts`) call this rather than
 * each independently re-deriving the same problem/indeterminate tally, the
 * exact drift `host-toolkit` (phase 222) and M.3 (v1.56 handoff) exist to
 * prevent. Pure: takes only the report, degrades to nothing (an empty report
 * is `'clean', total: 0`), never throws.
 */
export function summarizeDoctorReport(report: DoctorReport): DoctorSummary {
  const problemCount = report.checks.filter(
    (c) => c.severity !== 'ok' && c.severity !== 'indeterminate',
  ).length;
  if (problemCount > 0) return { kind: 'problems', problemCount, total: report.checks.length };
  const indeterminateCount = report.checks.filter((c) => c.severity === 'indeterminate').length;
  if (indeterminateCount > 0) {
    return { kind: 'indeterminate', indeterminateCount, total: report.checks.length };
  }
  return { kind: 'clean', total: report.checks.length };
}

/**
 * The `cadence doctor` human/JSON-adjacent text form of a {@link DoctorSummary}
 * — period-terminated, no prefix (the CLI renderer prints it as its own
 * line). Pure and directly unit-testable with a synthetic `DoctorSummary`
 * (phase 268, round 3): `summarizeDoctorReport`'s tally being correct
 * doesn't guarantee this formatting step is — round 2's fix made the tally
 * itself test-guarded but left this string construction inline in
 * `cli/commands/doctor.ts`, still only reachable through a `tempRepo`
 * fixture that can never actually produce an `'indeterminate'`-kind summary
 * (it always carries pre-existing warnings). Extracting the formatting here
 * closes that gap the same way `summarizeDoctorReport` closed the tally gap.
 */
export function renderDoctorSummaryLine(summary: DoctorSummary): string {
  switch (summary.kind) {
    case 'problems':
      return `${summary.problemCount} problem(s) across ${summary.total} checks.`;
    case 'indeterminate':
      return (
        `${summary.total - summary.indeterminateCount} of ${summary.total} checks passed; ` +
        `${summary.indeterminateCount} indeterminate (could not be assessed).`
      );
    case 'clean':
      return `All ${summary.total} checks passed.`;
  }
}

/**
 * The MCP `doctorService` seam's text form of a {@link DoctorSummary} —
 * `doctor: `-prefixed, newline-terminated, no trailing period (an
 * independent existing convention from {@link renderDoctorSummaryLine}'s
 * CLI text, not something this phase introduced or unified — the two
 * genuinely differ byte-for-byte and AC-2 requires pre-existing output
 * stay that way). Pure and directly unit-testable, same rationale as
 * {@link renderDoctorSummaryLine}.
 */
export function renderDoctorServiceSummaryLine(summary: DoctorSummary): string {
  switch (summary.kind) {
    case 'problems':
      return `doctor: ${summary.problemCount} problem(s) across ${summary.total} checks\n`;
    case 'indeterminate':
      return (
        `doctor: ${summary.total - summary.indeterminateCount} of ${summary.total} checks passed; ` +
        `${summary.indeterminateCount} indeterminate (could not be assessed)\n`
      );
    case 'clean':
      return `doctor: all ${summary.total} checks passed\n`;
  }
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
