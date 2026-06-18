import { describe, it, expect } from 'vitest';
import { doctorNextStep } from '../../src/doctor/render.js';
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
});
