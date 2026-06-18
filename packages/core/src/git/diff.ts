import { execFileSync } from 'node:child_process';

/**
 * Collect `git diff --no-color HEAD -- <files>` without invoking a shell.
 * Returns empty string outside git workdirs, on no diff, or on git failure.
 */
export function collectGitDiff(cwd: string, files: string[]): string {
  if (files.length === 0) return '';
  try {
    return execFileSync('git', ['diff', '--no-color', 'HEAD', '--', ...files], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}
