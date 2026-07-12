import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
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

  // Task 7 (Phase 158) — SubagentStart wiring.
  it('writes a SubagentStart hook entry', async () => {
    const root = await tempDir();
    await installHooks(root);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.SubagentStart).toHaveLength(1);
    expect(cfg.hooks.SubagentStart[0]._managedBy).toBe('cadence');
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

  // AC-1 (Phase 171) — malformed settings.json must never be silently
  // discarded/overwritten. Regression test for the deja-hooks-wiped incident
  // (31f1351 / PR #170): a JSON.parse failure on an existing file used to
  // reset `current` to `{}` and write a fresh cadence-only config over it,
  // destroying any third-party content that happened to be present.
  it('AC-1: refuses to touch settings.json that is malformed (parse failure), leaving raw content byte-for-byte unchanged', async () => {
    const root = await tempDir();
    await mkdir(join(root, '.claude'), { recursive: true });

    // Start from a plausible real settings.json containing a recognizable
    // third-party (non-cadence) hook entry...
    const validWithThirdParty = JSON.stringify({
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: 'some-other-tool' }] },
        ],
      },
    });
    // ...then corrupt it (truncate) so JSON.parse throws — simulating the
    // on-disk malformed-JSON state that triggered the real incident.
    const malformed = validWithThirdParty.slice(0, -1);
    expect(() => JSON.parse(malformed)).toThrow();

    const settingsPath = join(root, '.claude/settings.json');
    await writeFile(settingsPath, malformed, 'utf8');

    const before = await readFile(settingsPath, 'utf8');
    expect(before).toBe(malformed);

    // installHooks must refuse (throw) rather than silently overwrite.
    await expect(installHooks(root)).rejects.toThrow(/not valid JSON/);

    const after = await readFile(settingsPath, 'utf8');
    // installHooks must refuse to write over a malformed settings.json —
    // the raw bytes on disk must be exactly what they were before the call.
    expect(after).toBe(before);
  });

  // AC-4 (Phase 171) — existing successful-parse merge behavior (preserving
  // third-party/non-cadence keys and hooks) must be unaffected by the T2/T3
  // refusal + backup/atomic-write changes. Also confirms the T3 backup
  // exists and contains the ORIGINAL pre-install bytes, and that no leftover
  // temp file is left behind after a successful call.
  it('AC-4: preserves third-party hook entries on a valid install AND writes a backup of the original content AND leaves no leftover tmp file', async () => {
    const root = await tempDir();
    await mkdir(join(root, '.claude'), { recursive: true });
    const settingsPath = join(root, '.claude/settings.json');

    const original = JSON.stringify(
      {
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: 'third-party-tool --flag' }] },
          ],
        },
        someThirdPartyKey: 'keep-me',
      },
      null,
      2,
    );
    await writeFile(settingsPath, original, 'utf8');

    await installHooks(root);

    // (a) third-party entry still present (existing merge-preserve behavior, unchanged).
    const cfg = JSON.parse(await readFile(settingsPath, 'utf8'));
    expect(cfg.someThirdPartyKey).toBe('keep-me');
    type Entry = { hooks: Array<{ command: string }>; _managedBy?: string };
    const thirdPartyEntry = (cfg.hooks.SessionStart as Entry[]).find((e) =>
      e.hooks.some((h) => h.command === 'third-party-tool --flag'),
    );
    expect(thirdPartyEntry).toBeDefined();
    // Cadence entry was also added alongside it.
    const cadenceEntry = (cfg.hooks.SessionStart as Entry[]).find(
      (e) => e._managedBy === 'cadence',
    );
    expect(cadenceEntry).toBeDefined();

    // (b) a backup matching settings.json.bak-* exists and holds the
    // ORIGINAL pre-install content byte-for-byte.
    const dirEntries = await readdir(join(root, '.claude'));
    const backupNames = dirEntries.filter((name) => name.startsWith('settings.json.bak-'));
    expect(backupNames).toHaveLength(1);
    const backupContent = await readFile(join(root, '.claude', backupNames[0] as string), 'utf8');
    expect(backupContent).toBe(original);

    // (c) no leftover settings.json.tmp-* file remains after success.
    const tmpNames = dirEntries.filter((name) => name.startsWith('settings.json.tmp-'));
    expect(tmpNames).toHaveLength(0);
  });

  // AC-2 (Phase 171) — ENOENT (no settings.json yet) must still create a
  // fresh file with the cadence-managed hooks; the T2 malformed-JSON refusal
  // must not regress the absent-file path.
  it('AC-2: ENOENT (no prior settings.json) still creates a fresh settings file with cadence hooks', async () => {
    const root = await tempDir();
    await installHooks(root);

    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0]._managedBy).toBe('cadence');
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe(
      'npx @manehorizons/cadence-host-claude-code hook',
    );
  });

  // AC-3 (Phase 171) — the ENOENT / fresh-install path has nothing to back
  // up, so no `.bak-*` file should be created.
  it('AC-3: a fresh install with no prior settings.json creates no backup file', async () => {
    const root = await tempDir();
    await installHooks(root);

    const dirEntries = await readdir(join(root, '.claude'));
    const backupNames = dirEntries.filter((name) => name.startsWith('settings.json.bak-'));
    expect(backupNames).toHaveLength(0);
    const tmpNames = dirEntries.filter((name) => name.startsWith('settings.json.tmp-'));
    expect(tmpNames).toHaveLength(0);
    // Sanity: the settings file itself was still created (AC-2, unaffected).
    expect(dirEntries).toContain('settings.json');
  });
});
