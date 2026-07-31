import { describe, it, expect } from 'vitest';
import type { Anchor } from '@manehorizons/cadence-types';
import { computeFindingId, attachFindingIdentity } from '../../src/verify/finding-identity.js';
import type { AnchoredFinding } from '../../src/verify/criteria-gap.js';

// Phase 236 (T3, §7.2, dec-20260730-001) — AC-3: code-review findings get a
// computed, refactor-stable id at anchor time. The hash is a pure content
// hash over (file, anchor.kind, anchor.ref, severity, normalized message) —
// deliberately never over a line number, so an edit that only shifts a
// finding's line leaves its id unchanged.

function anchor(overrides: Partial<Anchor> = {}): Anchor {
  return {
    kind: 'ac',
    ref: 'AC-1',
    tier: 'structured',
    ...overrides,
  };
}

function finding(overrides: Partial<AnchoredFinding> = {}): AnchoredFinding {
  return {
    severity: 'high',
    message: 'Unhandled promise rejection',
    anchor: anchor(),
    ...overrides,
  };
}

describe('computeFindingId — determinism (AC-3)', () => {
  it('AC-3: the same (file, anchor, severity, message) inputs produce the same id across two separate calls', () => {
    const a = computeFindingId('src/example.ts', anchor(), 'high', 'Unhandled promise rejection');
    const b = computeFindingId('src/example.ts', anchor(), 'high', 'Unhandled promise rejection');
    expect(a).toBe(b);
  });

  it('AC-3: the id is a sha256 hex digest (64 lowercase hex chars)', () => {
    const id = computeFindingId('src/example.ts', anchor(), 'high', 'message');
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('computeFindingId — each of the four inputs is load-bearing (AC-3)', () => {
  const baseFile = 'src/example.ts';
  const baseAnchor = anchor();
  const baseSeverity = 'high';
  const baseMessage = 'Unhandled promise rejection';

  it('AC-3: changing file (holding anchor/severity/message constant) changes the id', () => {
    const a = computeFindingId(baseFile, baseAnchor, baseSeverity, baseMessage);
    const b = computeFindingId('src/other.ts', baseAnchor, baseSeverity, baseMessage);
    expect(a).not.toBe(b);
  });

  it('AC-3: changing anchor.kind (holding file/severity/message constant) changes the id', () => {
    const a = computeFindingId(baseFile, baseAnchor, baseSeverity, baseMessage);
    const b = computeFindingId(baseFile, anchor({ kind: 'boundary' }), baseSeverity, baseMessage);
    expect(a).not.toBe(b);
  });

  it('AC-3: changing anchor.ref (holding file/severity/message constant) changes the id', () => {
    const a = computeFindingId(baseFile, baseAnchor, baseSeverity, baseMessage);
    const b = computeFindingId(baseFile, anchor({ ref: 'AC-2' }), baseSeverity, baseMessage);
    expect(a).not.toBe(b);
  });

  it('AC-3: changing severity (holding file/anchor/message constant) changes the id', () => {
    const a = computeFindingId(baseFile, baseAnchor, baseSeverity, baseMessage);
    const b = computeFindingId(baseFile, baseAnchor, 'medium', baseMessage);
    expect(a).not.toBe(b);
  });

  it('AC-3: changing message (holding file/anchor/severity constant) changes the id', () => {
    const a = computeFindingId(baseFile, baseAnchor, baseSeverity, baseMessage);
    const b = computeFindingId(baseFile, baseAnchor, baseSeverity, 'A completely different message');
    expect(a).not.toBe(b);
  });
});

describe('computeFindingId — message normalization', () => {
  it('AC-3: leading/trailing whitespace on the message does not change the id', () => {
    const a = computeFindingId('src/example.ts', anchor(), 'high', 'Unhandled promise rejection');
    const b = computeFindingId('src/example.ts', anchor(), 'high', '  Unhandled promise rejection  ');
    expect(a).toBe(b);
  });

  it('AC-3: internal whitespace runs collapse to a single space before hashing', () => {
    const a = computeFindingId('src/example.ts', anchor(), 'high', 'Unhandled promise rejection');
    const b = computeFindingId(
      'src/example.ts',
      anchor(),
      'high',
      'Unhandled   promise\n\trejection',
    );
    expect(a).toBe(b);
  });
});

describe('computeFindingId — anchor.ref absence is distinct from a present ref (AC-3)', () => {
  it('AC-3: an anchor with no ref produces a different id than the same anchor with a ref set', () => {
    const withoutRef = computeFindingId(
      'src/example.ts',
      { kind: 'none', tier: 'undeclared' },
      'high',
      'message',
    );
    const withRef = computeFindingId(
      'src/example.ts',
      { kind: 'none', tier: 'undeclared', ref: 'undeclared' },
      'high',
      'message',
    );
    expect(withoutRef).not.toBe(withRef);
  });
});

describe('attachFindingIdentity — refactor stability (AC-3)', () => {
  it('AC-3: two findings differing ONLY in line number produce the identical id — a line shift never changes identity', () => {
    const before = attachFindingIdentity({
      'src/example.ts': [finding({ line: 10 })],
    });
    const after = attachFindingIdentity({
      'src/example.ts': [finding({ line: 47 })],
    });
    expect(before['src/example.ts']?.[0]?.id).toBe(after['src/example.ts']?.[0]?.id);
    expect(before['src/example.ts']?.[0]?.id).toBeDefined();
  });

  it('AC-3: attachFindingIdentity sets target: artifact and disposition: open on every output finding', () => {
    const result = attachFindingIdentity({
      'src/example.ts': [finding({ line: 10 }), finding({ message: 'A second finding' })],
    });
    const list = result['src/example.ts'];
    expect(list).toHaveLength(2);
    for (const f of list ?? []) {
      expect(f.target).toBe('artifact');
      expect(f.disposition).toBe('open');
    }
  });

  it('AC-3: attachFindingIdentity preserves the original severity/message/line/anchor unchanged', () => {
    const input = finding({ line: 10, severity: 'medium', message: 'Preserve me', anchor: anchor({ ref: 'AC-9' }) });
    const result = attachFindingIdentity({ 'src/example.ts': [input] });
    const output = result['src/example.ts']?.[0];
    expect(output?.severity).toBe('medium');
    expect(output?.message).toBe('Preserve me');
    expect(output?.line).toBe(10);
    expect(output?.anchor).toEqual(anchor({ ref: 'AC-9' }));
  });

  it('AC-3: attachFindingIdentity computes the id via computeFindingId with the file, anchor, severity, and message', () => {
    const input = finding({ severity: 'low', message: 'Matches computeFindingId' });
    const result = attachFindingIdentity({ 'src/example.ts': [input] });
    const expectedId = computeFindingId('src/example.ts', input.anchor, 'low', 'Matches computeFindingId');
    expect(result['src/example.ts']?.[0]?.id).toBe(expectedId);
  });

  it('AC-3: attachFindingIdentity maps every file and every finding in the input, preserving structure', () => {
    const result = attachFindingIdentity({
      'a.ts': [finding()],
      'b.ts': [finding(), finding({ message: 'second in b' })],
    });
    expect(Object.keys(result).sort()).toEqual(['a.ts', 'b.ts']);
    expect(result['a.ts']).toHaveLength(1);
    expect(result['b.ts']).toHaveLength(2);
  });
});
