import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { tempRepo as tempCadenceRepo } from '@thomas-powers-jr/cadence-testkit';
import { explainAcCoverage } from '../../src/verify/coverage.js';
import { renderExplainHuman, runVerifyCoverage } from '../../src/services/verify.js';

// Phase 239 (T4, AC-6): `cadence verify coverage --explain` under the
// phase-qualified scheme. The gate (T3) already refuses a bare or
// foreign-phase token and names the expected form; --explain is the
// diagnostic an operator reaches for when that refusal is confusing, so it
// must agree with the gate. Before this task it did not: `explainAcCoverage`
// accepted `expectedQualifier` and ignored it, so it would report a bare
// cross-phase token as satisfying while the gate refused on it.
//
// FIXTURE TOKEN HYGIENE (same rule as tests/gates/coverage-qualified.test.ts):
// fixture tokens are built by concatenation (`q()`, `f()`, `AC3`) so this
// file's source never contains a contiguous qualified token for an AC it does
// not itself cover. The only literal `239-01/AC-N` tokens here are this
// task's own AC reference (AC-6) inside asserting it() titles.

const QUAL = '239-01';
const FOREIGN = '211-01';
/** Bare AC id fixture, built by concatenation to avoid a contiguous token. */
const AC3 = 'AC-' + '3';
/** Build a this-phase qualified fixture token, e.g. `<QUAL>/AC-3`. */
const q = (ac: string): string => `${QUAL}/${ac}`;
/** Build a foreign-phase qualified fixture token, e.g. `<FOREIGN>/AC-3`. */
const f = (ac: string): string => `${FOREIGN}/${ac}`;

const GLOBS = ['**/*.test.ts'];

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups) await c();
  cleanups.length = 0;
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'cadence-cov-explain-qual-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeTest(root: string, rel: string, body: string): Promise<void> {
  const abs = join(root, rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

/** Every occurrence recorded across every file, flattened. */
function allOccurrences(result: Awaited<ReturnType<typeof explainAcCoverage>>) {
  return result.files.flatMap((file) => file.occurrences);
}

describe('explainAcCoverage · phase-qualified scheme (phase 239 T4)', () => {
  it('239-01/AC-6: a bare token in an asserting block does NOT satisfy under the qualified scheme', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'bare.test.ts',
      `it('bare ${AC3} only', () => { expect(1).toBe(1); });\n`,
    );

    const result = await explainAcCoverage(root, AC3, {
      mode: 'assertion',
      globs: GLOBS,
      expectedQualifier: QUAL,
    });

    expect(result.satisfied).toBe(false);
    const occ = allOccurrences(result);
    expect(occ.length).toBeGreaterThan(0);
    expect(occ.every((o) => o.satisfies === false)).toBe(true);
    // The reason must name the literal token the operator has to write,
    // matching the gate's refusal (T3, AC-4) rather than contradicting it.
    expect(occ.map((o) => o.reason).join(' ')).toContain(q(AC3));
  });

  it("239-01/AC-6: another phase's qualified token does NOT satisfy", async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'foreign.test.ts',
      `it('${f(AC3)} foreign only', () => { expect(1).toBe(1); });\n`,
    );

    const result = await explainAcCoverage(root, AC3, {
      mode: 'assertion',
      globs: GLOBS,
      expectedQualifier: QUAL,
    });

    expect(result.satisfied).toBe(false);
    expect(allOccurrences(result).every((o) => o.satisfies === false)).toBe(true);
  });

  it("239-01/AC-6: this phase's own qualified token in an asserting block satisfies", async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'qualified.test.ts',
      `it('${q(AC3)} covered here', () => { expect(1).toBe(1); });\n`,
    );

    const result = await explainAcCoverage(root, AC3, {
      mode: 'assertion',
      globs: GLOBS,
      expectedQualifier: QUAL,
    });

    expect(result.satisfied).toBe(true);
    expect(allOccurrences(result).some((o) => o.satisfies === true)).toBe(true);
  });

  it('239-01/AC-6: a qualified token outside any asserting block still fails on the assertion rule', async () => {
    // Qualifier satisfied but the span rule is not — the two rules compose;
    // passing the qualifier must not short-circuit assertion-mode checking.
    const root = tempRepo();
    await writeTest(root, 'weak.test.ts', `// ${q(AC3)} comment only\n`);

    const result = await explainAcCoverage(root, AC3, {
      mode: 'assertion',
      globs: GLOBS,
      expectedQualifier: QUAL,
    });

    expect(result.satisfied).toBe(false);
    const reasons = allOccurrences(result).map((o) => o.reason).join(' ');
    // It must be reported as a span problem, NOT as a qualifier problem.
    expect(reasons).toContain('test block');
  });

  it('239-01/AC-6: mention mode honors the qualifier too', async () => {
    const root = tempRepo();
    await writeTest(root, 'mention.test.ts', `// bare ${AC3} mention\n`);

    const bare = await explainAcCoverage(root, AC3, {
      mode: 'mention',
      globs: GLOBS,
      expectedQualifier: QUAL,
    });
    expect(bare.satisfied).toBe(false);

    const root2 = tempRepo();
    await writeTest(root2, 'mention.test.ts', `// ${q(AC3)} mention\n`);
    const qualified = await explainAcCoverage(root2, AC3, {
      mode: 'mention',
      globs: GLOBS,
      expectedQualifier: QUAL,
    });
    expect(qualified.satisfied).toBe(true);
  });

  it('239-01/AC-6: without a qualifier the explain result is byte-for-byte the historical bare behavior', async () => {
    // Back-compat: absent `expectedQualifier`, a bare token still satisfies.
    const root = tempRepo();
    await writeTest(
      root,
      'bare.test.ts',
      `it('bare ${AC3} only', () => { expect(1).toBe(1); });\n`,
    );

    const result = await explainAcCoverage(root, AC3, {
      mode: 'assertion',
      globs: GLOBS,
    });

    expect(result.satisfied).toBe(true);
    expect(allOccurrences(result).some((o) => o.satisfies === true)).toBe(true);
  });
});

describe('renderExplainHuman · scheme visibility (phase 239 T4)', () => {
  it('239-01/AC-6: the rendered report names the scheme in effect', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'bare.test.ts',
      `it('bare ${AC3} only', () => { expect(1).toBe(1); });\n`,
    );

    const result = await explainAcCoverage(root, AC3, {
      mode: 'assertion',
      globs: GLOBS,
      expectedQualifier: QUAL,
    });
    const out = renderExplainHuman(result);

    expect(out).toContain('phase-qualified');
    // The operator must be able to read the expected token straight off the
    // report without inferring the prefix form.
    expect(out).toContain(q(AC3));
  });

  it('239-01/AC-6: the bare-scheme report is unchanged and mentions no qualifier', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'bare.test.ts',
      `it('bare ${AC3} only', () => { expect(1).toBe(1); });\n`,
    );

    const result = await explainAcCoverage(root, AC3, {
      mode: 'assertion',
      globs: GLOBS,
    });
    const out = renderExplainHuman(result);

    expect(out).not.toContain('phase-qualified');
    expect(out).toContain('Overall: SATISFIED');
  });
});

/**
 * Ephemeral initialized repo + a config/state pair and one test file.
 * Module-scoped (not describe-local) so both the phase-239 and phase-285
 * `runVerifyCoverage` suites in this file share one implementation.
 */
async function scenario(opts: {
  scheme: 'bare' | 'phase-qualified';
  activeDraft: string | null;
  body: string;
}): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const fx = await tempCadenceRepo({ initialized: true, projectName: 'explain-qual' });
  const configPath = join(fx.root, '.cadence', 'config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
  config['verification'] = {
    ...(config['verification'] as Record<string, unknown>),
    coverageMode: 'assertion',
    coverageScheme: opts.scheme,
    testGlobs: GLOBS,
  };
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

  const statePath = join(fx.root, '.cadence', 'state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8')) as Record<string, unknown>;
  state['activeDraft'] = opts.activeDraft;
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');

  await writeTest(fx.root, 'a.test.ts', opts.body);
  return { root: fx.root, cleanup: fx.cleanup };
}

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) }, out, err };
}

describe('runVerifyCoverage · resolves the qualifier from live state (phase 239 T4)', () => {
  it('239-01/AC-6: with an active draft, a bare token is reported NOT satisfying', async () => {
    const s = await scenario({
      scheme: 'phase-qualified',
      activeDraft: QUAL,
      body: `it('bare ${AC3} only', () => { expect(1).toBe(1); });\n`,
    });
    cleanups.push(s.cleanup);
    const cap = io();

    const res = await runVerifyCoverage(
      { cwd: s.root, explain: AC3, json: true },
      cap.io,
    );

    expect(res.exitCode).toBe(0);
    const data = res.data as Awaited<ReturnType<typeof explainAcCoverage>>;
    expect(data.expectedQualifier).toBe(QUAL);
    expect(data.satisfied).toBe(false);
    expect(cap.err.join('')).toEqual('');
  });

  it("239-01/AC-6: with an active draft, this phase's own qualified token satisfies", async () => {
    const s = await scenario({
      scheme: 'phase-qualified',
      activeDraft: QUAL,
      body: `it('${q(AC3)} covered', () => { expect(1).toBe(1); });\n`,
    });
    cleanups.push(s.cleanup);
    const cap = io();

    const res = await runVerifyCoverage({ cwd: s.root, explain: AC3, json: true }, cap.io);

    const data = res.data as Awaited<ReturnType<typeof explainAcCoverage>>;
    expect(data.satisfied).toBe(true);
  });

  it('239-01/AC-6: qualified scheme with no active draft warns loudly and reports unqualified', async () => {
    const s = await scenario({
      scheme: 'phase-qualified',
      activeDraft: null,
      body: `it('bare ${AC3} only', () => { expect(1).toBe(1); });\n`,
    });
    cleanups.push(s.cleanup);
    const cap = io();

    const res = await runVerifyCoverage({ cwd: s.root, explain: AC3, json: true }, cap.io);

    expect(res.exitCode).toBe(0);
    const data = res.data as Awaited<ReturnType<typeof explainAcCoverage>>;
    expect(data.expectedQualifier).toBeUndefined();
    // The fallback must be loud, and must say the report won't match the gate.
    const errText = cap.err.join('');
    expect(errText).toContain('phase-qualified');
    expect(errText).toContain('UNQUALIFIED');
  });

  it('239-01/AC-6: a MALFORMED active draft id warns loudly, same as a missing one', async () => {
    // Distinct from the null case above: a present-but-unusable id (here one
    // containing a `/`, which would corrupt the prefix form) must not be
    // quietly accepted as a qualifier.
    const s = await scenario({
      scheme: 'phase-qualified',
      activeDraft: '239-01/x',
      body: `it('bare ${AC3} only', () => { expect(1).toBe(1); });\n`,
    });
    cleanups.push(s.cleanup);
    const cap = io();

    const res = await runVerifyCoverage({ cwd: s.root, explain: AC3, json: true }, cap.io);

    expect(res.exitCode).toBe(0);
    const data = res.data as Awaited<ReturnType<typeof explainAcCoverage>>;
    expect(data.expectedQualifier).toBeUndefined();
    const errText = cap.err.join('');
    expect(errText).toContain('phase-qualified');
    expect(errText).toContain('UNQUALIFIED');
  });

  it('239-01/AC-6: the bare scheme reads no qualifier and prints no notice', async () => {
    const s = await scenario({
      scheme: 'bare',
      activeDraft: QUAL,
      body: `it('bare ${AC3} only', () => { expect(1).toBe(1); });\n`,
    });
    cleanups.push(s.cleanup);
    const cap = io();

    const res = await runVerifyCoverage({ cwd: s.root, explain: AC3, json: true }, cap.io);

    const data = res.data as Awaited<ReturnType<typeof explainAcCoverage>>;
    expect(data.expectedQualifier).toBeUndefined();
    expect(data.satisfied).toBe(true);
    expect(cap.err.join('')).toEqual('');
  });
});

// Phase 285 (HANDOFF-v1.62 Phase H, rec-20260816-001): an already-qualified
// --explain argument (e.g. `282-01/AC-4`) was silently prepended with the
// active draft's own qualifier a second time, producing a search token that
// can never match anything -- NOT SATISFIED at exit 0, with no diagnostic at
// all. The fix normalizes the argument to its bare form and prints a stderr
// notice (D-X option 3).
describe("285-01: --explain double-qualification guard (HANDOFF-v1.62's Phase H)", () => {
  it('285-01/AC-2: the correct bare --explain path under phase-qualified is byte-identical to a committed snapshot', async () => {
    const s = await scenario({
      scheme: 'phase-qualified',
      activeDraft: QUAL,
      body: `it('${q(AC3)} covered', () => { expect(1).toBe(1); });\n`,
    });
    cleanups.push(s.cleanup);
    const cap = io();

    const res = await runVerifyCoverage({ cwd: s.root, explain: AC3, json: true }, cap.io);

    // Snapshots the literal `stdout` string (not the parsed `res.data` object)
    // so this genuinely proves byte-identity of what the CLI actually prints
    // -- AC-2/AC-3 require "stdout and JSON output" identity, and under
    // `--json: true` stdout IS the JSON output (JSON.stringify's own key
    // order and whitespace included).
    expect({
      exitCode: res.exitCode,
      stdout: cap.out.join(''),
      stderr: cap.err.join(''),
    }).toMatchSnapshot();
  });

  it('285-01/AC-3: a qualifier-looking token under the bare scheme is matched literally, never normalized', async () => {
    // Q2 stands in for a value that happens to equal state.activeDraft, even
    // though `bare` must never read it. NOTE: `satisfied` alone does not
    // discriminate a leak here -- bare `AC-3` still matches as a `\b`-bounded
    // substring of the compound "Q2/AC-3" token, so a leaked strip would
    // still report `satisfied: true`. What actually catches a leak is
    // `expectedQualifier` (asserted `toBeUndefined()` below): under `bare`,
    // `runVerifyCoverage` never computes it at all; a regression that leaked
    // the phase-qualified branch's logic into this scheme would leak that
    // computation too, so `expectedQualifier` becoming defined -- or the
    // committed snapshot diverging (it has no `expectedQualifier` key) -- is
    // the real signal a future reader should look for.
    const Q2 = '285-fixture-qualifier';
    const s = await scenario({
      scheme: 'bare',
      activeDraft: Q2,
      body: `it('${Q2}/${AC3} covered', () => { expect(1).toBe(1); });\n`,
    });
    cleanups.push(s.cleanup);
    const cap = io();

    const res = await runVerifyCoverage(
      { cwd: s.root, explain: `${Q2}/${AC3}`, json: true },
      cap.io,
    );

    const data = res.data as Awaited<ReturnType<typeof explainAcCoverage>>;
    expect(data.satisfied).toBe(true);
    expect(data.expectedQualifier).toBeUndefined();
    expect(cap.err.join('')).toEqual('');
    // Snapshots the literal `stdout` string (not the parsed `res.data` object)
    // so this genuinely proves byte-identity of what the CLI actually prints
    // -- AC-2/AC-3 require "stdout and JSON output" identity, and under
    // `--json: true` stdout IS the JSON output (JSON.stringify's own key
    // order and whitespace included).
    expect({
      exitCode: res.exitCode,
      stdout: cap.out.join(''),
      stderr: cap.err.join(''),
    }).toMatchSnapshot();
  });

  it('285-01/AC-1: an already-qualified --explain argument is normalized to its bare form with a stderr notice', async () => {
    const s = await scenario({
      scheme: 'phase-qualified',
      activeDraft: QUAL,
      body: `it('${q(AC3)} covered', () => { expect(1).toBe(1); });\n`,
    });
    cleanups.push(s.cleanup);
    const cap = io();

    const res = await runVerifyCoverage(
      { cwd: s.root, explain: q(AC3), json: true },
      cap.io,
    );

    const data = res.data as Awaited<ReturnType<typeof explainAcCoverage>>;
    // Desired fixed behavior: search for the bare token, not `QUAL/QUAL/AC3`.
    expect(data.acId).toBe(AC3);
    expect(data.satisfied).toBe(true);
    const errText = cap.err.join('');
    expect(errText).toContain(q(AC3));
    // AC3 ('AC-3') is trivially a substring of q(AC3) ('239-01/AC-3'), so the
    // assertion above alone would not catch a regression that dropped the
    // "using the bare form '<X>'" clause. Strip the q(AC3) occurrence first
    // so this genuinely proves the bare form is named on its own.
    expect(errText.replace(q(AC3), '')).toContain(AC3);
  });

  it('285-01/AC-1: a qualifier-only --explain argument (nothing after the slash) is refused, never searched as an empty token', async () => {
    // Independent-reviewer finding: stripping the prefix unconditionally
    // left a real regression -- `--explain '<Q>/'` strips to '', and
    // explainAcCoverage's `\b${acId}\b` degrades to matching every word
    // boundary on an empty pattern, silently reporting `satisfied: true`.
    // Reproduced pre-patch: exitCode 0, satisfied: true, 20 spurious
    // occurrences. That is a false SATISFIED, the opposite failure
    // direction from (and worse than) the double-qualification bug this
    // phase exists to fix.
    const s = await scenario({
      scheme: 'phase-qualified',
      activeDraft: QUAL,
      body: `it('${q(AC3)} covered', () => { expect(1).toBe(1); });\n`,
    });
    cleanups.push(s.cleanup);
    const cap = io();

    const res = await runVerifyCoverage(
      { cwd: s.root, explain: q(''), json: true },
      cap.io,
    );

    expect(res.exitCode).not.toBe(0);
    expect(res.data).toBeUndefined();
    const errText = cap.err.join('');
    expect(errText).toContain(q(''));
    expect(errText.toLowerCase()).toContain('no ac id');
  });

  // 285-01/AC-4: the JSON shape (CoverageExplainResult's field list) must be
  // unchanged by the T2 fix in every scenario. Field names are derived from
  // source, not hand-copied — mirrors
  // packages/core/tests/docs/coverage-scheme-docs.test.ts's
  // `extractInterfaceFields` (brace-depth counting over the TS interface
  // body) since that helper is module-local there and not exported.
  const COVERAGE_SRC = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'verify', 'coverage.ts'),
    'utf8',
  );

  function extractInterfaceFields(source: string, interfaceName: string): string[] {
    const startMarker = `interface ${interfaceName} {`;
    const start = source.indexOf(startMarker);
    if (start === -1) {
      throw new Error(`interface ${interfaceName} not found in source`);
    }
    const bodyStart = start + startMarker.length;
    let depth = 1;
    let i = bodyStart;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
    }
    const body = source.slice(bodyStart, i - 1);
    const fields: string[] = [];
    for (const line of body.split('\n')) {
      const m = /^\s*(\w+)\??:/.exec(line);
      if (m?.[1] !== undefined) fields.push(m[1]);
    }
    return fields;
  }

  /**
   * Assert `json`'s own key set matches `CoverageExplainResult`'s field
   * list exactly, given that `expectedQualifier` is that interface's one
   * optional field and `explainAcCoverage` omits it via conditional spread
   * (never serializes an explicit `undefined`) rather than always including
   * it — see 285-01/AC-3, whose bare-scheme scenario legitimately has no
   * `expectedQualifier` key at all. `expectQualifier` is supplied by the
   * caller (who knows which scheme it ran), not read back off `json` — a
   * read-back would let `expectedQualifier` silently vanish from a
   * scenario that requires it without failing this assertion. Every other
   * field must always be present, and no key outside the interface's list
   * may appear.
   */
  function assertJsonShapeMatchesInterface(json: unknown, expectQualifier: boolean): void {
    const fields = extractInterfaceFields(COVERAGE_SRC, 'CoverageExplainResult');
    const expectedKeys = fields
      .filter((f) => f !== 'expectedQualifier' || expectQualifier)
      .sort();
    expect(Object.keys(json as Record<string, unknown>).sort()).toEqual(expectedKeys);
  }

  it('285-01/AC-4: JSON shape is unchanged (CoverageExplainResult field set) across bare-arg, correct-qualified-arg, and already-qualified-arg scenarios', async () => {
    // Scenario 1 — bare arg: --explain AC-N under phase-qualified, an
    // active draft, matching AC-2's "correct bare" setup.
    const s1 = await scenario({
      scheme: 'phase-qualified',
      activeDraft: QUAL,
      body: `it('${q(AC3)} covered', () => { expect(1).toBe(1); });\n`,
    });
    cleanups.push(s1.cleanup);
    const cap1 = io();
    const res1 = await runVerifyCoverage({ cwd: s1.root, explain: AC3, json: true }, cap1.io);
    expect(res1.exitCode).toBe(0);
    assertJsonShapeMatchesInterface(JSON.parse(cap1.out.join('')), true);

    // Scenario 2 — correct qualified arg: under `bare` scheme a
    // qualifier-looking literal token is the *correct* --explain argument
    // (matching AC-3's setup), so `expectedQualifier` legitimately never
    // appears here.
    const Q3 = '285-fixture-qualifier-ac4';
    const s2 = await scenario({
      scheme: 'bare',
      activeDraft: Q3,
      body: `it('${Q3}/${AC3} covered', () => { expect(1).toBe(1); });\n`,
    });
    cleanups.push(s2.cleanup);
    const cap2 = io();
    const res2 = await runVerifyCoverage(
      { cwd: s2.root, explain: `${Q3}/${AC3}`, json: true },
      cap2.io,
    );
    expect(res2.exitCode).toBe(0);
    assertJsonShapeMatchesInterface(JSON.parse(cap2.out.join('')), false);

    // Scenario 3 — already-qualified arg: the double-qualification case
    // this task's fix normalizes (matching AC-1's setup).
    const s3 = await scenario({
      scheme: 'phase-qualified',
      activeDraft: QUAL,
      body: `it('${q(AC3)} covered', () => { expect(1).toBe(1); });\n`,
    });
    cleanups.push(s3.cleanup);
    const cap3 = io();
    const res3 = await runVerifyCoverage(
      { cwd: s3.root, explain: q(AC3), json: true },
      cap3.io,
    );
    expect(res3.exitCode).toBe(0);
    assertJsonShapeMatchesInterface(JSON.parse(cap3.out.join('')), true);
  });
});
