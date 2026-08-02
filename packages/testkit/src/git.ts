import { execFileSync } from 'node:child_process';

/**
 * Shell out to `git <args>` in `cwd` and return stdout as a string.
 *
 * Shared low-level git helper for tests that need a real git repo fixture
 * (as opposed to `@thomas-powers-jr/cadence-core`'s best-effort diff helpers).
 * Throws on any git failure — callers that want fail-loud behavior get it
 * for free; callers that expect success should just call it directly.
 */
export function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}
