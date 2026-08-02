import { describe, it, expect } from 'vitest';
import type { RetroDigest } from '@thomas-powers-jr/cadence-types';
import { renderRetroMd } from '../../src/parse/retro-writer.js';

const EMPTY: RetroDigest = { bypasses: [], roughTasks: [], findings: {} };

describe('renderRetroMd', () => {
  it('renders a single "no friction" line for an empty digest', () => {
    const md = renderRetroMd(EMPTY);
    expect(md).toContain('No friction detected this settle.');
    expect(md).not.toContain('## Gate bypasses');
  });

  it('renders "no friction" even when findings are present but structurally empty', () => {
    // Mirrors buildRetroDigest's guard in services/retro.ts: a digest shouldn't reach here
    // with present-but-empty findings in practice, but the renderer's own empty-check must
    // not misreport one as having friction if it does.
    const md = renderRetroMd({
      bypasses: [],
      roughTasks: [],
      findings: { codeReview: {}, securityAudit: [], boundaryScan: { offenders: [] } },
    });
    expect(md).toContain('No friction detected this settle.');
    expect(md).not.toContain('## Code review findings');
    expect(md).not.toContain('## Security audit findings');
    expect(md).not.toContain('## Boundary scan offenders');
  });

  it('renders gate bypasses', () => {
    const md = renderRetroMd({
      ...EMPTY,
      bypasses: [{ gate: 'test-coverage', flag: '--allow-missing-coverage', reason: 'legacy file', severity: 'warn' }],
    });
    expect(md).toContain('## Gate bypasses');
    expect(md).toContain('WARN test-coverage via --allow-missing-coverage: legacy file');
  });

  it('renders rough tasks', () => {
    const md = renderRetroMd({
      ...EMPTY,
      roughTasks: [{ id: 'T2', status: 'BLOCKED', notes: 'waiting on infra' }],
    });
    expect(md).toContain('## Rough tasks');
    expect(md).toContain('- T2: BLOCKED — waiting on infra');
  });

  it('renders codeReview findings grouped by file', () => {
    const md = renderRetroMd({
      ...EMPTY,
      findings: { codeReview: { 'src/foo.ts': [{ severity: 'high', message: 'no error handling' }] } },
    });
    expect(md).toContain('## Code review findings');
    expect(md).toContain('src/foo.ts: HIGH — no error handling');
  });

  it('renders securityAudit and boundaryScan findings', () => {
    const md = renderRetroMd({
      ...EMPTY,
      findings: {
        securityAudit: [{ severity: 'critical', message: 'hardcoded secret', line: 12 }],
        boundaryScan: { offenders: ['src/out-of-scope.ts'] },
      },
    });
    expect(md).toContain('## Security audit findings');
    expect(md).toContain('CRITICAL — hardcoded secret (line 12)');
    expect(md).toContain('## Boundary scan offenders');
    expect(md).toContain('- src/out-of-scope.ts');
  });
});
