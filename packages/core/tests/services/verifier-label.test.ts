import { describe, it, expect } from 'vitest';
import { MOCK_VERIFIER_CAPABILITY, type GateProvenance } from '@thomas-powers-jr/cadence-types';
import { formatVerifierRollupLabel } from '../../src/services/verifier-label.js';

/**
 * Phase 264, T1 — single-sourced mock capability label + formatter.
 * Covers: base text shape unchanged; the mock capability clause appears iff
 * provider is mock; each of configured/fallback/empty-diff tags when every
 * matching gate agrees; an explicit mixed tag when they disagree; no tag at
 * all when no matching gate carries `providerSelection`.
 */

function gate(overrides: Partial<GateProvenance> = {}): GateProvenance {
  return { gate: 'code-review', status: 'ran', ...overrides };
}

describe('formatVerifierRollupLabel (264-01/AC-1)', () => {
  it('264-01/AC-1: renders the existing base text shape unchanged for a real provider with no matching gates', () => {
    const label = formatVerifierRollupLabel(
      { provider: 'anthropic', model: 'claude-opus-4', gateCount: 3 },
      [],
    );
    expect(label).toBe('anthropic claude-opus-4 (3 gate(s))');
  });

  it('264-01/AC-1: omits the model segment when model is absent, matching the pre-existing literal', () => {
    const label = formatVerifierRollupLabel({ provider: 'local', gateCount: 1 }, []);
    expect(label).toBe('local (1 gate(s))');
  });

  it('264-01/AC-1: appends the MOCK_VERIFIER_CAPABILITY clause when provider is mock', () => {
    const label = formatVerifierRollupLabel({ provider: 'mock', gateCount: 2 }, []);
    expect(label).toContain('mock (2 gate(s))');
    expect(label).toContain(MOCK_VERIFIER_CAPABILITY.message);
  });

  it('264-01/AC-1: does NOT append the mock capability clause for a real (non-mock) provider', () => {
    const label = formatVerifierRollupLabel(
      { provider: 'anthropic', model: 'claude-opus-4', gateCount: 3 },
      [],
    );
    expect(label).not.toContain(MOCK_VERIFIER_CAPABILITY.message);
  });

  it('264-01/AC-1: appends a (configured) tag when every matching gate agrees on providerSelection=configured', () => {
    const label = formatVerifierRollupLabel({ provider: 'mock', gateCount: 2 }, [
      gate({ providerSelection: 'configured' }),
      gate({ providerSelection: 'configured' }),
    ]);
    expect(label).toContain('(configured)');
    expect(label.endsWith('(configured)')).toBe(true);
  });

  it('264-01/AC-1: appends a (fallback) tag when every matching gate agrees on providerSelection=fallback', () => {
    const label = formatVerifierRollupLabel({ provider: 'mock', gateCount: 1 }, [
      gate({ providerSelection: 'fallback' }),
    ]);
    expect(label).toContain('(fallback)');
  });

  it("264-01/AC-1: appends an (empty-diff) tag for a REAL provider judging an empty diff -- empty-diff is not mock-only", () => {
    const label = formatVerifierRollupLabel(
      { provider: 'anthropic', model: 'claude-opus-4', gateCount: 1 },
      [gate({ gate: 'security-audit', providerSelection: 'empty-diff' })],
    );
    expect(label).toBe('anthropic claude-opus-4 (1 gate(s)) (empty-diff)');
  });

  it('264-01/AC-1: appends an explicit (mixed) tag when matching gates disagree on providerSelection, never silently omitting it', () => {
    const label = formatVerifierRollupLabel({ provider: 'mock', gateCount: 2 }, [
      gate({ providerSelection: 'configured' }),
      gate({ gate: 'security-audit', providerSelection: 'fallback' }),
    ]);
    expect(label).toContain('(mixed)');
    expect(label).not.toContain('(configured)');
    expect(label).not.toContain('(fallback)');
  });

  it('264-01/AC-1: appends no selection tag when matchingGates is empty -- pins the exact absent-selection output', () => {
    const label = formatVerifierRollupLabel({ provider: 'mock', gateCount: 2 }, []);
    expect(label).toBe(`mock (2 gate(s)) ${MOCK_VERIFIER_CAPABILITY.message}`);
  });

  it('264-01/AC-1: appends no selection tag when no matching gate carries providerSelection at all (pre-phase-263 records) -- pins the exact absent-selection output', () => {
    const label = formatVerifierRollupLabel({ provider: 'mock', gateCount: 2 }, [
      gate(),
      gate({ gate: 'security-audit' }),
    ]);
    expect(label).toBe(`mock (2 gate(s)) ${MOCK_VERIFIER_CAPABILITY.message}`);
  });

  it('264-01/AC-1: a mix of gates WITH and WITHOUT providerSelection still tags using only the carrying gates (uniform)', () => {
    const label = formatVerifierRollupLabel({ provider: 'mock', gateCount: 2 }, [
      gate(),
      gate({ gate: 'security-audit', providerSelection: 'configured' }),
    ]);
    expect(label).toContain('(configured)');
  });

  /**
   * Phase 267 (267-01, T3): a mock-identified clean pass on code-review/
   * security-audit now records `status: 'skipped'` + an abstention
   * skipReason instead of `status: 'ran'` (registry.ts, T2). This function
   * reads only `provider`/`model`/`providerSelection` off `matchingGates` --
   * never `status` -- so an abstained (skipped) matching gate must format
   * identically to the equivalent ran gate. Investigated and confirmed by
   * this test rather than assumed.
   */
  it("267-01/AC-3: a status: 'skipped' mock-abstained matching gate formats IDENTICALLY to the equivalent status: 'ran' gate -- status is not part of this function's contract", () => {
    const ranLabel = formatVerifierRollupLabel({ provider: 'mock', gateCount: 1 }, [
      gate({ providerSelection: 'configured' }),
    ]);
    const skippedLabel = formatVerifierRollupLabel({ provider: 'mock', gateCount: 1 }, [
      gate({
        status: 'skipped',
        skipReason:
          "code-review: mock-identified clean pass abstained — the mock provider is not real verification, recorded as skipped rather than a persisted pass",
        providerSelection: 'configured',
      }),
    ]);
    expect(skippedLabel).toBe(ranLabel);
    expect(skippedLabel).toContain('(configured)');
    expect(skippedLabel).toContain(MOCK_VERIFIER_CAPABILITY.message);
  });
});

/**
 * Phase 264, T6 — overcorrection guard: proves the new rendered label
 * (and the underlying MOCK_VERIFIER_CAPABILITY constant it draws from)
 * never introduces an adequacy-implying word that would overstate what
 * mock verification actually does.
 */
describe('formatVerifierRollupLabel banned-word guard', () => {
  const BANNED_WORDS = ['verified', 'passed', 'adequate', 'sufficient'];

  it('264-01/AC-5: rendered labels across representative mock scenarios, and the underlying MOCK_VERIFIER_CAPABILITY message itself, never contain a banned adequacy-implying word', () => {
    const labels = [
      // mock + no-selection: no matching gates at all.
      formatVerifierRollupLabel({ provider: 'mock', gateCount: 2 }, []),
      // mock + configured: every matching gate agrees on providerSelection=configured.
      formatVerifierRollupLabel({ provider: 'mock', gateCount: 2 }, [
        gate({ providerSelection: 'configured' }),
        gate({ providerSelection: 'configured' }),
      ]),
      // mock + mixed: matching gates disagree on providerSelection.
      formatVerifierRollupLabel({ provider: 'mock', gateCount: 2 }, [
        gate({ providerSelection: 'configured' }),
        gate({ gate: 'security-audit', providerSelection: 'fallback' }),
      ]),
      // mock + fallback: every matching gate agrees on providerSelection=fallback.
      formatVerifierRollupLabel({ provider: 'mock', gateCount: 1 }, [
        gate({ providerSelection: 'fallback' }),
      ]),
      // real provider + empty-diff: empty-diff is not mock-only, include it too.
      formatVerifierRollupLabel({ provider: 'anthropic', model: 'claude-opus-4', gateCount: 1 }, [
        gate({ gate: 'security-audit', providerSelection: 'empty-diff' }),
      ]),
    ];

    for (const label of labels) {
      const lowered = label.toLowerCase();
      for (const banned of BANNED_WORDS) {
        expect(lowered).not.toContain(banned);
      }
    }

    // The more fundamental check: the constant itself, independent of any
    // formatting call site, must never carry a banned word either.
    const capabilityLowered = MOCK_VERIFIER_CAPABILITY.message.toLowerCase();
    for (const banned of BANNED_WORDS) {
      expect(capabilityLowered).not.toContain(banned);
    }
  });
});
