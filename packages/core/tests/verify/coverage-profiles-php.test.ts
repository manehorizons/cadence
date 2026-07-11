import { describe, it, expect } from 'vitest';
import { findSpansForProfile } from '../../src/verify/coverage-profiles/engine.js';
import { getProfileForExtension, listProfiles, phpProfile } from '../../src/verify/coverage-profiles/registry.js';

describe('built-in php profile (phase 167 T5, AC-5)', () => {
  it('is registered under .php and dispatch/registry reads from it (AC-5)', () => {
    expect(getProfileForExtension('.php')).toBe(phpProfile);
    expect(getProfileForExtension('php')).toBe(phpProfile); // extension without leading dot
    expect(listProfiles()).toContain(phpProfile);
  });

  it('Pest it(...) with expect()->toBe(1) inside yields a qualifying span (AC-5)', () => {
    const t = [
      "it('does something', function () {",
      '    $x = 1; // AC-5',
      '    expect($x)->toBe(1);',
      '});',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-5');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('Pest test(...) with expect()->toBeTrue() inside yields a qualifying span (AC-5)', () => {
    const t = [
      "test('does another thing', function () {",
      '    // AC-5',
      '    expect(true)->toBeTrue();',
      '});',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
  });

  it('PHPUnit public function testFoo(): void with $this->assertEquals inside a class yields a qualifying span (AC-5)', () => {
    const t = [
      'class FooTest extends TestCase {',
      '    public function testFoo(): void {',
      '        $x = 1; // AC-5',
      '        $this->assertEquals(1, $x);',
      '    }',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-5');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
    // span is bounded by the method's own closing brace, not the class's
    const classCloseIdx = t.lastIndexOf('}');
    expect(spans[0]!.end).toBeLessThan(classCloseIdx);
  });

  it('a non-asserting Pest closure yields a span but hasAssertion is false (AC-5)', () => {
    const t = [
      "it('does nothing meaningful', function () {",
      '    $x = 1; // AC-5',
      '    $x = $x + 1;',
      '});',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
    const acIdx = t.indexOf('AC-5');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('a non-asserting PHPUnit method yields a span but hasAssertion is false — matches PHPUnit\'s own discovery convention (AC-5)', () => {
    const t = [
      'public function testNothing(): void {',
      '    $x = 1; // AC-5',
      '    $x = $x + 1;',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });

  it('a // and # line comment mentioning assertion-looking text does not create a false assertion, Pest shape (AC-5)', () => {
    const t = [
      "it('comment test', function () {",
      "    // expect(1)->toBe(2), fake AC-5",
      "    # expect(1)->toBe(3), also fake",
      '    $x = 1;',
      '});',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });

  it('a /* block comment */ mentioning assertion-looking text does not create a false assertion, Pest shape (AC-5)', () => {
    const t = [
      "it('block comment test', function () {",
      '    /* expect(1)->toBe(4), fake too, AC-5 */',
      '    $x = 1;',
      '});',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });

  it('a // and # line comment mentioning assertion-looking text does not create a false assertion, PHPUnit shape (AC-5)', () => {
    const t = [
      'public function testCommentOnly(): void {',
      "    // \$this->assertTrue(false), fake AC-5",
      "    # \$this->assertFalse(true)",
      '    $x = 1;',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });

  it('a /* block comment */ mentioning assertion-looking text does not create a false assertion, PHPUnit shape (AC-5)', () => {
    const t = [
      'public function testBlockCommentOnly(): void {',
      "    /* \$this->assertNull(null), AC-5 */",
      '    $x = 1;',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });

  it('a string literal containing opener-looking or assertion-looking text does not confuse masking, Pest shape (AC-5)', () => {
    const t = [
      "it('spoofed content test', function () {",
      "    \$s1 = 'expect(1)->toBe(999), not real'; // AC-5",
      '    $s2 = "it(\'nested spoof\', function () { expect(2)->toBe(2); });";',
      '    $ok = true;',
      '    expect($ok)->toBeTrue();',
      '});',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    // Exactly one span (the real closure) — the fake "it(...)" text living
    // inside the double-quoted string must never be picked up as a second
    // opener: string content is hidden from opener matching by default.
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
  });

  it('a string literal containing opener-looking or assertion-looking text does not confuse masking, PHPUnit shape (AC-5)', () => {
    const t = [
      'public function testSpoofedContent(): void {',
      "    \$s1 = 'assertTrue(false), fake AC-5';",
      '    $s2 = "public function testNested(): void { $this->assertTrue(false); }";',
      '    $ok = true;',
      '    $this->assertTrue($ok);',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    // Exactly one span (the real method) — the fake "public function
    // testNested(...)" text living inside the double-quoted string must
    // never be picked up as a second opener.
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
  });

  it('a private or protected method, and a public non-test-prefixed method, are never picked up as PHPUnit openers (AC-5)', () => {
    const t = [
      'class FooTest extends TestCase {',
      '    private function testPrivateHelper(): void {',
      '        $this->assertTrue(true); // AC-5 (never reachable as a span)',
      '    }',
      '    protected function testProtectedHelper(): void {',
      '        $this->assertTrue(true);',
      '    }',
      '    public function helperNotATest(): void {',
      '        $this->assertTrue(true);',
      '    }',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(0);
  });

  it('a plain function named "it" or "test" outside any Pest-like closure-call context is never picked up as an opener (AC-5)', () => {
    // Neither a bare function DEFINITION named test/it, nor a bare CALL with
    // a value argument (no comma-then-function-keyword shape at all), can
    // satisfy the Pest opener's structural `, function` requirement — see
    // php.ts's module docstring ("Item 8") for why this is a structural
    // impossibility for ordinary PHP, not just an unlikely heuristic.
    const t = [
      'function test($x) { // AC-5',
      '    return $x + 1;',
      '}',
      'function it($y) {',
      '    return $y * 2;',
      '}',
      '$result = test(5);',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(0);
  });

  it('a single-argument Pest closure with no description string is not recognized — documented scope decision (AC-5)', () => {
    // AC-5's Given clause specifies description-bearing it()/test() closures;
    // a bare single-arg closure form has no `,` between `(` and `function`
    // at all, so it is out of scope for this fixed opener shape (mirrors the
    // "fixed representative set" precedent already established by every
    // other built-in profile). Verified explicitly rather than assumed.
    const t = ['test(function () {', '    expect(1)->toBe(1); // AC-5', '});'].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(0);
  });

  it('both Pest and PHPUnit shapes in the same file are both recognized independently, without one corrupting the other (AC-5)', () => {
    const t = [
      "it('pest one', function () {",
      '    expect(1)->toBe(1); // AC-5',
      '});',
      '',
      'class BarTest extends TestCase {',
      '    public function testBar(): void {',
      '        $this->assertEquals(2, 2); // AC-5 too',
      '    }',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(2);
    expect(spans[0]!.hasAssertion).toBe(true);
    expect(spans[1]!.hasAssertion).toBe(true);
    // The two spans must not overlap.
    expect(spans[0]!.end).toBeLessThan(spans[1]!.start);
  });

  it('heredoc content NESTED inside a real opener is correctly masked as string content, not scanned as code (AC-5, T5 review fix)', () => {
    // heredoc/nowdoc is now masked via LanguageSyntax.heredocs (php.ts /
    // mask.ts, T5 review fix) exactly like any other string. The real outer
    // Pest closure's own span is still found and still qualifies (via its
    // own expect() call), and the fake PHPUnit-shaped text living inside the
    // heredoc never independently creates a second span, now because it's
    // masked as string content, not merely because it happens to sit inside
    // an already-resolved block.
    const t = [
      "it('heredoc content test', function () {",
      '    $sql = <<<EOT',
      '    public function testFake(): void { $this->assertTrue(false); }',
      '    EOT;',
      '    expect($sql)->toBeString(); // AC-5',
      '});',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
  });

  it('a STANDALONE heredoc containing a complete, balanced-brace PHPUnit-shaped snippet no longer produces a fabricated span (AC-5, T5 review fix)', () => {
    // A first version of this profile left heredoc entirely unmasked, and
    // this exact fixture — a standalone, file-scope heredoc (e.g. a
    // code-generation test's expected-output fixture) whose body happens to
    // form a complete, balanced-brace PHPUnit-shaped snippet — produced a
    // genuinely fabricated span, verified empirically, not hypothesized.
    // LanguageSyntax.heredocs closes this: the entire heredoc body (this
    // fixture contains no real, top-level opener at all) is now masked as
    // string content, so zero spans are found — the fake test-shaped text
    // was never real code and no longer satisfies assertion-mode coverage.
    const t = [
      '$template = <<<EOT',
      'public function testGenerated(): void {',
      '    $this->assertTrue(true); // AC-5',
      '}',
      'EOT;',
      'echo $template;',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(0);
  });

  it('nowdoc (single-quoted identifier) and a double-quoted heredoc identifier are both masked identically to plain heredoc (AC-5, T5 review fix)', () => {
    const nowdoc = [
      "$sql = <<<'SQL'",
      'SELECT * FROM users; -- fake assert_eq!(1,1), AC-5',
      'SQL;',
      'echo $sql;',
    ].join('\n');
    expect(findSpansForProfile(nowdoc, phpProfile).length).toBe(0);

    const quotedIdentifier = [
      '$template = <<<"EOT"',
      'public function testFake(): void { $this->assertTrue(false); }',
      'EOT;',
      'echo $template;',
    ].join('\n');
    expect(findSpansForProfile(quotedIdentifier, phpProfile).length).toBe(0);
  });

  it('an indented heredoc closing marker (PHP 7.3+ flexible syntax) is still correctly recognized as the close (AC-5, T5 review fix)', () => {
    const t = [
      "it('flexible heredoc', function () {",
      '    $sql = <<<EOT',
      '        public function testFake(): void { $this->assertTrue(false); }',
      '        EOT;',
      '    expect($sql)->toBeString(); // AC-5',
      '});',
    ].join('\n');
    const spans = findSpansForProfile(t, phpProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
  });
});
