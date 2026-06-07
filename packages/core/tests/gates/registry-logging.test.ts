import { describe, it, expect, afterEach } from 'vitest';
import {
  runSettleGates,
  type GateEntry,
  type SettleGate,
} from '../../src/gates/registry.js';
import type { GateResult, SettleContext } from '../../src/gates/types.js';
import { Logger, setLogger, resetLogger } from '../../src/logging/logger.js';
import type { LogLevel } from '@manehorizons/cadence-types';

const ALL_GATES: SettleGate[] = [
  'draft-read',
  'structural-verifier',
  'build-test-must-pass',
  'test-coverage',
  'interactive-verdict',
  'deep-verify',
  'code-review',
  'security-audit',
];

/** A total registry of stubs; `verdicts` overrides specific gate outcomes. */
function fullRegistry(
  verdicts: Partial<Record<SettleGate, GateResult>> = {},
): Record<SettleGate, GateEntry> {
  const mk = (g: SettleGate): GateEntry => ({
    impl: async () => verdicts[g] ?? { outcome: 'pass' },
    selfGuarded: false,
  });
  return Object.fromEntries(ALL_GATES.map((g) => [g, mk(g)])) as Record<SettleGate, GateEntry>;
}

function ctxWith(gates: string[]): SettleContext {
  return { gateSet: { gates } } as unknown as SettleContext;
}

/** Install a capturing logger and return the parsed records it receives. */
function captureRecords(level: LogLevel = 'debug'): Array<Record<string, unknown>> {
  const recs: Array<Record<string, unknown>> = [];
  setLogger(
    new Logger({
      level,
      format: 'json',
      write: (l) => recs.push(JSON.parse(l) as Record<string, unknown>),
      now: () => 'T',
    }),
  );
  return recs;
}

afterEach(() => resetLogger());

describe('gate seam logging (AC-1)', () => {
  it('AC-1: emits seam:gate "passed" for run gates and "skipped" for excluded gates', async () => {
    const recs = captureRecords('debug');
    await runSettleGates(ctxWith(['draft-read']), {
      registry: fullRegistry(),
      order: ['draft-read', 'test-coverage'],
    });
    const gate = recs.filter((r) => r.seam === 'gate');
    expect(gate).toHaveLength(2);
    expect(gate[0]).toMatchObject({ msg: 'gate passed', fields: { gate: 'draft-read', outcome: 'pass' } });
    expect(gate[1]).toMatchObject({ msg: 'gate skipped', fields: { gate: 'test-coverage' } });
  });

  it('AC-1: emits a seam:gate warn "refused" for the halting gate', async () => {
    const recs = captureRecords('debug');
    const res = await runSettleGates(ctxWith(['draft-read', 'test-coverage']), {
      registry: fullRegistry({ 'test-coverage': { outcome: 'refuse' } }),
      order: ['draft-read', 'test-coverage'],
    });
    expect(res.refused).toBe(true);
    const refused = recs.find((r) => r.seam === 'gate' && r.msg === 'gate refused');
    expect(refused).toMatchObject({ level: 'warn', fields: { gate: 'test-coverage', outcome: 'refuse' } });
  });

  it('AC-1/AC-6: emits nothing at the silent default', async () => {
    const recs = captureRecords('silent');
    await runSettleGates(ctxWith(['draft-read']), {
      registry: fullRegistry(),
      order: ['draft-read', 'test-coverage'],
    });
    expect(recs).toHaveLength(0);
  });
});
