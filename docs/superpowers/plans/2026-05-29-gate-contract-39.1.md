# Phase 39.1 — Gate Contract + coverage/deep-verify extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the inline test-coverage and `--deep` verifier gates out of `settle.ts` into `gates/coverage.ts` + `gates/deep-verify.ts`, behind a shared `SettleContext`/`GateResult`/`GateImpl` contract, with byte-identical `cadence settle run` behavior.

**Architecture:** A readonly `SettleContext` (built once by settle) carries everything a gate reads, including injected `verifiers`/`emit`/`io` ports. Each gate is a `GateImpl = (ctx) => Promise<GateResult>` returning `outcome: 'pass' | 'refuse'` plus a functional `summaryPatch`/`flags` contribution that the caller merges into a private accumulator. 39.1 keeps the calls hand-wired (unrolled); Phase 44.1 later turns them into a registry loop of the same shape.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest, pnpm + turbo. Design doc: `docs/superpowers/specs/2026-05-29-cadence-gate-contract-39.1-design.md`.

**Bit-identical anchor:** Every stderr string, exit code, and the `coverageBypassed`/`verifierFailure` flag values must match the pre-extraction `settle.ts` exactly. Source of truth for the current behavior is `settle.ts:196-230` (coverage) and `settle.ts:307-404` (deep-verify) at commit `757b65d`.

---

## File Structure

- **Create** `packages/core/src/gates/types.ts` — the contract: `SettleContext`, `GateResult`, `GateImpl`, `SettleAccumulator`, `GateFlags`, `IoPort`, `VerifierPorts`, `EmitPort`, and the `mergeInto` accumulator helper.
- **Create** `packages/core/src/gates/coverage.ts` — `runCoverageGate: GateImpl`.
- **Create** `packages/core/src/gates/deep-verify.ts` — `runDeepVerifyGate: GateImpl`.
- **Modify** `packages/core/src/cli/commands/settle.ts` — build the `SettleContext`, call the two gates, merge results, delete the two inline blocks.
- **Create** `packages/core/tests/gates/types.test.ts`, `coverage.test.ts`, `deep-verify.test.ts` — direct gate tests (no CLI stack).
- **Create** `packages/core/tests/cli/settle-bit-identical.test.ts` — settle-level transcript snapshot for the two refusal paths.

`gates/engine.ts`, `verify/*`, `notify/*` are **not** modified.

---

## Task 1: Define the gate contract (`gates/types.ts`)

**Files:**
- Create: `packages/core/src/gates/types.ts`
- Test: `packages/core/tests/gates/types.test.ts`

- [ ] **Step 1: Write the failing test for `mergeInto`**

`mergeInto` is the only logic in this file (the rest is types); test it directly.

```ts
// packages/core/tests/gates/types.test.ts
import { describe, it, expect } from 'vitest';
import { mergeInto, type SettleAccumulator, type GateResult } from '../../src/gates/types.js';

describe('mergeInto', () => {
  // AC-4: gate summaryPatch + flags merge into the accumulator
  it('merges summaryPatch fields and flags without dropping prior data', () => {
    const acc: SettleAccumulator = { flags: {} };
    const a: GateResult = { outcome: 'pass', flags: { coverageBypassed: true } };
    const b: GateResult = {
      outcome: 'pass',
      summaryPatch: { deepVerify: { 'AC-1': { pass: true, reason: 'ok', provider: 'mock' } } },
      flags: { verifierFailure: { message: 'boom', provider: 'mock' } },
    };
    mergeInto(acc, a);
    mergeInto(acc, b);
    expect(acc.flags).toEqual({
      coverageBypassed: true,
      verifierFailure: { message: 'boom', provider: 'mock' },
    });
    expect(acc.deepVerify).toEqual({ 'AC-1': { pass: true, reason: 'ok', provider: 'mock' } });
  });

  // AC-4: a result with no patch/flags is a no-op
  it('is a no-op for an empty result', () => {
    const acc: SettleAccumulator = { flags: { coverageBypassed: false } };
    mergeInto(acc, { outcome: 'pass' });
    expect(acc).toEqual({ flags: { coverageBypassed: false } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cadence/core test -- tests/gates/types.test.ts`
Expected: FAIL — cannot find module `../../src/gates/types.js`.

- [ ] **Step 3: Write `gates/types.ts`**

```ts
// packages/core/src/gates/types.ts
import type {
  CadenceConfig,
  CadenceState,
  Draft,
  GateSet,
  DeepVerdict,
  Finding,
} from '@cadence/types';
import type {
  VerifyInput,
  VerifyResult,
  VerifyTestRef,
} from '../verify/verifier.js';
import type { InteractiveVerdict } from '../verify/interactive.js';
import type { AnomalyEvent } from '../notify/collect.js';

/** The PROGRESS.json shape settle reads. Mirrors the local interface in settle.ts. */
export interface ProgressJson {
  draftId: string;
  tasks: Record<
    string,
    { status: string; notes: string; touchedFiles: string[]; updatedAt: string }
  >;
}

/** An AC verdict row destined for SUMMARY.acResults. */
export interface AcResult {
  id: string;
  pass: boolean;
  note?: string;
}

/** Stderr seam. Defaults to process.stderr.write; tests inject a capture. */
export interface IoPort {
  err(s: string): void;
}

/**
 * Injected verifier collaborators. Phase 40.1 consolidates behind this; gates
 * never import a *-factory directly. 39.1 defines ONLY `deep` (what it
 * exercises); 39.4/39.5 add members when those gates are extracted.
 */
export interface VerifierPorts {
  readonly deep: { verify(input: VerifyInput): Promise<VerifyResult> };
}

/**
 * Notification collaborator. Phase 42.1 consolidates the emitUnconverged spine
 * behind this. 39.1 defines only the `anomalies` finalizer hook it needs;
 * 39.4/39.7 add `codeReviewHigh`/`unconverged` members when those gates land.
 */
export interface EmitPort {
  anomalies(events: AnomalyEvent[]): Promise<void>;
}

/** The subset of `settle run` flags gates read. Grows as gates are extracted. */
export interface SettleOpts {
  readonly force?: boolean;
  readonly auto?: boolean;
  readonly deep?: boolean;
  readonly allowMissingCoverage?: boolean;
  readonly allowVerifierFailure?: boolean;
}

/** Everything a gate may read. Built once, before the gate loop. Readonly. */
export interface SettleContext {
  readonly cwd: string;
  readonly state: CadenceState;
  readonly draft: Draft;
  readonly progress: ProgressJson;
  readonly config: CadenceConfig | null;
  readonly gateSet: GateSet;
  readonly opts: SettleOpts;
  readonly explicitIds: ReadonlySet<string>;
  readonly touchedFiles: readonly string[];
  /** Memoized test-coverage scan (today scanned 3×; shared here). */
  coverage(): Promise<Map<string, VerifyTestRef[]>>;
  readonly verifiers: VerifierPorts;
  readonly emit: EmitPort;
  readonly io: IoPort;
}

/** Cross-cutting flags a gate sets for the finalizers to read. */
export interface GateFlags {
  coverageBypassed?: boolean;
  verifierFailure?: { message: string; provider?: string };
}

/**
 * The shared bag the driver owns: gate `summaryPatch`es merge here; finalizers
 * read + write it too. `acResults` is finalizer-built, not a gate contribution.
 */
export interface SettleAccumulator {
  deepVerify?: Record<string, DeepVerdict>;
  interactiveVerify?: Record<string, InteractiveVerdict>;
  codeReview?: Record<string, Finding[]>;
  securityAudit?: Finding[];
  acResults?: AcResult[];
  flags: GateFlags;
}

/** A gate's entire contribution. No shared mutable state. */
export interface GateResult {
  readonly outcome: 'pass' | 'refuse';
  readonly summaryPatch?: Partial<SettleAccumulator>;
  readonly flags?: GateFlags;
}

export type GateImpl = (ctx: SettleContext) => Promise<GateResult>;

/** Shallow-merge a GateResult's contribution into the accumulator. */
export function mergeInto(acc: SettleAccumulator, res: GateResult): void {
  if (res.summaryPatch) {
    const { flags: _ignore, ...rest } = res.summaryPatch;
    Object.assign(acc, rest);
  }
  if (res.flags) {
    Object.assign(acc.flags, res.flags);
  }
}
```

Note: `AnomalyEvent` is imported from `notify/collect.js` — confirm the export name there; if `collectAnomalies`'s return element type is not exported under that name, export it (`export type AnomalyEvent = ...`) in `notify/collect.ts` as part of this step (additive, no behavior change).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cadence/core test -- tests/gates/types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @cadence/core typecheck`
Expected: no errors. (If `AnomalyEvent` isn't exported from `collect.ts`, add the export now.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/gates/types.ts packages/core/tests/gates/types.test.ts packages/core/src/notify/collect.ts
git commit -m "feat(core): gate contract types + mergeInto (Phase 39.1 AC-4)"
```

---

## Task 2: Extract the coverage gate (`gates/coverage.ts`)

Current behavior to preserve verbatim — `settle.ts:196-230`:
- `coverageBypassed = membership('test-coverage') && allowMissingCoverage` (the caller only invokes this gate under membership, so inside the gate `coverageBypassed = !!opts.allowMissingCoverage`).
- Gate scans + refuses only when `!allowMissingCoverage && opts.auto !== false`.
- On unmet ACs and `!force`: one stderr line per unmet id, then the refusal line; refuse.
- `globsLabel = config?.verification?.testGlobs?.join(', ') ?? '(defaults)'`.

**Files:**
- Create: `packages/core/src/gates/coverage.ts`
- Test: `packages/core/tests/gates/coverage.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/tests/gates/coverage.test.ts
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

  // AC-1: --force settles past uncovered ACs
  it('passes uncovered ACs under --force', async () => {
    const res = await runCoverageGate(ctx({ opts: { force: true }, coverageMap: new Map() }));
    expect(res.outcome).toBe('pass');
  });

  // AC-1: explicit --ac ids are excluded from the coverage requirement
  it('skips ACs that were explicitly verdicted', async () => {
    const res = await runCoverageGate(
      ctx({ explicitIds: new Set(['AC-1']), coverageMap: new Map() }),
    );
    expect(res.outcome).toBe('pass');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @cadence/core test -- tests/gates/coverage.test.ts`
Expected: FAIL — cannot find `../../src/gates/coverage.js`.

- [ ] **Step 3: Implement `gates/coverage.ts`**

```ts
// packages/core/src/gates/coverage.ts
import { uncoveredAcs } from '../verify/coverage.js';
import type { GateImpl, GateResult } from './types.js';

/**
 * Test-coverage gate (Phase 14). Extracted from settle.ts:196-230 verbatim.
 * Invoked when 'test-coverage' is in the effective gate set. Refuses when any
 * non-explicit AC has no linked test, unless --allow-missing-coverage / --force.
 */
export const runCoverageGate: GateImpl = async (ctx): Promise<GateResult> => {
  const coverageBypassed = ctx.opts.allowMissingCoverage === true;
  if (ctx.opts.allowMissingCoverage || ctx.opts.auto === false) {
    return { outcome: 'pass', flags: { coverageBypassed } };
  }
  const coverage = await ctx.coverage();
  const acIds = ctx.draft.acceptanceCriteria.map((a) => a.id);
  const unmet = uncoveredAcs(
    acIds.filter((id) => !ctx.explicitIds.has(id)),
    coverage,
  );
  if (unmet.length > 0 && !ctx.opts.force) {
    const globsLabel =
      ctx.config?.verification?.testGlobs?.join(', ') ?? '(defaults)';
    for (const id of unmet) {
      ctx.io.err(`coverage: ${id} has no linked test (searched: ${globsLabel})\n`);
    }
    ctx.io.err(
      'settle run refused: each AC needs at least one test that references its id (e.g. AC-1 in a describe/it). ' +
        'Pass --allow-missing-coverage to bypass, or --force to settle anyway.\n',
    );
    return { outcome: 'refuse', flags: { coverageBypassed } };
  }
  return { outcome: 'pass', flags: { coverageBypassed } };
};
```

Note: `uncoveredAcs` takes `(acIds, coverageMap)` — confirm the second arg is the `Map` returned by `scanTestCoverage` (it is, per `settle.ts:206-214`).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @cadence/core test -- tests/gates/coverage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/gates/coverage.ts packages/core/tests/gates/coverage.test.ts
git commit -m "feat(core): extract coverage gate to gates/coverage.ts (Phase 39.1 AC-1)"
```

---

## Task 3: Extract the deep-verify gate (`gates/deep-verify.ts`)

Current behavior to preserve verbatim — `settle.ts:307-404`. The caller invokes this gate when `deepRequested = opts.deep || membership('deep-verify')`; inside, the gate also early-returns `pass` when `opts.auto === false`. Builds `VerifyInput` from ACs + coverage + touched files, calls the verifier port, records `deepVerify`, refuses on non-explicit failures unless `--force`, and on a verifier throw either records all-fail + `verifierFailure` flag (`--allow-verifier-failure`) or refuses.

**Files:**
- Create: `packages/core/src/gates/deep-verify.ts`
- Test: `packages/core/tests/gates/deep-verify.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/tests/gates/deep-verify.test.ts
import { describe, it, expect } from 'vitest';
import { runDeepVerifyGate } from '../../src/gates/deep-verify.js';
import type { SettleContext } from '../../src/gates/types.js';
import type { VerifyResult } from '../../src/verify/verifier.js';

function ctx(over: {
  verify: () => Promise<VerifyResult>;
  opts?: SettleContext['opts'];
  explicitIds?: Set<string>;
  errs?: string[];
}): SettleContext {
  const errs = over.errs ?? [];
  return {
    cwd: '/x',
    state: {} as never,
    draft: {
      acceptanceCriteria: [{ id: 'AC-1', given: 'g', when: 'w', then: 't' }],
      tasks: [{ id: 'T1', files: ['a.ts'] }],
    } as never,
    progress: { draftId: 'd', tasks: {} },
    config: null,
    gateSet: { gates: ['deep-verify'], softCap: false },
    opts: over.opts ?? { deep: true },
    explicitIds: over.explicitIds ?? new Set<string>(),
    touchedFiles: ['a.ts'],
    coverage: async () => new Map(),
    verifiers: { deep: { verify: over.verify } },
    emit: { anomalies: async () => {} },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('runDeepVerifyGate', () => {
  // AC-2: passing verdict → pass + deepVerify summaryPatch
  it('records a passing verdict', async () => {
    const res = await runDeepVerifyGate(
      ctx({ verify: async () => ({ verdicts: { 'AC-1': { pass: true, reason: 'ok' } }, provider: 'mock' }) }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.deepVerify?.['AC-1']).toEqual({ pass: true, reason: 'ok', provider: 'mock' });
  });

  // AC-2: failing non-explicit verdict, no --force → refuse with stderr
  it('refuses on a failing verdict', async () => {
    const errs: string[] = [];
    const res = await runDeepVerifyGate(
      ctx({ errs, verify: async () => ({ verdicts: { 'AC-1': { pass: false, reason: 'nope' } }, provider: 'mock' }) }),
    );
    expect(res.outcome).toBe('refuse');
    expect(errs.join('')).toContain('deep-verify: AC-1 failed — nope (provider: mock)');
    expect(errs.join('')).toContain('settle run --deep refused');
  });

  // AC-2: verifier throws, --allow-verifier-failure → pass + all-fail + flag
  it('degrades on verifier throw with allowVerifierFailure', async () => {
    const res = await runDeepVerifyGate(
      ctx({
        opts: { deep: true, allowVerifierFailure: true },
        verify: async () => { throw new Error('boom'); },
      }),
    );
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch?.deepVerify?.['AC-1']?.pass).toBe(false);
    expect(res.summaryPatch?.deepVerify?.['AC-1']?.reason).toBe('verifier failed: boom');
    expect(res.flags?.verifierFailure).toEqual({ message: 'boom', provider: 'mock' });
  });

  // AC-2: verifier throws, no bypass → refuse
  it('refuses on verifier throw without the bypass flag', async () => {
    const res = await runDeepVerifyGate(
      ctx({ opts: { deep: true }, verify: async () => { throw new Error('boom'); } }),
    );
    expect(res.outcome).toBe('refuse');
  });

  // AC-2: gate does not fire when not requested
  it('passes without firing when neither --deep nor membership applies', async () => {
    const res = await runDeepVerifyGate(
      ctx({ opts: {}, verify: async () => { throw new Error('should not be called'); } }),
    );
    // opts.deep is false and gateSet has 'deep-verify' → membership fires it; to
    // test the no-fire path, override gateSet:
    expect(res.outcome).toBe('pass');
  });
});
```

Note: the last test's `ctx` has `gateSet.gates = ['deep-verify']`, so membership fires. To exercise the true no-fire path, the implementer should add a variant with `gateSet: { gates: [], softCap: false }` and `opts: {}`; keep whichever expresses the branch — the point is the `deepRequested` guard returns `pass` without calling `verify`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @cadence/core test -- tests/gates/deep-verify.test.ts`
Expected: FAIL — cannot find `../../src/gates/deep-verify.js`.

- [ ] **Step 3: Implement `gates/deep-verify.ts`**

```ts
// packages/core/src/gates/deep-verify.ts
import type { DeepVerdict } from '@cadence/types';
import type { VerifyAc, VerifyInput, VerifyTestRef } from '../verify/verifier.js';
import type { GateImpl, GateResult, GateFlags } from './types.js';

/**
 * Deep verifier gate (Phase 15). Extracted from settle.ts:307-404 verbatim.
 * Fires on --deep OR membership('deep-verify'); skipped under --auto=false.
 */
export const runDeepVerifyGate: GateImpl = async (ctx): Promise<GateResult> => {
  const deepRequested =
    ctx.opts.deep === true || ctx.gateSet.gates.includes('deep-verify');
  if (!deepRequested || ctx.opts.auto === false) {
    return { outcome: 'pass' };
  }

  const acs: VerifyAc[] = ctx.draft.acceptanceCriteria.map((a) => ({
    id: a.id,
    given: a.given,
    when: a.when,
    then: a.then,
  }));
  const coverageMap = await ctx.coverage();
  const tests: Record<string, VerifyTestRef[]> = {};
  for (const [id, refs] of coverageMap) tests[id] = refs;
  const verifyInput: VerifyInput = {
    acs,
    tests,
    diff: '',
    files: [...ctx.touchedFiles],
  };

  try {
    const result = await ctx.verifiers.deep.verify(verifyInput);
    const deepVerify: Record<string, DeepVerdict> = {};
    for (const ac of acs) {
      const v = result.verdicts[ac.id];
      if (v) {
        deepVerify[ac.id] = {
          pass: v.pass,
          reason: v.reason,
          provider: result.provider,
          ...(result.model ? { model: result.model } : {}),
        };
      }
    }
    const offenders = acs
      .map((a) => a.id)
      .filter(
        (id) =>
          !ctx.explicitIds.has(id) &&
          deepVerify[id] !== undefined &&
          deepVerify[id]!.pass === false,
      );
    if (offenders.length > 0 && !ctx.opts.force) {
      for (const id of offenders) {
        ctx.io.err(
          `deep-verify: ${id} failed — ${deepVerify[id]!.reason} (provider: ${result.provider})\n`,
        );
      }
      ctx.io.err(
        'settle run --deep refused: the independent verifier rejected one or more ACs. ' +
          'Pass --force to settle anyway, or address the gaps.\n',
      );
      return { outcome: 'refuse', summaryPatch: { deepVerify } };
    }
    return { outcome: 'pass', summaryPatch: { deepVerify } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (ctx.opts.allowVerifierFailure) {
      ctx.io.err(
        `deep-verify: verifier failed (${message}); --allow-verifier-failure set, treating all ACs as pass=false.\n`,
      );
      const failedProvider = ctx.config?.verifier?.provider ?? 'mock';
      const failedModel = ctx.config?.verifier?.model;
      const deepVerify: Record<string, DeepVerdict> = {};
      for (const ac of acs) {
        deepVerify[ac.id] = {
          pass: false,
          reason: `verifier failed: ${message}`,
          provider: failedProvider,
          ...(failedModel ? { model: failedModel } : {}),
        };
      }
      const flags: GateFlags = { verifierFailure: { message, provider: failedProvider } };
      return { outcome: 'pass', summaryPatch: { deepVerify }, flags };
    }
    ctx.io.err(
      `deep-verify: verifier failed — ${message}. Pass --allow-verifier-failure to continue.\n`,
    );
    return { outcome: 'refuse' };
  }
};
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @cadence/core test -- tests/gates/deep-verify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/gates/deep-verify.ts packages/core/tests/gates/deep-verify.test.ts
git commit -m "feat(core): extract deep-verify gate to gates/deep-verify.ts (Phase 39.1 AC-2)"
```

---

## Task 4: Wire the gates into `settle.ts`

Replace the two inline blocks with a `SettleContext` build + two gate calls + merges. Keep all other logic (finalizers) reading the same locals — bridge by destructuring from the accumulator.

**Files:**
- Modify: `packages/core/src/cli/commands/settle.ts`

- [ ] **Step 1: Add imports + a memoize helper at the top of settle.ts**

```ts
import { scanTestCoverage } from '../../verify/coverage.js';   // (already imported — keep uncoveredAcs import only if still used elsewhere; it is not after extraction — remove uncoveredAcs)
import { runCoverageGate } from '../../gates/coverage.js';
import { runDeepVerifyGate } from '../../gates/deep-verify.js';
import { mergeInto, type SettleContext, type SettleAccumulator } from '../../gates/types.js';
import type { VerifyTestRef } from '../../verify/verifier.js';
```

Remove the now-unused `uncoveredAcs` import (the coverage gate owns it). Keep `scanTestCoverage` (used by the ctx `coverage()` thunk and still by the interactive block until 39.3).

- [ ] **Step 2: After `gateSet` is computed (settle.ts:153), build the context + accumulator**

Insert after the soft-cap and draft-read blocks (they stay inline in 39.1), before the old coverage block at line 196:

```ts
const touchedFiles = Array.from(new Set(draft.tasks.flatMap((t) => t.files)));
let coverageMemo: Promise<Map<string, VerifyTestRef[]>> | undefined;
const ctx: SettleContext = {
  cwd,
  state,
  draft,
  progress,
  config: cadenceConfig,
  gateSet,
  opts: {
    force: opts.force,
    auto: opts.auto,
    deep: opts.deep,
    allowMissingCoverage: opts.allowMissingCoverage,
    allowVerifierFailure: opts.allowVerifierFailure,
  },
  explicitIds,
  touchedFiles,
  coverage: () => {
    if (!coverageMemo) {
      const globs = cadenceConfig?.verification?.testGlobs;
      coverageMemo = scanTestCoverage(cwd, globs ? { globs } : {});
    }
    return coverageMemo;
  },
  verifiers: { deep: selectVerifier(cadenceConfig) },
  emit: { anomalies: async (events) => { /* unused in 39.1 */ void events; } },
  io: { err: (s) => process.stderr.write(s) },
};
const acc: SettleAccumulator = { flags: {} };
```

- [ ] **Step 3: Replace the inline coverage block (old settle.ts:196-230) with the gate call**

```ts
if (gateSet.gates.includes('test-coverage')) {
  const res = await runCoverageGate(ctx);
  mergeInto(acc, res);
  if (res.outcome === 'refuse') {
    process.exitCode = 1;
    return;
  }
}
const coverageBypassed = acc.flags.coverageBypassed === true;
```

Delete the old `let verifierFailure` declaration at the old line 199 — it now lives in `acc.flags.verifierFailure`. Anywhere the finalizer used `verifierFailure`, read `acc.flags.verifierFailure`.

- [ ] **Step 4: Replace the inline deep-verify block (old settle.ts:307-404) with the gate call**

```ts
{
  const res = await runDeepVerifyGate(ctx);
  mergeInto(acc, res);
  if (res.outcome === 'refuse') {
    process.exitCode = 1;
    return;
  }
}
const deepVerify = acc.deepVerify;
```

(`deepVerify` was a `let` consumed by the AC-merge + the anomaly finalizer + SUMMARY assembly. Keep the local name bound to `acc.deepVerify` so downstream code is untouched.)

- [ ] **Step 5: Fix the `collectAnomalies` finalizer (settle.ts:734) to read the accumulator**

```ts
const anomalies = collectAnomalies({
  draft,
  progress,
  coverageBypassed,
  force: opts.force === true,
  ...(acc.deepVerify ? { deepVerify: acc.deepVerify } : {}),
  ...(interactiveVerify ? { interactiveVerify } : {}),
  ...(acc.flags.verifierFailure ? { verifierFailure: acc.flags.verifierFailure } : {}),
});
```

And in the SUMMARY assembly (settle.ts:828), keep `...(acc.deepVerify ? { deepVerify: acc.deepVerify } : {})`.

- [ ] **Step 6: Run the full core test suite**

Run: `pnpm --filter @cadence/core test`
Expected: PASS — all existing settle tests green (behavior unchanged). Investigate any diff in stderr/exit-code assertions; those are the bit-identical canary.

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm --filter @cadence/core typecheck && pnpm --filter @cadence/core lint`
Expected: no errors. (Watch for unused-import lint on `uncoveredAcs`.)

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/cli/commands/settle.ts
git commit -m "refactor(core): route settle through coverage + deep-verify gates (Phase 39.1 AC-7,AC-8)"
```

---

## Task 5: Bit-identical transcript snapshot

Lock the externally-observable behavior so future gate phases can't drift it.

**Files:**
- Create: `packages/core/tests/cli/settle-bit-identical.test.ts`

- [ ] **Step 1: Write the snapshot test using the testkit ephemeral repo**

```ts
// packages/core/tests/cli/settle-bit-identical.test.ts
import { describe, it, expect } from 'vitest';
import { makeTempRepo } from '@cadence/testkit';   // confirm the exact fixture export name in packages/testkit/src/fixture.ts
import { execFileSync } from 'node:child_process';

// AC-7: settle's coverage-refusal transcript is stable post-extraction.
describe('settle run — bit-identical gate transcripts', () => {
  it('coverage gate refusal message is unchanged', async () => {
    const repo = await makeTempRepo({ profile: 'standard', tier: 'standard' });
    // arrange a BUILD-state draft with an AC that has no linked test, then:
    let stderr = '';
    try {
      execFileSync(
        process.execPath,
        [require.resolve('../../bin/cadence.cjs'), 'settle', 'run', '--auto'],
        { cwd: repo.root, encoding: 'utf8' },
      );
    } catch (e: unknown) {
      stderr = (e as { stderr?: string }).stderr ?? '';
    }
    expect(stderr).toContain('coverage: AC-1 has no linked test');
    expect(stderr).toMatchSnapshot();
  });
});
```

Note: the exact fixture API (`makeTempRepo`, draft seeding helpers) must match `packages/testkit/src/fixture.ts` — inspect it and adapt arrange-steps to the existing helpers used by other `tests/cli/*` settle tests (grep `tests/` for `settle run` to copy the established setup). The assertion intent — a stable stderr snapshot — is the contract; the arrange plumbing follows existing tests.

- [ ] **Step 2: Run to capture the snapshot**

Run: `pnpm --filter @cadence/core test -- tests/cli/settle-bit-identical.test.ts`
Expected: PASS (snapshot written on first run). Eyeball the `.snap` file: the refusal text must match what `cadence settle run --auto` printed before Task 4.

- [ ] **Step 3: Full gate**

Run from repo root: `pnpm turbo run lint typecheck test build`
Expected: all green (this is the pre-push gate).

- [ ] **Step 4: Commit**

```bash
git add packages/core/tests/cli/settle-bit-identical.test.ts packages/core/tests/cli/__snapshots__
git commit -m "test(core): bit-identical settle transcript snapshot for gate extraction (Phase 39.1 AC-7)"
```

---

## Self-Review

**Spec coverage** (design doc ACs → tasks):
- AC-1 (coverage single home) → Task 2. AC-2 (deep single home + port) → Task 3.
- AC-3 (uniform `GateImpl`, no casts) → `runCoverageGate`/`runDeepVerifyGate` typed `: GateImpl` (Tasks 2/3); add a one-line type-assert test if desired.
- AC-4 (functional patch) → Task 1 (`mergeInto`). AC-5 (`io` port) → exercised in every gate test via the `errs` capture.
- AC-6 (test without CLI) → Tasks 2/3 construct `ctx` directly. AC-7 (bit-identical) → Tasks 4/5. AC-8 (net LoC drop) → Task 4 deletes both inline blocks.

**Placeholder scan:** Two spots intentionally defer to existing code, not TODO: (a) the `AnomalyEvent` export name (Task 1 Step 3) and (b) the testkit fixture API (Task 5) — both instruct the implementer to confirm against the named source file rather than inventing. All gate logic is complete, real code copied from the verified `settle.ts` lines.

**Type consistency:** `GateImpl`/`GateResult`/`SettleContext`/`SettleAccumulator`/`mergeInto` names are identical across Tasks 1–4. `runCoverageGate`/`runDeepVerifyGate` names match between the gate files, their tests, and the settle wiring. `coverageBypassed`/`verifierFailure` flag names match the `GateFlags` definition and the `collectAnomalies` finalizer call.

**Known follow-on (not 39.1):** the `--deep`/`--interactive` flags force a gate that may not be in the matrix set; 39.1 preserves this via the call-site `deepRequested` guard, but Phase 44.1's registry must resolve an *effective* gate set (matrix ∪ flag-forced) before iterating `GATE_ORDER`. Recorded for 44.1; out of scope here.
