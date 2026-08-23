import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { COMMAND_GUIDANCE } from '@thomas-powers-jr/cadence-types';
import { checkPacks, checkPackCommands } from '../../src/doctor/run.js';
import { loadConfig, writeConfig } from '../../src/config/loader.js';
import { rollup } from '../../src/doctor/model.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

/**
 * Write a valid `.cadence/packs/<id>/pack.json` so `resolvePacks` resolves it.
 * `commands`, when provided, is written into the manifest alongside `id`/
 * `version` — additive third param, existing two-arg call sites unaffected.
 */
async function seedPack(root: string, id: string, commands?: string[]): Promise<void> {
  const packDir = join(root, '.cadence', 'packs', id);
  await mkdir(packDir, { recursive: true });
  const manifest: { id: string; version: string; commands?: string[] } = {
    id,
    version: '1.0.0',
  };
  if (commands !== undefined) {
    manifest.commands = commands;
  }
  await writeFile(join(packDir, 'pack.json'), JSON.stringify(manifest));
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

  it('291-01/AC-5: a mix of resolved and unresolved enabled packs errors (escalated from slice 1 warning) and names BOTH sides', async () => {
    active = await tempRepo({ initialized: true });
    await seedPack(active.root, 'cadence/resolves-fine');
    await setPacks(active.root, {
      enabled: ['cadence/resolves-fine', 'cadence/never-installed'],
      disabled: [],
    });

    const c = await checkPacks(active.root);
    expect(c.name).toBe('packs');
    // Slice 2 (phase 291) completes dec-20260822-025's two-phase plan: packs
    // are now behaviorally consumed (skillAudit union + the settle-time
    // `checkUnresolvablePacks` refusal), so an unresolved enabled pack is a
    // real failure, not a cosmetic one. Assert the negative too, so a silent
    // regression back to slice 1's warning rung fails here.
    expect(c.severity).toBe('error');
    expect(c.severity).not.toBe('warning');
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

  it('291-01/AC-5: errors when NO enabled pack resolves, saying so explicitly rather than emitting an empty resolved list', async () => {
    active = await tempRepo({ initialized: true });
    // No manifest seeded at all — the common real-world shape: an operator
    // adds an id to packs.enabled and never creates the manifest.
    await setPacks(active.root, { enabled: ['cadence/never-installed'], disabled: [] });

    const c = await checkPacks(active.root);
    expect(c.name).toBe('packs');
    expect(c.severity).toBe('error');
    expect(c.detail).toContain('cadence/never-installed');
    expect(c.detail).toContain('No enabled pack resolved');
    expect(c.remediation).toBeTruthy();
  });

  it('290-01/AC-4: degrades to ok (never a fabricated failure) when config.json cannot be loaded — checkInitialized already reports that as error', async () => {
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

describe('checkPackCommands — cadence doctor pack-commands check', () => {
  it('293-01/AC-2: reports ok with no warning when zero packs are enabled', async () => {
    active = await tempRepo({ initialized: true });
    await setPacks(active.root, { enabled: [], disabled: [] });

    const c = await checkPackCommands(active.root);
    expect(c.name).toBe('pack-commands');
    expect(c.severity).toBe('ok');
    expect(c.status).toBe('ok');
    expect(c.remediation).toBeNull();
  });

  it('293-01/AC-2: reports ok when an enabled pack has no commands field at all', async () => {
    active = await tempRepo({ initialized: true });
    await seedPack(active.root, 'cadence/no-commands');
    await setPacks(active.root, { enabled: ['cadence/no-commands'], disabled: [] });

    const c = await checkPackCommands(active.root);
    expect(c.name).toBe('pack-commands');
    expect(c.severity).toBe('ok');
    expect(c.remediation).toBeNull();
  });

  it('293-01/AC-2: reports ok, naming the pack, when every declared command is a real slash-command name', async () => {
    active = await tempRepo({ initialized: true });
    // Pick guaranteed-real keys off the canonical guidance map rather than
    // hardcoding strings that could drift from the registered set.
    const realCommands = Object.keys(COMMAND_GUIDANCE).slice(0, 2);
    expect(realCommands.length).toBeGreaterThan(0);
    await seedPack(active.root, 'cadence/valid-commands', realCommands);
    await setPacks(active.root, { enabled: ['cadence/valid-commands'], disabled: [] });

    const c = await checkPackCommands(active.root);
    expect(c.name).toBe('pack-commands');
    expect(c.severity).toBe('ok');
    expect(c.detail).toContain('cadence/valid-commands');
    expect(c.remediation).toBeNull();
  });

  it('293-01/AC-1: warns (never errors) on an unrecognized command, naming both the pack id and the bad command, and never flips DoctorReport.ok', async () => {
    active = await tempRepo({ initialized: true });
    await seedPack(active.root, 'cadence/bad-command', [
      'cadence-does-not-exist',
      'cadence-also-does-not-exist',
    ]);
    await setPacks(active.root, { enabled: ['cadence/bad-command'], disabled: [] });

    const c = await checkPackCommands(active.root);
    expect(c.name).toBe('pack-commands');
    expect(c.severity).toBe('warning');
    expect(c.status).toBe('warning');
    expect(c.detail).toContain('cadence/bad-command');
    // Every unrecognized command name must be named, not just the first —
    // a single-offender fixture can't distinguish `unknown.join(', ')` from
    // `unknown[0]`.
    expect(c.detail).toContain('cadence-does-not-exist');
    expect(c.detail).toContain('cadence-also-does-not-exist');
    expect(c.remediation).not.toBeNull();
    expect(c.fixId).toBeNull();

    // A warning must never flip the composed report's overall `ok`.
    const report = rollup([c]);
    expect(report.ok).toBe(true);
  });

  it('293-01/AC-2: degrades to ok (never indeterminate) when config.json cannot be loaded', async () => {
    active = await tempRepo({ initialized: true });
    // Malformed JSON is what actually makes `loadConfig` throw: a *missing*
    // config.json returns `defaultConfig` instead, which would exercise the
    // empty-enabled branch rather than the catch branch under test here.
    await writeFile(join(active.root, '.cadence', 'config.json'), '{not valid json');

    const c = await checkPackCommands(active.root);
    expect(c.name).toBe('pack-commands');
    expect(c.severity).toBe('ok');
    expect(c.status).toBe('ok');
    // Assert the CATCH branch specifically: the empty-enabled branch is also
    // `ok`, so severity alone cannot tell the two apart.
    expect(c.detail).toContain('not determinable');
    // AC-2's Then clause requires this degrades to `pass(...)`, never the
    // `indeterminate` rung — assert the negative explicitly so a regression
    // to `indeterminate` fails here rather than slipping past a bare `ok`
    // check (which `indeterminate` could theoretically also satisfy if the
    // severity type were ever loosened).
    expect(c.severity).not.toBe('indeterminate');
    expect(c.remediation).toBeNull();
  });

  it('293-01/AC-2: an id present in both packs.enabled and packs.disabled is excluded before the check runs — disabled wins, behaves like zero enabled packs', async () => {
    active = await tempRepo({ initialized: true });
    // No manifest on disk: if the disabled list were ignored, this pack
    // would fail to resolve entirely (a `checkPacks`-shaped failure), not
    // merely skip the commands check — assert it behaves like zero packs.
    await setPacks(active.root, {
      enabled: ['cadence/turned-off'],
      disabled: ['cadence/turned-off'],
    });

    const c = await checkPackCommands(active.root);
    expect(c.name).toBe('pack-commands');
    expect(c.severity).toBe('ok');
    expect(c.detail).toContain('No packs enabled');
    expect(c.remediation).toBeNull();
  });
});
