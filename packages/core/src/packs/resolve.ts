import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PackManifestZ,
  isValidPackId,
  type PackManifest,
  type CadenceConfig,
} from '@thomas-powers-jr/cadence-types';

/**
 * A resolved pack: either a successfully parsed manifest with source-classification
 * (source is resolver-assigned, never self-declared), or an error reason.
 * See docs/packs-design.md §4a — source classification is the resolver's job,
 * not the manifest's self-declaration, to prevent self-authorizing claims.
 */
export type ResolvedPack =
  | { id: string; source: 'local'; manifest: PackManifest }
  | { id: string; source: 'local'; error: string };

/**
 * Resolve pack ids from config.packs to their manifests on disk.
 *
 * For each id in config.packs.enabled that is NOT also in config.packs.disabled:
 * - Read .cadence/packs/<id>/pack.json
 * - Validate against PackManifestZ
 * - Return success or error, never throw
 * - Disabled ids win over enabled ids on collision (tighten-only principle)
 *
 * See docs/packs-design.md §4a (resolution), §5 I-4 (one chokepoint),
 * and §6 D-AQ (disabled wins).
 */
export async function resolvePacks(
  repoRoot: string,
  config: Pick<CadenceConfig, 'packs'>,
): Promise<ResolvedPack[]> {
  const disabledSet = new Set(config.packs.disabled ?? []);

  // Filter enabled ids: exclude any that appear in disabled
  const toResolve = (config.packs.enabled ?? []).filter((id) => !disabledSet.has(id));

  const results: ResolvedPack[] = [];

  for (const id of toResolve) {
    const result = await resolvePackId(repoRoot, id);
    results.push(result);
  }

  return results;
}

/**
 * Resolve a single pack id. Never throws — captures errors and returns them.
 */
async function resolvePackId(repoRoot: string, id: string): Promise<ResolvedPack> {
  if (!isValidPackId(id)) {
    // Reject before any path join — a config-supplied id never passes
    // through PackManifestZ (only the manifest's own `id` field does), so
    // this is the only guard against a malformed id (e.g. `../../etc`)
    // reaching the filesystem.
    return {
      id,
      source: 'local',
      error: `Invalid pack id "${id}": does not match the <scope>/<name> grammar.`,
    };
  }

  const packJsonPath = join(repoRoot, '.cadence', 'packs', id, 'pack.json');

  try {
    const content = await readFile(packJsonPath, 'utf8');
    let manifest: unknown;
    try {
      manifest = JSON.parse(content);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        id,
        source: 'local',
        error: `Invalid JSON in ${packJsonPath}: ${reason}`,
      };
    }

    const validation = PackManifestZ.safeParse(manifest);
    if (!validation.success) {
      return {
        id,
        source: 'local',
        error: `Schema validation failed for ${id}: ${validation.error.message}`,
      };
    }

    return {
      id,
      source: 'local',
      manifest: validation.data,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      id,
      source: 'local',
      error: `Failed to read pack manifest for ${id} at ${packJsonPath}: ${reason}`,
    };
  }
}
