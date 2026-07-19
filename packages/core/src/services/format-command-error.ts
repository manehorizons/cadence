import { StateCorruptError } from '../errors.js';

/**
 * Single source of truth for the `"<cmd> failed: <message>"` line every
 * command-service function's outer `catch` prints (phase 196 / issue #177,
 * AC-6). Every one of these services used to inline the same
 * `` `${cmd} failed: ${err instanceof Error ? err.message : String(err)}` ``
 * ternary; this centralizes it and adds one behavior: a `StateCorruptError`
 * (e.g. an unresolved git merge conflict leaving literal conflict markers in
 * `.cadence/state.json`) gets an extra trailing line pointing at the
 * `cadence doctor --fix` repair path. Every other error type is unchanged —
 * byte-for-byte identical to what each site printed before.
 *
 * `cli/index.ts`'s top-level `.catch` — a defense-in-depth backstop for any
 * future command that forgets to catch its own errors — reuses this same
 * message shape via {@link formatTopLevelError}.
 */
export function formatCommandError(cmd: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const pointer =
    err instanceof StateCorruptError ? "\nRun 'cadence doctor --fix' to diagnose and repair." : '';
  return `${cmd} failed: ${message}${pointer}`;
}

/**
 * Format an error for the CLI's top-level catch (`cli/index.ts`). Same
 * `StateCorruptError` pointer as {@link formatCommandError}, but with no
 * `"<cmd> failed:"` prefix — this handler doesn't know which command was
 * running, only that something threw uncaught past every service's own
 * catch.
 */
export function formatTopLevelError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return err instanceof StateCorruptError
    ? `${message}\nRun 'cadence doctor --fix' to diagnose and repair.`
    : message;
}
