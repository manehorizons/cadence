import { describe, it, expect } from 'vitest';
import { TOOLS } from '../../src/mcp/tools.js';

const EXPECTED_COUNTS: Record<string, number> = {
  READ_ONLY: 6,
  LEDGER_WRITE: 5,
  LOOP_WRITE: 4,
  APPROVAL_BYPASS: 2,
  SETTLE: 1,
};

describe('TOOLS capabilityClass (AC-1)', () => {
  it('every registered tool has a capabilityClass', () => {
    for (const tool of TOOLS) {
      // AC-1: every tool must be tagged with a capability class
      expect(tool.capabilityClass, `${tool.name} is missing capabilityClass`).toBeDefined();
      expect(Object.keys(EXPECTED_COUNTS)).toContain(tool.capabilityClass);
    }
  });

  it('per-class counts match the researched mapping exactly (6/5/4/2/1)', () => {
    const counts: Record<string, number> = {};
    for (const tool of TOOLS) {
      counts[tool.capabilityClass] = (counts[tool.capabilityClass] ?? 0) + 1;
    }
    // AC-1: counts must be exactly READ_ONLY:6, LEDGER_WRITE:5, LOOP_WRITE:4, APPROVAL_BYPASS:2, SETTLE:1
    expect(counts).toEqual(EXPECTED_COUNTS);
  });

  it('APPROVAL_BYPASS class contains exactly the two approval-skipping tools', () => {
    const approvalBypass = TOOLS.filter((t) => t.capabilityClass === 'APPROVAL_BYPASS').map(
      (t) => t.name,
    );
    // AC-1: cadence_draft_approve and cadence_spec_approve are the approval-bypass tools
    expect(approvalBypass.sort()).toEqual(['cadence_draft_approve', 'cadence_spec_approve']);
  });

  it('SETTLE class contains exactly cadence_settle', () => {
    const settle = TOOLS.filter((t) => t.capabilityClass === 'SETTLE').map((t) => t.name);
    // AC-1: cadence_settle is classified SETTLE but left ungated this phase
    expect(settle).toEqual(['cadence_settle']);
  });
});
