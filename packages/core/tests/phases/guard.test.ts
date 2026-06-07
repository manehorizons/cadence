import { describe, it, expect } from 'vitest';
import { defaultConfig, type CadenceConfig } from '@manehorizons/cadence-types';
import { assertNoPhaseCollision } from '../../src/phases/guard.js';
import type { Occupancy } from '../../src/phases/collision.js';

const cfg = (over: Partial<CadenceConfig['phaseGuard']> = {}): CadenceConfig => ({
  ...defaultConfig,
  phaseGuard: { ...defaultConfig.phaseGuard, ...over },
});

const gatherFrom =
  (occ: Occupancy[]) => async () =>
    occ;

describe('assertNoPhaseCollision (AC-4, AC-5)', () => {
  it('AC-4: refuses on a sibling collision, naming the conflict + next free + bypass hint', async () => {
    const v = await assertNoPhaseCollision('', 30, {
      config: cfg(),
      gather: gatherFrom([{ number: 30, source: 'sibling', location: '/tmp/feature-x' }]),
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.message).toContain('phase 30 is in use by worktree /tmp/feature-x');
      expect(v.message).toContain('suggested next free: 31');
      expect(v.message).toContain('--allow-phase-collision');
    }
  });

  it('AC-4: phrases an upstream conflict as "in use on origin/<ref>"', async () => {
    const v = await assertNoPhaseCollision('x' as never, 42, {
      config: cfg(),
      gather: gatherFrom([{ number: 42, source: 'upstream', location: 'origin/main' }]),
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.message).toContain('phase 42 is in use on origin/main');
  });

  it('AC-4: ok when no occupancy collides', async () => {
    const v = await assertNoPhaseCollision('' as never, 30, {
      config: cfg(),
      gather: gatherFrom([{ number: 28, source: 'sibling', location: '/x' }]),
    });
    expect(v.ok).toBe(true);
  });

  it('AC-5: --allow-phase-collision (allow:true) bypasses a real collision', async () => {
    const v = await assertNoPhaseCollision('' as never, 30, {
      config: cfg(),
      allow: true,
      gather: gatherFrom([{ number: 30, source: 'sibling', location: '/x' }]),
    });
    expect(v.ok).toBe(true);
  });

  it('AC-7: phaseGuard.enabled=false disables the guard entirely', async () => {
    const v = await assertNoPhaseCollision('' as never, 30, {
      config: cfg({ enabled: false }),
      gather: gatherFrom([{ number: 30, source: 'sibling', location: '/x' }]),
    });
    expect(v.ok).toBe(true);
  });

  it('AC-6: excludeSources:["local"] drops self so the settle backstop never self-collides', async () => {
    const v = await assertNoPhaseCollision('' as never, 30, {
      config: cfg(),
      excludeSources: ['local'],
      gather: gatherFrom([{ number: 30, source: 'local', location: '.' }]),
    });
    expect(v.ok).toBe(true);
  });

  it('AC-6: excludeSources:["local"] still catches a same-number SIBLING (the backstop must fire)', async () => {
    const v = await assertNoPhaseCollision('' as never, 30, {
      config: cfg(),
      excludeSources: ['local'],
      gather: gatherFrom([
        { number: 30, source: 'local', location: '.' },
        { number: 30, source: 'sibling', location: '/tmp/race-wt' },
      ]),
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.message).toContain('phase 30 is in use by worktree /tmp/race-wt');
  });

  it('AC-4: a null target (non-numeric phase) is never guarded', async () => {
    let called = false;
    const v = await assertNoPhaseCollision('' as never, null, {
      config: cfg(),
      gather: async () => {
        called = true;
        return [];
      },
    });
    expect(v.ok).toBe(true);
    expect(called).toBe(false);
  });
});
