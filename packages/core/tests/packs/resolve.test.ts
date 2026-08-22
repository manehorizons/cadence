import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { resolvePacks } from '../../src/packs/resolve.js';
import type { CadenceConfig } from '@thomas-powers-jr/cadence-types';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('resolvePacks — pack manifest resolution', () => {
  it('290-01/AC-2: resolved case — enabled id with valid pack.json on disk → returns { id, source: "local", manifest }', async () => {
    active = await tempRepo({ initialized: true });
    const packDir = join(active.root, '.cadence/packs/cadence/test-pack');
    await mkdir(packDir, { recursive: true });

    const manifest = {
      id: 'cadence/test-pack',
      version: '1.0.0',
    };
    await writeFile(join(packDir, 'pack.json'), JSON.stringify(manifest));

    const config: Pick<CadenceConfig, 'packs'> = {
      packs: { enabled: ['cadence/test-pack'], disabled: [] },
    };

    const result = await resolvePacks(active.root, config);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'cadence/test-pack',
      source: 'local',
      manifest,
    });
  });

  it('290-01/AC-2: missing-file case — enabled id with no pack.json on disk → returns { id, source: "local", error: <reason> }, does not throw', async () => {
    active = await tempRepo({ initialized: true });
    const config: Pick<CadenceConfig, 'packs'> = {
      packs: { enabled: ['cadence/missing-pack'], disabled: [] },
    };

    const result = await resolvePacks(active.root, config);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'cadence/missing-pack',
      source: 'local',
      error: expect.any(String),
    });
    expect(result[0]).not.toHaveProperty('manifest');
  });

  it('290-01/AC-2: invalid-JSON case — enabled id with malformed JSON in pack.json → returns error result, does not throw', async () => {
    active = await tempRepo({ initialized: true });
    const packDir = join(active.root, '.cadence/packs/cadence/bad-json');
    await mkdir(packDir, { recursive: true });
    await writeFile(join(packDir, 'pack.json'), '{invalid json');

    const config: Pick<CadenceConfig, 'packs'> = {
      packs: { enabled: ['cadence/bad-json'], disabled: [] },
    };

    const result = await resolvePacks(active.root, config);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'cadence/bad-json',
      source: 'local',
      error: expect.any(String),
    });
    expect(result[0]).not.toHaveProperty('manifest');
  });

  it('290-01/AC-2: schema-failure case — enabled id with valid JSON that fails PackManifestZ validation → returns error result, does not throw', async () => {
    active = await tempRepo({ initialized: true });
    const packDir = join(active.root, '.cadence/packs/cadence/bad-schema');
    await mkdir(packDir, { recursive: true });

    const manifest = {
      id: 'cadence/bad-schema',
      // missing version, which is required
    };
    await writeFile(join(packDir, 'pack.json'), JSON.stringify(manifest));

    const config: Pick<CadenceConfig, 'packs'> = {
      packs: { enabled: ['cadence/bad-schema'], disabled: [] },
    };

    const result = await resolvePacks(active.root, config);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'cadence/bad-schema',
      source: 'local',
      error: expect.any(String),
    });
    expect(result[0]).not.toHaveProperty('manifest');
  });

  it('290-01/AC-3: disabled-wins collision case — id in both enabled and disabled with valid manifest file → excluded entirely, not resolved or reported as disabled', async () => {
    active = await tempRepo({ initialized: true });
    const packDir = join(active.root, '.cadence/packs/cadence/collision');
    await mkdir(packDir, { recursive: true });

    const manifest = {
      id: 'cadence/collision',
      version: '1.0.0',
    };
    await writeFile(join(packDir, 'pack.json'), JSON.stringify(manifest));

    const config: Pick<CadenceConfig, 'packs'> = {
      packs: {
        enabled: ['cadence/collision'],
        disabled: ['cadence/collision'],
      },
    };

    const result = await resolvePacks(active.root, config);
    expect(result).toHaveLength(0);
  });

  it('290-01/AC-2: a malformed config-supplied id (path-traversal shape) is rejected before any filesystem path join, not attempted', async () => {
    active = await tempRepo({ initialized: true });
    const config: Pick<CadenceConfig, 'packs'> = {
      packs: { enabled: ['../../etc'], disabled: [] },
    };

    const result = await resolvePacks(active.root, config);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: '../../etc',
      source: 'local',
      error: expect.any(String),
    });
    expect(result[0]).not.toHaveProperty('manifest');
  });

  it('one pack failure does not block another pack resolution', async () => {
    active = await tempRepo({ initialized: true });

    // Create valid pack
    const validDir = join(active.root, '.cadence/packs/cadence/valid-pack');
    await mkdir(validDir, { recursive: true });
    const validManifest = {
      id: 'cadence/valid-pack',
      version: '1.0.0',
    };
    await writeFile(join(validDir, 'pack.json'), JSON.stringify(validManifest));

    const config: Pick<CadenceConfig, 'packs'> = {
      packs: {
        enabled: ['cadence/valid-pack', 'cadence/missing-pack'],
        disabled: [],
      },
    };

    const result = await resolvePacks(active.root, config);
    expect(result).toHaveLength(2);

    const valid = result.find((r) => r.id === 'cadence/valid-pack');
    expect(valid).toEqual({
      id: 'cadence/valid-pack',
      source: 'local',
      manifest: validManifest,
    });

    const missing = result.find((r) => r.id === 'cadence/missing-pack');
    expect(missing).toEqual({
      id: 'cadence/missing-pack',
      source: 'local',
      error: expect.any(String),
    });
  });
});
