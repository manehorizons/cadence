import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCoverageGate } from '../../src/gates/coverage.js';
import type { SettleContext } from '../../src/gates/types.js';
import type { VerifyTestRef } from '../../src/verify/verifier.js';

// Phase 239 (T3): the test-coverage gate under the phase-qualified scheme —
// resolve the scheme from config, pass the active draft id as the expected
// qualifier, and name the literal expected token on refusal.
//
// FIXTURE TOKEN HYGIENE (same rule as tests/verify/coverage-scheme.test.ts):
// fixture tokens are built by concatenation (`q('AC-3')`, `f('AC-3')`, `AC3`)
// so this file's own source never contains a contiguous qualified token for
// an AC it doesn't itself cover. The only literal `239-01/AC-N` tokens in
// this file are this task's own AC references (AC-2, AC-3, AC-4) inside
// asserting it() titles.

const QUAL = '239-01';
const FOREIGN = '211-01';
/** Bare AC id fixture, built by concatenation to avoid a contiguous token. */
const AC3 = 'AC-' + '3';
/** Build a this-phase qualified fixture token, e.g. `<QUAL>/AC-3`. */
const q = (ac: string): string => `${QUAL}/${ac}`;
/** Build a foreign-phase qualified fixture token, e.g. `<FOREIGN>/AC-3`. */
const f = (ac: string): string => `${FOREIGN}/${ac}`;

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups) await c();
  cleanups.length = 0;
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'cadence-cov-gate-qual-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeTest(root: string, rel: string, body: string): Promise<void> {
  const abs = join(root, rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

/** Config with the qualified scheme on; coverageMode overridable. */
function qualifiedConfig(mode: 'mention' | 'assertion' = 'assertion'): never {
  return {
    verification: {
      coverageScheme: 'phase-qualified',
      coverageMode: mode,
      testGlobs: ['**/*.test.ts'],
    },
  } as never;
}

function ctx(over: Partial<SettleContext> & {
  coverageMap?: Map<string, VerifyTestRef[]>;
  errs?: string[];
  activeDraft?: string | null;
}): SettleContext {
  const errs = over.errs ?? [];
  const base = {
    cwd: '/nonexistent-cov-gate-qual',
    state: { activeDraft: over.activeDraft !== undefined ? over.activeDraft : QUAL },
    draft: {
      acceptanceCriteria: [{ id: AC3, given: '', when: '', then: '' }],
      tasks: [],
    },
    progress: { draftId: 'd', tasks: {} },
    config: null,
    gateSet: { gates: ['test-coverage'], softCap: false },
    opts: {},
    explicitIds: new Set<string>(),
    touchedFiles: [],
    coverage: async () => over.coverageMap ?? new Map<string, VerifyTestRef[]>(),
    verifiers: { deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) } },
    emit: { anomalies: async () => {} },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
  const { coverageMap: _c, errs: _e, activeDraft: _a, ...rest } = over;
  return Object.assign(base, rest) as SettleContext;
}

describe('runCoverageGate · phase-qualified scheme (phase 239 T3)', () => {
  it('239-01/AC-2: refuses when the only reference is a bare token inside an asserting block', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'bare.test.ts',
      `it('bare ${AC3} only', () => { expect(1).toBe(1); });\n`,
    );
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, cwd: root, config: qualifiedConfig() }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain(AC3);
  });

  it("239-01/AC-2: refuses when the only reference is another phase's qualified token inside an asserting block", async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'foreign.test.ts',
      `it('${f(AC3)} foreign only', () => { expect(1).toBe(1); });\n`,
    );
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, cwd: root, config: qualifiedConfig() }),
    );
    expect(res.outcome).toBe('refuse');
  });

  it('239-01/AC-2: refuses when bare and foreign references coexist but no own-phase token exists', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'mixed.test.ts',
      `it('bare ${AC3} here', () => { expect(1).toBe(1); });\n` +
        `it('${f(AC3)} there', () => { expect(2).toBe(2); });\n`,
    );
    const res = await runCoverageGate(ctx({ cwd: root, config: qualifiedConfig() }));
    expect(res.outcome).toBe('refuse');
  });

  it('239-01/AC-2: the refusal is scheme-gated — under the bare scheme the same bare ref passes via the memoized map', async () => {
    // Bare scheme (field absent → default 'bare'): the gate must keep
    // consuming ctx.coverage() (the shared memoized thunk) and must not
    // rescan cwd or demand a qualifier. cwd points at a nonexistent dir on
    // purpose: a rescan would find nothing and wrongly refuse.
    const map = new Map<string, VerifyTestRef[]>([
      [AC3, [{ file: 'a.test.ts', line: 1, snippet: `it('${AC3}')`, qualifying: true }]],
    ]);
    const res = await runCoverageGate(
      ctx({
        coverageMap: map,
        config: { verification: { coverageMode: 'assertion' } } as never,
      }),
    );
    expect(res.outcome).toBe('pass');
  });

  it("239-01/AC-3: passes when an asserting test block references this phase's own qualified token", async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'qualified.test.ts',
      `it('${q(AC3)} covered here', () => { expect(1).toBe(1); });\n`,
    );
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, cwd: root, config: qualifiedConfig() }),
    );
    expect(res.outcome).toBe('pass');
    expect(errs).toEqual([]);
  });

  it("239-01/AC-3: the same qualified test satisfies no other phase's identically-numbered AC", async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'qualified.test.ts',
      `it('${q(AC3)} covered here', () => { expect(1).toBe(1); });\n`,
    );
    // Settle the SAME repo as a different draft (a foreign phase): the
    // 239-01-qualified test must not satisfy 211-01's AC-3.
    const res = await runCoverageGate(
      ctx({ cwd: root, config: qualifiedConfig(), activeDraft: FOREIGN }),
    );
    expect(res.outcome).toBe('refuse');
  });

  it('239-01/AC-3: mention mode also honors the qualifier (own token passes, bare-only refuses)', async () => {
    const root = tempRepo();
    await writeTest(root, 'mention.test.ts', `// ${q(AC3)} mention\n`);
    const pass = await runCoverageGate(
      ctx({ cwd: root, config: qualifiedConfig('mention') }),
    );
    expect(pass.outcome).toBe('pass');

    const root2 = tempRepo();
    await writeTest(root2, 'mention.test.ts', `// bare ${AC3} mention\n`);
    const refuse = await runCoverageGate(
      ctx({ cwd: root2, config: qualifiedConfig('mention') }),
    );
    expect(refuse.outcome).toBe('refuse');
  });
});

describe('runCoverageGate · refusal names the literal expected token (phase 239 T3)', () => {
  it('239-01/AC-4: the assertion-mode absent refusal contains the exact expected token on stderr and in reason', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'bare.test.ts',
      `it('bare ${AC3} only', () => { expect(1).toBe(1); });\n`,
    );
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, cwd: root, config: qualifiedConfig() }),
    );
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    // The literal token the fix requires — no source reading needed.
    expect(joined).toContain(q(AC3));
    expect(res.reason).toContain(q(AC3));
  });

  it('239-01/AC-4: the mention-mode refusal contains the exact expected token', async () => {
    const root = tempRepo();
    await writeTest(root, 'mention.test.ts', `// bare ${AC3} mention\n`);
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, cwd: root, config: qualifiedConfig('mention') }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain(q(AC3));
    expect(res.reason).toContain(q(AC3));
  });

  it('239-01/AC-4: the weak-link (non-asserting) refusal contains the exact expected token', async () => {
    const root = tempRepo();
    // Qualified token present, but only in a comment — never inside an
    // asserting test block.
    await writeTest(root, 'weak.test.ts', `// ${q(AC3)} comment only\n`);
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, cwd: root, config: qualifiedConfig() }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain(q(AC3));
    expect(res.reason).toContain(q(AC3));
  });

  it('239-01/AC-4: a sealed refusal still contains the exact expected token', async () => {
    const root = tempRepo();
    await writeTest(
      root,
      'bare.test.ts',
      `it('bare ${AC3} only', () => { expect(1).toBe(1); });\n`,
    );
    const sealedQualified = {
      gates: { sealed: ['test-coverage'] },
      verification: {
        coverageScheme: 'phase-qualified',
        coverageMode: 'assertion',
        testGlobs: ['**/*.test.ts'],
      },
    } as never;
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, cwd: root, opts: { force: true }, config: sealedQualified }),
    );
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain(q(AC3));
    expect(joined).toContain('gates.sealed');
  });

  it('239-01/AC-4: an empty active draft id refuses loudly instead of silently scanning unqualified', async () => {
    const root = tempRepo();
    // A test that WOULD pass if the empty qualifier degenerated to
    // "preceded by a bare /" were quietly accepted.
    await writeTest(root, 'x.test.ts', `it('/${AC3}', () => { expect(1).toBe(1); });\n`);
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, cwd: root, config: qualifiedConfig(), activeDraft: '' }),
    );
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('phase-qualified');
    expect(joined).toContain('draft id');
  });

  it('239-01/AC-4: a missing (null) active draft id refuses loudly', async () => {
    const root = tempRepo();
    await writeTest(root, 'x.test.ts', `it('${q(AC3)}', () => { expect(1).toBe(1); });\n`);
    const res = await runCoverageGate(
      ctx({ cwd: root, config: qualifiedConfig(), activeDraft: null }),
    );
    expect(res.outcome).toBe('refuse');
    expect(res.reason).toContain('draft id');
  });

  it('239-01/AC-4: a newline-bearing draft id refuses loudly (malformed)', async () => {
    const root = tempRepo();
    await writeTest(root, 'x.test.ts', `it('${q(AC3)}', () => { expect(1).toBe(1); });\n`);
    const res = await runCoverageGate(
      ctx({ cwd: root, config: qualifiedConfig(), activeDraft: '239-01\nx' }),
    );
    expect(res.outcome).toBe('refuse');
    expect(res.reason).toContain('draft id');
  });

  it('239-01/AC-4: --force past a malformed draft id prints a loud notice, never a quiet unqualified scan', async () => {
    const root = tempRepo();
    await writeTest(root, 'x.test.ts', `it('bare ${AC3}', () => { expect(1).toBe(1); });\n`);
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({
        errs,
        cwd: root,
        opts: { force: true },
        config: qualifiedConfig(),
        activeDraft: '',
      }),
    );
    // --force keeps its existing "settle anyway" meaning, but the fallback
    // must be loud (CLAUDE.md: The Quiet Fallback), and coverageBypassed
    // stays false (it tracks --allow-missing-coverage only).
    expect(res.outcome).toBe('pass');
    expect(errs.join('')).not.toEqual('');
    expect(errs.join('')).toContain('phase-qualified');
    expect(res.flags?.coverageBypassed).toBe(false);
  });
});
