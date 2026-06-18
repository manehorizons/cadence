// packages/core/src/phases/next-free.ts
//
// Best-effort resolver for the worktree-aware next free phase number (v1.19,
// phase 86). Mirrors `doctor/run.ts checkWorktreePhases`' recipe: read
// `phaseGuard.integrationRef` (default `main`), gather cross-worktree occupancy,
// then ask the pure `detectPhaseCollision` for `nextFree` (= `max(observed)+1`,
// monotonic — lowest-gap was dropped per §13). The impure layer (this module)
// keeps the I/O out of the pure `nextAction` core, which just takes the number
// as a hint.

import { loadConfig } from '../config/loader.js';
import { gatherOccupancy } from './occupancy.js';
import { detectPhaseCollision, type Occupancy } from './collision.js';

type Gather = (repoRoot: string, opts: { integrationRef: string }) => Promise<Occupancy[]>;

/**
 * Resolve the next free phase number across local + sibling + upstream claims,
 * or `null` when nothing was observed or any source failed. `draft new` treats
 * `null` as phase `1`; `progress` remains copy-pasteable and no longer renders
 * positional placeholders. The collector is injectable for deterministic,
 * offline tests.
 */
export async function resolveNextFreePhase(
  root: string,
  gather: Gather = gatherOccupancy,
): Promise<number | null> {
  try {
    let integrationRef = 'main';
    try {
      integrationRef = (await loadConfig(root)).phaseGuard.integrationRef;
    } catch {
      /* config unreadable — fall back to the default ref */
    }

    const occupancies = await gather(root, { integrationRef });
    if (occupancies.length === 0) return null;

    return detectPhaseCollision(0, occupancies).nextFree;
  } catch {
    return null; // best-effort: any failure degrades to the caller's fallback
  }
}
