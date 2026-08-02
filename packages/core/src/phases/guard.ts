// packages/core/src/phases/guard.ts
//
// The shared phase-collision guard (v1.18, phase 83). Composes the impure
// `gatherOccupancy` collector with the pure `detectPhaseCollision` and turns a
// collision into a loud, named refusal message. Used at scaffold time
// (`spec new` / `draft new`) and as a settle backstop. Additive to — never a
// replacement for — the existing local same-dir `existsSync` refusal.

import type { CadenceConfig } from '@thomas-powers-jr/cadence-types';
import { detectPhaseCollision, type Occupancy } from './collision.js';
import { gatherOccupancy } from './occupancy.js';

export type GuardVerdict = { ok: true } | { ok: false; message: string };

export interface GuardOpts {
  config: CadenceConfig;
  /** `--allow-phase-collision` — bypass the guard (the local `existsSync` refusal is unaffected). */
  allow?: boolean;
  /** Sources to ignore when matching conflicts (settle passes `['local']` to drop self). */
  excludeSources?: Occupancy['source'][];
  /** Test seam: override the occupancy collector. Defaults to `gatherOccupancy`. */
  gather?: (repoRoot: string, opts: { integrationRef: string }) => Promise<Occupancy[]>;
}

function describe(c: Occupancy): string {
  return c.source === 'upstream'
    ? `phase ${c.number} is in use on ${c.location}`
    : `phase ${c.number} is in use by worktree ${c.location}`;
}

/**
 * Returns `{ ok: true }` when scaffolding `target` is safe, else
 * `{ ok: false, message }` naming each conflict and the suggested next free
 * number. Short-circuits to `ok` when the guard is disabled, bypassed, or the
 * target has no numeric token. Never throws (the collector is best-effort).
 */
export async function assertNoPhaseCollision(
  repoRoot: string,
  target: number | null,
  opts: GuardOpts,
): Promise<GuardVerdict> {
  if (target === null) return { ok: true };
  if (opts.config.phaseGuard.enabled === false) return { ok: true };
  if (opts.allow === true) return { ok: true };

  const gather = opts.gather ?? gatherOccupancy;
  const occupancies = await gather(repoRoot, {
    integrationRef: opts.config.phaseGuard.integrationRef,
  });
  const result = detectPhaseCollision(target, occupancies, {
    excludeSources: opts.excludeSources ?? [],
  });
  if (!result.collides) return { ok: true };

  const lines = [
    `phase-collision guard: refusing — phase ${target} is already in use:`,
    ...result.conflicts.map((c) => `  - ${describe(c)}`),
    `suggested next free: ${result.nextFree}`,
    `bypass with --allow-phase-collision`,
  ];
  return { ok: false, message: lines.join('\n') + '\n' };
}
