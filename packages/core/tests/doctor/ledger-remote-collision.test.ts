import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import {
  checkLedgerRemoteCollision,
  findLedgerRemoteCollisions,
  runDoctor,
  type LedgerIdSnapshot,
  type LedgerRemoteCollisionResult,
} from '../../src/doctor/run.js';
import { addRecommendation } from '../../src/intelligence/store/recommendations.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

const HEALTHY_ENV = { nodeVersion: 'v20.11.0', platform: 'linux' as const };

/** Builds a `LedgerIdSnapshot` with all four subjects defaulting to empty. */
function snap(overrides: Partial<LedgerIdSnapshot> = {}): LedgerIdSnapshot {
  return {
    recommendations: [],
    evidence: [],
    decisions: [],
    assumptions: [],
    ...overrides,
  };
}

/** A stub gather returning a fixed result (offline, deterministic) — mirrors
 *  `worktree-phases.test.ts`'s `stub` idiom. */
const stub =
  (result: LedgerRemoteCollisionResult) =>
  async (): Promise<LedgerRemoteCollisionResult> =>
    result;

function gitInit(root: string): void {
  execSync('git init -q', { cwd: root, stdio: 'ignore' });
  execSync('git config user.email "test@cadence.local"', { cwd: root, stdio: 'ignore' });
  execSync('git config user.name "Cadence Test"', { cwd: root, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'ignore' });
}

describe('findLedgerRemoteCollisions (pure)', () => {
  it('AC-3: no collision when local and origin add different new ids', () => {
    const mergeBase = snap();
    const local = snap({ recommendations: ['rec-20260726-001'] });
    const origin = snap({ recommendations: ['rec-20260726-002'] });
    expect(findLedgerRemoteCollisions(local, mergeBase, origin)).toEqual([]);
  });

  it('AC-3: detects a collision when both sides independently mint the same new recommendation id', () => {
    const mergeBase = snap();
    const local = snap({ recommendations: ['rec-20260726-001'] });
    const origin = snap({ recommendations: ['rec-20260726-001'] });
    expect(findLedgerRemoteCollisions(local, mergeBase, origin)).toEqual([
      { subject: 'recommendations', id: 'rec-20260726-001' },
    ]);
  });

  it('AC-3: detects simultaneous collisions across evidence, decisions, and assumptions subjects', () => {
    const mergeBase = snap();
    const local = snap({
      evidence: ['ev-20260726-001'],
      decisions: ['dec-20260726-001'],
      assumptions: ['as-20260726-001'],
    });
    const origin = snap({
      evidence: ['ev-20260726-001'],
      decisions: ['dec-20260726-001'],
      assumptions: ['as-20260726-001'],
    });
    const collisions = findLedgerRemoteCollisions(local, mergeBase, origin);
    expect(collisions).toHaveLength(3);
    expect(collisions).toEqual(
      expect.arrayContaining([
        { subject: 'evidence', id: 'ev-20260726-001' },
        { subject: 'decisions', id: 'dec-20260726-001' },
        { subject: 'assumptions', id: 'as-20260726-001' },
      ]),
    );
  });

  it('AC-3: an id already present at the merge-base is NOT flagged, even though both sides still carry it', () => {
    // Critical "already-merged, not a real collision" case: an id present in
    // local, mergeBase, AND origin is not "new" on either side.
    const mergeBase = snap({ recommendations: ['rec-20260701-001'] });
    const local = snap({ recommendations: ['rec-20260701-001'] });
    const origin = snap({ recommendations: ['rec-20260701-001'] });
    expect(findLedgerRemoteCollisions(local, mergeBase, origin)).toEqual([]);
  });
});

describe('checkLedgerRemoteCollision (injected stub gather)', () => {
  it('AC-3: checked:false reason not-a-repo → ok', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkLedgerRemoteCollision(
      active.root,
      stub({ checked: false, reason: 'not-a-repo' }),
    );
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/not-a-repo/);
  });

  it('AC-3: checked:false reason detached → ok', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkLedgerRemoteCollision(
      active.root,
      stub({ checked: false, reason: 'detached' }),
    );
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/detached/);
  });

  it('AC-3: checked:false reason fetch-failed → ok', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkLedgerRemoteCollision(
      active.root,
      stub({ checked: false, reason: 'fetch-failed' }),
    );
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/fetch-failed/);
  });

  it('AC-3: checked:false reason no-upstream → ok', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkLedgerRemoteCollision(
      active.root,
      stub({ checked: false, reason: 'no-upstream' }),
    );
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/no-upstream/);
  });

  it('AC-3: checked:false reason no-merge-base → ok', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkLedgerRemoteCollision(
      active.root,
      stub({ checked: false, reason: 'no-merge-base' }),
    );
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/no-merge-base/);
  });

  it('AC-3: checked:true with a genuine collision → warning naming the id, manual fix (fixId null)', async () => {
    active = await tempRepo({ initialized: true });
    const mergeBase = snap();
    const local = snap({ recommendations: ['rec-20260726-001'] });
    const origin = snap({ recommendations: ['rec-20260726-001'] });
    const check = await checkLedgerRemoteCollision(
      active.root,
      stub({ checked: true, branch: 'main', local, mergeBase, origin }),
    );
    expect(check.name).toBe('ledger-remote-collision');
    expect(check.severity).toBe('warning');
    expect(check.fixId).toBeNull();
    expect(check.detail).toContain('rec-20260726-001');
  });

  it('AC-3: checked:true with no collision → ok', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkLedgerRemoteCollision(
      active.root,
      stub({
        checked: true,
        branch: 'main',
        local: snap({ recommendations: ['rec-20260726-001'] }),
        mergeBase: snap(),
        origin: snap({ recommendations: ['rec-20260726-002'] }),
      }),
    );
    expect(check.name).toBe('ledger-remote-collision');
    expect(check.severity).toBe('ok');
  });

  it('AC-3: a throwing gather → ok (best-effort, never propagates the throw)', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkLedgerRemoteCollision(active.root, async () => {
      throw new Error('git exploded');
    });
    expect(check.severity).toBe('ok');
  });

  it('AC-1/AC-2: wired into runDoctor (best-effort, never fails the report)', async () => {
    active = await tempRepo({ initialized: true });
    const report = await runDoctor(active.root, HEALTHY_ENV);
    const found = report.checks.find((c) => c.name === 'ledger-remote-collision');
    expect(found).toBeDefined();
    expect(found?.severity).not.toBe('error');
  });
});

describe(
  'checkLedgerRemoteCollision (real git, default gather)',
  // Mirrors remote-freshness.test.ts's headroom: a bare remote + a second
  // clone + several git operations can take longer on Windows CI (FS + AV
  // overhead).
  { timeout: process.platform === 'win32' ? 150_000 : 20_000 },
  () => {
    it('AC-3: detects a real cross-session collision end-to-end (bare origin + second clone independently minting the same rec id)', async () => {
      active = await tempRepo({ initialized: true });
      gitInit(active.root);
      execSync('git add -A && git commit -q -m init', { cwd: active.root, stdio: 'ignore' });

      // Bare "origin" + a second clone scoped to this fixture's own unique tmp
      // path (never a literal "../origin.git" — that resolves to a shared,
      // collision-prone path one level above every tempRepo root).
      const originPath = `${active.root}-origin.git`;
      const pc2Path = `${active.root}-pc2`;
      execSync(
        `git init -q --bare "${originPath}" && git remote add origin "${originPath}" && git push -q -u origin HEAD`,
        { cwd: active.root, stdio: 'ignore' },
      );
      execSync(`git clone -q "${originPath}" "${pc2Path}"`, { cwd: active.root, stdio: 'ignore' });
      execSync('git config user.email t@t', { cwd: pc2Path, stdio: 'ignore' });
      execSync('git config user.name t', { cwd: pc2Path, stdio: 'ignore' });
      execSync('git config commit.gpgsign false', { cwd: pc2Path, stdio: 'ignore' });

      // "The other PC" (pc2) independently adds a recommendation and pushes.
      // Its ledger is still empty at this point (freshly cloned from the
      // init commit), so `mintId` computes the same rec-<today>-001 id that
      // the first checkout will also compute below — the real rec-20260726-001
      // collision incident from this repo's own history, reproduced.
      const pc2Rec = await addRecommendation(pc2Path, {
        title: 'pc2 rec',
        summary: 'minted on the other checkout',
        priority: 'medium',
        readiness: 'raw-idea',
        affectedAreas: [],
        affectedFiles: [],
      });
      execSync('git add -A && git commit -q -m "pc2 rec"', { cwd: pc2Path, stdio: 'ignore' });
      execSync('git push -q', { cwd: pc2Path, stdio: 'ignore' });

      // First checkout independently adds its own recommendation — its own
      // ledger is still empty too (has not fetched pc2's push), so it mints
      // the SAME id, then commits locally WITHOUT pushing.
      const localRec = await addRecommendation(active.root, {
        title: 'local rec',
        summary: 'minted on the first checkout',
        priority: 'medium',
        readiness: 'raw-idea',
        affectedAreas: [],
        affectedFiles: [],
      });
      execSync('git add -A && git commit -q -m "local rec"', { cwd: active.root, stdio: 'ignore' });

      expect(localRec.id).toBe(pc2Rec.id);

      // Real git, default gather: fetches origin, resolves merge-base HEAD
      // @{u}, and diffs new-since-merge-base ledger ids on both sides.
      const check = await checkLedgerRemoteCollision(active.root);
      expect(check.name).toBe('ledger-remote-collision');
      expect(check.severity).toBe('warning');
      expect(check.fixId).toBeNull();
      expect(check.detail).toContain(localRec.id);
    });
  },
);
