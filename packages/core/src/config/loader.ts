import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CadenceConfigZ, defaultConfig, type CadenceConfig } from '@thomas-powers-jr/cadence-types';
import { ConfigInvalidError } from '../errors.js';
import { atomicWriteJSON } from '../state/atomic-write.js';
import { mergeCustomProfiles } from '../verify/coverage-profiles/registry.js';

export async function loadConfig(repoRoot: string): Promise<CadenceConfig> {
  const path = join(repoRoot, '.cadence', 'config.json');
  if (!existsSync(path)) {
    return defaultConfig;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    throw new ConfigInvalidError(`config.json is not valid JSON: ${(err as Error).message}`);
  }
  const p = parsed as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...defaultConfig };
  for (const [k, v] of Object.entries(p)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) &&
        merged[k] !== null && typeof merged[k] === 'object' && !Array.isArray(merged[k])) {
      merged[k] = { ...(merged[k] as Record<string, unknown>), ...(v as Record<string, unknown>) };
    } else {
      merged[k] = v;
    }
  }
  const result = CadenceConfigZ.safeParse(merged);
  if (!result.success) {
    throw new ConfigInvalidError(`config.json failed schema validation: ${result.error.message}`);
  }
  // Phase 167, T7 (AC-7): validate + register any custom assertion-coverage
  // profiles at config-load time, not lazily on first use. Throws
  // `ConfigInvalidError` (refuse + suggest) on a bad regex, a missing
  // `keyword` config for `do-end-keyword`, or a built-in extension
  // collision — never silently ignored.
  mergeCustomProfiles(result.data.verification.coverageProfiles);
  return result.data;
}

export async function writeConfig(repoRoot: string, config: CadenceConfig): Promise<void> {
  CadenceConfigZ.parse(config);
  await atomicWriteJSON(join(repoRoot, '.cadence', 'config.json'), config);
}
