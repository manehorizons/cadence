import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installHooks } from '../src/install.js';

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

async function tempDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'cadence-cc-'));
  cleanup.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

describe('installHooks', () => {
  it('creates .claude/settings.json with all 6 hook events', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.SessionStart).toBeDefined();
    expect(cfg.hooks.UserPromptSubmit).toBeDefined();
    expect(cfg.hooks.PreToolUse).toBeDefined();
    expect(cfg.hooks.PostToolUse).toBeDefined();
    expect(cfg.hooks.Stop).toBeDefined();
    expect(cfg.hooks.SubagentStop).toBeDefined();
  });

  it('AC-1 (phase 119): rejects settingsPath outside the project root', async () => {
    const root = await tempDir();
    await expect(installHooks(root, { settingsPath: '../settings.json' })).rejects.toThrow(
      /settingsPath must stay within the project root/,
    );
  });

  it('PreToolUse/PostToolUse entries match edit tools only', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.PreToolUse[0].matcher).toBe('Edit|Write|MultiEdit|NotebookEdit');
    expect(cfg.hooks.PostToolUse[0].matcher).toBe('Edit|Write|MultiEdit|NotebookEdit');
  });

  it('all events point at the host-claude-code shim (single command)', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    const expected = 'npx @manehorizons/cadence-host-claude-code hook';
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe(expected);
    expect(cfg.hooks.UserPromptSubmit[0].hooks[0].command).toBe(expected);
    expect(cfg.hooks.PreToolUse[0].hooks[0].command).toBe(expected);
    expect(cfg.hooks.PostToolUse[0].hooks[0].command).toBe(expected);
    expect(cfg.hooks.Stop[0].hooks[0].command).toBe(expected);
    expect(cfg.hooks.SubagentStop[0].hooks[0].command).toBe(expected);
  });

  it('cadenceCommand option appends --cadence "<cmd>" to the shim invocation', async () => {
    const root = await tempDir();
    await installHooks(root, { cadenceCommand: 'node /abs/cadence.js' });
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe(
      'npx @manehorizons/cadence-host-claude-code hook --cadence "node /abs/cadence.js"',
    );
  });

  it('entries are tagged with _managedBy=cadence', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0]._managedBy).toBe('cadence');
    expect(cfg.hooks.PreToolUse[0]._managedBy).toBe('cadence');
  });

  it('hook entries declare type=command', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0].hooks[0].type).toBe('command');
  });

  it('preserves existing non-hook settings', async () => {
    const root = await tempDir();
    await mkdir(join(root, '.claude'), { recursive: true });
    await writeFile(
      join(root, '.claude/settings.json'),
      JSON.stringify({ model: 'sonnet', otherKey: 'preserve-me' }),
    );
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.model).toBe('sonnet');
    expect(cfg.otherKey).toBe('preserve-me');
    expect(cfg.hooks.SessionStart).toBeDefined();
  });

  it('replaces only cadence-managed hook entries on re-install (idempotent)', async () => {
    const root = await tempDir();
    await mkdir(join(root, '.claude'), { recursive: true });
    await writeFile(
      join(root, '.claude/settings.json'),
      JSON.stringify({
        hooks: {
          SessionStart: [{ hooks: [{ type: 'command', command: 'user-custom-hook' }] }],
          PostToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'user-bash-hook' }] },
          ],
        },
      }),
    );
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    type Entry = { matcher?: string; _managedBy?: string; hooks: Array<{ command: string }> };
    const sessionStarts: Entry[] = cfg.hooks.SessionStart;
    const userEntry = sessionStarts.find((e) =>
      e.hooks.some((h) => h.command === 'user-custom-hook'),
    );
    const cadenceEntry = sessionStarts.find((e) => e._managedBy === 'cadence');
    expect(userEntry).toBeDefined();
    expect(cadenceEntry).toBeDefined();
    const bashEntry = (cfg.hooks.PostToolUse as Entry[]).find((e) => e.matcher === 'Bash');
    expect(bashEntry).toBeDefined();
    expect(bashEntry?._managedBy).toBeUndefined();

    // Re-install should not duplicate the cadence entry.
    await installHooks(root);
    const cfg2 = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    const cadenceSessionStarts = (cfg2.hooks.SessionStart as Entry[]).filter(
      (e) => e._managedBy === 'cadence',
    );
    expect(cadenceSessionStarts).toHaveLength(1);
    // User entry still preserved.
    const userStill = (cfg2.hooks.SessionStart as Entry[]).find((e) =>
      e.hooks.some((h) => h.command === 'user-custom-hook'),
    );
    expect(userStill).toBeDefined();
  });

  it('shim command can be overridden via opts.command', async () => {
    const root = await tempDir();
    await installHooks(root, { command: 'node /abs/shim.js hook' });
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe('node /abs/shim.js hook');
  });

  it('local=true emits absolute paths to local builds (no npx)', async () => {
    const root = await tempDir();
    await installHooks(root, { local: true });
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    const cmd = cfg.hooks.SessionStart[0].hooks[0].command;
    expect(cmd).not.toMatch(/npx /);
    expect(cmd).toMatch(/^node .+host-claude-code[\\/]dist[\\/]cli\.js hook /);
    expect(cmd).toMatch(/--cadence "node .+core[\\/]dist[\\/]cli[\\/]index\.js"/);
  });

  it('local=true is overridden by explicit opts.command / opts.cadenceCommand', async () => {
    const root = await tempDir();
    await installHooks(root, {
      local: true,
      command: 'node /custom/shim.js hook',
      cadenceCommand: 'node /custom/cadence.js',
    });
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe(
      'node /custom/shim.js hook --cadence "node /custom/cadence.js"',
    );
  });

  // AC-2 (Phase 23.4) — PostToolUse has two cadence-managed entries (Edit-tools + Skill).
  it('PostToolUse has both Edit-tools and Skill matchers, both cadence-managed', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    const postToolUse = cfg.hooks.PostToolUse as Array<{ matcher: string; _managedBy: string }>;
    expect(postToolUse).toHaveLength(2);
    const matchers = postToolUse.map((e) => e.matcher).sort();
    expect(matchers).toEqual(['Edit|Write|MultiEdit|NotebookEdit', 'Skill']);
    for (const entry of postToolUse) {
      expect(entry._managedBy).toBe('cadence');
    }
  });

  // AC-1 (Phase 18.1) — F2 rename rollout.
  it('evicts legacy _managedBy=keel hook entries on re-install', async () => {
    const root = await tempDir();
    await mkdir(join(root, '.claude'), { recursive: true });
    // Pre-seed with two legacy `keel`-managed entries and one user-customized.
    await writeFile(
      join(root, '.claude/settings.json'),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [{ type: 'command', command: 'npx @keel/host-claude-code hook' }],
              _managedBy: 'keel',
            },
            { hooks: [{ type: 'command', command: 'user-hook' }] },
          ],
          PreToolUse: [
            {
              matcher: 'Edit|Write|MultiEdit|NotebookEdit',
              hooks: [{ type: 'command', command: 'npx @keel/host-claude-code hook' }],
              _managedBy: 'keel',
            },
          ],
        },
      }),
    );
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    type Entry = { _managedBy?: string; hooks: Array<{ command: string }> };
    // No keel-managed entries survive.
    const legacy = (cfg.hooks.SessionStart as Entry[]).filter((e) => e._managedBy === 'keel');
    expect(legacy).toHaveLength(0);
    const legacyPreTool = (cfg.hooks.PreToolUse as Entry[]).filter((e) => e._managedBy === 'keel');
    expect(legacyPreTool).toHaveLength(0);
    // Exactly one cadence-managed SessionStart entry, user entry preserved.
    const cadenceStarts = (cfg.hooks.SessionStart as Entry[]).filter(
      (e) => e._managedBy === 'cadence',
    );
    expect(cadenceStarts).toHaveLength(1);
    const userStill = (cfg.hooks.SessionStart as Entry[]).find((e) =>
      e.hooks.some((h) => h.command === 'user-hook'),
    );
    expect(userStill).toBeDefined();
  });
});
