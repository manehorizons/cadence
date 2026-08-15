// packages/core/src/build/task-touched-files.ts
//
// Phase 280 (T7): first-sighting semantics on top of
// `collectUnscopedTouchedFiles`. `collectUnscopedTouchedFiles` returns the
// PHASE's cumulative touched-file set (a merge-base diff + all working-tree
// changes) -- this set never shrinks as a phase progresses. If a later
// task's boundary check re-ran that raw set, every file a DONE task ever
// touched would get re-flagged as a boundary violation on every subsequent
// recording, forever -- a growing false-positive flood. The fix: subtract
// everything already attributed to a previously-recorded task, so a stray
// file is only ever flagged once, at the recording that first observes it.

import { collectUnscopedTouchedFiles, filterCadenceSelfWrites } from '../git/boundary-diff.js';

export interface DeriveTaskTouchedFilesResult {
  delta: string[];
  baseRefResolved: boolean;
}

/**
 * Derive the set of files newly touched since the last recorded task: the
 * phase's unscoped touched-file set (`.cadence/**` self-writes excluded),
 * minus every file already attributed to a previously-recorded task.
 */
export async function deriveTaskTouchedFiles(
  cwd: string,
  integrationRef: string,
  previouslyRecorded: Set<string>,
): Promise<DeriveTaskTouchedFilesResult> {
  const { files, baseRefResolved } = await collectUnscopedTouchedFiles(cwd, integrationRef);
  const filtered = filterCadenceSelfWrites(files);
  const delta = filtered.filter((f) => !previouslyRecorded.has(f));
  return { delta, baseRefResolved };
}
