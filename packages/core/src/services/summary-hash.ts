import { createHash } from 'node:crypto';
import type { Summary } from '@manehorizons/cadence-types';

/**
 * Phase 223 (T2): settle-time content-hash provenance, so a hand-edited
 * settled SUMMARY.json is detectable instead of rendering faithfully as if
 * it were genuine (rec-20260724-006, dec-20260726-001 — detection only, no
 * signing/keys).
 *
 * Exported from here (not inlined in `services/settle.ts`) because T3's
 * `cadence summary verify` needs to recompute the exact same digest from a
 * different code path — importing this module is how it stays byte-for-byte
 * identical to what settle wrote, instead of a parallel reimplementation
 * silently drifting out of sync.
 */

/**
 * Recursively sorts object keys (arrays keep their existing order — order is
 * semantically meaningful there, e.g. `taskResults`/`acResults` sequencing).
 * `JSON.stringify` alone is insufficient: two structurally-identical
 * `Summary` objects assembled via different code paths (e.g. differing
 * spread order) can produce different key insertion order and therefore a
 * different string, even though the content is logically identical. Sorting
 * keys before stringifying makes the digest depend only on content, not on
 * how the object happened to be built.
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeysDeep(source[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Deterministic JSON stringification: recursively sorts object keys before
 * calling `JSON.stringify`, so the result depends only on content, never on
 * key insertion order.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

/**
 * Computes a sha256 content hash over a canonical stringification of
 * `summary`, EXCLUDING `summary.contentHash` itself — a field cannot hash
 * over its own prior value (that would make the digest depend on whether a
 * hash was already attached, and on what it previously said), so it is
 * always stripped before hashing regardless of whether it is present on the
 * input.
 */
export function computeSummaryContentHash(summary: Summary): {
  algorithm: 'sha256';
  value: string;
} {
  const { contentHash: _contentHash, ...rest } = summary;
  void _contentHash;
  const value = createHash('sha256').update(canonicalStringify(rest)).digest('hex');
  return { algorithm: 'sha256', value };
}
