/**
 * Parse a task's `done:` field (a comma-separated list of AC ids, e.g.
 * `AC-1, AC-2, AC-3`) into the AC ids it references.
 *
 * Each comma-separated token only needs to *start* with a valid `AC-\d+`
 * prefix — trailing annotation text after the id (e.g.
 * `AC-4 (core logic)`) is tolerated and stripped, rather than causing the
 * whole token (and therefore that AC) to be silently dropped.
 */
export function parseAcRefs(done: string): string[] {
  return done
    .split(',')
    .map((s) => /^\s*(AC-\d+)/.exec(s)?.[1])
    .filter((s): s is string => s !== undefined);
}
