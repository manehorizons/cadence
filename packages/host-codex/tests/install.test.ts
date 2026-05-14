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
  const d = await mkdtemp(join(tmpdir(), 'keel-codex-'));
  cleanup.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

describe('installHooks', () => {
  it('creates .codex/hooks.json with all 5 Codex hook events', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
    expect(cfg.hooks.SessionStart).toBeDefined();
    expect(cfg.hooks.UserPromptSubmit).toBeDefined();
    expect(cfg.hooks.PreToolUse).toBeDefined();
    expect(cfg.hooks.PostToolUse).toBeDefined();
    expect(cfg.hooks.Stop).toBeDefined();
  });

  it('does not register a SubagentStop entry (Codex has no such event)', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
    expect(cfg.hooks.SubagentStop).toBeUndefined();
  });

  it('PreToolUse/PostToolUse matchers cover apply_patch|Edit|Write', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
    expect(cfg.hooks.PreToolUse[0].matcher).toBe('apply_patch|Edit|Write');
    expect(cfg.hooks.PostToolUse[0].matcher).toBe('apply_patch|Edit|Write');
  });

  it('all events point at the host-codex shim', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
    const expected = 'npx @keel/host-codex hook';
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe(expected);
    expect(cfg.hooks.UserPromptSubmit[0].hooks[0].command).toBe(expected);
    expect(cfg.hooks.PreToolUse[0].hooks[0].command).toBe(expected);
    expect(cfg.hooks.PostToolUse[0].hooks[0].command).toBe(expected);
    expect(cfg.hooks.Stop[0].hooks[0].command).toBe(expected);
  });

  it('keelCommand option appends --keel "<cmd>"', async () => {
    const root = await tempDir();
    await installHooks(root, { keelCommand: 'node /abs/keel.js' });
    const cfg = JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe(
      'npx @keel/host-codex hook --keel "node /abs/keel.js"',
    );
  });

  it('entries are tagged with _managedBy=keel', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0]._managedBy).toBe('keel');
    expect(cfg.hooks.PreToolUse[0]._managedBy).toBe('keel');
  });

  it('hook entries declare type=command', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0].hooks[0].type).toBe('command');
  });

  it('preserves existing non-keel hook entries (user-owned)', async () => {
    const root = await tempDir();
    await mkdir(join(root, '.codex'), { recursive: true });
    await writeFile(
      join(root, '.codex/hooks.json'),
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
    const cfg = JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
    type Entry = { matcher?: string; _managedBy?: string; hooks: Array<{ command: string }> };
    const userEntry = (cfg.hooks.SessionStart as Entry[]).find((e) =>
      e.hooks.some((h) => h.command === 'user-custom-hook'),
    );
    const keelEntry = (cfg.hooks.SessionStart as Entry[]).find((e) => e._managedBy === 'keel');
    expect(userEntry).toBeDefined();
    expect(keelEntry).toBeDefined();
    const bashEntry = (cfg.hooks.PostToolUse as Entry[]).find((e) => e.matcher === 'Bash');
    expect(bashEntry).toBeDefined();
    expect(bashEntry?._managedBy).toBeUndefined();
  });

  it('preserves top-level non-hooks keys (forward-compat)', async () => {
    const root = await tempDir();
    await mkdir(join(root, '.codex'), { recursive: true });
    await writeFile(
      join(root, '.codex/hooks.json'),
      JSON.stringify({ somethingElse: 'preserve-me' }),
    );
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
    expect(cfg.somethingElse).toBe('preserve-me');
    expect(cfg.hooks.SessionStart).toBeDefined();
  });

  it('re-install is idempotent — no duplicate keel entries', async () => {
    const root = await tempDir();
    await installHooks(root);
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
    type Entry = { _managedBy?: string };
    const keelOnes = (cfg.hooks.SessionStart as Entry[]).filter((e) => e._managedBy === 'keel');
    expect(keelOnes).toHaveLength(1);
  });

  it('shim command can be overridden via opts.command', async () => {
    const root = await tempDir();
    await installHooks(root, { command: 'node /abs/shim.js hook' });
    const cfg = JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe('node /abs/shim.js hook');
  });

  it('settingsPath option overrides target file', async () => {
    const root = await tempDir();
    await installHooks(root, { settingsPath: 'custom-hooks.json' });
    const cfg = JSON.parse(await readFile(join(root, 'custom-hooks.json'), 'utf8'));
    expect(cfg.hooks.SessionStart).toBeDefined();
  });

  it('local=true emits absolute paths to local builds (no npx)', async () => {
    const root = await tempDir();
    await installHooks(root, { local: true });
    const cfg = JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
    const cmd = cfg.hooks.SessionStart[0].hooks[0].command;
    expect(cmd).not.toMatch(/npx /);
    expect(cmd).toMatch(/^node .+host-codex[\\/]dist[\\/]cli\.js hook /);
    expect(cmd).toMatch(/--keel "node .+core[\\/]dist[\\/]cli[\\/]index\.js"/);
  });

  it('local=true is overridden by explicit opts.command / opts.keelCommand', async () => {
    const root = await tempDir();
    await installHooks(root, {
      local: true,
      command: 'node /custom/shim.js hook',
      keelCommand: 'node /custom/keel.js',
    });
    const cfg = JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe(
      'node /custom/shim.js hook --keel "node /custom/keel.js"',
    );
  });
});
