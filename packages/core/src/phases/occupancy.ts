// packages/core/src/phases/occupancy.ts
//
// Impure occupancy collector (v1.18, phase 83). Observes ground truth — this
// worktree's own phase dirs, every sibling git worktree's phase dirs, and the
// upstream integration ref's phase dirs — and normalizes each to an `Occupancy`
// for the pure `detectPhaseCollision`. The worktree list IS the registry; the
// phase dirs ARE the claims. Best-effort everywhere: any git/fs failure on a
// source contributes nothing and never throws (the only hard failure in the
// whole feature is an actual detected collision, decided downstream).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { phaseNumber, type Occupancy } from './collision.js';

const pexec = promisify(execFile);
const EXEC_OPTS = { timeout: 5000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 } as const;

/** Best-effort, read-only git. Resolves to '' on any failure (non-repo, no git). */
async function git(root: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await pexec('git', args, { cwd: root, ...EXEC_OPTS });
    return stdout;
  } catch {
    return '';
  }
}

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

/** Parse `git worktree list --porcelain` into worktree absolute paths. */
function parseWorktreePaths(porcelain: string): string[] {
  const paths: string[] = [];
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) paths.push(line.slice('worktree '.length).trim());
  }
  return paths;
}

/**
 * Canonicalize an absolute worktree path for equality comparison. `git worktree
 * list` emits forward-slash paths (and, on Windows, may differ in drive-letter
 * case) while `repoRoot` is Node-built with platform separators — so a raw
 * string compare makes the MAIN worktree look unequal to `repoRoot` on Windows,
 * leaking it in as a phantom "sibling" of itself. Normalizing separators to `/`,
 * stripping a trailing slash, and case-folding on win32 fixes that. Pure +
 * platform-parametrized so it is testable off-Windows.
 */
export function normalizeWorktreePath(p: string, platform: NodeJS.Platform = process.platform): string {
  const slashed = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return platform === 'win32' ? slashed.toLowerCase() : slashed;
}

/** True when two worktree paths refer to the same worktree (separator/case-robust). */
export function isSameWorktree(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
  return normalizeWorktreePath(a, platform) === normalizeWorktreePath(b, platform);
}

/**
 * Canonical key for a worktree path: realpath when the dir exists (resolves
 * Windows 8.3 short-names, symlinks, and on-disk casing) then separator/case
 * normalization. Best-effort — falls back to plain normalization if realpath
 * fails (e.g. a pruned worktree). Used to robustly identify "self" so the main
 * worktree is never collected as a sibling of itself.
 */
async function worktreeKey(p: string): Promise<string> {
  try {
    return normalizeWorktreePath(await realpath(p));
  } catch {
    return normalizeWorktreePath(p);
  }
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

  // (b) sibling — every other worktree sharing this `.git`. Self is identified
  // by canonical key (realpath + normalize) so the main worktree is never
  // collected as a sibling of itself — the bug that false-fired the settle
  // backstop on Windows, where git's path representation differs from repoRoot.
  try {
    const selfKey = await worktreeKey(repoRoot);
    const porcelain = await git(repoRoot, ['worktree', 'list', '--porcelain']);
    for (const path of parseWorktreePaths(porcelain)) {
      if ((await worktreeKey(path)) === selfKey) continue;
      occupancies.push(...toOccupancies(await localPhaseDirs(path), 'sibling', path));
    }
  } catch {
    /* best-effort: no sibling data */
  }

  // (c) upstream — already-merged phases on origin/<integrationRef>.
  try {
    const ref = `origin/${opts.integrationRef}`;
    const tree = await git(repoRoot, [
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
