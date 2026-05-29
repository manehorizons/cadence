import { describe, it, expect } from 'vitest';
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
