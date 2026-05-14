import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { EDIT_TOOL_MATCHER } from './event-map.js';

export interface InstallOptions {
  /** Base command before `hook <event>`. Defaults to `npx @keel/core`. */
  command?: string;
  /** Path to settings file relative to root. Defaults to `.claude/settings.json`. */
  settingsPath?: string;
}

interface HookEntry {
  matcher?: string;
  hooks: Array<{ type: 'command'; command: string }>;
  _managedBy?: string;
}

interface SettingsShape {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

function isKeelEntry(entry: HookEntry): boolean {
  return entry._managedBy === 'keel';
}

export async function installHooks(root: string, opts: InstallOptions = {}): Promise<void> {
  const base = opts.command ?? 'npx @keel/core';
  const settingsPath = join(root, opts.settingsPath ?? '.claude/settings.json');

  let current: SettingsShape = {};
  try {
    current = JSON.parse(await readFile(settingsPath, 'utf8')) as SettingsShape;
  } catch {
    // file absent or malformed → start fresh
  }
  if (typeof current !== 'object' || current === null || Array.isArray(current)) current = {};

  const keelEntry = (event: string): HookEntry => ({
    hooks: [{ type: 'command', command: `${base} hook ${event}` }],
    _managedBy: 'keel',
  });

  const keelEntryMatched = (event: string, matcher: string): HookEntry => ({
    matcher,
    hooks: [{ type: 'command', command: `${base} hook ${event}` }],
    _managedBy: 'keel',
  });

  const desired: Record<string, HookEntry> = {
    SessionStart: keelEntry('session-start'),
    UserPromptSubmit: keelEntry('user-prompt'),
    PreToolUse: keelEntryMatched('pre-tool-edit', EDIT_TOOL_MATCHER),
    PostToolUse: keelEntryMatched('post-tool-edit', EDIT_TOOL_MATCHER),
    Stop: keelEntry('session-stop'),
    SubagentStop: keelEntry('subagent-result'),
  };

  const hooks: Record<string, HookEntry[]> = current.hooks ?? {};

  for (const [ccEvent, entry] of Object.entries(desired)) {
    const existing = hooks[ccEvent] ?? [];
    const filtered = existing.filter((e) => !isKeelEntry(e));
    filtered.push(entry);
    hooks[ccEvent] = filtered;
  }

  current.hooks = hooks;

  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(current, null, 2) + '\n', 'utf8');
}
