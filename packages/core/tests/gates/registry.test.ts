import { describe, it, expect } from 'vitest';
import { NO_TEST_COMMAND_NOTICE } from '@manehorizons/cadence-types';
import type { GateResult, SettleContext } from '../../src/gates/types.js';
import {
  GATE_ORDER,
  GATE_REGISTRY,
  runSettleGates,
  type GateEntry,
  type SettleGate,
} from '../../src/gates/registry.js';
import { runDraftReadGate } from '../../src/gates/draft-read.js';
import { runStructuralVerifierGate } from '../../src/gates/structural-verifier.js';
import { runBoundaryScanGate } from '../../src/gates/boundary-scan.js';
import { runBuildTestGate } from '../../src/gates/build-test-must-pass.js';
import { runCoverageGate } from '../../src/gates/coverage.js';
import { runInteractiveGate } from '../../src/gates/interactive.js';
import { runDeepVerifyGate } from '../../src/gates/deep-verify.js';
import { runCodeReviewGate } from '../../src/gates/code-review.js';
import { runSecurityAuditGate } from '../../src/gates/security-audit.js';

/** The nine settle gates in their canonical execution order. */
const EXPECTED_ORDER: SettleGate[] = [
  'draft-read',
  'structural-verifier',
  'boundary-scan',
  'build-test-must-pass',
  'test-coverage',
  'interactive-verdict',
  'deep-verify',
  'code-review',
  'security-audit',
];

/** A recording registry: each impl pushes its gate name + returns a verdict. */
function recordingRegistry(
  calls: SettleGate[],
  verdicts: Partial<Record<SettleGate, GateResult>> = {},
): Record<SettleGate, GateEntry> {
  const pass: GateResult = { outcome: 'pass' };
  const entry = (gate: SettleGate): GateEntry => ({
    impl: async () => {
      calls.push(gate);
      return verdicts[gate] ?? pass;
    },
    selfGuarded: GATE_REGISTRY[gate].selfGuarded ?? false,
  });
  return {
    'draft-read': entry('draft-read'),
    'structural-verifier': entry('structural-verifier'),
    'boundary-scan': entry('boundary-scan'),
    'build-test-must-pass': entry('build-test-must-pass'),
    'test-coverage': entry('test-coverage'),
    'interactive-verdict': entry('interactive-verdict'),
    'deep-verify': entry('deep-verify'),
    'code-review': entry('code-review'),
    'security-audit': entry('security-audit'),
  };
}

/** Minimal SettleContext with a controllable gate set. */
function ctxWith(gates: string[]): SettleContext {
  return { gateSet: { gates }, opts: {} } as unknown as SettleContext;
}

describe('GATE registry wiring (Phase 44.1)', () => {
  it('GATE_ORDER is the canonical 8-gate execution order (AC-3)', () => {
    expect(GATE_ORDER).toEqual(EXPECTED_ORDER);
  });

  it('GATE_ORDER covers exactly the registry keys (AC-1 totality)', () => {
    expect([...GATE_ORDER].sort()).toEqual(Object.keys(GATE_REGISTRY).sort());
  });

  it('each entry wires the real gate impl (identity)', () => {
    expect(GATE_REGISTRY['draft-read'].impl).toBe(runDraftReadGate);
    expect(GATE_REGISTRY['structural-verifier'].impl).toBe(runStructuralVerifierGate);
    expect(GATE_REGISTRY['boundary-scan'].impl).toBe(runBoundaryScanGate);
    expect(GATE_REGISTRY['build-test-must-pass'].impl).toBe(runBuildTestGate);
    expect(GATE_REGISTRY['test-coverage'].impl).toBe(runCoverageGate);
    expect(GATE_REGISTRY['interactive-verdict'].impl).toBe(runInteractiveGate);
    expect(GATE_REGISTRY['deep-verify'].impl).toBe(runDeepVerifyGate);
    expect(GATE_REGISTRY['code-review'].impl).toBe(runCodeReviewGate);
    expect(GATE_REGISTRY['security-audit'].impl).toBe(runSecurityAuditGate);
  });

  it('only boundary-scan, deep-verify + interactive-verdict are selfGuarded', () => {
    const selfGuarded = (Object.keys(GATE_REGISTRY) as SettleGate[]).filter(
      (g) => GATE_REGISTRY[g].selfGuarded,
    );
    expect(selfGuarded.sort()).toEqual(['boundary-scan', 'deep-verify', 'interactive-verdict']);
  });
});

describe('runSettleGates dispatch (Phase 44.1)', () => {
  it('invokes every present gate in GATE_ORDER (AC-3)', async () => {
    const calls: SettleGate[] = [];
    const { refused } = await runSettleGates(ctxWith([...EXPECTED_ORDER]), {
      registry: recordingRegistry(calls),
    });
    expect(refused).toBe(false);
    expect(calls).toEqual(EXPECTED_ORDER);
  });

  it('skips membership gates absent from the set; self-guarded gates still run', async () => {
    const calls: SettleGate[] = [];
    await runSettleGates(
      ctxWith(['structural-verifier', 'build-test-must-pass']),
      { registry: recordingRegistry(calls) },
    );
    expect(calls).toEqual([
      'structural-verifier',
      'boundary-scan',
      'build-test-must-pass',
      'interactive-verdict',
      'deep-verify',
    ]);
  });

  it('runs boundary-scan + deep-verify + interactive-verdict on an empty set (self-guarded, no membership)', async () => {
    const calls: SettleGate[] = [];
    await runSettleGates(ctxWith([]), { registry: recordingRegistry(calls) });
    expect(calls).toEqual(['boundary-scan', 'interactive-verdict', 'deep-verify']);
  });

  it('halts on the first refusing gate; later gates never run (AC-5)', async () => {
    const calls: SettleGate[] = [];
    const { refused } = await runSettleGates(ctxWith([...EXPECTED_ORDER]), {
      registry: recordingRegistry(calls, { 'test-coverage': { outcome: 'refuse' } }),
    });
    expect(refused).toBe(true);
    expect(calls).toEqual([
      'draft-read',
      'structural-verifier',
      'boundary-scan',
      'build-test-must-pass',
      'test-coverage',
    ]);
    expect(calls).not.toContain('code-review');
  });

  it('merges gate summaryPatch + flags into the accumulator', async () => {
    const calls: SettleGate[] = [];
    const { acc } = await runSettleGates(ctxWith([...EXPECTED_ORDER]), {
      registry: recordingRegistry(calls, {
        'test-coverage': { outcome: 'pass', flags: { coverageBypassed: true } },
        'code-review': { outcome: 'pass', summaryPatch: { codeReview: { 'a.ts': [] } } },
      }),
    });
    expect(acc.flags.coverageBypassed).toBe(true);
    expect(acc.codeReview).toEqual({ 'a.ts': [] });
  });
});

describe('runSettleGates gate provenance (AC-1, phase 140)', () => {
  it('records status:"ran" for every membership gate that was invoked (boundary-scan self-guards to skipped)', async () => {
    const { gates } = await runSettleGates(ctxWith([...EXPECTED_ORDER]), {
      registry: recordingRegistry([]),
    });
    expect(gates).toEqual(
      EXPECTED_ORDER.map((gate) =>
        gate === 'boundary-scan'
          ? { gate, status: 'skipped', skipReason: 'boundaryEnforcement is not "block"' }
          : { gate, status: 'ran' },
      ),
    );
  });

  it('records status:"skipped" with reason for a gate absent from the set', async () => {
    const { gates } = await runSettleGates(
      ctxWith(['draft-read']),
      { registry: recordingRegistry([]), order: ['draft-read', 'security-audit'] },
    );
    expect(gates).toEqual([
      { gate: 'draft-read', status: 'ran' },
      { gate: 'security-audit', status: 'skipped', skipReason: 'not in the active tier × profile gate set' },
    ]);
  });

  it('records deep-verify as skipped when invoked but not requested (self-guarded no-op)', async () => {
    const { gates } = await runSettleGates(ctxWith([]), {
      registry: recordingRegistry([]),
      order: ['deep-verify'],
    });
    expect(gates).toEqual([
      { gate: 'deep-verify', status: 'skipped', skipReason: 'not requested (no --deep / --interactive, not in gate set)' },
    ]);
  });

  it('records deep-verify as ran when actually requested via --deep', async () => {
    const ctx = { gateSet: { gates: [] }, opts: { deep: true } } as unknown as SettleContext;
    const { gates } = await runSettleGates(ctx, {
      registry: recordingRegistry([]),
      order: ['deep-verify'],
    });
    expect(gates).toEqual([{ gate: 'deep-verify', status: 'ran' }]);
  });

  it('records build-test-must-pass as skipped when the gate patches buildTestRan:false', async () => {
    const { gates } = await runSettleGates(ctxWith(['build-test-must-pass']), {
      registry: recordingRegistry([], {
        'build-test-must-pass': { outcome: 'pass', summaryPatch: { buildTestRan: false } },
      }),
      order: ['build-test-must-pass'],
    });
    expect(gates).toEqual([
      { gate: 'build-test-must-pass', status: 'skipped', skipReason: NO_TEST_COMMAND_NOTICE.message },
    ]);
  });

  it('records test-coverage as skipped when bypassed via --allow-missing-coverage', async () => {
    const { gates } = await runSettleGates(ctxWith(['test-coverage']), {
      registry: recordingRegistry([], {
        'test-coverage': { outcome: 'pass', flags: { coverageBypassed: true } },
      }),
      order: ['test-coverage'],
    });
    expect(gates).toEqual([
      { gate: 'test-coverage', status: 'skipped', skipReason: 'bypassed via --allow-missing-coverage' },
    ]);
  });

  it('returns a partial gates[] (only entries before the halt) on refusal', async () => {
    const { gates, refused } = await runSettleGates(ctxWith([...EXPECTED_ORDER]), {
      registry: recordingRegistry([], { 'test-coverage': { outcome: 'refuse' } }),
    });
    expect(refused).toBe(true);
    expect(gates).toEqual([
      { gate: 'draft-read', status: 'ran' },
      { gate: 'structural-verifier', status: 'ran' },
      { gate: 'boundary-scan', status: 'skipped', skipReason: 'boundaryEnforcement is not "block"' },
      { gate: 'build-test-must-pass', status: 'ran' },
    ]);
  });

  it('records boundary-scan as ran when effectiveBoundaryEnforcement resolves to "block"', async () => {
    const ctx = {
      gateSet: { gates: [] },
      opts: {},
      config: { boundaryEnforcement: 'block' },
      draft: { tasks: [] },
    } as unknown as SettleContext;
    const { gates } = await runSettleGates(ctx, {
      registry: recordingRegistry([]),
      order: ['boundary-scan'],
    });
    expect(gates).toEqual([{ gate: 'boundary-scan', status: 'ran' }]);
  });
});
