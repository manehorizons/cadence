import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { EDIT_TOOL_MATCHER, SKILL_TOOL_MATCHER } from './event-map.js';
import { resolveLocalPaths } from './locate-self.js';
import { resolveProjectPath } from './safe-path.js';

export interface InstallOptions {
  /**
   * Shim command that Claude Code invokes for every hook event. The shim
   * reads stdin, translates payloads, and spawns the core CLI.
   * Default: `npx @manehorizons/cadence-host-claude-code hook`.
   */
  command?: string;
  /**
   * Base command the shim itself should use to invoke `@manehorizons/cadence-core`.
   * If set, appended as `--cadence "<cmd>"` to the shim command.
   * Default: shim's own default (`npx @manehorizons/cadence-core`).
   */
  cadenceCommand?: string;
  /** Path to settings file relative to root. Defaults to `.claude/settings.json`. */
  settingsPath?: string;
  /**
   * Use absolute paths to the local workspace builds instead of `npx`-style
   * defaults. Intended for monorepo dogfood before the package is published.
   */
  local?: boolean;
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

function isCadenceEntry(entry: HookEntry): boolean {
  return entry._managedBy === 'cadence';
}

/**
 * Pre-Phase-12 installs tagged entries with `_managedBy: 'keel'`. Phase 18.1
 * evicts those on re-install so the rename completes operationally and old
 * `@keel/host-claude-code` shim invocations stop firing.
 */
function isLegacyKeelEntry(entry: HookEntry): boolean {
  return entry._managedBy === 'keel';
}

export async function installHooks(root: string, opts: InstallOptions = {}): Promise<void> {
  const local = opts.local ? resolveLocalPaths() : null;
  const base =
    opts.command ?? (local ? `node ${local.shimCli} hook` : 'npx @manehorizons/cadence-host-claude-code hook');
  const cadenceCommand = opts.cadenceCommand ?? (local ? `node ${local.coreCli}` : undefined);
  const command = cadenceCommand ? `${base} --cadence "${cadenceCommand}"` : base;
  const settingsPath = resolveProjectPath(
    root,
    opts.settingsPath ?? '.claude/settings.json',
    'settingsPath',
  );

  let current: SettingsShape = {};
  try {
    current = JSON.parse(await readFile(settingsPath, 'utf8')) as SettingsShape;
  } catch {
    // file absent or malformed → start fresh
  }
  if (typeof current !== 'object' || current === null || Array.isArray(current)) current = {};

  const plain = (): HookEntry => ({
    hooks: [{ type: 'command', command }],
    _managedBy: 'cadence',
  });

  const matched = (matcher: string): HookEntry => ({
    matcher,
    hooks: [{ type: 'command', command }],
    _managedBy: 'cadence',
  });

  // Phase 23.4 — PostToolUse has two cadence-managed entries: one for edit
  // tools (post-tool-edit abstract) and one for the Skill tool (skill-invoke).
  const desired: Record<string, HookEntry[]> = {
    SessionStart: [plain()],
    UserPromptSubmit: [plain()],
    PreToolUse: [matched(EDIT_TOOL_MATCHER)],
    PostToolUse: [matched(EDIT_TOOL_MATCHER), matched(SKILL_TOOL_MATCHER)],
    Stop: [plain()],
    SubagentStop: [plain()],
  };

  const hooks: Record<string, HookEntry[]> = current.hooks ?? {};

  for (const [ccEvent, entries] of Object.entries(desired)) {
    const existing = hooks[ccEvent] ?? [];
    const filtered = existing.filter(
      (e) => !isCadenceEntry(e) && !isLegacyKeelEntry(e),
    );
    filtered.push(...entries);
    hooks[ccEvent] = filtered;
  }

  current.hooks = hooks;

  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(current, null, 2) + '\n', 'utf8');
}
