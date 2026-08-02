import { describe, it, expect } from 'vitest';
import type { GateProvenance } from '@thomas-powers-jr/cadence-types';
import type { GateResult, SettleContext } from '../../src/gates/types.js';
import { runSettleGates, type GateEntry, type SettleGate } from '../../src/gates/registry.js';

/**
 * Phase 241 (T1): `SettleContext.gateProvenance` is the read-only seam that
 * lets a later gate (the anchor ladder's `executable` tier, wired by a later
 * task) see what `build-test-must-pass` recorded earlier in the same settle.
 * These tests drive the REAL `runSettleGates` loop over recording stubs via
 * its `deps: { registry, order }` test seam — the established style in
 * `registry.test.ts` — rather than unit-testing a helper in isolation.
 */

/** All ten settle gate names, for building a total `Record<SettleGate, GateEntry>`. */
const ALL_GATES: SettleGate[] = [
  'draft-read',
  'structural-verifier',
  'boundary-scan',
  'task-verify-required',
  'build-test-must-pass',
  'test-coverage',
  'interactive-verdict',
  'deep-verify',
  'code-review',
  'security-audit',
];

/**
 * A registry where every gate defaults to an unconditional pass, and named
 * gates can override with a recording/asserting impl. `selfGuarded` is
 * always false here — the tests below control exactly which gates run via
 * `deps.order`, so self-guard semantics (irrelevant to this seam) never need
 * to enter the picture.
 */
function recordingRegistry(
  overrides: Partial<Record<SettleGate, (ctx: SettleContext) => Promise<GateResult>>> = {},
): Record<SettleGate, GateEntry> {
  const entry = (gate: SettleGate): GateEntry => ({
    impl: overrides[gate] ?? (async () => ({ outcome: 'pass' })),
    selfGuarded: false,
  });
  const result = {} as Record<SettleGate, GateEntry>;
  for (const gate of ALL_GATES) {
    result[gate] = entry(gate);
  }
  return result;
}

/**
 * Minimal SettleContext with a controllable gate set, plus three
 * distinctly-identifiable closures standing in for the real memoized
 * `coverage()` / `draftMtimeMs()` / `diff()` — exactly the properties the
 * task's "trap" warns must survive by identity through the per-gate context.
 */
function baseCtx(gates: string[]): SettleContext {
  return {
    gateSet: { gates },
    opts: {},
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    diff: () => '',
  } as unknown as SettleContext;
}

describe('runSettleGates per-gate provenance snapshot (Phase 241, T1)', () => {
  it('AC-1: a later gate receives prior provenance including the recorded build-test-must-pass "ran" entry, and the first gate invoked receives an empty collection, not undefined', async () => {
    const seen: Partial<Record<SettleGate, readonly GateProvenance[] | undefined>> = {};
    const registry = recordingRegistry({
      'build-test-must-pass': async (ctx) => {
        seen['build-test-must-pass'] = ctx.gateProvenance;
        return { outcome: 'pass' };
      },
      'code-review': async (ctx) => {
        seen['code-review'] = ctx.gateProvenance;
        return { outcome: 'pass' };
      },
    });

    const { refused } = await runSettleGates(
      baseCtx(['build-test-must-pass', 'code-review']),
      { registry, order: ['build-test-must-pass', 'code-review'] },
    );

    expect(refused).toBe(false);
    // build-test-must-pass ran first: nothing recorded yet — must be an
    // empty collection, never `undefined`.
    expect(seen['build-test-must-pass']).toBeDefined();
    expect(seen['build-test-must-pass']).toEqual([]);
    // code-review ran second: its snapshot must carry the build-test-must-pass
    // entry the registry recorded for the gate that ran just before it.
    expect(seen['code-review']).toEqual([
      { gate: 'build-test-must-pass', status: 'ran' },
    ]);
  });

  it('AC-1: the snapshot carries SKIPPED entries too, not just the gates that ran — a later gate sees why an earlier gate did not run', async () => {
    // Regression pin: an implementation that snapshotted only
    // `gates.filter((g) => g.status === 'ran')` passed every other test in
    // this file and the whole gates suite, because nothing else consumes
    // `ctx.gateProvenance` yet. AC-1 promises "the provenance entries
    // recorded so far", and a skipped entry is a recorded fact the anchor
    // ladder reasons about — `build-test-must-pass` being SKIPPED is
    // precisely what must NOT corroborate an `executable` tier.
    let seen: readonly Readonly<GateProvenance>[] | undefined;
    const registry = recordingRegistry({
      'code-review': async (ctx) => {
        seen = ctx.gateProvenance;
        return { outcome: 'pass' };
      },
    });

    // `structural-verifier` is absent from the gate set, so the registry
    // records it as skipped via the early-`continue` path before code-review runs.
    const { refused } = await runSettleGates(baseCtx(['draft-read', 'code-review']), {
      registry,
      order: ['draft-read', 'structural-verifier', 'code-review'],
    });

    expect(refused).toBe(false);
    expect(seen).toEqual([
      { gate: 'draft-read', status: 'ran' },
      {
        gate: 'structural-verifier',
        status: 'skipped',
        skipReason: 'not in the active tier × profile gate set',
      },
    ]);
  });

  it('AC-2: a gate cannot rewrite a snapshot ENTRY\'s fields to corrupt the accumulator that becomes SUMMARY.json.gates', async () => {
    // The array-level freeze alone left element objects shared by reference
    // with the live accumulator, so `gateProvenance[0].status = 'refused'`
    // rewrote a persisted provenance entry with no cast required. The cast
    // below only defeats the compile-time `Readonly<GateProvenance>` guard so
    // the RUNTIME guarantee can be asserted independently of the type.
    let threw: unknown;
    const registry = recordingRegistry({
      'code-review': async (ctx) => {
        try {
          (ctx.gateProvenance as GateProvenance[])[0]!.status = 'refused';
        } catch (err) {
          threw = err;
        }
        return { outcome: 'pass' };
      },
    });

    const { gates, refused } = await runSettleGates(baseCtx(['draft-read', 'code-review']), {
      registry,
      order: ['draft-read', 'code-review'],
    });

    expect(refused).toBe(false);
    // Frozen entry ⇒ the write throws in strict mode (ESM always is) rather
    // than silently succeeding.
    expect(threw).toBeInstanceOf(TypeError);
    // The authoritative accumulator still reports draft-read as having RUN.
    expect(gates).toEqual([
      { gate: 'draft-read', status: 'ran' },
      { gate: 'code-review', status: 'ran' },
    ]);
  });

  it('AC-2: a gate\'s snapshot reflects only what existed at its own invocation — later gates appending their own entries never grows an already-captured snapshot, and attempting to mutate the snapshot never corrupts the registry\'s real accumulator', async () => {
    let firstSnapshot: readonly GateProvenance[] | undefined;
    const registry = recordingRegistry({
      'draft-read': async (ctx) => {
        firstSnapshot = ctx.gateProvenance;
        // A gate that tries to reach through its snapshot to mutate the
        // registry's live accumulator must fail loudly (frozen array),
        // never silently succeed and corrupt later gates' view.
        expect(() => {
          (ctx.gateProvenance as GateProvenance[]).push({
            gate: 'security-audit',
            status: 'ran',
          });
        }).toThrow(TypeError);
        return { outcome: 'pass' };
      },
    });

    const { gates, refused } = await runSettleGates(
      baseCtx(['draft-read', 'structural-verifier', 'build-test-must-pass']),
      { registry, order: ['draft-read', 'structural-verifier', 'build-test-must-pass'] },
    );

    expect(refused).toBe(false);
    // draft-read was first: its captured snapshot was and remains empty,
    // even though the registry's real accumulator went on to record two
    // more entries after draft-read returned.
    expect(firstSnapshot).toEqual([]);
    // The real accumulator was never corrupted by draft-read's mutation
    // attempt — it holds exactly the three gates that actually ran, with no
    // injected 'security-audit' entry anywhere in it.
    expect(gates).toEqual([
      { gate: 'draft-read', status: 'ran' },
      { gate: 'structural-verifier', status: 'ran' },
      { gate: 'build-test-must-pass', status: 'ran' },
    ]);
  });
});

describe('memoized-closure identity preservation (Phase 241, T1 — "the trap")', () => {
  it('passes the exact same coverage/draftMtimeMs/diff function references into every per-gate context, never re-created per gate', async () => {
    const outer = baseCtx(['draft-read', 'structural-verifier', 'code-review']);
    const seenCtxs: SettleContext[] = [];
    const registry = recordingRegistry({
      'draft-read': async (ctx) => {
        seenCtxs.push(ctx);
        return { outcome: 'pass' };
      },
      'structural-verifier': async (ctx) => {
        seenCtxs.push(ctx);
        return { outcome: 'pass' };
      },
      'code-review': async (ctx) => {
        seenCtxs.push(ctx);
        return { outcome: 'pass' };
      },
    });

    await runSettleGates(outer, {
      registry,
      order: ['draft-read', 'structural-verifier', 'code-review'],
    });

    expect(seenCtxs).toHaveLength(3);
    for (const seen of seenCtxs) {
      // Identity (===), not just deep-equality: a re-created closure would
      // still be deep-equal-ish in behavior but would reset the outer
      // memoization, silently turning one repo-wide coverage scan into many.
      expect(seen.coverage).toBe(outer.coverage);
      expect(seen.draftMtimeMs).toBe(outer.draftMtimeMs);
      expect(seen.diff).toBe(outer.diff);
    }
  });
});
