import { describe, it, expect } from 'vitest';
import { renderSummaryMd } from '../../src/parse/summary-writer.js';
import type { Summary } from '@thomas-powers-jr/cadence-types';

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

describe('renderSummaryMd - gate provenance (AC-4, phase 140)', () => {
  it('renders a Gate provenance section with ran and skipped entries', () => {
    const summary: Summary = {
      ...SAMPLE,
      gates: [
        { gate: 'draft-read', status: 'ran' },
        { gate: 'security-audit', status: 'skipped', skipReason: 'not in the active tier x profile gate set' },
      ],
    };
    const md = renderSummaryMd(summary);
    expect(md).toContain('## Gate provenance');
    expect(md).toContain('- draft-read: ran');
    expect(md).toMatch(/- security-audit: skipped — not in the active tier/);
  });

  it('omits the Gate provenance section when gates is absent (AC-5 back-compat)', () => {
    const md = renderSummaryMd(SAMPLE);
    expect(md).not.toContain('## Gate provenance');
  });

  it('renders deep-verify token usage under the section when present', () => {
    const summary: Summary = {
      ...SAMPLE,
      gates: [{ gate: 'deep-verify', status: 'ran' }],
      deepVerifyMeta: {
        diffProvided: true,
        diffBytes: 500,
        truncated: false,
        filesCount: 1,
        provider: 'anthropic',
        inputTokens: 1204,
        outputTokens: 340,
      },
    };
    const md = renderSummaryMd(summary);
    expect(md).toContain('tokens: 1204 in / 340 out');
  });
});

describe('renderSummaryMd - AC evidence tags (AC-4, phase 140)', () => {
  it('renders the evidence tag next to a PASS/FAIL line when present', () => {
    const summary: Summary = {
      ...SAMPLE,
      acResults: [{ id: 'AC-1', pass: true, evidence: 'assertion' }],
    };
    const md = renderSummaryMd(summary);
    expect(md).toMatch(/AC-1: PASS \(assertion\)/);
  });

  it('omits the evidence tag when absent (AC-5 back-compat)', () => {
    const md = renderSummaryMd(SAMPLE);
    expect(md).toMatch(/- AC-1: PASS\n/);
  });
});
