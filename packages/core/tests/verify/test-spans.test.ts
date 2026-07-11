import { describe, it, expect } from 'vitest';
import { findTestSpans } from '../../src/verify/test-spans.js';

function spanCovers(text: string, needle: string): boolean {
  const at = text.indexOf(needle);
  return findTestSpans(text).some((s) => s.hasAssertion && at >= s.start && at <= s.end);
}

/**
 * Phase 169 T1 (red): `TestSpan` does not carry a `skipped` field yet, so any
 * access to it is `undefined` today. Cast to the shape T2 will add so this
 * compiles cleanly both before and after the fix — the assertion itself is
 * what must go red pre-fix.
 */
type SpanWithSkip = { start: number; end: number; hasAssertion: boolean; skipped?: boolean };

function spanFor(text: string, needle: string): SpanWithSkip | undefined {
  const at = text.indexOf(needle);
  return (findTestSpans(text) as SpanWithSkip[]).find((s) => at >= s.start && at <= s.end);
}

describe('findTestSpans (phase 108)', () => {
  it('an it() with expect() is a qualifying span covering its title (AC-2)', () => {
    const t = `it('does X (AC-1)', () => { expect(1).toBe(1); });`;
    expect(spanCovers(t, 'AC-1')).toBe(true);
  });

  it('an it() with NO assertion does not qualify (AC-2)', () => {
    const t = `it('does X (AC-1)', () => { const y = 2; });`;
    expect(spanCovers(t, 'AC-1')).toBe(false);
  });

  it('a bare comment mention is outside any span (AC-2)', () => {
    const t = `// AC-1 sets it up\nit('x', () => { expect(1).toBe(1); });`;
    expect(spanCovers(t, 'AC-1')).toBe(false);
  });

  it('a describe() label alone does not qualify (AC-2)', () => {
    const t = `describe('group AC-1', () => { it('x', () => { expect(1).toBe(1); }); });`;
    // AC-1 is in the describe title, not inside the inner it() span.
    expect(spanCovers(t, 'AC-1')).toBe(false);
  });

  it('parens inside the title string do not break span matching (AC-2)', () => {
    const t = `it('handles foo(bar) (AC-1)', () => { expect(ok).toBe(true); });`;
    expect(spanCovers(t, 'AC-1')).toBe(true);
  });

  it('assert() counts as an assertion (AC-2)', () => {
    const t = `test('y (AC-1)', () => { assert(thing); });`;
    expect(spanCovers(t, 'AC-1')).toBe(true);
  });

  it('.should counts as an assertion (AC-2)', () => {
    const t = `it('z (AC-1)', () => { result.should.equal(3); });`;
    expect(spanCovers(t, 'AC-1')).toBe(true);
  });

  it('it.only is recognized as an opener (AC-2)', () => {
    const t = `it.only('w (AC-1)', () => { expect(a).toBe(b); });`;
    expect(spanCovers(t, 'AC-1')).toBe(true);
  });

  it('an assertion mentioned only in a comment does not qualify the block (AC-2)', () => {
    const t = `it('q (AC-1)', () => { /* expect(x) */ const z = 1; });`;
    expect(spanCovers(t, 'AC-1')).toBe(false);
  });

  // Phase 169 T1 (red): the skip dodge. it.skip(...) with an intact
  // expect(1).toBe(1) inside must be flagged `skipped: true` — today
  // `TestSpan` has no `skipped` field at all, so this is `undefined` and the
  // assertion fails. Fixed in T2 (test-spans.ts opener-modifier capture).
  it('it.skip is flagged as a skipped span even with an intact assertion inside (AC-2)', () => {
    const t = `it.skip('does X (AC-1)', () => { expect(1).toBe(1); });`;
    const span = spanFor(t, 'AC-1');
    expect(span?.skipped).toBe(true);
  });

  // Phase 169 (T5 regression lock): `test.todo('AC-1: something')` has no
  // second (callback) argument at all — just a title string, then the
  // closing `)`. Verified against the real scanner rather than assumed: the
  // opener regex matches `test.todo(`, the paren-depth tracker then sees the
  // string-quote chars via the top-level `sq` state transition (which never
  // touches `active.code`) and finally the lone closing `)` brings
  // `active.depth` to 0 — so a real (if empty-bodied) span IS formed, with
  // `hasAssertion: false` (no code was ever appended to `active.code`) and
  // `skipped: true` (the `todo` modifier). This is what makes `test.todo`
  // with no body at all still count as a linked (skip-caused) ref rather
  // than silently falling outside every span.
  it('test.todo with no callback argument at all still forms a skipped, non-asserting span (AC-2, phase 169)', () => {
    const t = `test.todo('AC-1: something');`;
    const span = spanFor(t, 'AC-1');
    expect(span).toBeDefined();
    expect(span?.skipped).toBe(true);
    expect(span?.hasAssertion).toBe(false);
  });
});
