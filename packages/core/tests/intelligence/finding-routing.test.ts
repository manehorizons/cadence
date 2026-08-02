import { describe, it, expect } from 'vitest';
import type { Finding } from '@thomas-powers-jr/cadence-types';
import type { AddRecommendationInput } from '../../src/intelligence/store/recommendations.js';
import {
  deriveRoutingCandidates,
  type RoutingCandidate,
  type RoutingSettlePointer,
} from '../../src/intelligence/finding-routing.js';

// Phase 242 (T2, §7.3, dec-20260731-001) — pure finding-routing derivation.
// Covers AC-2 (dedup across settles via an already-routed id set), AC-3 (skip
// findings with no stable id), AC-4 (one scoutId per batch), AC-7 (merge
// same-id findings within one settle, recording the occurrence count).
// Phase 245 (245-01, T4) adds AC-5: since computeFindingId no longer hashes
// severity, a same-id merge group can now legitimately disagree on severity
// — the merge must take the most severe value seen, not whichever occurrence
// arrived first.

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: 'high',
    message: 'Unhandled promise rejection',
    ...overrides,
  };
}

function pointer(overrides: Partial<RoutingSettlePointer> = {}): RoutingSettlePointer {
  return {
    phaseId: '242-findings-to-ledger-auto-routing',
    draftId: '242-01',
    contentHash: 'abc123',
    summaryPath: '.cadence/phases/242-findings-to-ledger-auto-routing/242-01-SUMMARY.json',
    ...overrides,
  };
}

const NOW = new Date('2026-07-31T21:59:00Z');

describe('deriveRoutingCandidates — empty input', () => {
  it('an empty findingsByFile input returns an empty list', () => {
    const result = deriveRoutingCandidates({}, new Set(), pointer(), NOW);
    expect(result).toEqual([]);
  });
});

describe('deriveRoutingCandidates — AC-3: findings without a stable id are excluded', () => {
  it('242-01/AC-3: a finding with no id is excluded while a sibling finding with an id is still routed', () => {
    const withId = finding({ id: 'id-has-identity', message: 'has identity' });
    const withoutId = finding({ message: 'no identity yet (e.g. security-audit)' });
    const result = deriveRoutingCandidates(
      { 'src/a.ts': [withId, withoutId] },
      new Set(),
      pointer(),
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.sourceFindingId).toBe('id-has-identity');
  });

  it('242-01/AC-3: a finding with an empty-string id is treated the same as no id', () => {
    const result = deriveRoutingCandidates(
      { 'src/a.ts': [finding({ id: '' })] },
      new Set(),
      pointer(),
      NOW,
    );
    expect(result).toEqual([]);
  });
});

describe('deriveRoutingCandidates — AC-2: already-routed ids are excluded (dedup across settles)', () => {
  it('242-01/AC-2: a finding whose id is already in the routed set is excluded, while a fresh id in the same batch still routes', () => {
    const alreadyRouted = finding({ id: 'id-already-routed', message: 'seen before' });
    const fresh = finding({ id: 'id-fresh', message: 'new this settle' });
    const result = deriveRoutingCandidates(
      { 'src/a.ts': [alreadyRouted, fresh] },
      new Set(['id-already-routed']),
      pointer(),
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.sourceFindingId).toBe('id-fresh');
  });
});

describe('deriveRoutingCandidates — AC-4: one scoutId per batch', () => {
  it('242-01/AC-4: two or more new findings in one call share exactly one, correctly-formatted scoutId', () => {
    const a = finding({ id: 'id-a', message: 'first' });
    const b = finding({ id: 'id-b', message: 'second' });
    const result = deriveRoutingCandidates(
      { 'src/a.ts': [a], 'src/b.ts': [b] },
      new Set(),
      pointer(),
      NOW,
    );
    expect(result).toHaveLength(2);
    // Exact-string assertion (not just mutual equality) — guards against a
    // getHours()-for-getUTCHours() slip and pins the scout-YYYYMMDD-HHMM
    // convention derived from the injected `now`, in UTC.
    expect(result[0]?.scoutId).toBe('scout-20260731-2159');
    expect(result[1]?.scoutId).toBe('scout-20260731-2159');
  });
});

describe('deriveRoutingCandidates — AC-7: same-id findings merge with an occurrence count', () => {
  it('242-01/AC-7: two findings sharing one id in the same settle (same message — the only way a real collision arises, since message is a computeFindingId hash input — but different lines, which the hash excludes) merge into a single candidate whose summary and evidence.summary both state the occurrence count and list every occurrence\'s line', () => {
    const occurrenceA = finding({ id: 'id-dup', message: 'same finding message', line: 10 });
    const occurrenceB = finding({ id: 'id-dup', message: 'same finding message', line: 45 });
    const result = deriveRoutingCandidates(
      { 'src/a.ts': [occurrenceA, occurrenceB] },
      new Set(),
      pointer(),
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.sourceFindingId).toBe('id-dup');
    expect(result[0]?.summary).toContain('2 occurrences merged');
    expect(result[0]?.summary).toContain('lines 10, 45');
    expect(result[0]?.evidence.summary).toContain('2 occurrences merged');
    expect(result[0]?.evidence.summary).toContain('lines 10, 45');
    // Merged candidates cite the file alone (no single line represents the
    // whole group) — pins that the location string doesn't silently pick
    // one occurrence's line and hide the others.
    expect(result[0]?.summary).not.toMatch(/src\/a\.ts:\d+:/);
  });

  it('242-01/AC-7: three occurrences of one id merge into one candidate stating "3 occurrences merged" and listing all three lines in encounter order', () => {
    const one = finding({ id: 'id-triple', message: 'shared message', line: 1 });
    const two = finding({ id: 'id-triple', message: 'shared message', line: 2 });
    const three = finding({ id: 'id-triple', message: 'shared message', line: 3 });
    const result = deriveRoutingCandidates(
      { 'src/a.ts': [one, two, three] },
      new Set(),
      pointer(),
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.evidence.summary).toContain('3 occurrences merged');
    expect(result[0]?.evidence.summary).toContain('lines 1, 2, 3');
  });

  it('242-01/AC-7: an occurrence with no line number is omitted from the lines list rather than rendering as "undefined"', () => {
    const withLine = finding({ id: 'id-partial-line', message: 'shared message', line: 7 });
    const withoutLine = finding({ id: 'id-partial-line', message: 'shared message' });
    const result = deriveRoutingCandidates(
      { 'src/a.ts': [withLine, withoutLine] },
      new Set(),
      pointer(),
      NOW,
    );
    expect(result[0]?.evidence.summary).toContain('2 occurrences merged, lines 7');
    expect(result[0]?.evidence.summary).not.toContain('undefined');
  });

  it('242-01/AC-7: a non-duplicated (single-occurrence) finding does not mention occurrences at all', () => {
    const result = deriveRoutingCandidates(
      { 'src/a.ts': [finding({ id: 'id-solo' })] },
      new Set(),
      pointer(),
      NOW,
    );
    expect(result[0]?.summary).not.toContain('occurrences merged');
    expect(result[0]?.evidence.summary).not.toContain('occurrences merged');
  });
});

describe('deriveRoutingCandidates — AC-5: same-id/different-severity merge takes the most severe', () => {
  // Phase 245 narrowed computeFindingId to (file, normalized message) only,
  // so two occurrences of the same id can now legitimately disagree on
  // severity (previously impossible — severity was a hash input). The merge
  // must never silently keep whichever severity happened to arrive first,
  // since priority (derived from severity) drives ledger triage.
  it('245-01/AC-5: a medium occurrence followed by a critical occurrence of the same id merges to priority critical', () => {
    const first = finding({ id: 'id-severity-drift', message: 'same message', severity: 'medium', line: 10 });
    const second = finding({ id: 'id-severity-drift', message: 'same message', severity: 'critical', line: 20 });
    const result = deriveRoutingCandidates(
      { 'src/a.ts': [first, second] },
      new Set(),
      pointer(),
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.priority).toBe('critical');
    expect(result[0]?.title).toContain('critical');
    // Occurrence/line bookkeeping must stay correct regardless of which
    // occurrence became canonical.
    expect(result[0]?.summary).toContain('2 occurrences merged');
    expect(result[0]?.summary).toContain('lines 10, 20');
  });

  it('245-01/AC-5: the same pair in reverse order (critical first, medium second) still merges to priority critical — the less-severe later occurrence never downgrades the group', () => {
    const first = finding({ id: 'id-severity-drift-rev', message: 'same message', severity: 'critical', line: 20 });
    const second = finding({ id: 'id-severity-drift-rev', message: 'same message', severity: 'medium', line: 10 });
    const result = deriveRoutingCandidates(
      { 'src/a.ts': [first, second] },
      new Set(),
      pointer(),
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.priority).toBe('critical');
    expect(result[0]?.title).toContain('critical');
    expect(result[0]?.summary).toContain('2 occurrences merged');
    expect(result[0]?.summary).toContain('lines 20, 10');
  });

  it('245-01/AC-5: three occurrences (medium, low, high) merge to the highest severity seen (high), not the first or the last', () => {
    const a = finding({ id: 'id-severity-triple', message: 'same message', severity: 'medium', line: 1 });
    const b = finding({ id: 'id-severity-triple', message: 'same message', severity: 'low', line: 2 });
    const c = finding({ id: 'id-severity-triple', message: 'same message', severity: 'high', line: 3 });
    const result = deriveRoutingCandidates(
      { 'src/a.ts': [a, b, c] },
      new Set(),
      pointer(),
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.priority).toBe('high');
  });
});

describe('deriveRoutingCandidates — settle-pointer plumbing', () => {
  it("evidence.path is the settle's SUMMARY.json path, and evidence.summary names the phase id, draftId, and contentHash", () => {
    const p = pointer({
      phaseId: '242-findings-to-ledger-auto-routing',
      draftId: '242-01',
      contentHash: 'deadbeef',
      summaryPath: '.cadence/phases/242-findings-to-ledger-auto-routing/242-01-SUMMARY.json',
    });
    const result = deriveRoutingCandidates(
      { 'src/a.ts': [finding({ id: 'id-pointer-check' })] },
      new Set(),
      p,
      NOW,
    );
    expect(result[0]?.evidence.path).toBe(p.summaryPath);
    expect(result[0]?.evidence.summary).toContain('242-findings-to-ledger-auto-routing');
    expect(result[0]?.evidence.summary).toContain('242-01');
    expect(result[0]?.evidence.summary).toContain('deadbeef');
  });
});

describe('deriveRoutingCandidates — secret redaction', () => {
  it("a finding message quoting a live-looking credential is redacted in title, summary, and evidence.summary — addRecommendation only redacts evidence.summary, so this module can't rely on it", () => {
    // gitleaks:allow — fake key, redaction fixture
    const leaked = 'AKIAABCDEFGHIJKLMNOP';
    const result = deriveRoutingCandidates(
      { 'src/leak.ts': [finding({ id: 'id-leak', message: `hardcoded credential: ${leaked}` })] },
      new Set(),
      pointer(),
      NOW,
    );
    const candidate = result[0];
    expect(candidate?.title).not.toContain(leaked);
    expect(candidate?.summary).not.toContain(leaked);
    expect(candidate?.evidence.summary).not.toContain(leaked);
    expect(candidate?.title).toContain('[REDACTED]');
    expect(candidate?.summary).toContain('[REDACTED]');
    expect(candidate?.evidence.summary).toContain('[REDACTED]');
  });
});

describe('deriveRoutingCandidates — severity to priority mapping', () => {
  it('severity maps identically onto RecommendationPriority (critical/high/medium/low)', () => {
    const result = deriveRoutingCandidates(
      {
        'src/a.ts': [
          finding({ id: 'id-critical', severity: 'critical' }),
          finding({ id: 'id-high', severity: 'high' }),
          finding({ id: 'id-medium', severity: 'medium' }),
          finding({ id: 'id-low', severity: 'low' }),
        ],
      },
      new Set(),
      pointer(),
      NOW,
    );
    const byId = new Map(result.map((c) => [c.sourceFindingId, c]));
    expect(byId.get('id-critical')?.priority).toBe('critical');
    expect(byId.get('id-high')?.priority).toBe('high');
    expect(byId.get('id-medium')?.priority).toBe('medium');
    expect(byId.get('id-low')?.priority).toBe('low');
  });
});

describe('deriveRoutingCandidates — shape compatibility with AddRecommendationInput', () => {
  it('a RoutingCandidate is directly assignable into AddRecommendationInput (T3 needs no re-derivation)', () => {
    const result = deriveRoutingCandidates(
      { 'src/a.ts': [finding({ id: 'id-shape-check' })] },
      new Set(),
      pointer(),
      NOW,
    );
    const candidate = result[0] as RoutingCandidate;
    // Type-only assignability check: fails typecheck (not just at runtime) if
    // RoutingCandidate ever structurally drifts from AddRecommendationInput —
    // e.g. if T1's RecommendationEvidenceOverride shape changes and this
    // module's locally-declared evidence shape (kept structurally identical
    // on purpose, per the "no ledger-store imports" boundary) isn't updated
    // to match.
    const asInput: AddRecommendationInput = candidate;
    expect(asInput.sourceFindingId).toBe('id-shape-check');
  });
});
