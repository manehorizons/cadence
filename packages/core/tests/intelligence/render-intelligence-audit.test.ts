import { describe, expect, it } from 'vitest';
import type {
  IntelligenceAuditFinding,
  IntelligenceAuditReport,
} from '../../src/intelligence/store.js';
import { renderIntelligenceAudit } from '../../src/intelligence/render-intelligence-audit.js';

function mkReport(findings: IntelligenceAuditFinding[]): IntelligenceAuditReport {
  const byKind = {
    'broken-assumption-link': [] as IntelligenceAuditFinding[],
    'broken-decision-link': [] as IntelligenceAuditFinding[],
    'broken-evidence-link': [] as IntelligenceAuditFinding[],
    'orphan-assumption': [] as IntelligenceAuditFinding[],
    'orphan-decision': [] as IntelligenceAuditFinding[],
    'orphan-evidence': [] as IntelligenceAuditFinding[],
  };
  for (const f of findings) byKind[f.kind].push(f);
  return { findings, byKind };
}

describe('renderIntelligenceAudit (Slice 19)', () => {
  it('AC-8: clean report → `Audit clean: no integrity issues.\\n`', () => {
    const md = renderIntelligenceAudit(mkReport([]));
    expect(md).toBe('Audit clean: no integrity issues.\n');
  });

  it('AC-9: findings render with header count + section per kind + remediation block', () => {
    const md = renderIntelligenceAudit(
      mkReport([
        { kind: 'broken-assumption-link', recId: 'rec-1', assumptionId: 'as-missing' },
        { kind: 'broken-decision-link', recId: 'rec-1', decisionId: 'dec-missing' },
        { kind: 'orphan-evidence', evidenceId: 'ev-orphan', missingRecId: 'rec-gone' },
      ]),
    );
    expect(md).toMatch(/^# CADENCE Intelligence Audit/);
    expect(md).toMatch(/Found 3 integrity issue\(s\)/);
    expect(md).toMatch(/## Broken Assumption Links \(1\)/);
    expect(md).toMatch(/- rec-1 references missing assumption: as-missing/);
    expect(md).toMatch(/## Broken Decision Links \(1\)/);
    expect(md).toMatch(/- rec-1 references missing decision: dec-missing/);
    expect(md).toMatch(/## Orphan Evidence \(1\)/);
    expect(md).toMatch(/- ev-orphan references missing rec: rec-gone/);
    expect(md).toMatch(/## Remediation/);
    expect(md).toMatch(/cadence intelligence reconcile/);
  });

  it('AC-9: empty sections OMITTED in output', () => {
    const md = renderIntelligenceAudit(
      mkReport([
        { kind: 'orphan-assumption', assumptionId: 'as-1', missingRecId: 'rec-gone' },
      ]),
    );
    expect(md).toMatch(/## Orphan Assumptions \(1\)/);
    expect(md).not.toMatch(/## Broken Assumption Links/);
    expect(md).not.toMatch(/## Broken Decision Links/);
    expect(md).not.toMatch(/## Broken Evidence Links/);
    expect(md).not.toMatch(/## Orphan Decisions/);
    expect(md).not.toMatch(/## Orphan Evidence/);
  });

  it('AC-9: section order — broken-* first, then orphan-*', () => {
    const md = renderIntelligenceAudit(
      mkReport([
        { kind: 'orphan-decision', decisionId: 'd1', missingRecId: 'r1' },
        { kind: 'broken-assumption-link', recId: 'r2', assumptionId: 'a1' },
        { kind: 'orphan-assumption', assumptionId: 'a2', missingRecId: 'r3' },
        { kind: 'broken-evidence-link', recId: 'r4', evidenceId: 'e1' },
      ]),
    );
    const brokenAs = md.indexOf('## Broken Assumption Links');
    const brokenEv = md.indexOf('## Broken Evidence Links');
    const orphanAs = md.indexOf('## Orphan Assumptions');
    const orphanDec = md.indexOf('## Orphan Decisions');
    expect(brokenAs).toBeGreaterThan(-1);
    expect(brokenAs).toBeLessThan(brokenEv);
    expect(brokenEv).toBeLessThan(orphanAs);
    expect(orphanAs).toBeLessThan(orphanDec);
  });
});
