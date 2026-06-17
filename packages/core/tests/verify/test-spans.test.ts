import { describe, it, expect } from 'vitest';
import { findTestSpans } from '../../src/verify/test-spans.js';

function spanCovers(text: string, needle: string): boolean {
  const at = text.indexOf(needle);
  return findTestSpans(text).some((s) => s.hasAssertion && at >= s.start && at <= s.end);
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
});
