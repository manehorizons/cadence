import { describe, it, expect } from 'vitest';
import { SummaryZ, DeepVerifyMetaZ } from '../src/summary.js';

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
