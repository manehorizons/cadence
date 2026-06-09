// packages/core/src/handoff/retention.ts
//
// Handoff retention (Phase 88, v1.20). `selectPrunable` is the pure, I/O-free
// core: given SESSION-*.md filenames, a keep-count, and the current
// (lastHandoff) filename, it decides which docs to prune. `pruneHandoffDir` is
// its impure companion that reads the dir and unlinks the selection; the
// wiring layer (run-handoff) calls it best-effort.
import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Return the filenames to prune: everything except the newest `keep` docs by
 * lexicographic-descending order. The `current` (lastHandoff) filename is
 * ALWAYS retained — a belt-and-suspenders invariant so the active handoff can
 * never be deleted, even if it would otherwise fall outside the newest `keep`.
 *
 * Lexicographic-descending order is deterministic and offline: SESSION names
 * carry an ISO date prefix (`SESSION-YYYY-MM-DD[-label].md`), so descending
 * string order is chronological at day granularity, with intra-day label ties
 * broken alphabetically. The returned list preserves that descending order.
 *
 * Pure: no filesystem access, no side effects.
 */
export function selectPrunable(
  filenames: readonly string[],
  keep: number,
  current: string,
): string[] {
  const descending = [...filenames].sort().reverse();
  const retained = new Set(descending.slice(0, Math.max(0, keep)));
  retained.add(current);
  return descending.filter((name) => !retained.has(name));
}

const SESSION_RE = /^SESSION-.*\.md$/;

/**
 * Impure companion to `selectPrunable`: read the handoff `dir`, select the
 * `SESSION-*.md` docs to prune (keeping the newest `retain` plus `current`),
 * `unlink` them, and return the pruned filenames. The caller (run-handoff)
 * invokes this best-effort and swallows any throw — it must never fail a
 * handoff write. Signature matches the injectable `prune` seam.
 */
export async function pruneHandoffDir(
  dir: string,
  retain: number,
  current: string,
): Promise<string[]> {
  const entries = await readdir(dir);
  const sessions = entries.filter((n) => SESSION_RE.test(n));
  const toPrune = selectPrunable(sessions, retain, current);
  for (const name of toPrune) {
    await unlink(join(dir, name));
  }
  return toPrune;
}
