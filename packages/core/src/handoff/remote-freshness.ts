// packages/core/src/handoff/remote-freshness.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RemoteFreshness } from '@thomas-powers-jr/cadence-types';

const pexec = promisify(execFile);
const EXEC_OPTS = { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 } as const;

/**
 * Origin-freshness probe for resume (two-PC / parallel-clone guard). The ONLY
 * mutation is `git fetch`, which updates remote-tracking refs — never the
 * working tree, index, or local branches. Every failure path is soft
 * (`checked: false`): resume must never break offline.
 */
export async function checkRemoteFreshness(root: string): Promise<RemoteFreshness> {
  const git = async (args: string[]): Promise<string> =>
    (await pexec('git', args, { cwd: root, ...EXEC_OPTS })).stdout.trim();

  try {
    await git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    return { checked: false, reason: 'not-a-repo' };
  }

  let branch: string;
  try {
    branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {
    return { checked: false, reason: 'detached' };
  }
  if (branch === 'HEAD') return { checked: false, reason: 'detached' };

  try {
    await git(['fetch', '--quiet', 'origin', branch]);
  } catch {
    try {
      await git(['fetch', '--all', '--prune', '--quiet']);
    } catch {
      return { checked: false, reason: 'fetch-failed', branch };
    }
  }

  try {
    const counts = await git(['rev-list', '--left-right', '--count', '@{u}...HEAD']);
    const [behind = 0, ahead = 0] = counts.split(/\s+/).map(Number);
    return { checked: true, branch, behind, ahead };
  } catch {
    return { checked: false, reason: 'no-upstream', branch };
  }
}
