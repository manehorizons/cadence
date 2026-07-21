import { execFileSync } from 'node:child_process';

/**
 * Thrown when `discoverChangedPhases` cannot compute a git diff against the
 * requested base ref (unresolvable ref, not a git repo, git binary missing,
 * etc). Unlike the best-effort `collectGitDiff` in `./diff.ts` — which
 * degrades to an empty string on any failure because it feeds a "nice to
 * have" context blob — a phase-verification gate that discovers *which*
 * phases changed must never silently reinterpret a real git failure as "no
 * phases changed". Callers are expected to let this propagate and fail the
 * gate loudly rather than catch-and-ignore it.
 */
export class GitDiffError extends Error {}

export interface ChangedPhase {
  phase: string;
  id: string;
  path: string;
}

const SUMMARY_PATH_RE = /^\.cadence\/phases\/([^/]+)\/([^/]+)-SUMMARY\.json$/;

/**
 * Discover which phase SUMMARY.json files changed (added, copied, modified,
 * or renamed) between `baseRef` and `HEAD`. Throws `GitDiffError` on any git
 * failure instead of degrading to an empty result — see `GitDiffError`.
 */
export function discoverChangedPhases(repoRoot: string, baseRef: string): ChangedPhase[] {
  let out: string;
  try {
    out = execFileSync(
      'git',
      [
        'diff',
        '--name-only',
        '--diff-filter=ACMR',
        `${baseRef}...HEAD`,
        '--',
        '.cadence/phases/*/*-SUMMARY.json',
      ],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (err) {
    const stderr = (err as { stderr?: Buffer | string }).stderr;
    const detail = stderr ? stderr.toString().trim() : err instanceof Error ? err.message : String(err);
    throw new GitDiffError(`could not compute git diff against "${baseRef}": ${detail}`);
  }
  const paths = out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const results: ChangedPhase[] = [];
  for (const p of paths) {
    const m = SUMMARY_PATH_RE.exec(p);
    if (!m) continue;
    results.push({ phase: m[1]!, id: m[2]!, path: p });
  }
  return results;
}
