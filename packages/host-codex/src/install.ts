import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { EDIT_TOOL_MATCHER } from './event-map.js';
import { resolveLocalPaths } from './locate-self.js';

export interface InstallOptions {
  /**
   * Shim command Codex invokes for every hook event. The shim reads stdin,
   * translates the payload, and spawns the core CLI.
   * Default: `npx @manehorizons/cadence-host-codex hook`.
   */
  command?: string;
  /**
   * Base command the shim itself uses to invoke `@manehorizons/cadence-core`.
   * If set, appended as `--cadence "<cmd>"`. Default: the shim's own default.
   */
  cadenceCommand?: string;
  /** Hook config path relative to root. Default `.codex/hooks.json`. */
  hooksPath?: string;
  /**
   * Use absolute paths to the local workspace builds instead of the `npx`
   * defaults. Monorepo dogfood only — writes machine-absolute paths.
   */
  local?: boolean;
}

// Codex's apply_patch is the sole edit tool; the matcher is applied to
// `tool_name` for Pre/PostToolUse, anchored so it matches only apply_patch.
const PATCH_MATCHER = `^${EDIT_TOOL_MATCHER}$`;

interface HookEntry {
  matcher?: string;
  hooks: Array<{ type: 'command'; command: string }>;
  _managedBy?: string;
}

interface HooksFile {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

const isCadenceEntry = (e: HookEntry): boolean => e._managedBy === 'cadence';

/**
 * Write cadence-managed Codex hook entries into project-level
 * `{root}/.codex/hooks.json` (FINDINGS §3). Idempotent: cadence-managed entries
 * are replaced on re-install; user-authored entries on the same event are
 * preserved. Hooks are project-scoped — unlike the global slash-command prompts.
 */
export async function installHooks(root: string, opts: InstallOptions = {}): Promise<void> {
  const local = opts.local ? resolveLocalPaths() : null;
  const base = opts.command ?? (local ? `node ${local.shimCli} hook` : 'npx @manehorizons/cadence-host-codex hook');
  const cadenceCommand = opts.cadenceCommand ?? (local ? `node ${local.coreCli}` : undefined);
  const command = cadenceCommand ? `${base} --cadence "${cadenceCommand}"` : base;
  const hooksPath = join(root, opts.hooksPath ?? '.codex/hooks.json');

  let current: HooksFile = {};
  try {
    current = JSON.parse(await readFile(hooksPath, 'utf8')) as HooksFile;
  } catch {
    // absent or malformed → start fresh
  }
  if (typeof current !== 'object' || current === null || Array.isArray(current)) current = {};

  const plain = (): HookEntry => ({ hooks: [{ type: 'command', command }], _managedBy: 'cadence' });
  const matched = (matcher: string): HookEntry => ({
    matcher,
    hooks: [{ type: 'command', command }],
    _managedBy: 'cadence',
  });

  const desired: Record<string, HookEntry[]> = {
    SessionStart: [plain()],
    UserPromptSubmit: [plain()],
    PreToolUse: [matched(PATCH_MATCHER)],
    PostToolUse: [matched(PATCH_MATCHER)],
    Stop: [plain()],
    SubagentStop: [plain()],
  };

  const hooks: Record<string, HookEntry[]> = current.hooks ?? {};
  for (const [event, entries] of Object.entries(desired)) {
    const kept = (hooks[event] ?? []).filter((e) => !isCadenceEntry(e));
    kept.push(...entries);
    hooks[event] = kept;
  }
  current.hooks = hooks;

  await mkdir(dirname(hooksPath), { recursive: true });
  await writeFile(hooksPath, JSON.stringify(current, null, 2) + '\n', 'utf8');
}
