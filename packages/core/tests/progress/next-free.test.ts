import { describe, it, expect, afterEach } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { emptyState } from '@manehorizons/cadence-types';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { nextAction } from '../../src/progress.js';
import { derivePhaseTaskId } from '../../src/phases/id.js';
import { resolveNextFreePhase } from '../../src/phases/next-free.js';
import { progressService } from '../../src/services/progress.js';
import type { Occupancy } from '../../src/phases/collision.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

/** A stub collector returning fixed occupancies (offline, deterministic). */
const stub =
  (occ: Occupancy[]) =>
  async (): Promise<Occupancy[]> =>
    occ;

const capture = () => {
  let out = '';
  let err = '';
  return {
    io: { out: (s: string) => (out += s), err: (s: string) => (err += s) },
    get out() {
      return out;
    },
    get err() {
      return err;
    },
  };
};

describe('nextAction occupancy hint (pure — no I/O)', () => {
  it('AC-1: IDLE with a nextPhaseNumber renders it in the slug prefix, leaving the num arg at default 1', () => {
    const action = nextAction(emptyState(), { nextPhaseNumber: 86 });
    expect(action.command).toContain('86-'); // slug prefix `86-<slug>`
    expect(action.command).not.toContain('<num>');
    // The phase number and the task number are distinct: next-free fills only the
    // phase-number token, so the task-num slot defaults to 1 — not the phase number.
    expect(action.command).toBe('cadence draft new 86-<slug> 1 --title=…');
  });

  it('AC-1: phases >= 100 derive a clean PP-TT id (regression for rec-20260611-002)', () => {
    // Bug: the num slot used to be filled with the phase number, so `draft new
    // 103-<slug> 103` mangled into id 103-103 instead of 103-01.
    const action = nextAction(emptyState(), { nextPhaseNumber: 103 });
    expect(action.command).toBe('cadence draft new 103-<slug> 1 --title=…');
    // The suggested invocation, run through id derivation, yields the task-1 id.
    expect(derivePhaseTaskId('103-<slug>', '1')).toBe('103-01');
  });

  it("AC-2: IDLE without a hint keeps today's <num> placeholder", () => {
    const action = nextAction(emptyState());
    expect(action.command).toContain('<num>');
  });

  it('AC-1: a hint at a non-IDLE position is ignored (BUILD command unchanged)', () => {
    const state = { ...emptyState(), loopPosition: 'BUILD' as const };
    const action = nextAction(state, { nextPhaseNumber: 99 });
    expect(action.command).not.toContain('99');
  });
});

describe('resolveNextFreePhase (best-effort I/O)', () => {
  it('AC-1: returns max(observed)+1 over local + sibling + upstream', async () => {
    active = await tempRepo({ initialized: true });
    const n = await resolveNextFreePhase(
      active.root,
      stub([
        { number: 12, source: 'local', location: active.root },
        { number: 30, source: 'sibling', location: '/wt/other' },
        { number: 7, source: 'upstream', location: 'origin/main' },
      ]),
    );
    expect(n).toBe(31);
  });

  it('AC-2: empty occupancy → null (caller falls back to the placeholder)', async () => {
    active = await tempRepo({ initialized: true });
    expect(await resolveNextFreePhase(active.root, stub([]))).toBeNull();
  });

  it('AC-2: a throwing collector → null (best-effort, never throws)', async () => {
    active = await tempRepo({ initialized: true });
    const n = await resolveNextFreePhase(active.root, async () => {
      throw new Error('git boom');
    });
    expect(n).toBeNull();
  });
});

describe('progressService IDLE suggestion (occupancy-aware)', () => {
  it('AC-1: IDLE with local phases suggests a concrete next-free number', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, '.cadence', 'phases', '05-foo'), { recursive: true });
    await mkdir(join(active.root, '.cadence', 'phases', '12-bar'), { recursive: true });
    const cap = capture();
    const res = await progressService(active.root, cap.io);
    expect(res.exitCode).toBe(0);
    expect(cap.out).toMatch(/cadence draft new 13-/);
    expect(cap.out).not.toContain('<num>');
  });

  it('AC-2: IDLE with no phases falls back to the placeholder and exits 0', async () => {
    active = await tempRepo({ initialized: true });
    const cap = capture();
    const res = await progressService(active.root, cap.io);
    expect(res.exitCode).toBe(0);
    expect(cap.out).toContain('<num>');
  });
});
