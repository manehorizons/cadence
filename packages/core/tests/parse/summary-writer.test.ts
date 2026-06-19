import { describe, it, expect } from 'vitest';
import { renderSummaryMd } from '../../src/parse/summary-writer.js';
import type { Summary } from '@manehorizons/cadence-types';

const SAMPLE: Summary = {
  schemaVersion: 1,
  draftId: '01-01',
  completedAt: '2026-05-13T10:00:00Z',
  acResults: [
    { id: 'AC-1', pass: true },
    { id: 'AC-2', pass: false, note: 'flaky in CI' },
  ],
  taskResults: [
    { id: 'T1', status: 'DONE', notes: '' },
    { id: 'T2', status: 'DONE_WITH_CONCERNS', notes: 'edge case at large input' },
  ],
  decisions: [{ id: 'D-001', phase: '01-foundation', title: 'use commander v13', decidedAt: '2026-05-13' }],
  deferred: [{ id: 'DEF-001', from: '01-01', title: 'add streaming variant', createdAt: '2026-05-13' }],
  skillAudit: { required: ['commit'], invoked: ['commit'] },
};

describe('renderSummaryMd', () => {
  it('renders draft id and completion timestamp', () => {
    const md = renderSummaryMd(SAMPLE);
    expect(md).toContain('# SETTLE Summary — 01-01');
    expect(md).toContain('2026-05-13T10:00:00Z');
  });

  it('renders AC results with pass/fail badges', () => {
    const md = renderSummaryMd(SAMPLE);
    expect(md).toMatch(/AC-1.*PASS/);
    expect(md).toMatch(/AC-2.*FAIL/);
    expect(md).toContain('flaky in CI');
  });

  it('renders task statuses', () => {
    const md = renderSummaryMd(SAMPLE);
    expect(md).toMatch(/T1.*DONE/);
    expect(md).toMatch(/T2.*DONE_WITH_CONCERNS/);
  });

  it('renders decisions + deferred sections', () => {
    const md = renderSummaryMd(SAMPLE);
    expect(md).toContain('## Decisions');
    expect(md).toContain('D-001');
    expect(md).toContain('## Deferred');
    expect(md).toContain('DEF-001');
  });

  it('renders skill audit gaps', () => {
    const summary = { ...SAMPLE, skillAudit: { required: ['commit', 'review-pr'], invoked: ['commit'] } };
    const md = renderSummaryMd(summary);
    expect(md).toMatch(/review-pr.*NOT INVOKED/);
  });

  it('AC-2: renders gate bypasses when present', () => {
    const summary: Summary = {
      ...SAMPLE,
      gateBypasses: [
        {
          gate: 'test-coverage',
          flag: '--allow-missing-coverage',
          reason: 'test-coverage gate bypassed via --allow-missing-coverage',
          severity: 'warn',
        },
      ],
    };
    const md = renderSummaryMd(summary);
    expect(md).toContain('## Gate bypasses');
    expect(md).toContain('WARN test-coverage via --allow-missing-coverage');
  });

  it('AC-4: omits gate bypasses when absent', () => {
    const md = renderSummaryMd(SAMPLE);
    expect(md).not.toContain('## Gate bypasses');
  });
});
