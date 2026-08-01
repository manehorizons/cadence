import { describe, it, expect } from 'vitest';
import { SummaryZ, DeepVerifyMetaZ, GateProvenanceZ, AcEvidenceZ, AssuranceRecordZ } from '../src/summary.js';

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

describe('GateProvenanceZ verifier identity (AC-3, phase 232)', () => {
  it('parses an entry carrying provider + model', () => {
    const g = GateProvenanceZ.parse({
      gate: 'code-review',
      status: 'ran',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
    expect(g.provider).toBe('anthropic');
    expect(g.model).toBe('claude-sonnet-4-6');
  });

  it('treats provider and model as optional (back-compat with pre-phase-232 entries)', () => {
    const g = GateProvenanceZ.parse({ gate: 'security-audit', status: 'ran' });
    expect(g.provider).toBeUndefined();
    expect(g.model).toBeUndefined();
  });
});

describe('SummaryZ.schemaVersion (AC-3, phase 232)', () => {
  it('parses a schemaVersion 1 summary unchanged (pre-existing record)', () => {
    const result = SummaryZ.safeParse({ ...baseSummary, schemaVersion: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe(1);
    }
  });

  it('parses a schemaVersion 2 summary carrying gate provenance identity', () => {
    const result = SummaryZ.safeParse({
      ...baseSummary,
      schemaVersion: 2,
      gates: [{ gate: 'code-review', status: 'ran', provider: 'mock' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe(2);
      expect(result.data.gates?.[0]).toEqual({ gate: 'code-review', status: 'ran', provider: 'mock' });
    }
  });

  it('rejects an unrecognized schemaVersion', () => {
    const result = SummaryZ.safeParse({ ...baseSummary, schemaVersion: 3 });
    expect(result.success).toBe(false);
  });
});

describe('SummaryZ real historical artifact round-trip (AC-3, AC-4, phase 232)', () => {
  // Pinned verbatim from .cadence/phases/140-summary-gate-provenance/140-01-SUMMARY.json
  // — a real, previously-settled schemaVersion 1 record (predates phase 232's
  // provider/model identity fields on `gates` entries). Proves the current
  // SummaryZ still accepts a genuine historical artifact unmodified, not just
  // a synthetic v1 object.
  const realHistoricalSummary = {
    schemaVersion: 1,
    draftId: '140-01',
    completedAt: '2026-07-02T22:23:49.993Z',
    acResults: [
      { id: 'AC-1', pass: true, evidence: 'assertion' },
      { id: 'AC-2', pass: true, evidence: 'assertion' },
      { id: 'AC-3', pass: true, evidence: 'assertion' },
      { id: 'AC-4', pass: true, evidence: 'assertion' },
      { id: 'AC-5', pass: true, evidence: 'assertion' },
    ],
    gates: [
      { gate: 'draft-read', status: 'skipped', skipReason: 'not in the active tier × profile gate set' },
      { gate: 'structural-verifier', status: 'ran' },
      {
        gate: 'build-test-must-pass',
        status: 'skipped',
        skipReason:
          'no test command configured — build-test-must-pass cannot verify your tests ran; this settle will NOT confirm the suite passes. Set verification.testCommand in .cadence/config.json to enable real enforcement.',
      },
      { gate: 'test-coverage', status: 'ran' },
      { gate: 'interactive-verdict', status: 'skipped', skipReason: 'not requested (no --deep / --interactive, not in gate set)' },
      { gate: 'deep-verify', status: 'skipped', skipReason: 'not requested (no --deep / --interactive, not in gate set)' },
      { gate: 'code-review', status: 'skipped', skipReason: 'not in the active tier × profile gate set' },
      { gate: 'security-audit', status: 'skipped', skipReason: 'not in the active tier × profile gate set' },
    ],
    taskResults: [
      { id: 'T1', status: 'DONE', notes: '' },
      { id: 'T2', status: 'DONE', notes: '' },
      { id: 'T3', status: 'DONE', notes: '' },
      { id: 'T4', status: 'DONE', notes: '' },
      { id: 'T5', status: 'DONE', notes: '' },
      { id: 'T6', status: 'DONE', notes: '' },
      { id: 'T7', status: 'DONE', notes: '' },
      { id: 'T8', status: 'DONE', notes: '' },
      { id: 'T9', status: 'DONE', notes: '' },
      { id: 'T10', status: 'DONE', notes: '' },
      { id: 'T11', status: 'DONE', notes: '' },
    ],
    decisions: [],
    deferred: [],
    skillAudit: { required: [], invoked: [] },
  };

  it('parses a real pre-existing settled SUMMARY.json (140-01, schemaVersion 1) unmodified', () => {
    const result = SummaryZ.safeParse(realHistoricalSummary);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe(1);
      expect(result.data.gates).toHaveLength(8);
      expect(result.data.gates?.[1]).toEqual({ gate: 'structural-verifier', status: 'ran' });
      // Pre-phase-232 gate entries carry no verifier identity.
      expect(result.data.gates?.every((g) => g.provider === undefined && g.model === undefined)).toBe(true);
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

describe('SummaryZ.contentHash (AC-1, phase 223)', () => {
  it('accepts a summary carrying a contentHash', () => {
    const result = SummaryZ.safeParse({
      ...baseSummary,
      contentHash: { algorithm: 'sha256', value: 'a'.repeat(64) },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contentHash).toEqual({ algorithm: 'sha256', value: 'a'.repeat(64) });
    }
  });

  it('leaves contentHash undefined when absent (back-compat with pre-phase-223 records)', () => {
    const result = SummaryZ.safeParse(baseSummary);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contentHash).toBeUndefined();
    }
  });

  it('rejects an unsupported algorithm', () => {
    const result = SummaryZ.safeParse({
      ...baseSummary,
      contentHash: { algorithm: 'md5', value: 'deadbeef' },
    });
    expect(result.success).toBe(false);
  });
});

// evidenceTally's key schema is AcEvidenceZ (five classes: ai-verified,
// executed, assertion, mention, unverified) instead of a bare z.string(), so
// a full evidenceTally object must enumerate all five keys — z.record over
// an enum key schema is exhaustive under zod v4.
const zeroEvidenceTally = {
  'ai-verified': 0,
  executed: 0,
  assertion: 0,
  mention: 0,
  unverified: 0,
} as const;

describe('AssuranceRecordZ (phase 233)', () => {
  it('parses a full assurance record with all five evidence-class keys (AC-1)', () => {
    const record = AssuranceRecordZ.parse({
      verifierRollup: [
        { provider: 'anthropic', model: 'claude-sonnet-4-6', gateCount: 2 },
        { provider: 'mock', gateCount: 1 },
      ],
      evidenceTally: { ...zeroEvidenceTally, 'ai-verified': 1, assertion: 3, unverified: 1 },
      overall: 'mixed',
    });
    expect(record.verifierRollup).toEqual([
      { provider: 'anthropic', model: 'claude-sonnet-4-6', gateCount: 2 },
      { provider: 'mock', gateCount: 1 },
    ]);
    expect(record.evidenceTally).toEqual({ ...zeroEvidenceTally, 'ai-verified': 1, assertion: 3, unverified: 1 });
    expect(record.overall).toBe('mixed');
  });

  it('treats verifierRollup[].model as optional', () => {
    const record = AssuranceRecordZ.parse({
      verifierRollup: [{ provider: 'mock', gateCount: 4 }],
      evidenceTally: zeroEvidenceTally,
      overall: 'unverified',
    });
    expect(record.verifierRollup[0]?.model).toBeUndefined();
  });

  it('rejects an unknown overall label', () => {
    expect(() =>
      AssuranceRecordZ.parse({
        verifierRollup: [],
        evidenceTally: zeroEvidenceTally,
        overall: 'vibes',
      }),
    ).toThrow();
  });

  it('rejects a typo-d evidence-class key instead of silently accepting it (AC-1)', () => {
    const result = AssuranceRecordZ.safeParse({
      verifierRollup: [],
      // 'ai-verifed' (missing an 'i') is not a member of AcEvidenceZ.
      evidenceTally: { ...zeroEvidenceTally, 'ai-verifed': 1 },
      overall: 'weak',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an evidenceTally missing one of the five required evidence-class keys', () => {
    const { unverified: _unverified, ...partialTally } = zeroEvidenceTally;
    const result = AssuranceRecordZ.safeParse({
      verifierRollup: [],
      evidenceTally: partialTally,
      overall: 'weak',
    });
    expect(result.success).toBe(false);
  });
});

describe('SummaryZ.assurance (phase 233)', () => {
  it('accepts a summary carrying a populated assurance record (AC-1)', () => {
    const parsed = SummaryZ.parse({
      ...baseSummary,
      assurance: {
        verifierRollup: [{ provider: 'anthropic', model: 'claude-sonnet-4-6', gateCount: 3 }],
        evidenceTally: { ...zeroEvidenceTally, 'ai-verified': 2, executed: 1 },
        overall: 'strong',
      },
    });
    expect(parsed.assurance?.overall).toBe('strong');
    expect(parsed.assurance?.verifierRollup[0]?.provider).toBe('anthropic');
    expect(parsed.assurance?.evidenceTally).toEqual({ ...zeroEvidenceTally, 'ai-verified': 2, executed: 1 });
  });

  it('leaves assurance undefined when absent — pre-existing SUMMARYs without the field still parse (AC-1)', () => {
    const parsed = SummaryZ.parse(baseSummary);
    expect(parsed.assurance).toBeUndefined();
  });

  it('still parses the real pre-existing schemaVersion 1 historical artifact without assurance (AC-1)', () => {
    // Re-uses baseSummary's shape to confirm the new optional field never
    // becomes load-bearing for older records — proven directly rather than
    // duplicating the full 140-01 fixture above.
    const result = SummaryZ.safeParse({ ...baseSummary, schemaVersion: 1 as const });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assurance).toBeUndefined();
    }
  });
});
