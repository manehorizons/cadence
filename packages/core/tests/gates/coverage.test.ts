import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCoverageGate } from '../../src/gates/coverage.js';
import type { SettleContext } from '../../src/gates/types.js';
import type { VerifyTestRef } from '../../src/verify/verifier.js';

function ctx(over: Partial<SettleContext> & {
  coverageMap?: Map<string, VerifyTestRef[]>;
  errs?: string[];
}): SettleContext {
  const errs = over.errs ?? [];
  const base = {
    cwd: '/x',
    state: {} as never,
    draft: {
      acceptanceCriteria: [{ id: 'AC-1', given: '', when: '', then: '' }],
      tasks: [],
    } as never,
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
  return Object.assign(base, over) as SettleContext;
}

describe('runCoverageGate', () => {
  // AC-1: uncovered AC, no --force → refuse with per-id + summary stderr
  it('refuses when an AC has no linked test', async () => {
    const errs: string[] = [];
    const res = await runCoverageGate(ctx({ errs, coverageMap: new Map() }));
    expect(res.outcome).toBe('refuse');
    expect(errs[0]).toBe('coverage: AC-1 has no linked test (searched: (defaults))\n');
    expect(errs.join('')).toContain('settle run refused: each AC needs at least one test');
    expect(res.flags?.coverageBypassed).toBe(false);
  });

  // AC-1: covered AC → pass, no stderr
  it('passes when every AC is covered', async () => {
    const errs: string[] = [];
    const map = new Map<string, VerifyTestRef[]>([
      ['AC-1', [{ file: 'a.test.ts', line: 1, snippet: 'AC-1' }]],
    ]);
    const res = await runCoverageGate(ctx({ errs, coverageMap: map }));
    expect(res.outcome).toBe('pass');
    expect(errs).toEqual([]);
  });

  // AC-1: --allow-missing-coverage → pass + coverageBypassed flag, no scan refusal
  it('bypasses with allowMissingCoverage and sets the flag', async () => {
    const res = await runCoverageGate(
      ctx({ opts: { allowMissingCoverage: true }, coverageMap: new Map() }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.flags?.coverageBypassed).toBe(true);
  });

  // AC-1: --force settles past uncovered ACs; --force does NOT bypass the gate
  // (coverageBypassed stays false — it tracks --allow-missing-coverage only,
  // matching the original settle.ts `coverageBypassed = membership && allowMissingCoverage`).
  it('passes uncovered ACs under --force without setting coverageBypassed', async () => {
    const res = await runCoverageGate(ctx({ opts: { force: true }, coverageMap: new Map() }));
    expect(res.outcome).toBe('pass');
    expect(res.flags?.coverageBypassed).toBe(false);
  });

  // AC-1 / AC-7 (bit-identical): the legacy --ac-only path (auto === false) skips
  // the scan WITHOUT bypassing. In the original settle.ts, `coverageBypassed` is
  // computed as `membership && allowMissingCoverage` independent of `auto`, so an
  // auto=false run with no --allow-missing-coverage leaves coverageBypassed FALSE.
  // (Guards against regressing to `coverageBypassed = ... || auto === false`.)
  it('skips the scan on auto=false but does NOT mark coverage bypassed', async () => {
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, opts: { auto: false }, coverageMap: new Map() }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.flags?.coverageBypassed).toBe(false);
    expect(errs).toEqual([]); // no scan ran → no stderr
  });

  // AC-1: explicit --ac ids are excluded from the coverage requirement
  it('skips ACs that were explicitly verdicted', async () => {
    const res = await runCoverageGate(
      ctx({ explicitIds: new Set(['AC-1']), coverageMap: new Map() }),
    );
    expect(res.outcome).toBe('pass');
  });
});

describe('runCoverageGate · assertion mode (AC-5)', () => {
  const assertionConfig = { verification: { coverageMode: 'assertion' } } as never;

  // AC-5: a weakly-linked AC (mentioned but never inside an asserting block)
  // refuses with the distinct assertion-mode hint, and the message names the mode.
  it('refuses a weakly-linked AC with the assertion-block hint', async () => {
    const errs: string[] = [];
    const map = new Map<string, VerifyTestRef[]>([
      ['AC-1', [{ file: 'a.test.ts', line: 3, snippet: '// AC-1', qualifying: false }]],
    ]);
    const res = await runCoverageGate(ctx({ errs, config: assertionConfig, coverageMap: map }));
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('AC-1');
    expect(joined).toContain('not inside an asserting it()/test() block');
    expect(joined).toContain('assertion mode'); // refusal names the mode
    // It is NOT the plain "has no linked test" message — it was mentioned.
    expect(joined).not.toContain('AC-1 has no linked test');
  });

  // AC-5: an entirely-absent AC still gets the plain "has no linked test" message,
  // even in assertion mode.
  it('refuses an absent AC with the plain no-linked-test message', async () => {
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, config: assertionConfig, coverageMap: new Map() }),
    );
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('AC-1 has no linked test');
    expect(joined).not.toContain('not inside an asserting');
  });

  // AC-5: weak link and absent AC each get their own message in one refusal.
  it('emits distinct messages for a weak link vs an absent AC', async () => {
    const errs: string[] = [];
    const draft = {
      acceptanceCriteria: [
        { id: 'AC-1', given: '', when: '', then: '' },
        { id: 'AC-2', given: '', when: '', then: '' },
      ],
      tasks: [],
    } as never;
    const map = new Map<string, VerifyTestRef[]>([
      ['AC-1', [{ file: 'a.test.ts', line: 3, snippet: '// AC-1', qualifying: false }]],
      // AC-2 absent
    ]);
    const res = await runCoverageGate(ctx({ errs, draft, config: assertionConfig, coverageMap: map }));
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('AC-1');
    expect(joined).toContain('not inside an asserting it()/test() block');
    expect(joined).toContain('AC-2 has no linked test');
  });

  // AC-5: an AC with a qualifying (asserting-block) ref passes in assertion mode.
  it('passes an AC that has a qualifying assertion ref', async () => {
    const errs: string[] = [];
    const map = new Map<string, VerifyTestRef[]>([
      ['AC-1', [{ file: 'a.test.ts', line: 5, snippet: "it('AC-1', ...)", qualifying: true }]],
    ]);
    const res = await runCoverageGate(ctx({ errs, config: assertionConfig, coverageMap: map }));
    expect(res.outcome).toBe('pass');
    expect(errs).toEqual([]);
  });

  // AC-5: --force settles past a weak link without refusing.
  it('passes a weak link under --force', async () => {
    const map = new Map<string, VerifyTestRef[]>([
      ['AC-1', [{ file: 'a.test.ts', line: 3, snippet: '// AC-1', qualifying: false }]],
    ]);
    const res = await runCoverageGate(
      ctx({ opts: { force: true }, config: assertionConfig, coverageMap: map }),
    );
    expect(res.outcome).toBe('pass');
  });
});

// Phase 166 T3 (AC-3): the assertion-mode trailing refusal message names
// which distinct cause applies — glob-miss (no test files matched
// verification.testGlobs) vs. span-miss (files matched but no
// assertion-shaped span found for the AC id) — each with its own fix
// suggestion, instead of one generic blob covering both causes.
describe('runCoverageGate · assertion mode split refusal (phase 166 T3)', () => {
  const assertionConfig = { verification: { coverageMode: 'assertion' } } as never;
  const sealedAssertionConfig = {
    gates: { sealed: ['test-coverage'] },
    verification: { coverageMode: 'assertion' },
  } as never;

  it('glob-miss (absent-only) refusal explains testGlobs discovery, not span parsing', async () => {
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, config: assertionConfig, coverageMap: new Map() }),
    );
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('no test files matched configured globs');
    expect(joined).toContain('verification.testGlobs');
    expect(joined).not.toContain('assertion-shaped span');
    expect(joined).not.toContain('cadence config edit coverageMode');
  });

  // Phase 166 (whole-branch review fix): `absent` alone doesn't prove no
  // file matched the globs — it only means zero refs were found anywhere.
  // When a real file DOES match the globs but simply never mentions the AC,
  // blaming testGlobs is wrong; the gate must say so accurately instead.
  it('glob-miss message is accurate when files matched globs but never mention the AC', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cadence-coverage-gate-'));
    const explicitGlobsConfig = {
      verification: { coverageMode: 'assertion', testGlobs: ['**/*.test.ts'] },
    } as never;
    try {
      await writeFile(join(dir, 'unrelated.test.ts'), "it('does something else', () => {});\n");
      const errs: string[] = [];
      const res = await runCoverageGate(
        ctx({ errs, cwd: dir, config: explicitGlobsConfig, coverageMap: new Map() }),
      );
      expect(res.outcome).toBe('refuse');
      const joined = errs.join('');
      expect(joined).toContain('no test file references');
      expect(joined).toContain('verification.testGlobs');
      expect(joined).not.toContain('no test files matched configured globs');
      expect(joined).not.toContain('assertion-shaped span');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('span-miss (weak-only) refusal explains assertion parsing and the coverageMode fallback, not testGlobs', async () => {
    const errs: string[] = [];
    const map = new Map<string, VerifyTestRef[]>([
      ['AC-1', [{ file: 'a.test.ts', line: 3, snippet: '// AC-1', qualifying: false }]],
    ]);
    const res = await runCoverageGate(ctx({ errs, config: assertionConfig, coverageMap: map }));
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('assertion-shaped span');
    expect(joined).toContain('cadence config edit coverageMode');
    expect(joined).not.toContain('no test files matched configured globs');
    expect(joined).not.toContain('verification.testGlobs');
  });

  it('when both absent and weak ACs are present, each gets its own distinct explanation', async () => {
    const errs: string[] = [];
    const draft = {
      acceptanceCriteria: [
        { id: 'AC-1', given: '', when: '', then: '' },
        { id: 'AC-2', given: '', when: '', then: '' },
      ],
      tasks: [],
    } as never;
    const map = new Map<string, VerifyTestRef[]>([
      ['AC-1', [{ file: 'a.test.ts', line: 3, snippet: '// AC-1', qualifying: false }]],
      // AC-2 absent entirely
    ]);
    const res = await runCoverageGate(
      ctx({ errs, draft, config: assertionConfig, coverageMap: map }),
    );
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('no test files matched configured globs');
    expect(joined).toContain('verification.testGlobs');
    expect(joined).toContain('assertion-shaped span');
    expect(joined).toContain('cadence config edit coverageMode');
  });

  it('sealed: glob-miss explanation stays cause-specific and names gates.sealed', async () => {
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, opts: { force: true }, config: sealedAssertionConfig, coverageMap: new Map() }),
    );
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('no test files matched configured globs');
    expect(joined).toContain('verification.testGlobs');
    expect(joined).toContain('gates.sealed');
    expect(joined).not.toContain('assertion-shaped span');
    expect(res.flags?.coverageBypassed).toBe(false);
  });

  it('sealed: span-miss explanation stays cause-specific and names gates.sealed', async () => {
    const errs: string[] = [];
    const map = new Map<string, VerifyTestRef[]>([
      ['AC-1', [{ file: 'a.test.ts', line: 3, snippet: '// AC-1', qualifying: false }]],
    ]);
    const res = await runCoverageGate(
      ctx({ errs, opts: { force: true }, config: sealedAssertionConfig, coverageMap: map }),
    );
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('assertion-shaped span');
    expect(joined).toContain('cadence config edit coverageMode');
    expect(joined).toContain('gates.sealed');
    expect(joined).not.toContain('no test files matched configured globs');
    expect(res.flags?.coverageBypassed).toBe(false);
  });
});

// Phase 141 T5 (AC-3, AC-5): sealed test-coverage ignores --force and
// --allow-missing-coverage, refusing with a distinct "gates.sealed" message
// instead of the normal bypass hint.
describe('runCoverageGate · sealed (phase 141)', () => {
  const sealedConfig = { gates: { sealed: ['test-coverage'] } } as never;
  const sealedAssertionConfig = {
    gates: { sealed: ['test-coverage'] },
    verification: { coverageMode: 'assertion' },
  } as never;

  // AC-3: sealed + --force still refuses (mention mode).
  it('refuses under --force when sealed (mention mode)', async () => {
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, opts: { force: true }, config: sealedConfig, coverageMap: new Map() }),
    );
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('AC-1 has no linked test');
    expect(joined).toContain('gates.sealed');
    expect(joined).not.toContain('Pass --allow-missing-coverage to bypass');
    expect(res.flags?.coverageBypassed).toBe(false);
  });

  // AC-3: sealed + --allow-missing-coverage still refuses — the gate must NOT
  // short-circuit past coverage computation, and coverageBypassed must be
  // false because the bypass did not actually take effect.
  it('refuses under --allow-missing-coverage when sealed and still computes coverage', async () => {
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({
        errs,
        opts: { allowMissingCoverage: true },
        config: sealedConfig,
        coverageMap: new Map(),
      }),
    );
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('AC-1 has no linked test');
    expect(joined).toContain('gates.sealed');
    expect(joined).not.toContain('Pass --allow-missing-coverage to bypass');
    expect(res.flags?.coverageBypassed).toBe(false);
  });

  // AC-3: sealed refusal message names gates.sealed literally and says
  // neither --force nor --allow-missing-coverage can bypass it.
  it('sealed refusal message names gates.sealed and both unusable flags', async () => {
    const errs: string[] = [];
    await runCoverageGate(
      ctx({
        errs,
        opts: { force: true, allowMissingCoverage: true },
        config: sealedConfig,
        coverageMap: new Map(),
      }),
    );
    const joined = errs.join('');
    expect(joined).toContain('gates.sealed');
    expect(joined).toContain('--force');
    expect(joined).toContain('--allow-missing-coverage');
  });

  // AC-3: sealed + --force still refuses in assertion mode too, on a weak link.
  it('refuses a weak link under --force when sealed (assertion mode)', async () => {
    const errs: string[] = [];
    const map = new Map<string, VerifyTestRef[]>([
      ['AC-1', [{ file: 'a.test.ts', line: 3, snippet: '// AC-1', qualifying: false }]],
    ]);
    const res = await runCoverageGate(
      ctx({ errs, opts: { force: true }, config: sealedAssertionConfig, coverageMap: map }),
    );
    expect(res.outcome).toBe('refuse');
    const joined = errs.join('');
    expect(joined).toContain('not inside an asserting it()/test() block');
    expect(joined).toContain('gates.sealed');
    expect(joined).not.toContain('Pass --allow-missing-coverage to bypass');
    expect(res.flags?.coverageBypassed).toBe(false);
  });

  // AC-3: sealed but coverage is actually fine → gate passes normally, no
  // sealed message printed (sealing only removes the ability to bypass an
  // already-correct refusal, it doesn't change what makes the gate refuse).
  it('passes when sealed but coverage is fully satisfied', async () => {
    const errs: string[] = [];
    const map = new Map<string, VerifyTestRef[]>([
      ['AC-1', [{ file: 'a.test.ts', line: 1, snippet: 'AC-1' }]],
    ]);
    const res = await runCoverageGate(ctx({ errs, config: sealedConfig, coverageMap: map }));
    expect(res.outcome).toBe('pass');
    expect(errs).toEqual([]);
    expect(res.flags?.coverageBypassed).toBe(false);
  });

  // AC-5 (regression safety): unsealed --allow-missing-coverage behavior is
  // byte-for-byte unchanged — still short-circuits before computing coverage
  // (no per-AC stderr lines) and still sets coverageBypassed true.
  it('unsealed: --allow-missing-coverage still short-circuits and bypasses (regression)', async () => {
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, opts: { allowMissingCoverage: true }, coverageMap: new Map() }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.flags?.coverageBypassed).toBe(true);
    expect(errs).toEqual([]);
  });

  // AC-5 (regression safety): unsealed --force still bypasses a refusal and
  // prints the original "Pass --allow-missing-coverage... or --force" hint,
  // not the sealed message.
  it('unsealed: --force still bypasses and prints the original bypass hint (regression)', async () => {
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, opts: { force: true }, coverageMap: new Map() }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.flags?.coverageBypassed).toBe(false);
    expect(errs).toEqual([]);
  });

  // AC-5 (regression safety): a config naming a different gate in
  // gates.sealed does not seal test-coverage — --force bypasses cleanly, just
  // like the unsealed case (no refusal fires, so no stderr is printed).
  it('a gates.sealed entry for a different gate does not seal test-coverage (regression)', async () => {
    const otherSealed = { gates: { sealed: ['build-test-must-pass'] } } as never;
    const errs: string[] = [];
    const res = await runCoverageGate(
      ctx({ errs, opts: { force: true }, config: otherSealed, coverageMap: new Map() }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.flags?.coverageBypassed).toBe(false);
    expect(errs).toEqual([]);
  });
});
