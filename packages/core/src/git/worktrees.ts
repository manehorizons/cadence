// packages/core/src/git/worktrees.ts
//
// Standalone git-worktree-discovery plumbing (extracted from
// `phases/occupancy.ts`, phase 142). Best-effort everywhere: any git/fs
// failure degrades to an empty result rather than throwing, so a caller
// never needs its own try/catch around these.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath } from 'node:fs/promises';

const pexec = promisify(execFile);
const EXEC_OPTS = { timeout: 5000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 } as const;

export interface WorktreeEntry {
  path: string;
  branch: string | null;
}

/** Best-effort, read-only git. Resolves to '' on any failure (non-repo, no git). */
export async function gitBestEffort(root: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await pexec('git', args, { cwd: root, ...EXEC_OPTS });
    return stdout;
  } catch {
    return '';
  }
}

/**
 * Parse `git worktree list --porcelain` into `{ path, branch }` entries. Each
 * `worktree <path>` line starts a new entry; a following `branch
 * refs/heads/<name>` line (before the next `worktree ` line) sets that
 * entry's branch, stripped of the `refs/heads/` prefix. A `detached` line (or
 * no branch line at all) leaves `branch: null`.
 */
export function parseWorktreePorcelain(porcelain: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length).trim(), branch: null };
      entries.push(current);
    } else if (current && line.startsWith('branch refs/heads/')) {
      current.branch = line.slice('branch refs/heads/'.length).trim();
    }
  }
  return entries;
}

/**
 * Canonicalize an absolute worktree path for equality comparison. `git worktree
 * list` emits forward-slash paths (and, on Windows, may differ in drive-letter
 * case) while a caller's root is Node-built with platform separators — so a raw
 * string compare makes the main worktree look unequal to itself on Windows,
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
export async function worktreeKey(p: string): Promise<string> {
  try {
    return normalizeWorktreePath(await realpath(p));
  } catch {
    return normalizeWorktreePath(p);
  }
}

/**
 * List every git worktree sharing `repoRoot`'s `.git`, excluding `repoRoot`
 * itself (self identified by canonical key — realpath + normalize). Never
 * throws: any git/fs failure resolves to `[]`.
 */
export async function listSiblingWorktrees(repoRoot: string): Promise<WorktreeEntry[]> {
  try {
    const selfKey = await worktreeKey(repoRoot);
    const porcelain = await gitBestEffort(repoRoot, ['worktree', 'list', '--porcelain']);
    const entries = parseWorktreePorcelain(porcelain);
    const siblings: WorktreeEntry[] = [];
    for (const entry of entries) {
      if ((await worktreeKey(entry.path)) === selfKey) continue;
      siblings.push(entry);
    }
    return siblings;
  } catch {
    return [];
  }
}
