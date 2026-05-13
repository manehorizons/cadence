import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { KeelConfigZ, defaultConfig, type KeelConfig } from '@keel/types';
import { ConfigInvalidError } from '../errors.js';
import { atomicWriteJSON } from '../state/atomic-write.js';

export async function loadConfig(repoRoot: string): Promise<KeelConfig> {
  const path = join(repoRoot, '.keel', 'config.json');
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
  const result = KeelConfigZ.safeParse(merged);
  if (!result.success) {
    throw new ConfigInvalidError(`config.json failed schema validation: ${result.error.message}`);
  }
  return result.data;
}

export async function writeConfig(repoRoot: string, config: KeelConfig): Promise<void> {
  KeelConfigZ.parse(config);
  await atomicWriteJSON(join(repoRoot, '.keel', 'config.json'), config);
}
