import { describe, it, expect } from 'vitest';
import { AnchorTierZ, AnchorZ, FindingZ } from '../src/summary.js';

// AC-2 (Phase 235): the anchor ladder classifies findings by criterion
// strength, declared as its own peer schema alongside AcEvidenceZ (D5) —
// not a reuse or extension of it.

describe('AnchorTierZ (AC-2)', () => {
  it('AC-2: accepts each of the four §7.1 tiers', () => {
    expect(AnchorTierZ.parse('executable')).toBe('executable');
    expect(AnchorTierZ.parse('structured')).toBe('structured');
    expect(AnchorTierZ.parse('declared')).toBe('declared');
    expect(AnchorTierZ.parse('undeclared')).toBe('undeclared');
  });

  it('rejects an unknown tier', () => {
    expect(() => AnchorTierZ.parse('ai-verified')).toThrow();
    expect(() => AnchorTierZ.parse('bogus-tier')).toThrow();
  });
});

describe('AnchorZ (AC-2)', () => {
  it('AC-2: parses a full ac-kind anchor at the executable tier', () => {
    const anchor = AnchorZ.parse({ kind: 'ac', ref: 'AC-3', tier: 'executable' });
    expect(anchor.kind).toBe('ac');
    expect(anchor.ref).toBe('AC-3');
    expect(anchor.tier).toBe('executable');
  });

  it('parses a boundary-kind anchor at the declared tier', () => {
    const anchor = AnchorZ.parse({ kind: 'boundary', ref: 'no bespoke fingerprint', tier: 'declared' });
    expect(anchor.kind).toBe('boundary');
    expect(anchor.tier).toBe('declared');
  });

  it('treats ref as genuinely optional', () => {
    const anchor = AnchorZ.parse({ kind: 'none', tier: 'undeclared' });
    expect(anchor.ref).toBeUndefined();
  });

  it('AC-2: constrains kind to ac | boundary | none, rejecting an unknown kind', () => {
    expect(() => AnchorZ.parse({ kind: 'invariant', tier: 'declared' })).toThrow();
    expect(() => AnchorZ.parse({ kind: 'bogus', tier: 'declared' })).toThrow();
  });

  it('rejects an anchor missing a required tier', () => {
    expect(() => AnchorZ.parse({ kind: 'ac', ref: 'AC-1' })).toThrow();
  });

  it('rejects an anchor with an invalid tier', () => {
    expect(() => AnchorZ.parse({ kind: 'ac', ref: 'AC-1', tier: 'ai-verified' })).toThrow();
  });
});

describe('FindingZ with the optional anchor field (AC-2 back-compat)', () => {
  it('AC-2: still parses a pre-existing Finding with no anchor key at all', () => {
    const finding = FindingZ.parse({ severity: 'high', message: 'unchecked input', line: 42 });
    expect(finding.severity).toBe('high');
    expect(finding.message).toBe('unchecked input');
    expect(finding.line).toBe(42);
    expect(finding.anchor).toBeUndefined();
  });

  it('accepts a Finding carrying an anchor', () => {
    const finding = FindingZ.parse({
      severity: 'medium',
      message: 'no test covers this branch',
      anchor: { kind: 'ac', ref: 'AC-2', tier: 'structured' },
    });
    expect(finding.anchor).toBeDefined();
    expect(finding.anchor?.kind).toBe('ac');
    expect(finding.anchor?.tier).toBe('structured');
  });

  it('rejects a Finding whose anchor is malformed', () => {
    expect(() =>
      FindingZ.parse({
        severity: 'low',
        message: 'bad anchor',
        anchor: { kind: 'ac', tier: 'not-a-real-tier' },
      }),
    ).toThrow();
  });
});
