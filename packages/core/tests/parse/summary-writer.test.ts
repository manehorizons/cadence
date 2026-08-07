import { describe, it, expect } from 'vitest';
import { renderSummaryMd } from '../../src/parse/summary-writer.js';
import type { Finding, Summary } from '@thomas-powers-jr/cadence-types';

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

describe('renderSummaryMd - Findings section (phase 257)', () => {
  function finding(overrides: Partial<Finding> = {}): Finding {
    return {
      severity: 'medium',
      message: 'some finding message',
      ...overrides,
    };
  }

  it('257-01/AC-1: places ## Findings after ## Tasks and before ## Gate provenance', () => {
    const summary: Summary = {
      ...SAMPLE,
      codeReview: { 'src/a.ts': [finding({ severity: 'high' })] },
      gates: [{ gate: 'code-review', status: 'ran' }],
    };
    const md = renderSummaryMd(summary);
    const tasksIdx = md.indexOf('## Tasks');
    const findingsIdx = md.indexOf('## Findings');
    const gatesIdx = md.indexOf('## Gate provenance');
    expect(tasksIdx).toBeGreaterThan(-1);
    expect(findingsIdx).toBeGreaterThan(tasksIdx);
    expect(gatesIdx).toBeGreaterThan(findingsIdx);
  });

  it('257-01/AC-1: renders codeReview findings of every severity, grouped by file then severity', () => {
    const summary: Summary = {
      ...SAMPLE,
      codeReview: {
        'src/b.ts': [finding({ severity: 'low', message: 'b low finding' })],
        'src/a.ts': [
          finding({ severity: 'medium', message: 'a medium finding' }),
          finding({ severity: 'critical', message: 'a critical finding' }),
          finding({ severity: 'high', message: 'a high finding' }),
        ],
      },
    };
    const md = renderSummaryMd(summary);
    expect(md).toContain('## Findings');
    expect(md).toContain('### Code review');

    // file grouping is codepoint order: src/a.ts before src/b.ts
    const aIdx = md.indexOf('#### src/a.ts');
    const bIdx = md.indexOf('#### src/b.ts');
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);

    // within src/a.ts, severity order is critical > high > medium
    const critIdx = md.indexOf('CRITICAL: a critical finding');
    const highIdx = md.indexOf('HIGH: a high finding');
    const medIdx = md.indexOf('MEDIUM: a medium finding');
    expect(critIdx).toBeGreaterThan(aIdx);
    expect(highIdx).toBeGreaterThan(critIdx);
    expect(medIdx).toBeGreaterThan(highIdx);
    expect(medIdx).toBeLessThan(bIdx);

    expect(md).toMatch(/LOW: b low finding/);
  });

  it('257-01/AC-1: renders securityAudit findings under a Security audit subsection', () => {
    const summary: Summary = {
      ...SAMPLE,
      securityAudit: [
        finding({ severity: 'high', message: 'sec high finding' }),
        finding({ severity: 'critical', message: 'sec critical finding' }),
      ],
    };
    const md = renderSummaryMd(summary);
    expect(md).toContain('## Findings');
    expect(md).toContain('### Security audit');
    const critIdx = md.indexOf('CRITICAL: sec critical finding');
    const highIdx = md.indexOf('HIGH: sec high finding');
    expect(critIdx).toBeGreaterThan(-1);
    expect(highIdx).toBeGreaterThan(critIdx);
  });

  it('257-01/AC-1: renders a finding missing every optional field (no line/id/target/anchor/disposition)', () => {
    const summary: Summary = {
      ...SAMPLE,
      securityAudit: [finding({ severity: 'medium', message: 'bare finding' })],
    };
    const md = renderSummaryMd(summary);
    expect(md).toContain('- MEDIUM: bare finding');
    // no bracketed metadata block, no line annotation
    expect(md).not.toMatch(/bare finding.*\(line/);
    expect(md).not.toMatch(/bare finding.*\[/);
  });

  it('257-01/AC-1: renders anchor kind/ref/tier when present', () => {
    const summary: Summary = {
      ...SAMPLE,
      codeReview: {
        'src/a.ts': [
          finding({
            severity: 'high',
            message: 'anchored finding',
            anchor: { kind: 'ac', ref: 'AC-3', tier: 'structured' },
          }),
        ],
      },
    };
    const md = renderSummaryMd(summary);
    expect(md).toMatch(/anchored finding.*\[anchor: kind=ac, ref=AC-3, tier=structured\]/);
  });

  it('257-01/AC-1: renders disposition waived together with its matching waiver expiry', () => {
    const summary: Summary = {
      ...SAMPLE,
      codeReview: {
        'src/a.ts': [
          finding({
            severity: 'low',
            message: 'waived finding',
            disposition: 'waived',
            waiver: { expiry: '2026-09-01T00:00:00Z' },
          }),
        ],
      },
    };
    const md = renderSummaryMd(summary);
    expect(md).toMatch(/waived finding.*\[disposition: waived; waiver-expiry: 2026-09-01T00:00:00Z\]/);
  });

  it('257-01/AC-1: renders line number, id, and target when present', () => {
    const summary: Summary = {
      ...SAMPLE,
      codeReview: {
        'src/a.ts': [
          finding({
            severity: 'high',
            message: 'full-metadata finding',
            line: 42,
            id: 'abc123',
            target: 'artifact',
          }),
        ],
      },
    };
    const md = renderSummaryMd(summary);
    expect(md).toMatch(
      /full-metadata finding \(line 42\) \[id: abc123; target: artifact\]/,
    );
  });

  it('257-01/AC-1: omits ## Findings entirely when codeReview is {} and securityAudit is absent', () => {
    const summary: Summary = { ...SAMPLE, codeReview: {} };
    const md = renderSummaryMd(summary);
    expect(md).not.toContain('## Findings');
  });

  it('257-01/AC-1: omits ## Findings entirely when a codeReview file key maps to [] and securityAudit is absent', () => {
    const summary: Summary = { ...SAMPLE, codeReview: { 'src/a.ts': [] } };
    const md = renderSummaryMd(summary);
    expect(md).not.toContain('## Findings');
  });

  it('257-01/AC-1: omits ## Findings entirely when securityAudit is [] and codeReview is absent', () => {
    const summary: Summary = { ...SAMPLE, securityAudit: [] };
    const md = renderSummaryMd(summary);
    expect(md).not.toContain('## Findings');
  });

  it('257-01/AC-1: redacts secrets inside a codeReview finding message', () => {
    const summary: Summary = {
      ...SAMPLE,
      codeReview: {
        'src/a.ts': [
          finding({ severity: 'critical', message: 'found AKIAABCDEFGHIJKLMNOP leaked in code' }), // gitleaks:allow — fake key, redaction fixture
        ],
      },
    };
    const md = renderSummaryMd(summary);
    expect(md).toContain('[REDACTED]');
    expect(md).not.toContain('AKIAABCDEFGHIJKLMNOP'); // gitleaks:allow — fake key, redaction fixture
  });

  it('257-01/AC-4: redacts a GitHub-token-shaped string in a securityAudit finding message', () => {
    const leakedToken = 'ghp_ABCDEFGHIJ1234567890abcd'; // gitleaks:allow — fake token, redaction fixture
    const summary: Summary = {
      ...SAMPLE,
      securityAudit: [
        finding({ severity: 'high', message: `leaked credential ${leakedToken} in log output` }),
      ],
    };
    const md = renderSummaryMd(summary);
    expect(md).toContain('[REDACTED]');
    expect(md).not.toContain(leakedToken);
  });

  it('257-01/AC-4: does NOT redact a plain local-absolute-path-shaped string (out of scope for redactSecrets)', () => {
    const localPath = 'C:\\Users\\someone\\secret-notes.txt';
    const summary: Summary = {
      ...SAMPLE,
      codeReview: {
        'src/a.ts': [finding({ severity: 'medium', message: `found reference to ${localPath}` })],
      },
    };
    const md = renderSummaryMd(summary);
    expect(md).toContain(localPath);
    expect(md).not.toContain('[REDACTED]');
  });
});

describe('renderSummaryMd - byte-compatibility regression for historical summaries (phase 257, T3)', () => {
  // `SAMPLE` (top of file) carries no `codeReview`/`securityAudit` keys at
  // all — exactly the pre-phase-24.3/25.2 SUMMARY.json shape AC-3 describes.
  // This locks the rendering of that shape to a golden string, so a future
  // edit to `renderFindingsSection` (or its splice point in
  // `renderSummaryMd`) that accidentally starts emitting something for an
  // absent-findings summary fails loudly here instead of silently drifting
  // historical output byte-for-byte.
  it('257-01/AC-3: renders a historical summary with no codeReview/securityAudit byte-identically', () => {
    const md = renderSummaryMd(SAMPLE);

    expect(md).toMatchInlineSnapshot(`
      "# SETTLE Summary — 01-01

      **Completed:** 2026-05-13T10:00:00Z

      ## Acceptance Criteria

      - AC-1: PASS
      - AC-2: FAIL — flaky in CI

      ## Tasks

      - T1: DONE
      - T2: DONE_WITH_CONCERNS — edge case at large input

      ## Decisions

      - D-001 (01-foundation): use commander v13

      ## Deferred

      - DEF-001 (from 01-01): add streaming variant

      ## Skill audit

      - commit: invoked
      "
    `);
    expect(md).not.toContain('## Findings');
  });
});
