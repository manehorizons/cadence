// packages/core/src/phases/occupancy.ts
//
// Impure occupancy collector (v1.18, phase 83). Observes ground truth — this
// worktree's own phase dirs, every sibling git worktree's phase dirs, and the
// upstream integration ref's phase dirs — and normalizes each to an `Occupancy`
// for the pure `detectPhaseCollision`. The worktree list IS the registry; the
// phase dirs ARE the claims. Best-effort everywhere: any git/fs failure on a
// source contributes nothing and never throws (the only hard failure in the
// whole feature is an actual detected collision, decided downstream).

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { phaseNumber, type Occupancy } from './collision.js';
import { gitBestEffort, listSiblingWorktrees } from '../git/worktrees.js';

export { normalizeWorktreePath, isSameWorktree } from '../git/worktrees.js';

/** Read phase dir names under `<root>/.cadence/phases/`. Best-effort → []. */
async function localPhaseDirs(root: string): Promise<string[]> {
  try {
    const entries = await readdir(join(root, '.cadence', 'phases'), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

function toOccupancies(
  dirNames: readonly string[],
  source: Occupancy['source'],
  location: string,
): Occupancy[] {
  const out: Occupancy[] = [];
  for (const name of dirNames) {
    const number = phaseNumber(name);
    if (number !== null) out.push({ number, source, location });
  }
  return out;
}

/**
 * Gather phase-number occupancy from local + sibling worktrees + upstream.
 * Never throws — each source degrades to no data on failure.
 */
export async function gatherOccupancy(
  repoRoot: string,
  opts: { integrationRef: string },
): Promise<Occupancy[]> {
  const occupancies: Occupancy[] = [];

  // (a) local — this worktree's own claims (used for nextFree and, at settle,
  // to identify self via excludeNumbers).
  occupancies.push(...toOccupancies(await localPhaseDirs(repoRoot), 'local', repoRoot));

  // (b) sibling — every other worktree sharing this `.git`. Self-exclusion is
  // handled inside `listSiblingWorktrees` via canonical key (realpath +
  // normalize) so the main worktree is never collected as a sibling of
  // itself — the bug that false-fired the settle backstop on Windows, where
  // git's path representation differs from repoRoot.
  try {
    for (const { path } of await listSiblingWorktrees(repoRoot)) {
      occupancies.push(...toOccupancies(await localPhaseDirs(path), 'sibling', path));
    }
  } catch {
    /* best-effort: no sibling data */
  }

  // (c) upstream — already-merged phases on origin/<integrationRef>.
  try {
    const ref = `origin/${opts.integrationRef}`;
    const tree = await gitBestEffort(repoRoot, [
      'ls-tree',
      '-d',
      '--name-only',
      ref,
      '--',
      '.cadence/phases/',
    ]);
    const names = tree
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      // entries come back as `.cadence/phases/<name>` — take the trailing segment
      .map((l) => l.split('/').filter(Boolean).pop() ?? '');
    occupancies.push(...toOccupancies(names, 'upstream', ref));
  } catch {
    /* best-effort: no upstream data */
  }

  return occupancies;
}
