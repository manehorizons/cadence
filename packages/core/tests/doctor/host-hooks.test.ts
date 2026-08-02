import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { hasManagedCadence, hostHooksInstalled } from '../../src/doctor/host-hooks.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function writeSettings(root: string, body: string): Promise<void> {
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(join(root, '.claude', 'settings.json'), body);
}

describe('host-hooks predicate (AC-1)', () => {
  // AC-1: the deep-scan recognizes a nested _managedBy: "cadence" marker.
  it('AC-1: hasManagedCadence finds a nested managed marker', () => {
    expect(hasManagedCadence({ hooks: { SessionStart: [{ _managedBy: 'cadence' }] } })).toBe(true);
    expect(hasManagedCadence({ hooks: { SessionStart: [{ _managedBy: 'someone-else' }] } })).toBe(
      false,
    );
    expect(hasManagedCadence({})).toBe(false);
  });

  // AC-1: present marker → true.
  it('AC-1: hostHooksInstalled is true when a managed entry is present', async () => {
    active = await tempRepo({ initialized: true });
    await writeSettings(active.root, JSON.stringify({ hooks: { Stop: [{ _managedBy: 'cadence' }] } }));
    expect(await hostHooksInstalled(active.root)).toBe(true);
  });

  // AC-1: absent file / no marker / malformed JSON → false, never throws.
  it('AC-1: hostHooksInstalled is false (best-effort) on absent, unmanaged, or malformed settings', async () => {
    active = await tempRepo({ initialized: true });
    expect(await hostHooksInstalled(active.root)).toBe(false); // no settings.json
    await writeSettings(active.root, JSON.stringify({ hooks: {} }));
    expect(await hostHooksInstalled(active.root)).toBe(false); // no marker
    await writeSettings(active.root, '{ not valid json');
    expect(await hostHooksInstalled(active.root)).toBe(false); // malformed → no throw
  });
});
