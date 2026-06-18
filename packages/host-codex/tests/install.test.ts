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
  const d = await mkdtemp(join(tmpdir(), 'cadence-codex-'));
  cleanup.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

async function readHooks(root: string): Promise<any> {
  return JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
}

describe('installHooks (AC-1)', () => {
  it('AC-1: writes .codex/hooks.json with all six Codex events', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = await readHooks(root);
    for (const ev of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop']) {
      expect(cfg.hooks[ev]).toBeDefined();
    }
  });

  it('AC-1 (phase 119): rejects hooksPath outside the project root', async () => {
    const root = await tempDir();
    await expect(installHooks(root, { hooksPath: '../hooks.json' })).rejects.toThrow(
      /hooksPath must stay within the project root/,
    );
  });

  it('AC-1: PreToolUse/PostToolUse match apply_patch only', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = await readHooks(root);
    expect(cfg.hooks.PreToolUse[0].matcher).toBe('^apply_patch$');
    expect(cfg.hooks.PostToolUse[0].matcher).toBe('^apply_patch$');
    // Non-tool events carry no matcher.
    expect(cfg.hooks.SessionStart[0].matcher).toBeUndefined();
  });

  it('AC-1: entries are command hooks tagged _managedBy cadence', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = await readHooks(root);
    const entry = cfg.hooks.SessionStart[0];
    expect(entry._managedBy).toBe('cadence');
    expect(entry.hooks[0].type).toBe('command');
    expect(typeof entry.hooks[0].command).toBe('string');
    expect(entry.hooks[0].command.length).toBeGreaterThan(0);
  });

  it('AC-1: re-install is idempotent (no duplicate cadence entries)', async () => {
    const root = await tempDir();
    await installHooks(root);
    await installHooks(root);
    const cfg = await readHooks(root);
    expect(cfg.hooks.SessionStart).toHaveLength(1);
    expect(cfg.hooks.PostToolUse).toHaveLength(1);
  });

  it('AC-1: preserves a user-authored non-cadence entry on the same event', async () => {
    const root = await tempDir();
    await mkdir(join(root, '.codex'), { recursive: true });
    await writeFile(
      join(root, '.codex/hooks.json'),
      JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] } }),
    );
    await installHooks(root);
    const cfg = await readHooks(root);
    const commands = cfg.hooks.SessionStart.map((e: any) => e.hooks[0].command);
    expect(commands).toContain('echo hi'); // user's preserved
    expect(cfg.hooks.SessionStart.some((e: any) => e._managedBy === 'cadence')).toBe(true);
  });

  it('AC-4: --local embeds an absolute workspace core path', async () => {
    const root = await tempDir();
    await installHooks(root, { local: true });
    const cfg = await readHooks(root);
    // Platform-aware: the local core path is OS-native (POSIX `/` or Windows
    // `\` + drive letter), so match the `core/dist/cli/index.js` suffix with
    // either separator rather than assuming a POSIX leading slash.
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toMatch(
      /--cadence "node .+core[\\/]dist[\\/]cli[\\/]index\.js"/,
    );
  });

  it('honors an explicit --command override', async () => {
    const root = await tempDir();
    await installHooks(root, { command: 'node /abs/shim.js hook' });
    const cfg = await readHooks(root);
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe('node /abs/shim.js hook');
  });
});
