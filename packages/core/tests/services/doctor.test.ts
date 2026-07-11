import { describe, it, expect, afterEach } from 'vitest';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { defaultConfig } from '@manehorizons/cadence-types';
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
