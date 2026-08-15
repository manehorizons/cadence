// packages/core/src/git/boundary-diff.ts
//
// Unscoped git-diff enumeration for the settle-time `boundary-scan` gate
// (phase 156). Unlike `ctx.touchedFiles`/`ctx.diff()`, which are pre-scoped to
// the active draft's declared `files:` set, this enumerates every file
// touched by the whole phase — committed-since-divergence plus working-tree
// changes — so the gate can catch an out-of-boundary edit that never passed
// through the declared-files scope (e.g. a subagent-driven edit).

import { gitBestEffort } from './worktrees.js';

export interface UnscopedTouchedFiles {
  files: string[];
  baseRefResolved: boolean;
}

export const CADENCE_DIR_PREFIX = '.cadence/';

/**
 * Drop `.cadence/**` self-writes from a touched-files list — the settle-time
 * `boundary-scan` gate's own state writes (`state.json`, `STATE.md`, phase
 * artifacts, etc.) are never a boundary violation.
 */
export function filterCadenceSelfWrites(files: string[]): string[] {
  return files.filter((f) => f !== '.cadence' && !f.startsWith(CADENCE_DIR_PREFIX));
}

/**
 * Parse one `git status --porcelain` line into its path. Strips the 2-char
 * status code + 1-space prefix; for a rename/copy line (`R  old -> new`),
 * takes only the destination path — matching `git diff --name-only`'s own
 * default (renames-on) behavior of reporting the destination.
 */
function parsePorcelainPath(line: string): string | null {
  if (line.length < 4) return null;
  const rest = line.slice(3);
  const arrow = rest.indexOf(' -> ');
  return arrow === -1 ? rest : rest.slice(arrow + 4);
}

/**
 * Resolve a merge-base against `origin/<integrationRef>` first, falling back
 * to a local `<integrationRef>` if the remote ref doesn't resolve (no remote,
 * shallow clone). Returns `null` if neither resolves.
 */
async function resolveMergeBase(root: string, integrationRef: string): Promise<string | null> {
  const upstream = (await gitBestEffort(root, ['merge-base', `origin/${integrationRef}`, 'HEAD'])).trim();
  if (upstream) return upstream;
  const local = (await gitBestEffort(root, ['merge-base', integrationRef, 'HEAD'])).trim();
  return local || null;
}

/**
 * Enumerate every file touched by the current phase: the union of (a)
 * committed-since-divergence files (`git diff --name-only <merge-base>
 * HEAD`, only when a base ref resolves) and (b) working-tree
 * modified/added/untracked files (`git status --porcelain
 * --untracked-files=all`, always attempted). Never throws — every git call
 * goes through the best-effort `gitBestEffort` helper.
 */
export async function collectUnscopedTouchedFiles(
  root: string,
  integrationRef: string,
): Promise<UnscopedTouchedFiles> {
  const mergeBase = await resolveMergeBase(root, integrationRef);
  const files = new Set<string>();

  if (mergeBase) {
    const diff = await gitBestEffort(root, ['diff', '--name-only', mergeBase, 'HEAD']);
    for (const line of diff.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) files.add(trimmed);
    }
  }

  const status = await gitBestEffort(root, ['status', '--porcelain', '--untracked-files=all']);
  for (const line of status.split('\n')) {
    if (!line) continue;
    const path = parsePorcelainPath(line);
    if (path) files.add(path);
  }

  return { files: [...files], baseRefResolved: mergeBase !== null };
}
