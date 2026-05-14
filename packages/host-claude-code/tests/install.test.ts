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
  const d = await mkdtemp(join(tmpdir(), 'keel-cc-'));
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

  it('PreToolUse/PostToolUse entries match edit tools only', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.PreToolUse[0].matcher).toBe('Edit|Write|MultiEdit|NotebookEdit');
    expect(cfg.hooks.PostToolUse[0].matcher).toBe('Edit|Write|MultiEdit|NotebookEdit');
  });

  it('commands invoke `<base> hook <event>` for the keel CLI', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe('npx @keel/core hook session-start');
    expect(cfg.hooks.UserPromptSubmit[0].hooks[0].command).toBe('npx @keel/core hook user-prompt');
    expect(cfg.hooks.PreToolUse[0].hooks[0].command).toBe('npx @keel/core hook pre-tool-edit');
    expect(cfg.hooks.PostToolUse[0].hooks[0].command).toBe('npx @keel/core hook post-tool-edit');
    expect(cfg.hooks.Stop[0].hooks[0].command).toBe('npx @keel/core hook session-stop');
    expect(cfg.hooks.SubagentStop[0].hooks[0].command).toBe('npx @keel/core hook subagent-result');
  });

  it('entries are tagged with _managedBy=keel', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0]._managedBy).toBe('keel');
    expect(cfg.hooks.PreToolUse[0]._managedBy).toBe('keel');
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

  it('replaces only keel-managed hook entries on re-install (idempotent)', async () => {
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
    const keelEntry = sessionStarts.find((e) => e._managedBy === 'keel');
    expect(userEntry).toBeDefined();
    expect(keelEntry).toBeDefined();
    const bashEntry = (cfg.hooks.PostToolUse as Entry[]).find((e) => e.matcher === 'Bash');
    expect(bashEntry).toBeDefined();
    expect(bashEntry?._managedBy).toBeUndefined();

    // Re-install should not duplicate keel entry.
    await installHooks(root);
    const cfg2 = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    const keelSessionStarts = (cfg2.hooks.SessionStart as Entry[]).filter(
      (e) => e._managedBy === 'keel',
    );
    expect(keelSessionStarts).toHaveLength(1);
    // User entry still preserved.
    const userStill = (cfg2.hooks.SessionStart as Entry[]).find((e) =>
      e.hooks.some((h) => h.command === 'user-custom-hook'),
    );
    expect(userStill).toBeDefined();
  });

  it('command can be overridden via opts.command', async () => {
    const root = await tempDir();
    await installHooks(root, { command: 'node /abs/keel.js' });
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe(
      'node /abs/keel.js hook session-start',
    );
  });
});
