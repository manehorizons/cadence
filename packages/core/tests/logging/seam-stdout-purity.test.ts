import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  runSettleGates,
  type GateEntry,
  type SettleGate,
} from '../../src/gates/registry.js';
import type { SettleContext } from '../../src/gates/types.js';
import { resetLogger } from '../../src/logging/logger.js';

/**
 * Seam-level guard for the phase-80 invariants applied through the real
 * (default, env-resolved) logger — not a capturing stub. Proves AC-5
 * (stderr-only at the seam) and AC-6 (default-off emits nothing).
 */

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

function fullRegistry(): Record<SettleGate, GateEntry> {
  const mk = (): GateEntry => ({ impl: async () => ({ outcome: 'pass' }), selfGuarded: false });
  return Object.fromEntries(ALL_GATES.map((g) => [g, mk()])) as Record<SettleGate, GateEntry>;
}

function ctxWith(gates: string[]): SettleContext {
  return { gateSet: { gates } } as unknown as SettleContext;
}

function withEnvLevel(level: string | undefined, fn: () => Promise<void>): Promise<void> {
  const prev = process.env.CADENCE_LOG_LEVEL;
  if (level === undefined) delete process.env.CADENCE_LOG_LEVEL;
  else process.env.CADENCE_LOG_LEVEL = level;
  resetLogger();
  return fn().finally(() => {
    if (prev === undefined) delete process.env.CADENCE_LOG_LEVEL;
    else process.env.CADENCE_LOG_LEVEL = prev;
    resetLogger();
  });
}

afterEach(() => resetLogger());

describe('seam stdout purity + default-off (AC-5, AC-6)', () => {
  it('AC-5: the gate seam at debug writes to stderr and never stdout', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const outSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      await withEnvLevel('debug', async () => {
        await runSettleGates(ctxWith(['draft-read']), {
          registry: fullRegistry(),
          order: ['draft-read', 'test-coverage'],
        });
      });
      expect(errSpy).toHaveBeenCalled();
      expect(outSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      outSpy.mockRestore();
    }
  });

  it('AC-6: the gate seam at the default (no env/config) writes nothing at all', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const outSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      await withEnvLevel(undefined, async () => {
        await runSettleGates(ctxWith(['draft-read']), {
          registry: fullRegistry(),
          order: ['draft-read', 'test-coverage'],
        });
      });
      expect(errSpy).not.toHaveBeenCalled();
      expect(outSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      outSpy.mockRestore();
    }
  });
});
