import { describe, it, expect } from 'vitest';
import { findSpansForProfile } from '../../src/verify/coverage-profiles/engine.js';
import { getProfileForExtension, listProfiles, pythonProfile } from '../../src/verify/coverage-profiles/registry.js';

describe('built-in python profile (phase 167 T2, AC-2)', () => {
  it('is registered under .py and dispatch/registry reads from it (AC-2)', () => {
    expect(getProfileForExtension('.py')).toBe(pythonProfile);
    expect(getProfileForExtension('py')).toBe(pythonProfile); // extension without leading dot
    expect(listProfiles()).toContain(pythonProfile);
  });

  it('module-level def test_*(): with an assert inside yields a qualifying span (AC-2)', () => {
    const t = ['def test_foo():', '    x = 1  # AC-2', '    assert x == 1', ''].join('\n');
    const spans = findSpansForProfile(t, pythonProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-2');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('class-based def test_bar(self): resolves indentation relative to the method, not the class (AC-2)', () => {
    const t = [
      'class TestThing:',
      '    def test_bar(self):',
      '        value = compute()  # AC-2',
      '        assert value == 42',
      '',
      '    def test_baz(self):',
      '        pass',
      '',
    ].join('\n');
    const spans = findSpansForProfile(t, pythonProfile);
    expect(spans.length).toBe(2);

    const asserting = spans.find((s) => s.hasAssertion);
    expect(asserting).toBeDefined();
    const acIdx = t.indexOf('AC-2');
    expect(acIdx).toBeGreaterThanOrEqual(asserting!.start);
    expect(acIdx).toBeLessThanOrEqual(asserting!.end);

    // The asserting method's span must not swallow the sibling method's body.
    const bazBodyIdx = t.indexOf('pass');
    expect(bazBodyIdx).toBeGreaterThan(asserting!.end);

    const nonAsserting = spans.find((s) => !s.hasAssertion);
    expect(nonAsserting).toBeDefined();
  });

  it('a # comment mentioning something assertion-like does not create a false span (AC-2)', () => {
    const t = [
      'def test_commented():',
      '    # assert this used to fail, AC-2',
      '    x = 1',
      '',
    ].join('\n');
    const spans = findSpansForProfile(t, pythonProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
    // the AC-2 token lives only inside the masked-out comment
    const acIdx = t.indexOf('AC-2');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('a docstring containing assertion-looking text does not count as an assertion (AC-2, triple-quoted)', () => {
    const t = [
      'def test_documented():',
      '    """This docstring mentions assert something, AC-2, but is not code."""',
      '    x = 1',
      '',
    ].join('\n');
    const spans = findSpansForProfile(t, pythonProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });

  it("a single-quoted triple docstring ('''...''') is masked the same way as \"\"\"...\"\"\" (AC-2)", () => {
    const t = [
      'def test_single_quote_doc():',
      "    '''assert AC-2 mentioned here, but this is a docstring'''",
      '    x = 1',
      '',
    ].join('\n');
    const spans = findSpansForProfile(t, pythonProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });

  it('a plain string literal containing "assert" does not count as an assertion (AC-2)', () => {
    const t = ['def test_string_literal():', '    msg = "assert AC-2 fake"', ''].join('\n');
    const spans = findSpansForProfile(t, pythonProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });

  it('a non-asserting def test_baz(): yields a span but hasAssertion is false (AC-2)', () => {
    const t = ['def test_baz():', '    x = compute()', '    y = x + 1', ''].join('\n');
    const spans = findSpansForProfile(t, pythonProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });

  it('a non-test function (def helper():) is not picked up as an opener at all (AC-2)', () => {
    const t = ['def helper():', '    assert True', ''].join('\n');
    const spans = findSpansForProfile(t, pythonProfile);
    expect(spans.length).toBe(0);
  });

  it('async def test_*(): resolves indentation relative to the true line start, not past the async prefix (AC-2)', () => {
    const t = [
      'async def test_async_thing():',
      '    value = await compute()  # AC-2',
      '    assert value == 1',
      '',
    ].join('\n');
    const spans = findSpansForProfile(t, pythonProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-2');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
    // the body (including the assert) must not be truncated to just the header line
    const assertIdx = t.indexOf('assert value');
    expect(assertIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('a return-type-annotated def test_foo(x: Path) -> None: still matches as an opener (AC-1)', () => {
    const t = ['def test_foo(x: int) -> None:', '    assert x == 1  # AC-1', ''].join('\n');
    const spans = findSpansForProfile(t, pythonProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-1');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('async def test_foo() -> bool: still matches as an opener (AC-1)', () => {
    const t = ['async def test_async_bool() -> bool:', '    assert True  # AC-1', ''].join('\n');
    const spans = findSpansForProfile(t, pythonProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-1');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('an annotated class method (def test_bar(self) -> None:) still matches as an opener (AC-1)', () => {
    const t = [
      'class TestThing:',
      '    def test_bar(self) -> None:',
      '        value = compute()  # AC-1',
      '        assert value == 42',
      '',
    ].join('\n');
    const spans = findSpansForProfile(t, pythonProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-1');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('a richer return-type annotation (-> Optional[str]:) still matches as an opener (AC-1)', () => {
    const t = ['def test_optional() -> Optional[str]:', '    assert True  # AC-1', ''].join('\n');
    const spans = findSpansForProfile(t, pythonProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
  });

  it('sibling test functions are separated by the indentation boundary (AC-2)', () => {
    const t = [
      'def test_one():',
      '    assert 1 == 1',
      '',
      'def test_two():',
      '    assert 2 == 2',
      '',
    ].join('\n');
    const spans = findSpansForProfile(t, pythonProfile);
    expect(spans.length).toBe(2);
    expect(spans[0]!.hasAssertion).toBe(true);
    expect(spans[1]!.hasAssertion).toBe(true);
    // spans do not overlap
    expect(spans[0]!.end).toBeLessThan(spans[1]!.start);
  });
});
