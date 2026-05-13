import { describe, it, expect, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@keel/testkit';
import { loadConfig, writeConfig } from '../../src/config/loader.js';
import { defaultConfig } from '@keel/types';
import { ConfigInvalidError } from '../../src/errors.js';

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('loadConfig', () => {
  it('returns defaults when no config file present', async () => {
    active = await tempRepo();
    const cfg = await loadConfig(active.root);
    expect(cfg.loopEnforcement).toBe('soft');
  });

  it('merges partial config over defaults', async () => {
    active = await tempRepo({ initialized: true });
    await writeFile(
      join(active.root, '.keel/config.json'),
      JSON.stringify({ ...defaultConfig, loopEnforcement: 'strict' }),
    );
    const cfg = await loadConfig(active.root);
    expect(cfg.loopEnforcement).toBe('strict');
    expect(cfg.commitCadence).toBe('draft');
  });

  it('throws ConfigInvalidError on schema violation', async () => {
    active = await tempRepo({ initialized: true });
    await writeFile(join(active.root, '.keel/config.json'), JSON.stringify({ loopEnforcement: 'nope' }));
    await expect(loadConfig(active.root)).rejects.toBeInstanceOf(ConfigInvalidError);
  });

  it('writeConfig persists and round-trips', async () => {
    active = await tempRepo({ initialized: true });
    const cfg = { ...defaultConfig, loopEnforcement: 'reminder' as const };
    await writeConfig(active.root, cfg);
    const after = await loadConfig(active.root);
    expect(after.loopEnforcement).toBe('reminder');
  });
});
