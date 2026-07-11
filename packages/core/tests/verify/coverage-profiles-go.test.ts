import { describe, it, expect } from 'vitest';
import { findSpansForProfile } from '../../src/verify/coverage-profiles/engine.js';
import { getProfileForExtension, listProfiles, goProfile } from '../../src/verify/coverage-profiles/registry.js';

describe('built-in go profile (phase 167 T3, AC-3)', () => {
  it('is registered under .go and dispatch/registry reads from it (AC-3)', () => {
    expect(getProfileForExtension('.go')).toBe(goProfile);
    expect(getProfileForExtension('go')).toBe(goProfile); // extension without leading dot
    expect(listProfiles()).toContain(goProfile);
  });

  it('func TestFoo(t *testing.T) with a t.Error inside yields a qualifying span (AC-3)', () => {
    const t = [
      'func TestFoo(t *testing.T) {',
      '\tgot := 1 // AC-3',
      '\tif got != 1 {',
      '\t\tt.Errorf("bad: %d", got)',
      '\t}',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, goProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-3');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('a t.Run subtest closure nested inside the outer test function is captured within the outer span (AC-3)', () => {
    const t = [
      'func TestOuter(t *testing.T) {',
      '\tt.Run("subtest name", func(t *testing.T) {',
      '\t\tgot := compute() // AC-3',
      '\t\tif got != 42 {',
      '\t\t\tt.Fatalf("want 42, got %d", got)',
      '\t\t}',
      '\t})',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, goProfile);
    // Only the outer TestOuter opener qualifies: the inner func(t *testing.T)
    // closure is anonymous and never matches the `func Test...` opener.
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-3');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
    // the subtest's closing brace (the last '}') must be inside the span, i.e.
    // the whole nested t.Run(...) call is folded into the outer function's body
    const lastBraceIdx = t.lastIndexOf('}');
    expect(lastBraceIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('a table-driven test with a for/range loop and t.Run subtests qualifies as one outer span covering the whole body (AC-3)', () => {
    const t = [
      'func TestTableDriven(t *testing.T) {',
      '\ttests := []struct {',
      '\t\tname string',
      '\t\tin   int',
      '\t\twant int',
      '\t}{',
      '\t\t{"double one", 1, 2}, // AC-3',
      '\t\t{"double two", 2, 4},',
      '\t}',
      '\tfor _, tt := range tests {',
      '\t\tt.Run(tt.name, func(t *testing.T) {',
      '\t\t\tgot := double(tt.in)',
      '\t\t\tassert.Equal(t, tt.want, got)',
      '\t\t})',
      '\t}',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, goProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-3');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
    // the assert.Equal call inside the nested t.Run closure is inside the span
    const assertIdx = t.indexOf('assert.Equal');
    expect(assertIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('a // comment mentioning t.Error does not create a false span (AC-3)', () => {
    const t = [
      'func TestCommented(t *testing.T) {',
      '\t// t.Error("fake"), AC-3',
      '\tx := 1',
      '\t_ = x',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, goProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
    const acIdx = t.indexOf('AC-3');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('a /* block comment */ mentioning an assertion does not create a false span (AC-3)', () => {
    const t = [
      'func TestBlockCommented(t *testing.T) {',
      '\t/* t.Fatal("fake"), AC-3 */',
      '\tx := 1',
      '\t_ = x',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, goProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });

  it('a string literal or raw string containing assertion-looking text does not count as an assertion (AC-3)', () => {
    const t = [
      'func TestStrings(t *testing.T) {',
      '\tinterp := "t.Error(fake) AC-3"',
      '\traw := `t.Fatal(fake) AC-3`',
      '\t_ = interp',
      '\t_ = raw',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, goProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });

  it('a raw string containing a backslash is not treated as an escape (AC-3, raw strings have no escape mechanism)', () => {
    // If mask.ts's generic escape handling ignored `escape: null`, the
    // trailing backslash below would "escape" the closing backtick and the
    // rest of the file would be swallowed as string content, hiding the
    // real t.Fatalf(...) assertion entirely.
    const t = [
      'func TestRawBackslash(t *testing.T) {',
      '\tpath := `C:\\some\\path` // AC-3',
      '\tif path == "" {',
      '\t\tt.Fatalf("empty path")',
      '\t}',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, goProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
  });

  it('a non-asserting func TestBar(t *testing.T) yields a span but hasAssertion is false (AC-3)', () => {
    const t = ['func TestBar(t *testing.T) {', '\tx := 1', '\t_ = x', '}'].join('\n');
    const spans = findSpansForProfile(t, goProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(false);
  });

  it('a non-test function (func helper() {...}) is never picked up as an opener (AC-3)', () => {
    const t = ['func helper() {', '\tt.Error("should never run")', '}'].join('\n');
    const spans = findSpansForProfile(t, goProfile);
    expect(spans.length).toBe(0);
  });

  it('a Test-prefixed non-testing.T function is never picked up as an opener (AC-3)', () => {
    const t = ['func TestData(x int) int {', '\treturn x + 1', '}'].join('\n');
    const spans = findSpansForProfile(t, goProfile);
    expect(spans.length).toBe(0);
  });

  it('a fake "*testing.T" living inside a comment in the param list cannot spoof the opener (AC-3, engine hardening fix)', () => {
    // Before the engine fix, findSpansForProfile matched openerPattern against
    // raw text, so a required interior literal like `*testing\.T` could be
    // satisfied by text inside a masked comment in the same signature — this
    // function is not a real Go test and must never yield a span.
    const spoofedViaComment = [
      'func TestFake(',
      '\tx SomeOtherType, /* not *testing.T at all */',
      ') {',
      '\tt.Error("should never be reachable")',
      '}',
    ].join('\n');
    expect(findSpansForProfile(spoofedViaComment, goProfile).length).toBe(0);
  });

  it('a fake "*testing.T" living inside a struct-tag string literal in the param list cannot spoof the opener (AC-3, engine hardening fix round 2)', () => {
    // A first fix round left string content visible to opener matching (to
    // preserve do-end-keyword's legitimate quoted-title design), which a
    // second independent review defeated: an anonymous struct-type parameter
    // with a field tag is ordinary, spec-legal Go, and a tag string can
    // contain "*testing.T" without the parameter's real type being
    // *testing.T at all. The go profile does not set `openerMatchesStrings`,
    // so this is now blocked by default (comments AND strings both hidden
    // from opener matching).
    const spoofedViaStructTag = [
      'func TestWeirdConfig(t struct {',
      '\tTag string `x:"*testing.T"`',
      '}) {',
      '\tdoSomethingCompletelyUnrelatedAndNotATest(t)',
      '}',
    ].join('\n');
    expect(findSpansForProfile(spoofedViaStructTag, goProfile).length).toBe(0);
  });

  it('a "*testing.T" nested inside a function-type parameter\'s own parens cannot spoof the opener (AC-3, engine hardening fix round 3)', () => {
    // A third independent review defeated the round-2 fix with pure, valid
    // code — no comment or string trickery at all: `[^)]*literal[^)]*\)` is
    // not paren-depth-aware, so a top-level parameter whose TYPE is itself a
    // function type with its own `(...)` (e.g. `cb func(x *testing.T)`)
    // supplies an early, unrelated closing paren that let the old wildcard
    // "find" the literal before ever reaching this signature's own true
    // closing paren. `openerRequiredLiteral` now closes this: the required
    // literal is tested only against the TOP-LEVEL parameter-list text, with
    // nested sub-expression interiors excluded entirely.
    const spoofedViaNestedFuncType = [
      'func TestSpoof(cb func(x *testing.T)) {',
      '\tt.Error("noop, t is not even in scope, this never runs under go test")',
      '}',
    ].join('\n');
    expect(findSpansForProfile(spoofedViaNestedFuncType, goProfile).length).toBe(0);

    // Same vector, but via an unremarkable, non-malicious real-world idiom —
    // a fixture/helper that accepts a testing callback. This was never a
    // deliberate spoof attempt; ordinary Go authors write this shape, so the
    // bug was a plain correctness bug as much as a security-relevant one.
    const ordinaryFixtureBuilder = [
      'func TestFixtureBuilder(name string, setup func(t *testing.T)) *Server {',
      '\tsrv := newServer(name)',
      '\tassert.NotNil(srv)',
      '\treturn srv',
      '}',
    ].join('\n');
    expect(findSpansForProfile(ordinaryFixtureBuilder, goProfile).length).toBe(0);
  });

  it('a "{"-bearing type in the parameter list (e.g. an inline struct{} param) does not truncate the span before the real body (AC-3, engine hardening fix round 4)', () => {
    // A fourth independent review found that round 3's opener-shortening fix
    // (openerPattern now ends right after the opening '(') was a regression:
    // brace-delimited's own "scan forward for the next '{'" search, resumed
    // from right after the opening paren, could be fooled by a `{`-bearing
    // parameter type occurring anywhere before the real function body —
    // e.g. an inline struct{...} parameter — mistaking the struct's own
    // brace for the function body's, truncating the span and silently
    // losing the real assertion. The engine now resumes block resolution
    // from AFTER the parameter list's true closing paren, restoring the
    // pre-round-3 behavior while keeping round 3's spoof-proof literal check.
    const structParamNotConfusedWithBody = [
      'func TestX(t *testing.T, cfg struct{ Name string }) {',
      '\tt.Error("boom")',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(structParamNotConfusedWithBody, goProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const errIdx = structParamNotConfusedWithBody.indexOf('t.Error');
    expect(errIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(errIdx).toBeLessThanOrEqual(spans[0]!.end);

    // Also confirm the common `map[K]struct{}` idiom doesn't confuse it either.
    const mapOfEmptyStructParam = [
      'func TestY(t *testing.T, seen map[string]struct{}) {',
      '\tt.Fatal("boom")',
      '}',
    ].join('\n');
    const spans2 = findSpansForProfile(mapOfEmptyStructParam, goProfile);
    expect(spans2.length).toBe(1);
    expect(spans2[0]!.hasAssertion).toBe(true);
  });

  it('testify require.NoError(t, err) counts as an assertion (AC-3)', () => {
    const t = [
      'func TestRequire(t *testing.T) {',
      '\terr := doThing() // AC-3',
      '\trequire.NoError(t, err)',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, goProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
    const acIdx = t.indexOf('AC-3');
    expect(acIdx).toBeGreaterThanOrEqual(spans[0]!.start);
    expect(acIdx).toBeLessThanOrEqual(spans[0]!.end);
  });

  it('a rune literal containing an escaped quote does not confuse masking (AC-3)', () => {
    const t = [
      'func TestRune(t *testing.T) {',
      "\tq := '\\'' // AC-3, escaped rune literal",
      '\tif q == 0 {',
      '\t\tt.Fatal("zero rune")',
      '\t}',
      '}',
    ].join('\n');
    const spans = findSpansForProfile(t, goProfile);
    expect(spans.length).toBe(1);
    expect(spans[0]!.hasAssertion).toBe(true);
  });
});
