import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { checkPacks } from '../../src/doctor/run.js';
import { loadConfig, writeConfig } from '../../src/config/loader.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

/** Write a valid `.cadence/packs/<id>/pack.json` so `resolvePacks` resolves it. */
async function seedPack(root: string, id: string): Promise<void> {
  const packDir = join(root, '.cadence', 'packs', id);
  await mkdir(packDir, { recursive: true });
  await writeFile(join(packDir, 'pack.json'), JSON.stringify({ id, version: '1.0.0' }));
}

/** Set `packs.enabled` / `packs.disabled` on the fixture's config.json. */
async function setPacks(
  root: string,
  packs: { enabled: string[]; disabled: string[] },
): Promise<void> {
  const cfg = await loadConfig(root);
  await writeConfig(root, { ...cfg, packs });
}

describe('checkPacks — cadence doctor pack-resolution check', () => {
  it('290-01/AC-4: reports ok with no warning when zero packs are enabled', async () => {
    active = await tempRepo({ initialized: true });
    // tempRepo's defaultConfig already ships `packs: { enabled: [], disabled: [] }`,
    // but set it explicitly so the test states its own precondition.
    await setPacks(active.root, { enabled: [], disabled: [] });

    const c = await checkPacks(active.root);
    expect(c.name).toBe('packs');
    expect(c.severity).toBe('ok');
    expect(c.status).toBe('ok');
    expect(c.remediation).toBeNull();
  });

  it('290-01/AC-4: reports ok when every enabled pack resolves, naming each resolved id', async () => {
    active = await tempRepo({ initialized: true });
    await seedPack(active.root, 'cadence/alpha');
    await seedPack(active.root, 'cadence/beta');
    await setPacks(active.root, {
      enabled: ['cadence/alpha', 'cadence/beta'],
      disabled: [],
    });

    const c = await checkPacks(active.root);
    expect(c.name).toBe('packs');
    expect(c.severity).toBe('ok');
    expect(c.detail).toContain('cadence/alpha');
    expect(c.detail).toContain('cadence/beta');
    expect(c.remediation).toBeNull();
  });

  it('290-01/AC-4: a mix of resolved and unresolved enabled packs warns (never errors) and names BOTH sides', async () => {
    active = await tempRepo({ initialized: true });
    await seedPack(active.root, 'cadence/resolves-fine');
    await setPacks(active.root, {
      enabled: ['cadence/resolves-fine', 'cadence/never-installed'],
      disabled: [],
    });

    const c = await checkPacks(active.root);
    expect(c.name).toBe('packs');
    // Slice 1 is warning-only by dec-20260822-025 — nothing consumes packs
    // behaviorally yet, so an unresolved pack breaks nothing today.
    expect(c.severity).toBe('warning');
    expect(c.severity).not.toBe('error');
    // The detail lists the failure AND the success — not just the failure.
    expect(c.detail).toContain('cadence/never-installed');
    expect(c.detail).toContain('cadence/resolves-fine');
    expect(c.remediation).toBeTruthy();
    expect(c.fixId).toBeNull();
  });

  it('290-01/AC-4: an id present in both packs.enabled and packs.disabled reports ok — disabled wins, so nothing is unresolved', async () => {
    active = await tempRepo({ initialized: true });
    // No manifest on disk at all: were the disabled list ignored, this id
    // would fail to resolve and the check would warn.
    await setPacks(active.root, {
      enabled: ['cadence/turned-off'],
      disabled: ['cadence/turned-off'],
    });

    const c = await checkPacks(active.root);
    expect(c.name).toBe('packs');
    expect(c.severity).toBe('ok');
    expect(c.remediation).toBeNull();
  });

  it('290-01/AC-4: warns when NO enabled pack resolves, saying so explicitly rather than emitting an empty resolved list', async () => {
    active = await tempRepo({ initialized: true });
    // No manifest seeded at all — the common real-world shape: an operator
    // adds an id to packs.enabled and never creates the manifest.
    await setPacks(active.root, { enabled: ['cadence/never-installed'], disabled: [] });

    const c = await checkPacks(active.root);
    expect(c.name).toBe('packs');
    expect(c.severity).toBe('warning');
    expect(c.detail).toContain('cadence/never-installed');
    expect(c.detail).toContain('No enabled pack resolved');
    expect(c.remediation).toBeTruthy();
  });

  it('290-01/AC-4: degrades to ok (never a fabricated warning) when config.json cannot be loaded — checkInitialized already reports that as error', async () => {
    active = await tempRepo({ initialized: true });
    // Malformed JSON is what actually makes `loadConfig` throw: a *missing*
    // config.json returns `defaultConfig` instead, which would exercise the
    // empty-enabled branch rather than the catch branch under test here.
    await writeFile(join(active.root, '.cadence', 'config.json'), '{not valid json');

    const c = await checkPacks(active.root);
    expect(c.name).toBe('packs');
    expect(c.severity).toBe('ok');
    // Assert the CATCH branch specifically: the empty-enabled branch is also
    // `ok`, so severity alone cannot tell the two apart.
    expect(c.detail).toContain('not determinable');
    expect(c.remediation).toBeNull();
  });
});
