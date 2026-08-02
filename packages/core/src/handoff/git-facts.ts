// packages/core/src/handoff/git-facts.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitFacts } from '@thomas-powers-jr/cadence-types';

const pexec = promisify(execFile);
const EXEC_OPTS = { timeout: 5000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 } as const;

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await pexec('git', args, { cwd: root, ...EXEC_OPTS });
  return stdout;
}

export interface GitFactsOptions {
  /** Run a best-effort `git fetch --quiet` first so ahead/behind are current.
   *  Soft: offline / no remote leaves fetched=false and facts still valid. */
  fetch?: boolean;
}

/** Best-effort, read-only. Never throws: non-repo / missing git → unavailable. */
export async function readGitFacts(root: string, opts: GitFactsOptions = {}): Promise<GitFacts> {
  try {
    await git(root, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    return { available: false };
  }
  let fetched = false;
  if (opts.fetch === true) {
    try {
      // fetch touches remote-tracking refs only — never the working tree.
      await pexec('git', ['fetch', '--quiet'], { cwd: root, timeout: 15000, windowsHide: true });
      fetched = true;
    } catch {
      /* offline / no remote — soft */
    }
  }
  try {
    const status = await git(root, ['status', '--short', '--branch']);
    const lines = status.split('\n');
    const header = lines[0] ?? '';
    const branch = header.match(/^## (?:No commits yet on )?([^.\s]+)/)?.[1] ?? 'HEAD';
    const ahead = Number(header.match(/ahead (\d+)/)?.[1] ?? '0');
    const behind = Number(header.match(/behind (\d+)/)?.[1] ?? '0');
    const dirty = lines.slice(1).some((l) => l.trim().length > 0);

    const safe = async (args: string[]): Promise<string> => {
      try { return (await git(root, args)).trim(); } catch { return ''; }
    };
    const head = await safe(['rev-parse', '--short', 'HEAD']);
    const recentCommits = await safe(['log', '--oneline', '-8']);
    const diffStat = await safe(['diff', '--stat']);

    return { available: true, branch, dirty, ahead, behind, head, recentCommits, diffStat, fetched };
  } catch {
    return { available: false };
  }
}
