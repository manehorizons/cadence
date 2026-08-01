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

  it('AC-2: constrains kind to ac | boundary | invariant | none, rejecting an unknown kind', () => {
    expect(() => AnchorZ.parse({ kind: 'bogus', tier: 'declared' })).toThrow();
  });

  it('AC-2: parses an anchor with kind "invariant"', () => {
    const anchor = AnchorZ.parse({ kind: 'invariant', ref: 'INV-1', tier: 'declared' });
    expect(anchor.kind).toBe('invariant');
    expect(anchor.ref).toBe('INV-1');
    expect(anchor.tier).toBe('declared');
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

describe('FindingZ identity, target, disposition, and waiver (AC-1, Phase 236)', () => {
  it('AC-1: a pre-phase-236 Finding record with none of the new fields present still parses unchanged', () => {
    const finding = FindingZ.parse({
      severity: 'high',
      message: 'unchecked input',
      line: 42,
      anchor: { kind: 'ac', ref: 'AC-2', tier: 'structured' },
    });
    expect(finding.id).toBeUndefined();
    expect(finding.target).toBeUndefined();
    expect(finding.disposition).toBeUndefined();
    expect(finding.waiver).toBeUndefined();
  });

  it('AC-1: parses id, target, and disposition when present', () => {
    const finding = FindingZ.parse({
      severity: 'medium',
      message: 'no test covers this branch',
      id: 'a1b2c3d4',
      target: 'artifact',
      disposition: 'open',
    });
    expect(finding.id).toBe('a1b2c3d4');
    expect(finding.target).toBe('artifact');
    expect(finding.disposition).toBe('open');
  });

  it('AC-1: target accepts both artifact and verification', () => {
    expect(FindingZ.parse({ severity: 'low', message: 'm', target: 'artifact' }).target).toBe('artifact');
    expect(FindingZ.parse({ severity: 'low', message: 'm', target: 'verification' }).target).toBe(
      'verification',
    );
  });

  it('AC-1: disposition accepts all five lifecycle states', () => {
    for (const disposition of ['open', 'accepted', 'fixed', 'superseded'] as const) {
      expect(FindingZ.parse({ severity: 'low', message: 'm', disposition }).disposition).toBe(disposition);
    }
    // 'waived' requires a waiver (enforced below) — covered separately, not
    // by this loop, since a bare `disposition: 'waived'` with no waiver is
    // exactly the invalid combination the cross-field refine rejects.
    expect(
      FindingZ.parse({
        severity: 'low',
        message: 'm',
        disposition: 'waived',
        waiver: { expiry: '2026-12-31T00:00:00Z' },
      }).disposition,
    ).toBe('waived');
  });

  it('AC-1: parses a waived Finding carrying a waiver with an offset-qualified ISO expiry', () => {
    const finding = FindingZ.parse({
      severity: 'low',
      message: 'accepted risk, revisit later',
      disposition: 'waived',
      waiver: { expiry: '2026-12-31T00:00:00Z' },
    });
    expect(finding.disposition).toBe('waived');
    expect(finding.waiver?.expiry).toBe('2026-12-31T00:00:00Z');
  });

  it('rejects an unknown target value', () => {
    expect(() => FindingZ.parse({ severity: 'low', message: 'm', target: 'bogus' })).toThrow();
  });

  it('rejects an unknown disposition value', () => {
    expect(() => FindingZ.parse({ severity: 'low', message: 'm', disposition: 'bogus' })).toThrow();
  });

  it('rejects a waiver expiry with no timezone offset', () => {
    expect(() =>
      FindingZ.parse({
        severity: 'low',
        message: 'm',
        disposition: 'waived',
        waiver: { expiry: '2026-12-31T00:00:00' },
      }),
    ).toThrow();
  });

  it('AC-1: rejects disposition "waived" with no waiver — a belief with no expiry is not a waiver', () => {
    expect(() =>
      FindingZ.parse({ severity: 'low', message: 'm', disposition: 'waived' }),
    ).toThrow(/waiver is required when disposition/);
  });

  it('AC-1: rejects a waiver present on a Finding whose disposition is not "waived"', () => {
    expect(() =>
      FindingZ.parse({
        severity: 'low',
        message: 'm',
        disposition: 'open',
        waiver: { expiry: '2026-12-31T00:00:00Z' },
      }),
    ).toThrow(/waiver may only be present when disposition/);
    // No disposition at all (defaults to none-set) is the same orphaned case.
    expect(() =>
      FindingZ.parse({ severity: 'low', message: 'm', waiver: { expiry: '2026-12-31T00:00:00Z' } }),
    ).toThrow(/waiver may only be present when disposition/);
  });
});
