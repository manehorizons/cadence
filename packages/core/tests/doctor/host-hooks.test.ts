import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import {
  hasManagedCadence,
  hasManagedCadenceMarker,
  hasStaleScopeManagedHook,
  hostHooksInstalled,
} from '../../src/doctor/host-hooks.js';
import { runDoctor } from '../../src/doctor/run.js';
import { planFixes, applyFixes } from '../../src/doctor/fix.js';

const ENV = { nodeVersion: process.versions.node, platform: process.platform as NodeJS.Platform };

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

describe('stale-scope host hook detection (AC-5, phase 250)', () => {
  const OLD_SCOPE_COMMAND = 'npx @manehorizons/cadence-host-claude-code hook';
  // Mirrors host-claude-code/src/install.ts:49's default command.
  const NEW_SCOPE_COMMAND = 'npx @thomas-powers-jr/cadence-host-claude-code hook';

  function settingsWith(command: string): Record<string, unknown> {
    return {
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command }], _managedBy: 'cadence' }],
      },
    };
  }

  // AC-5: a managed entry (marker present) whose command still references
  // @manehorizons must be flagged stale -- not just marker-presence.
  it('250-01/AC-5: a managed entry whose command still references @manehorizons is flagged stale, not just marker-presence', () => {
    // Marker-presence alone (the pre-phase-250 check) says "managed" for both.
    expect(hasManagedCadenceMarker(settingsWith(OLD_SCOPE_COMMAND))).toBe(true);
    expect(hasManagedCadenceMarker(settingsWith(NEW_SCOPE_COMMAND))).toBe(true);

    // The stale-scope predicate tells them apart.
    expect(hasStaleScopeManagedHook(settingsWith(OLD_SCOPE_COMMAND))).toBe(true);
    expect(hasStaleScopeManagedHook(settingsWith(NEW_SCOPE_COMMAND))).toBe(false);

    // hasManagedCadence composes both: a stale-scope entry no longer counts as managed.
    expect(hasManagedCadence(settingsWith(OLD_SCOPE_COMMAND))).toBe(false);
    expect(hasManagedCadence(settingsWith(NEW_SCOPE_COMMAND))).toBe(true);

    // A non-cadence-managed mention of the old scope must not trip the stale check.
    expect(hasStaleScopeManagedHook({ note: '@manehorizons/cadence-core is old' })).toBe(false);
  });

  // AC-5: the shared predicate degrades hostHooksInstalled the same way.
  it('250-01/AC-5: hostHooksInstalled is false when the only managed entry is stale-scope', async () => {
    active = await tempRepo({ initialized: true });
    await writeSettings(active.root, JSON.stringify(settingsWith(OLD_SCOPE_COMMAND)));
    expect(await hostHooksInstalled(active.root)).toBe(false);
  });

  // AC-5: cadence doctor flags the stale entry, and `--fix` re-runs install to repair it.
  it('250-01/AC-5: cadence doctor flags a stale-scope managed hook, and --fix re-runs install to repair it', async () => {
    active = await tempRepo({ initialized: true });
    await writeSettings(active.root, JSON.stringify(settingsWith(OLD_SCOPE_COMMAND)));

    const before = await runDoctor(active.root, ENV);
    const beforeCheck = before.checks.find((c) => c.name === 'host-hooks');
    expect(beforeCheck?.severity).toBe('warning');
    expect(beforeCheck?.fixId).toBe('host-install');

    const plan = planFixes(before);
    const hostAction = plan.actions.find((a) => a.check === 'host-hooks');
    expect(hostAction?.kind).toBe('wire-host');
    expect(hostAction?.fixId).toBe('host-install');

    let calls = 0;
    let calledWithRoot: string | undefined;
    const outcomes = await applyFixes(active.root, plan, { wireHost: true }, {
      hostInstall: async (root) => {
        calls++;
        calledWithRoot = root;
        // Simulate the real installHooks() repair (host-claude-code/src/install.ts's
        // mergeManagedHookEntries, which evicts every _managedBy: 'cadence' entry
        // and re-writes it with the current command) rewriting the settings file.
        await writeSettings(root, JSON.stringify(settingsWith(NEW_SCOPE_COMMAND)));
        return 0;
      },
    });
    expect(calls).toBe(1);
    expect(calledWithRoot).toBe(active.root);
    const outcome = outcomes.find((o) => o.check === 'host-hooks');
    expect(outcome?.status).toBe('applied');

    // Detect -> repair -> clear: doctor re-run now sees a fresh, non-stale entry.
    const after = await runDoctor(active.root, ENV);
    expect(after.checks.find((c) => c.name === 'host-hooks')?.severity).toBe('ok');

    const rewritten = await readFile(join(active.root, '.claude', 'settings.json'), 'utf8');
    expect(rewritten).toContain('@thomas-powers-jr/cadence-host-claude-code');
    expect(rewritten).not.toContain('@manehorizons');
  });
});
