import { describe, it, expect } from 'vitest';
import { findSpansForProfile } from '../../src/verify/coverage-profiles/engine.js';
import { getProfileForExtension, listProfiles, rustProfile } from '../../src/verify/coverage-profiles/registry.js';

describe('built-in rust profile (phase 167 T4, AC-4)', () => {
  it('is registered under .rs and dispatch/registry reads from it (AC-4)', () => {
    expect(getProfileForExtension('.rs')).toBe(rustProfile);
    expect(getProfileForExtension('rs')).toBe(rustProfile); // extension without leading dot
    expect(listProfiles()).toContain(rustProfile);
  });

  it('a #[test] fn with an assert! inside yields a qualifying span (AC-4)', () => {
    const t = [
      '#[test]',
      'fn test_basic() {',
      '    let x = 1; // AC-4',
      '    assert!(x == 1);',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-4');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('stacked attributes (#[test] then #[should_panic(expected = "...")]) still qualify (AC-4)', () => {
    const t = [
      '#[test]',
      '#[should_panic(expected = "boom")]',
      'fn test_panics() {',
      '    assert!(false, "AC-4 about to panic");',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-4');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('a blank line between #[test] and fn is tolerated (whitespace/newline handling) (AC-4)', () => {
    const t = [
      '#[test]',
      '',
      'fn test_blank_line_between() {',
      '    assert_eq!(1 + 1, 2); // AC-4',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
  });

  it('functions inside a #[cfg(test)] mod tests { ... } block are correctly recognized (AC-4)', () => {
    const t = [
      '#[cfg(test)]',
      'mod tests {',
      '    use super::*;',
      '',
      '    #[test]',
      '    fn test_inside_mod() {',
      '        let x = 2 + 2;',
      '        assert_eq!(x, 4); // AC-4',
      '    }',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    // Only the inner #[test] fn qualifies as an opener; the wrapping mod item
    // has no #[test] attribute of its own.
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-4');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
    // The span must be bounded by the inner fn's own closing brace, not the
    // outer mod's — the mod's final '}' is strictly after the span end.
    const modCloseIdx = t.lastIndexOf('}');
    expect(spans[0]!.end).toBeLessThan(modCloseIdx);
  });

  it('assert_eq! and assert_ne! both count as assertions (AC-4)', () => {
    const t = [
      '#[test]',
      'fn test_eq_ne() {',
      '    assert_eq!(1 + 1, 2); // AC-4',
      '    assert_ne!(1, 2);',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
  });

  it('assert_ne! alone (no plain assert!/assert_eq!) still qualifies as an assertion (AC-4)', () => {
    const t = ['#[test]', 'fn test_ne_only() {', '    assert_ne!(1, 2); // AC-4', '}'].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
  });

  it('a commented-out "// #[test]" attribute immediately followed by a real fn does NOT match (AC-4)', () => {
    const t = [
      '// #[test]',
      'fn not_actually_a_test() {',
      '    assert_eq!(1, 1); // AC-4',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(0);
  });

  it('a lifetime annotation is never mis-masked as a dangling char-literal string that swallows the rest of the file (AC-4)', () => {
    const t = [
      '#[test]',
      'fn test_lifetime_safe() {',
      "    fn identity<'a>(x: &'a str) -> &'a str { x }",
      '    let s = String::from("hello");',
      '    let r = identity(&s);',
      '    assert_eq!(r, "hello"); // AC-4',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    // If the lifetime `'a` were mis-masked as an unterminated char-literal
    // string, everything after it (including the closing braces and the
    // real assert_eq!) would be swallowed as "string" content, and
    // brace-delimited would never find a matching '}' — yielding zero spans.
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-4');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('a raw string containing assertion-looking or attribute-looking text does not count / does not confuse masking (AC-4)', () => {
    const t = [
      '#[test]',
      'fn test_raw_string_no_confuse() {',
      '    let s = r#"assert_eq!(1, 2); #[test] fn fake() {}"#;',
      '    assert_eq!(s.len() > 0, true); // AC-4',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    // Exactly one span (the real fn) — the fake "#[test] fn fake()" text
    // living inside the raw string must never be picked up as a second
    // opener, since string content is hidden from opener matching.
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-4', t.indexOf('s.len'));
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('a raw string with a hash count containing a bare backslash is not treated as an escape (AC-4, raw strings have no escape mechanism)', () => {
    const t = [
      '#[test]',
      'fn test_raw_hash_backslash() {',
      String.raw`    let path = r#"C:\some\path"#; // AC-4`,
      '    assert_eq!(path.contains(\'C\'), true);',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
  });

  it('a raw string exceeding any fixed hash-count bound does not expose its own content as live code (AC-4, T4 review fix)', () => {
    // An earlier version enumerated raw-string delimiters for a fixed hash
    // bound (0-8); a hash count beyond that fell through to the plain "..."
    // delimiter, which closed early on a quote embedded in the raw string's
    // own content, exposing decoy text as live code — a real, constructible
    // false positive, not hypothetical. `fencedStrings` has no such bound.
    const nineHashes = [
      '#[test]',
      'fn test_no_real_assertion() {',
      '    let s = r#########"prefix "assert_eq!(1, 1); "trailing"#########;',
      '    let z = 1;',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(nineHashes, rustProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);

    // Sanity: a real assertion in the same shape is still found correctly.
    const nineHashesReal = [
      '#[test]',
      'fn test_real_assertion() {',
      '    let s = r#########"prefix "decoy" trailing"#########; // AC-4',
      '    assert_eq!(s.len() > 0, true);',
      '}',
    ].join('\n');
    const spans2 = findSpansForProfile(nineHashesReal, rustProfile);
    expect(spans2.length).toBe(1);
    expect(spans2[0]!.hasAssertion).toBe(true);
  });

  it('a raw identifier (r#type, r#match) is never mistaken for a raw-string open (AC-4, T4 review fix)', () => {
    // `r#` followed by a letter (not a quote) is Rust's raw-identifier
    // syntax, escaping a reserved keyword as a normal identifier — it must
    // never be treated as the start of a fenced raw string.
    const t = [
      '#[test]',
      'fn test_raw_identifier() {',
      '    let r#type = 5; // AC-4',
      '    assert_eq!(r#type, 5);',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-4');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('a char literal containing a structurally significant character loses the span entirely rather than producing a wrong one (AC-4, documented false-negative-safe limitation)', () => {
    // Char literals are deliberately unmasked (see module docstring) so
    // lifetimes are never mis-swallowed. The accepted cost: a char literal
    // like '{' unbalances brace-delimited's own depth tracking, losing the
    // whole span — 0 spans, never a fabricated/wrong one.
    const t = [
      '#[test]',
      "fn test_brace_char() { let x = '{'; assert_eq!(x, '{'); }",
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(0);
  });

  it('a // comment mentioning assert_eq! does not create a false assertion (AC-4)', () => {
    const t = [
      '#[test]',
      'fn test_commented() {',
      '    // assert_eq!(1, 2), fake AC-4',
      '    let x = 1;',
      '    let _ = x;',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
    const acIdx = t.indexOf('AC-4');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('a /* block comment */ mentioning an assertion does not create a false assertion (AC-4)', () => {
    const t = [
      '#[test]',
      'fn test_block_commented() {',
      '    /* assert_eq!(1, 2), fake AC-4 */',
      '    let x = 1;',
      '    let _ = x;',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });

  it('a string literal containing assertion-looking text does not count as an assertion (AC-4)', () => {
    const t = [
      '#[test]',
      'fn test_string_no_confuse() {',
      '    let s = "assert_eq!(1, 2), fake AC-4";',
      '    let _ = s;',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });

  it('a non-test function (no #[test] attribute) is never picked up as an opener, even if named suggestively (AC-4)', () => {
    const t = ['fn compute_test_result() {', '    assert_eq!(1, 1); // AC-4', '}'].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(0);
  });

  it('#[should_panic] alone with no #[test] attribute does NOT count as a test opener (AC-4)', () => {
    const t = [
      '#[should_panic]',
      'fn test_panic_only() {',
      '    assert!(false, "AC-4 no test attr");',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(0);
  });

  it('a non-asserting #[test] fn yields a span but hasAssertion is false (AC-4)', () => {
    const t = ['#[test]', 'fn test_no_assertion() {', '    let x = 1; // AC-4', '    let _ = x;', '}'].join(
      '\n',
    );
    const spans = findSpansForProfile(t, rustProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });
});
