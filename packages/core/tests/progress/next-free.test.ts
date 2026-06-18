import { describe, it, expect, afterEach } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { emptyState } from '@manehorizons/cadence-types';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { nextAction } from '../../src/progress.js';
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

describe('nextAction occupancy hint (pure, no I/O)', () => {
  it('AC-5 (phase 120): IDLE renders a copy-pasteable inferred draft command', () => {
    const action = nextAction(emptyState(), { nextPhaseNumber: 86 });
    expect(action.command).toBe('cadence draft new --title "New work"');
    expect(action.command).not.toContain('<phase>');
    expect(action.command).not.toContain('<num>');
  });

  it('AC-5 (phase 120): phases >= 100 still render the same runnable command', () => {
    const action = nextAction(emptyState(), { nextPhaseNumber: 103 });
    expect(action.command).toBe('cadence draft new --title "New work"');
  });

  it('AC-5 (phase 120): IDLE without a hint is still copy-pasteable', () => {
    const action = nextAction(emptyState());
    expect(action.command).toBe('cadence draft new --title "New work"');
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

  it('AC-2: empty occupancy returns null', async () => {
    active = await tempRepo({ initialized: true });
    expect(await resolveNextFreePhase(active.root, stub([]))).toBeNull();
  });

  it('AC-2: a throwing collector returns null', async () => {
    active = await tempRepo({ initialized: true });
    const n = await resolveNextFreePhase(active.root, async () => {
      throw new Error('git boom');
    });
    expect(n).toBeNull();
  });
});

describe('progressService IDLE suggestion', () => {
  it('AC-5 (phase 120): IDLE with local phases suggests the inferred draft command', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, '.cadence', 'phases', '05-foo'), { recursive: true });
    await mkdir(join(active.root, '.cadence', 'phases', '12-bar'), { recursive: true });
    const cap = capture();
    const res = await progressService(active.root, cap.io);
    expect(res.exitCode).toBe(0);
    expect(cap.out).toMatch(/cadence draft new --title "New work"/);
    expect(cap.out).not.toContain('<phase>');
    expect(cap.out).not.toContain('<num>');
  });

  it('AC-5 (phase 120): IDLE with no phases still prints runnable command and exits 0', async () => {
    active = await tempRepo({ initialized: true });
    const cap = capture();
    const res = await progressService(active.root, cap.io);
    expect(res.exitCode).toBe(0);
    expect(cap.out).toContain('cadence draft new --title "New work"');
    expect(cap.out).not.toContain('<num>');
  });
});
