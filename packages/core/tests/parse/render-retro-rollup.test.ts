import { describe, it, expect } from 'vitest';
import type { RetroRollup } from '@manehorizons/cadence-types';
import { renderRetroRollup } from '../../src/parse/render-retro-rollup.js';

const EMPTY_BUCKETS = { recurring: [], oneOff: [] };

function mkRollup(overrides: Partial<RetroRollup> = {}): RetroRollup {
  return {
    totalPhases: 0,
    phasesWithFriction: 0,
    bypasses: EMPTY_BUCKETS,
    roughTaskStatuses: EMPTY_BUCKETS,
    findingCategories: EMPTY_BUCKETS,
    ...overrides,
  };
}

describe('renderRetroRollup', () => {
  it('prints a "nothing to report" message for an all-zero rollup (totalPhases 0)', () => {
    const md = renderRetroRollup(mkRollup());
    expect(md).toContain('0 phase(s) scanned, no friction to report.');
    expect(md).not.toContain('## Gate bypasses');
    expect(md).not.toContain('### Recurring');
  });

  it('prints a "nothing to report" message when phases were scanned but all dimensions are empty', () => {
    const md = renderRetroRollup(mkRollup({ totalPhases: 3, phasesWithFriction: 0 }));
    expect(md).toContain('no friction to report.');
    expect(md).not.toContain('## Gate bypasses');
  });

  it('AC-2: a populated rollup renders Recurring and One-off as distinct subsections', () => {
    const rollup = mkRollup({
      totalPhases: 4,
      phasesWithFriction: 3,
      bypasses: {
        recurring: [{ key: 'test-coverage', count: 3, phaseIds: ['170-a', '171-b', '172-c'] }],
        oneOff: [{ key: 'boundary-scan', count: 1, phaseIds: ['171-b'] }],
      },
    });
    const md = renderRetroRollup(rollup);

    expect(md).toContain('## Gate bypasses');
    expect(md).toContain('### Recurring');
    expect(md).toContain('- test-coverage (3 phases: 170-a, 171-b, 172-c)');
    expect(md).toContain('### One-off');
    expect(md).toContain('- boundary-scan (1 phase: 171-b)');

    const recurringIdx = md.indexOf('### Recurring');
    const oneOffIdx = md.indexOf('### One-off');
    const recurringItemIdx = md.indexOf('test-coverage');
    const oneOffItemIdx = md.indexOf('boundary-scan');
    expect(recurringIdx).toBeGreaterThan(-1);
    expect(oneOffIdx).toBeGreaterThan(recurringIdx);
    expect(recurringItemIdx).toBeGreaterThan(recurringIdx);
    expect(recurringItemIdx).toBeLessThan(oneOffIdx);
    expect(oneOffItemIdx).toBeGreaterThan(oneOffIdx);
  });

  it('a dimension with only one-off entries omits the Recurring subsection', () => {
    const rollup = mkRollup({
      totalPhases: 1,
      phasesWithFriction: 1,
      roughTaskStatuses: {
        recurring: [],
        oneOff: [{ key: 'BLOCKED', count: 1, phaseIds: ['170-a'] }],
      },
    });
    const md = renderRetroRollup(rollup);

    expect(md).toContain('## Rough task statuses');
    expect(md).not.toContain('### Recurring');
    expect(md).toContain('### One-off');
    expect(md).toContain('- BLOCKED (1 phase: 170-a)');
  });

  it('omits a whole dimension section when both its buckets are empty', () => {
    const rollup = mkRollup({
      totalPhases: 2,
      phasesWithFriction: 1,
      findingCategories: {
        recurring: [],
        oneOff: [{ key: 'securityAudit', count: 1, phaseIds: ['170-a'] }],
      },
    });
    const md = renderRetroRollup(rollup);

    expect(md).not.toContain('## Gate bypasses');
    expect(md).not.toContain('## Rough task statuses');
    expect(md).toContain('## Finding categories');
  });

  it('renders the summary line with totalPhases and phasesWithFriction', () => {
    const rollup = mkRollup({
      totalPhases: 5,
      phasesWithFriction: 2,
      bypasses: {
        recurring: [],
        oneOff: [{ key: 'gate-x', count: 1, phaseIds: ['170-a'] }],
      },
    });
    const md = renderRetroRollup(rollup);
    expect(md).toContain('5 phase(s) scanned, 2 with friction.');
  });
});
