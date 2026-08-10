import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { defaultConfig } from '@thomas-powers-jr/cadence-types';
import { doctorService } from '../../src/services/doctor.js';
import type { CommandIO } from '../../src/services/io.js';
import type { DoctorReport } from '../../src/doctor/model.js';

/**
 * T4 (phase 166, AC-4): `verification.coverageMode: 'assertion'` paired with
 * a detected project language that has no assertion-mode span-parsing
 * support yet is flagged by the `coverage-mode-language-support` check.
 * Phase 167 gave python/go/rust/php real support (checked against the live
 * coverage-profile registry, not a hardcoded language list), so an
 * unrecognized ('unknown') language is used here instead of python to keep
 * exercising the "no support" branch.
 *
 * The check itself now lives in `doctor/run.ts` (as `checkCoverageModeLanguageSupport`,
 * fully covered in `tests/doctor/run.test.ts`) so it surfaces from both the
 * CLI (`cadence doctor` -> `runDoctor` directly) and MCP (`doctorService` ->
 * `runDoctor`) call paths with zero duplication. This test only proves that
 * `doctorService` — the MCP seam — still surfaces the check by virtue of
 * calling `runDoctor`; it does not re-litigate the check's own logic.
 */

function captureIO(): { io: CommandIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

function findCheck(report: DoctorReport, name: string) {
  return report.checks.find((c) => c.name === name);
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('doctorService — coverage-mode language support (phase 166, AC-4)', () => {
  it('surfaces the coverage-mode-language-support check via runDoctor', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-lang-unknown' });
    expect(defaultConfig.verification.coverageMode).toBe('assertion'); // sanity: fixture starts in assertion mode
    // No package.json/pyproject.toml/go.mod/Cargo.toml/composer.json — detectProjectLanguage() → 'unknown'.

    const { io } = captureIO();
    const result = await doctorService(active.root, io);
    const report = result.data as DoctorReport;

    const check = findCheck(report, 'coverage-mode-language-support');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('warning');
    expect(check?.detail).toMatch(/coverageMode/);
    expect(check?.detail).toMatch(/assertion/);
    expect(check?.detail).toMatch(/unknown/);
    expect(check?.remediation).toMatch(/cadence config edit coverageMode/);
  });
});

/**
 * Phase 268 (AC-3): `conduction-drift-streak` going `indeterminate` must not
 * be counted as a "problem" in doctorService's summary line -- it means
 * "couldn't assess", not "found something wrong". It also must NOT be
 * silently folded into "all checks passed" -- that overclaim (caught by this
 * phase's whole-branch review, not the earlier per-task pass) is the exact
 * false-confidence defect dec-20260810-005 exists to close one layer down:
 * a summary line that says "all passed" when one check could not be
 * assessed is indistinguishable from a real clean pass. Forced by writing a
 * malformed SUMMARY.json under .cadence/phases/, which makes
 * computeConductionDriftStreak's whole result indeterminate by design.
 */
describe('doctorService — indeterminate is neither a problem nor a pass (phase 268, AC-3)', () => {
  it('268-01/AC-3: an indeterminate-only report is not counted in the problem tally, and is not claimed as "all passed"', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-indeterminate-not-a-problem' });
    const phaseDir = join(active.root, '.cadence', 'phases', '001-malformed');
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, '001-01-SUMMARY.json'), '{ not valid json', 'utf8');

    const { io, out } = captureIO();
    const result = await doctorService(active.root, io);
    const report = result.data as DoctorReport;

    const check = findCheck(report, 'conduction-drift-streak');
    expect(check?.severity).toBe('indeterminate');

    // The real problem/indeterminate tallies, computed independently of
    // doctorService's own logic, so this test would fail if a regression
    // re-counted indeterminate as a problem OR silently dropped it from the
    // summary line entirely.
    const realProblemCount = report.checks.filter(
      (c) => c.severity !== 'ok' && c.severity !== 'indeterminate',
    ).length;
    const realIndeterminateCount = report.checks.filter((c) => c.severity === 'indeterminate').length;
    expect(realIndeterminateCount).toBeGreaterThan(0);
    const summaryLine = out.find((line) => /problem\(s\)|checks passed|indeterminate/.test(line));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toBe(
      realProblemCount > 0
        ? `doctor: ${realProblemCount} problem(s) across ${report.checks.length} checks\n`
        : `doctor: ${report.checks.length - realIndeterminateCount} of ${report.checks.length} checks passed; ` +
          `${realIndeterminateCount} indeterminate (could not be assessed)\n`,
    );
    // Never the bare "all N checks passed" claim while an indeterminate
    // check is present -- that specific overclaim is what this test guards.
    expect(summaryLine).not.toBe(`doctor: all ${report.checks.length} checks passed\n`);
    expect(summaryLine).not.toContain(`${realProblemCount + 1} problem`);
  });
});
