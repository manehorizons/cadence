import { describe, it, expect, afterEach } from 'vitest';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { checkWorktreePhases, runDoctor } from '../../src/doctor/run.js';
import type { Occupancy } from '../../src/phases/collision.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

const HEALTHY_ENV = { nodeVersion: 'v22.11.0', platform: 'linux' as const };

/** A stub collector returning fixed occupancies (offline, deterministic). */
const stub =
  (occ: Occupancy[]) =>
  async (): Promise<Occupancy[]> =>
    occ;

describe('checkWorktreePhases', () => {
  it('AC-1: no sibling worktrees → ok', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkWorktreePhases(
      active.root,
      stub([{ number: 85, name: '85-x', source: 'local', location: active.root }]),
    );
    expect(check.severity).toBe('ok');
    expect(check.name).toBe('worktree-phases');
    expect(check.detail).toMatch(/no .*phase claims observed/i);
  });

  it('AC-1: empty occupancy (offline / non-git) → ok', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkWorktreePhases(active.root, stub([]));
    expect(check.severity).toBe('ok');
  });

  it('AC-1: upstream equal to local is NOT a collision (merged baseline) → ok', async () => {
    // Every local phase is also on origin/<ref> once merged; that is normal, not
    // a collision. Only sibling worktrees count — upstream is the guard's
    // scaffold-time concern, not a standing doctor warning.
    active = await tempRepo({ initialized: true });
    const check = await checkWorktreePhases(
      active.root,
      stub([
        { number: 85, name: '85-x', source: 'local', location: active.root },
        { number: 85, name: '85-x', source: 'upstream', location: 'origin/main' },
      ]),
    );
    expect(check.severity).toBe('ok');
  });

  it('AC-2: non-colliding sibling claims → ok with inventory', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkWorktreePhases(
      active.root,
      stub([
        { number: 85, name: '85-x', source: 'local', location: active.root },
        { number: 90, name: '90-x', source: 'sibling', location: '/wt/other' },
        { number: 91, name: '91-x', source: 'upstream', location: 'origin/main' },
      ]),
    );
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/90/);
    expect(check.detail).toMatch(/other/);
  });

  it('AC-3: a sibling number equal to a local number → warning + next free', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkWorktreePhases(
      active.root,
      stub([
        { number: 85, name: '85-x', source: 'local', location: active.root },
        { number: 85, name: '85-x', source: 'sibling', location: '/wt/other' },
      ]),
    );
    expect(check.severity).toBe('warning');
    expect(check.detail).toMatch(/85/);
    expect(check.detail).toMatch(/other/);
    // next free is max(observed)+1 = 86 (monotonic; lowest-gap was dropped)
    expect(check.remediation).toMatch(/86/);
  });

  it('AC-3: next free clears merged upstream numbers too', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkWorktreePhases(
      active.root,
      stub([
        { number: 85, name: '85-x', source: 'local', location: active.root },
        { number: 85, name: '85-x', source: 'sibling', location: '/wt/other' },
        { number: 90, name: '90-x', source: 'upstream', location: 'origin/main' },
      ]),
    );
    expect(check.severity).toBe('warning');
    // max(observed)+1 = 91 — upstream feeds nextFree even though it never collides.
    expect(check.remediation).toMatch(/91/);
  });

  it('AC-4: collector throws → ok (best-effort)', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkWorktreePhases(active.root, async () => {
      throw new Error('git exploded');
    });
    expect(check.severity).toBe('ok');
  });

  it('AC-1/AC-4: wired into runDoctor (best-effort, never fails the report)', async () => {
    active = await tempRepo({ initialized: true });
    const report = await runDoctor(active.root, HEALTHY_ENV);
    const wt = report.checks.find((c) => c.name === 'worktree-phases');
    expect(wt).toBeDefined();
    expect(wt?.severity).not.toBe('error');
  });
});
