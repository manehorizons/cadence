import { describe, it, expect } from 'vitest';
import {
  doctorNextStep,
  summarizeDoctorReport,
  renderDoctorSummaryLine,
  renderDoctorServiceSummaryLine,
} from '../../src/doctor/render.js';
import { pass, fail, rollup } from '../../src/doctor/model.js';

describe('doctorNextStep (113 AC-2)', () => {
  // AC-2: all checks ok → the Next: line points at the loop's next action.
  it('points at cadence progress when everything is ok', () => {
    const report = rollup([pass('node', 'fine'), pass('state', 'fine')]);
    expect(doctorNextStep(report)).toBe('cadence progress');
  });

  // AC-2: a warning → Next: points at the FIRST problem's remediation.
  it('points at the first problem remediation when a check warns', () => {
    const report = rollup([
      pass('node', 'fine'),
      fail('verification-readiness', 'warning', 'mock', 'Run `cadence activate` to turn on real verification.'),
      fail('handoff-retention', 'warning', 'lots', 'Set handoff.retain.'),
    ]);
    expect(doctorNextStep(report)).toBe('Run `cadence activate` to turn on real verification.');
  });

  // AC-2: an error outranks a later warning — first non-ok in order wins.
  it('uses the first non-ok check in order (error or warning, whichever is first)', () => {
    const report = rollup([
      fail('initialized', 'error', 'broken', 'Run `cadence init`.'),
      fail('verification-readiness', 'warning', 'mock', 'Run `cadence activate`.'),
    ]);
    expect(doctorNextStep(report)).toBe('Run `cadence init`.');
  });

  // Phase 268, T4 fix-up: `indeterminate` means "couldn't assess", not "found
  // a problem" -- it must not displace a healthy repo's `cadence progress`
  // pointer, nor a later real problem's remediation.
  it("268-01/AC-3: an indeterminate-only report still points at cadence progress -- indeterminate is not a 'problem'", () => {
    const report = rollup([
      pass('node', 'fine'),
      fail('conduction-drift-streak', 'indeterminate', 'not enough data', 'Informational only.'),
    ]);
    expect(doctorNextStep(report)).toBe('cadence progress');
  });

  it('268-01/AC-3: a later real warning still surfaces even when an earlier check is indeterminate', () => {
    const report = rollup([
      fail('conduction-drift-streak', 'indeterminate', 'not enough data', 'Informational only.'),
      fail('verification-readiness', 'warning', 'mock', 'Run `cadence activate`.'),
    ]);
    expect(doctorNextStep(report)).toBe('Run `cadence activate`.');
  });
});

/**
 * Phase 268, whole-branch-review fix-up: `summarizeDoctorReport` is the
 * single source of truth both `cli/commands/doctor.ts` and
 * `services/doctor.ts` derive their summary line from. Direct unit coverage
 * here (via `rollup()`/`pass()`/`fail()` synthetic reports, no `tempRepo`
 * fixture) is deliberate -- an earlier fix-up round added CLI/service tests
 * driven through a real `tempRepo({initialized:true})` fixture, which
 * always carries 3 pre-existing warnings (verification-readiness,
 * coverage-mode-language-support, conduction-reachability). That fixture
 * can never produce a "zero problems, N indeterminate" report, so those
 * tests could never exercise the `'indeterminate'` branch -- confirmed by a
 * subsequent independent review that deleting the branch entirely still
 * left the full suite green. Testing the pure function directly closes that
 * gap at its root instead of hunting for a fixture shape that happens to
 * produce the right report.
 */
describe('summarizeDoctorReport (phase 268, AC-3)', () => {
  it("268-01/AC-3: zero problems, zero indeterminate -> 'clean'", () => {
    const report = rollup([pass('node', 'fine'), pass('state', 'fine')]);
    expect(summarizeDoctorReport(report)).toEqual({ kind: 'clean', total: 2 });
  });

  it("268-01/AC-3: zero problems, one indeterminate -> 'indeterminate', never folded into 'clean'", () => {
    const report = rollup([
      pass('node', 'fine'),
      pass('state', 'fine'),
      fail('conduction-drift-streak', 'indeterminate', 'not enough data', 'Informational only.'),
    ]);
    expect(summarizeDoctorReport(report)).toEqual({ kind: 'indeterminate', indeterminateCount: 1, total: 3 });
  });

  it("268-01/AC-3: problems present, zero indeterminate -> 'problems', indeterminate count irrelevant", () => {
    const report = rollup([
      fail('verification-readiness', 'warning', 'mock', 'Run `cadence activate`.'),
      pass('node', 'fine'),
    ]);
    expect(summarizeDoctorReport(report)).toEqual({ kind: 'problems', problemCount: 1, total: 2 });
  });

  it("268-01/AC-3: problems AND indeterminate both present -> 'problems' wins, indeterminate never masked as clean", () => {
    const report = rollup([
      fail('verification-readiness', 'warning', 'mock', 'Run `cadence activate`.'),
      fail('conduction-drift-streak', 'indeterminate', 'not enough data', 'Informational only.'),
      pass('node', 'fine'),
    ]);
    expect(summarizeDoctorReport(report)).toEqual({ kind: 'problems', problemCount: 1, total: 3 });
  });

  it('268-01/AC-3: empty report -> clean, total 0 (degrades, never throws)', () => {
    expect(summarizeDoctorReport(rollup([]))).toEqual({ kind: 'clean', total: 0 });
  });
});

/**
 * Phase 268, round 3: `summarizeDoctorReport` being correct doesn't
 * guarantee the STRING built from its result is -- round 2's tests still
 * only drove the string-construction step inline through the same
 * tempRepo-fixture-can-never-reach-indeterminate path, so deleting the
 * `'indeterminate'` case from `renderHuman`/`doctorService` left the suite
 * green. These tests exercise the extracted formatters directly against
 * synthetic `DoctorSummary` values -- no fixture, no `DoctorReport`, no way
 * for the case to hide.
 */
describe('renderDoctorSummaryLine / renderDoctorServiceSummaryLine (phase 268, AC-3)', () => {
  it('268-01/AC-3: CLI text for each DoctorSummary kind, byte-for-byte, period-terminated, no prefix', () => {
    expect(renderDoctorSummaryLine({ kind: 'clean', total: 5 })).toBe('All 5 checks passed.');
    expect(renderDoctorSummaryLine({ kind: 'problems', problemCount: 2, total: 5 })).toBe(
      '2 problem(s) across 5 checks.',
    );
    expect(renderDoctorSummaryLine({ kind: 'indeterminate', indeterminateCount: 1, total: 5 })).toBe(
      '4 of 5 checks passed; 1 indeterminate (could not be assessed).',
    );
  });

  it('268-01/AC-3: MCP service text for each DoctorSummary kind, byte-for-byte, doctor: -prefixed, newline-terminated, no period', () => {
    expect(renderDoctorServiceSummaryLine({ kind: 'clean', total: 5 })).toBe('doctor: all 5 checks passed\n');
    expect(renderDoctorServiceSummaryLine({ kind: 'problems', problemCount: 2, total: 5 })).toBe(
      'doctor: 2 problem(s) across 5 checks\n',
    );
    expect(
      renderDoctorServiceSummaryLine({ kind: 'indeterminate', indeterminateCount: 1, total: 5 }),
    ).toBe('doctor: 4 of 5 checks passed; 1 indeterminate (could not be assessed)\n');
  });

  it("268-01/AC-3: neither renderer's 'indeterminate' text ever equals its own 'clean' text -- the exact overclaim this phase closes", () => {
    const indeterminate = { kind: 'indeterminate' as const, indeterminateCount: 1, total: 5 };
    const clean = { kind: 'clean' as const, total: 5 };
    expect(renderDoctorSummaryLine(indeterminate)).not.toBe(renderDoctorSummaryLine(clean));
    expect(renderDoctorServiceSummaryLine(indeterminate)).not.toBe(renderDoctorServiceSummaryLine(clean));
  });
});
