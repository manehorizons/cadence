import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CLAUDE_CODE_EXPECTED_HOOKS } from '../../src/doctor/host-hooks.js';

const DEFAULT_COMMAND = 'npx @thomas-powers-jr/cadence-host-claude-code hook';

/** Per-entry override for {@link completeManagedHooksObject}: identify the
 *  expected `(event, matcher)` pair, then either give it a different
 *  `command` string (e.g. a stale-scope one) or `omit` it entirely. */
export interface HookOverride {
  event: string;
  matcher: string | null;
  command?: string;
  omit?: boolean;
}

/**
 * Builds a `.claude/settings.json`-shaped `hooks` object with every managed
 * entry `CLAUDE_CODE_EXPECTED_HOOKS` expects, present and current by
 * default (phase 295, AC-3's "complete install" fixture) — this is the
 * fixture-builder the doctor test suite's previously-minimal single-entry
 * fixtures now need, since a lone entry is no longer a complete install
 * under the completeness check. `overrides` lets one test swap a single
 * entry's command (stale-scope) or omit it (an incomplete-install fixture,
 * e.g. AC-1's measured-shape reproduction).
 */
export function completeManagedHooksObject(
  overrides: readonly HookOverride[] = [],
  command = DEFAULT_COMMAND,
): Record<string, unknown[]> {
  const hooks: Record<string, unknown[]> = {};
  for (const exp of CLAUDE_CODE_EXPECTED_HOOKS) {
    const override = overrides.find((o) => o.event === exp.event && o.matcher === exp.matcher);
    if (override?.omit) continue;
    const entry: Record<string, unknown> = {
      hooks: [{ type: 'command', command: override?.command ?? command }],
      _managedBy: 'cadence',
    };
    if (exp.matcher !== null) entry.matcher = exp.matcher;
    (hooks[exp.event] ??= []).push(entry);
  }
  return hooks;
}

/**
 * Writes a complete (by default) managed `.claude/settings.json` to `root`.
 * `extraEntries` appends additional, non-managed entries per event —
 * mirrors this repo's real third-party hooks (`deja hook *`) for AC-4's
 * "non-managed entries are untouched and unreported" proof.
 */
export async function writeCompleteManagedSettings(
  root: string,
  overrides: readonly HookOverride[] = [],
  extraEntries: Record<string, unknown[]> = {},
): Promise<void> {
  const hooks = completeManagedHooksObject(overrides);
  for (const [event, entries] of Object.entries(extraEntries)) {
    (hooks[event] ??= []).push(...entries);
  }
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(join(root, '.claude', 'settings.json'), JSON.stringify({ hooks }));
}
