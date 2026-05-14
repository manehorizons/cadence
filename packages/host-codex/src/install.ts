import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { EDIT_TOOL_MATCHER } from './event-map.js';

export interface InstallOptions {
  /**
   * Shim command Codex invokes for every hook event. Default:
   * `npx @keel/host-codex hook`.
   */
  command?: string;
  /**
   * Base command the shim itself should use to invoke `@keel/core`.
   * If set, appended as `--keel "<cmd>"` to the shim command.
   */
  keelCommand?: string;
  /** Path to hooks file relative to root. Defaults to `.codex/hooks.json`. */
  settingsPath?: string;
}

interface HookEntry {
  matcher?: string;
  hooks: Array<{ type: 'command'; command: string }>;
  _managedBy?: string;
}

interface HooksFile {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

function isKeelEntry(entry: HookEntry): boolean {
  return entry._managedBy === 'keel';
}

export async function installHooks(root: string, opts: InstallOptions = {}): Promise<void> {
  const base = opts.command ?? 'npx @keel/host-codex hook';
  const command = opts.keelCommand ? `${base} --keel "${opts.keelCommand}"` : base;
  const settingsPath = join(root, opts.settingsPath ?? '.codex/hooks.json');

  let current: HooksFile = {};
  try {
    current = JSON.parse(await readFile(settingsPath, 'utf8')) as HooksFile;
  } catch {
    // file absent or malformed → start fresh
  }
  if (typeof current !== 'object' || current === null || Array.isArray(current)) current = {};

  const plain = (): HookEntry => ({
    hooks: [{ type: 'command', command }],
    _managedBy: 'keel',
  });

  const matched = (matcher: string): HookEntry => ({
    matcher,
    hooks: [{ type: 'command', command }],
    _managedBy: 'keel',
  });

  const desired: Record<string, HookEntry> = {
    SessionStart: plain(),
    UserPromptSubmit: plain(),
    PreToolUse: matched(EDIT_TOOL_MATCHER),
    PostToolUse: matched(EDIT_TOOL_MATCHER),
    Stop: plain(),
  };

  const hooks: Record<string, HookEntry[]> = current.hooks ?? {};

  for (const [codexEvent, entry] of Object.entries(desired)) {
    const existing = hooks[codexEvent] ?? [];
    const filtered = existing.filter((e) => !isKeelEntry(e));
    filtered.push(entry);
    hooks[codexEvent] = filtered;
  }

  current.hooks = hooks;

  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(current, null, 2) + '\n', 'utf8');
}
