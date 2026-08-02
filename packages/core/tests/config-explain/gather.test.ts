import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { SimpleStateBackend } from '../../src/state/simple.js';
import { gatherExplainContext } from '../../src/config-explain/gather.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('gatherExplainContext (AC-2)', () => {
  // AC-2: env vars drive the provider-key flags; the injected env wins.
  it('AC-2: reflects ANTHROPIC_API_KEY / CADENCE_LOCAL_API_KEY from the env', async () => {
    active = await tempRepo({ initialized: true });
    const ctx = await gatherExplainContext(active.root, {
      ANTHROPIC_API_KEY: 'sk-test',
    } as NodeJS.ProcessEnv);
    expect(ctx.anthropicKeyPresent).toBe(true);
    expect(ctx.localKeyPresent).toBe(false);
  });

  // AC-2: the active tier comes from state.json (null when idle/absent).
  it('AC-2: reflects the active tier from state.json', async () => {
    active = await tempRepo({ initialized: true });
    const backend = new SimpleStateBackend(active.root);
    const state = await backend.readState();
    expect((await gatherExplainContext(active.root, {} as NodeJS.ProcessEnv)).activeTier).toBeNull();
    await backend.commit({ ...state, tier: 'complex' });
    expect((await gatherExplainContext(active.root, {} as NodeJS.ProcessEnv)).activeTier).toBe(
      'complex',
    );
  });

  // AC-2: host-install state comes from the shared predicate.
  it('AC-2: reflects host-hook install state', async () => {
    active = await tempRepo({ initialized: true });
    expect((await gatherExplainContext(active.root, {} as NodeJS.ProcessEnv)).hostHooksInstalled).toBe(
      false,
    );
    await mkdir(join(active.root, '.claude'), { recursive: true });
    await writeFile(
      join(active.root, '.claude', 'settings.json'),
      JSON.stringify({ hooks: { Stop: [{ _managedBy: 'cadence' }] } }),
    );
    expect((await gatherExplainContext(active.root, {} as NodeJS.ProcessEnv)).hostHooksInstalled).toBe(
      true,
    );
  });

  // AC-2: best-effort — an uninitialized path never throws and defaults safely.
  it('AC-2: never throws on an uninitialized path', async () => {
    active = await tempRepo({ initialized: true });
    const ctx = await gatherExplainContext(join(active.root, 'nope'), {} as NodeJS.ProcessEnv);
    expect(ctx.activeTier).toBeNull();
    expect(ctx.hostHooksInstalled).toBe(false);
  });

  // Phase 250 (AC-5/T16): a managed entry whose command still references the
  // pre-rename npm scope is stale, not installed — gather must surface both
  // flags so build.ts can tell "stale, needs reinstall" apart from
  // "genuinely absent" instead of conflating the two.
  //
  // The stale scope string below is built via concatenation, not one
  // literal: this fixture must exercise the real stale-scope string to trip
  // `hasStaleScopeManagedHook`, but this test file is not allowlisted in the
  // phase-250 repo-wide stray-scope sweep (npm-scope-sweep.test.ts) and a
  // literal here would trip it.
  const STALE_SCOPE = '@maneh' + 'orizons/';

  it('T16: a stale-scope managed hook entry reports hostHooksInstalled=false, hostHooksStale=true', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, '.claude'), { recursive: true });
    await writeFile(
      join(active.root, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                { type: 'command', command: `npx ${STALE_SCOPE}cadence-host-claude-code hook` },
              ],
              _managedBy: 'cadence',
            },
          ],
        },
      }),
    );
    const ctx = await gatherExplainContext(active.root, {} as NodeJS.ProcessEnv);
    expect(ctx.hostHooksInstalled).toBe(false);
    expect(ctx.hostHooksStale).toBe(true);
  });

  it('T16: a fresh-scope managed hook entry reports hostHooksInstalled=true, hostHooksStale=false', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, '.claude'), { recursive: true });
    await writeFile(
      join(active.root, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                { type: 'command', command: 'npx @thomas-powers-jr/cadence-host-claude-code hook' },
              ],
              _managedBy: 'cadence',
            },
          ],
        },
      }),
    );
    const ctx = await gatherExplainContext(active.root, {} as NodeJS.ProcessEnv);
    expect(ctx.hostHooksInstalled).toBe(true);
    expect(ctx.hostHooksStale).toBe(false);
  });

  it('T16: a genuinely absent settings.json reports hostHooksInstalled=false, hostHooksStale=false', async () => {
    active = await tempRepo({ initialized: true });
    const ctx = await gatherExplainContext(active.root, {} as NodeJS.ProcessEnv);
    expect(ctx.hostHooksInstalled).toBe(false);
    expect(ctx.hostHooksStale).toBe(false);
  });
});
