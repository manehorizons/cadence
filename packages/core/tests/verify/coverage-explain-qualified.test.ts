import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { tempRepo as tempCadenceRepo } from '@manehorizons/cadence-testkit';
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

describe('runVerifyCoverage · resolves the qualifier from live state (phase 239 T4)', () => {
  /** Ephemeral initialized repo + a config/state pair and one test file. */
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
