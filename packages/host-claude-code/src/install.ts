import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isCadenceManagedEntry, mergeManagedHookEntries } from '@thomas-powers-jr/cadence-host-toolkit/install-merge';
import type { ManagedHookEntry } from '@thomas-powers-jr/cadence-host-toolkit/install-merge';
import { CLAUDE_CODE_EXPECTED_HOOKS } from '@thomas-powers-jr/cadence-host-toolkit';
import { resolveLocalPaths } from './locate-self.js';

export interface InstallOptions {
  /**
   * Shim command that Claude Code invokes for every hook event. The shim
   * reads stdin, translates payloads, and spawns the core CLI.
   * Default: `npx @thomas-powers-jr/cadence-host-claude-code hook`.
   */
  command?: string;
  /**
   * Base command the shim itself should use to invoke `@thomas-powers-jr/cadence-core`.
   * If set, appended as `--cadence "<cmd>"` to the shim command.
   * Default: shim's own default (`npx @thomas-powers-jr/cadence-core`).
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

type HookEntry = ManagedHookEntry;

interface SettingsShape {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
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
    opts.command ?? (local ? `node ${local.shimCli} hook` : 'npx @thomas-powers-jr/cadence-host-claude-code hook');
  const cadenceCommand = opts.cadenceCommand ?? (local ? `node ${local.coreCli}` : undefined);
  const command = cadenceCommand ? `${base} --cadence "${cadenceCommand}"` : base;
  const settingsPath = join(root, opts.settingsPath ?? '.claude/settings.json');

  let current: SettingsShape = {};
  let raw: string | undefined;
  try {
    raw = await readFile(settingsPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // file absent → start fresh, same as today's fresh-install behavior
      raw = undefined;
    } else {
      throw new Error(
        `Refusing to install: ${settingsPath} could not be read (${(err as Error).message}). ` +
          `Fix or remove the file manually before re-running install.`,
      );
    }
  }
  if (raw !== undefined) {
    try {
      current = JSON.parse(raw) as SettingsShape;
    } catch {
      throw new Error(
        `Refusing to install: ${settingsPath} exists but is not valid JSON. ` +
          `Fix or remove the file manually before re-running install.`,
      );
    }
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

  // Phase 295: built from CLAUDE_CODE_EXPECTED_HOOKS, the single source of
  // truth also pinned against core's independent copy by a drift test
  // (packages/host-claude-code/tests/expected-hooks-drift.test.ts) — this
  // installer and cadence doctor's completeness check must not disagree
  // about what "fully installed" means. Phase 23.4's original two-entry
  // PostToolUse shape (edit tools + the Skill tool) is expressed as two
  // list entries sharing one event key.
  const desired: Record<string, HookEntry[]> = {};
  for (const { event, matcher } of CLAUDE_CODE_EXPECTED_HOOKS) {
    (desired[event] ??= []).push(matcher === null ? plain() : matched(matcher));
  }

  current.hooks = mergeManagedHookEntries(
    current.hooks ?? {},
    desired,
    (e) => isCadenceManagedEntry(e) || isLegacyKeelEntry(e),
  );

  await mkdir(dirname(settingsPath), { recursive: true });

  // Phase 171 — before overwriting a prior settings file, preserve it under a
  // timestamped backup path. `raw !== undefined` here means the file existed
  // AND parsed as valid JSON above (malformed JSON already threw earlier), so
  // this is the only case where a prior file's content could be clobbered.
  if (raw !== undefined) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${settingsPath}.bak-${timestamp}`;
    await writeFile(backupPath, raw, 'utf8');
  }

  // Write atomically: stage the new content in a temp file in the same
  // directory, then rename it over the real path. `rename` on the same
  // filesystem is atomic, so a crash mid-write never leaves `settingsPath`
  // truncated or partially written.
  const tempPath = `${settingsPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, JSON.stringify(current, null, 2) + '\n', 'utf8');
  await rename(tempPath, settingsPath);
}
