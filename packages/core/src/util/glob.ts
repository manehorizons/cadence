/**
 * Phase 286-01 (dec-20260821-001, D-Y) — extracted verbatim from
 * `verify/coverage.ts` (formerly module-local `toMatcher`/`globToRegExp`
 * around line 655) so `checks/boundary.ts` can reuse the exact same glob
 * vocabulary for `files:` boundary matching without adding a new runtime
 * dependency. No behavior change versus the original — same tokenization:
 * `**` matches zero-or-more path segments, `*` matches within a single
 * segment (`[^/]*`), literal segments are regex-escaped verbatim.
 */

/**
 * Compile a glob pattern (subset: `**`, `*`, literal segments) into a
 * predicate over forward-slashed relative paths. Examples:
 *   `packages/**\/*.test.ts` → matches `packages/core/tests/foo.test.ts`
 *   `**\/*.test.ts` → matches `apps/api/__tests__/bar.test.ts`
 */
export function toMatcher(pattern: string): (relPath: string) => boolean {
  const re = globToRegExp(pattern);
  return (p) => re.test(p);
}

export function globToRegExp(pattern: string): RegExp {
  // Tokenize: split on '/', then handle '**' specially.
  const parts = pattern.split('/');
  const reParts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part === '**') {
      // Match zero-or-more path segments.
      // If there is a following part, allow `**/x` to match `x` too (zero segments).
      const next = parts[i + 1];
      if (next !== undefined) {
        reParts.push('(?:[^/]+/)*');
        // Consume the trailing slash semantics; let the next iteration add `next` literally.
      } else {
        reParts.push('.*');
      }
      continue;
    }
    // Escape regex specials except `*`.
    const seg = part
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*');
    reParts.push(seg);
    if (i < parts.length - 1) reParts.push('/');
  }
  return new RegExp('^' + reParts.join('') + '$');
}
