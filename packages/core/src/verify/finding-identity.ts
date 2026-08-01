import { createHash } from 'node:crypto';
import type { Anchor, Finding } from '@manehorizons/cadence-types';
import type { AnchoredFinding } from './criteria-gap.js';

/**
 * Phase 236 (T3, §7.2, dec-20260730-001) — pure content-hash finding
 * identity. `computeFindingId` hashes (file, anchor.kind, anchor.ref,
 * severity, normalized message) — deliberately NEVER a line number, so a
 * finding keeps the same `id` across settles even after an edit shifts
 * which line it sits on. `attachFindingIdentity` is the batch adapter that
 * stamps that id (plus `target`/`disposition`) onto every finding coming out
 * of `anchorFindings` (`verify/criteria-gap.ts`).
 *
 * Pure, dependency-injected — no fs, no clock, no I/O — matching the house
 * pure-core/impure-shell split used throughout `verify/*` (`resolveAnchor`,
 * `anchorFindings`). No new runtime dependency: `node:crypto` is already
 * used elsewhere in this codebase (`gates/security-audit.ts`'s `randomUUID`
 * import); this module only adds a `createHash` import from the same
 * built-in module.
 */

/**
 * Collapse a finding message to a normalized form before hashing: trim
 * leading/trailing whitespace, then collapse every internal run of
 * whitespace (spaces, tabs, newlines) to a single space. This is the
 * "normalized message" the id is computed over — it exists so that
 * incidental whitespace reformatting of a message (e.g. a verifier
 * re-wrapping a line) does not, by itself, mint a new identity for the same
 * underlying finding. It is deliberately NOT a semantic normalization (no
 * case-folding, no punctuation stripping) — a genuinely different message
 * must still produce a different id.
 */
export function normalizeMessage(message: string): string {
  return message.trim().replace(/\s+/g, ' ');
}

/**
 * Stable, ordered, unambiguous string form of the four identity inputs, fed
 * to the hash. Built with `JSON.stringify` over a fixed-order tuple rather
 * than plain string concatenation: JSON escapes any delimiter-like
 * characters that happen to appear inside `file`/`message`/etc., so e.g.
 * `file: 'a', ref: 'bc'` can never collide with `file: 'ab', ref: 'c'` the
 * way naive concatenation could. `anchor.ref` is encoded as `null` (a value
 * no real ref can ever equal) when absent, rather than being coerced to a
 * string sentinel that some real ref-shaped string could theoretically
 * collide with.
 */
function identityKey(file: string, anchor: Anchor, severity: string, message: string): string {
  return JSON.stringify([file, anchor.kind, anchor.ref ?? null, severity, normalizeMessage(message)]);
}

/**
 * A stable sha256 hex digest over (file, anchor.kind, anchor.ref, severity,
 * normalized message). Deliberately excludes any notion of line number —
 * that is the whole point of this function existing: the same finding keeps
 * the same id across settles even after an unrelated edit shifts its line.
 */
export function computeFindingId(
  file: string,
  anchor: Anchor,
  severity: string,
  message: string,
): string {
  return createHash('sha256').update(identityKey(file, anchor, severity, message)).digest('hex');
}

/**
 * Stamp every finding coming out of `anchorFindings` with its computed
 * identity, a `target` of `'artifact'` (code-review findings are always
 * about the artifact being changed, never about a verification claim), and
 * a default `disposition` of `'open'` (this phase only computes fresh
 * identity at detection time; disposition mutation — accept/waive/fix/
 * supersede — is a follow-on phase's CLI surface, per the DRAFT's
 * boundaries). Every other field the input finding already carried
 * (severity, message, line, anchor) passes through unchanged.
 */
export function attachFindingIdentity(
  findings: Record<string, AnchoredFinding[]>,
): Record<string, Finding[]> {
  const result: Record<string, Finding[]> = {};
  for (const [file, list] of Object.entries(findings)) {
    result[file] = list.map((f) => ({
      ...f,
      id: computeFindingId(file, f.anchor, f.severity, f.message),
      target: 'artifact' as const,
      disposition: 'open' as const,
    }));
  }
  return result;
}
