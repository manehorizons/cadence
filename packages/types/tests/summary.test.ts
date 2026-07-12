import { describe, it, expect } from 'vitest';
import { SummaryZ, DeepVerifyMetaZ, GateProvenanceZ, AcEvidenceZ } from '../src/summary.js';

// AC-4 (Phase 70): run-level deepVerifyMeta provenance — what the verifier saw.

const baseSummary = {
  schemaVersion: 1 as const,
  draftId: '70-01',
  completedAt: '2026-06-06T00:00:00.000Z',
  acResults: [],
  taskResults: [],
  decisions: [],
  deferred: [],
  skillAudit: { required: [], invoked: [] },
};

describe('DeepVerifyMetaZ (AC-4)', () => {
  it('parses a full provenance record', () => {
    const meta = DeepVerifyMetaZ.parse({
      diffProvided: true,
      diffBytes: 1234,
      truncated: false,
      filesCount: 3,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
    expect(meta.diffProvided).toBe(true);
    expect(meta.diffBytes).toBe(1234);
    expect(meta.truncated).toBe(false);
    expect(meta.filesCount).toBe(3);
    expect(meta.provider).toBe('anthropic');
    expect(meta.model).toBe('claude-sonnet-4-6');
  });

  it('treats model as optional', () => {
    const meta = DeepVerifyMetaZ.parse({
      diffProvided: false,
      diffBytes: 0,
      truncated: false,
      filesCount: 0,
      provider: 'mock',
    });
    expect(meta.model).toBeUndefined();
  });

  it('rejects a record missing a required field', () => {
    expect(() =>
      DeepVerifyMetaZ.parse({
        diffProvided: true,
        truncated: false,
        filesCount: 1,
        provider: 'mock',
      }),
    ).toThrow();
  });

  // AC-5 (Phase 73): optional token usage, back-compatible with v1.14 records.
  it('accepts optional token usage when present', () => {
    const meta = DeepVerifyMetaZ.parse({
      diffProvided: true,
      diffBytes: 10,
      truncated: false,
      filesCount: 1,
      provider: 'anthropic',
      inputTokens: 123,
      outputTokens: 45,
    });
    expect(meta.inputTokens).toBe(123);
    expect(meta.outputTokens).toBe(45);
  });

  it('treats token usage as optional (v1.14 record still validates)', () => {
    const meta = DeepVerifyMetaZ.parse({
      diffProvided: true,
      diffBytes: 10,
      truncated: false,
      filesCount: 1,
      provider: 'mock',
    });
    expect(meta.inputTokens).toBeUndefined();
    expect(meta.outputTokens).toBeUndefined();
  });
});

describe('SummaryZ.deepVerifyMeta (AC-4)', () => {
  it('accepts a summary carrying deepVerifyMeta', () => {
    const parsed = SummaryZ.parse({
      ...baseSummary,
      deepVerifyMeta: {
        diffProvided: true,
        diffBytes: 500,
        truncated: true,
        filesCount: 2,
        provider: 'mock',
      },
    });
    expect(parsed.deepVerifyMeta?.truncated).toBe(true);
    expect(parsed.deepVerifyMeta?.diffBytes).toBe(500);
  });

  it('leaves deepVerifyMeta undefined when absent (back-compat)', () => {
    const parsed = SummaryZ.parse(baseSummary);
    expect(parsed.deepVerifyMeta).toBeUndefined();
  });
});

describe('GateProvenanceZ (AC-1, phase 140)', () => {
  it('parses a ran entry with no skipReason', () => {
    const g = GateProvenanceZ.parse({ gate: 'draft-read', status: 'ran' });
    expect(g.status).toBe('ran');
    expect(g.skipReason).toBeUndefined();
  });

  it('parses a skipped entry with a reason', () => {
    const g = GateProvenanceZ.parse({
      gate: 'security-audit',
      status: 'skipped',
      skipReason: 'not in the active tier × profile gate set',
    });
    expect(g.status).toBe('skipped');
    expect(g.skipReason).toBe('not in the active tier × profile gate set');
  });

  it('rejects an unknown gate name', () => {
    expect(() => GateProvenanceZ.parse({ gate: 'not-a-real-gate', status: 'ran' })).toThrow();
  });

  // AC-4 (phase 170): pre-existing ran/skipped shapes must still validate unchanged.
  it('still validates pre-existing ran/skipped shapes (AC-4)', () => {
    const ran = GateProvenanceZ.safeParse({ gate: 'structural-verifier', status: 'ran' });
    expect(ran.success).toBe(true);

    const skipped = GateProvenanceZ.safeParse({
      gate: 'structural-verifier',
      status: 'skipped',
      skipReason: 'some reason',
    });
    expect(skipped.success).toBe(true);
  });

  // AC-1 (phase 170): new 'refused' status + optional reason field.
  it('accepts a refused entry with a reason, and reason is optional (AC-1)', () => {
    const withReason = GateProvenanceZ.safeParse({
      gate: 'boundary-scan',
      status: 'refused',
      reason: 'some reason string',
    });
    expect(withReason.success).toBe(true);
    if (withReason.success) {
      expect(withReason.data.status).toBe('refused');
      expect(withReason.data.reason).toBe('some reason string');
    }

    const withoutReason = GateProvenanceZ.safeParse({ gate: 'boundary-scan', status: 'refused' });
    expect(withoutReason.success).toBe(true);
    if (withoutReason.success) {
      expect(withoutReason.data.reason).toBeUndefined();
    }
  });
});

describe('AcEvidenceZ (AC-2, phase 140)', () => {
  it('accepts all five evidence classes', () => {
    for (const v of ['ai-verified', 'executed', 'assertion', 'mention', 'unverified']) {
      expect(AcEvidenceZ.parse(v)).toBe(v);
    }
  });

  it('rejects an unknown class', () => {
    expect(() => AcEvidenceZ.parse('vibes')).toThrow();
  });
});

describe('SummaryZ.gates / acResults[].evidence (AC-1, AC-2, AC-5, phase 140)', () => {
  it('accepts a summary carrying gates + per-AC evidence', () => {
    const parsed = SummaryZ.parse({
      ...baseSummary,
      acResults: [{ id: 'AC-1', pass: true, evidence: 'assertion' }],
      gates: [
        { gate: 'draft-read', status: 'ran' },
        { gate: 'deep-verify', status: 'skipped', skipReason: 'not requested' },
      ],
    });
    expect(parsed.gates?.[0]).toEqual({ gate: 'draft-read', status: 'ran' });
    expect(parsed.acResults[0]?.evidence).toBe('assertion');
  });

  it('leaves gates and evidence undefined when absent (AC-5 back-compat)', () => {
    const parsed = SummaryZ.parse(baseSummary);
    expect(parsed.gates).toBeUndefined();
    expect(parsed.acResults).toEqual([]);
  });
});

describe('SummaryZ.boundaryScan (AC-5, phase 156)', () => {
  it('accepts a summary carrying a bypassed boundary-scan audit trail', () => {
    const parsed = SummaryZ.parse({
      ...baseSummary,
      boundaryScan: { offenders: ['src/outside-boundary.ts'] },
    });
    expect(parsed.boundaryScan?.offenders).toEqual(['src/outside-boundary.ts']);
  });

  it('leaves boundaryScan undefined when absent (back-compat)', () => {
    const parsed = SummaryZ.parse(baseSummary);
    expect(parsed.boundaryScan).toBeUndefined();
  });
});
