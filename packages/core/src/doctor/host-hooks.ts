import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The pre-Phase-250 npm scope. A `_managedBy: "cadence"` hook entry whose
 * command still mentions it predates the `@manehorizons` → `@thomas-powers-jr`
 * rename and needs a fresh `install` run to pick up the current command
 * string (phase 250, AC-5).
 */
const STALE_NPM_SCOPE = '@manehorizons/';

/** True when a string anywhere in `value`'s subtree references {@link STALE_NPM_SCOPE}. */
function referencesStaleScope(value: unknown): boolean {
  if (typeof value === 'string') return value.includes(STALE_NPM_SCOPE);
  if (Array.isArray(value)) return value.some(referencesStaleScope);
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(referencesStaleScope);
  }
  return false;
}

/**
 * Deep-scan a parsed `.claude/settings.json` (or `.codex/hooks.json`) object
 * for any `_managedBy: "cadence"` entry — the marker the host adapter writes
 * on the lifecycle hooks it installs — with no regard for whether its command
 * is current. This is marker-presence only; most callers want
 * {@link hasManagedCadence}, which also rejects stale-scope entries.
 */
export function hasManagedCadenceMarker(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasManagedCadenceMarker);
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o['_managedBy'] === 'cadence') return true;
    return Object.values(o).some(hasManagedCadenceMarker);
  }
  return false;
}

/**
 * Deep-scan for a `_managedBy: "cadence"` entry whose own subtree still
 * references the stale, pre-rename `@manehorizons` npm scope (phase 250,
 * AC-5). Gated on the marker so an unrelated, user-authored mention of the
 * old scope elsewhere in the document never trips it — only a hook CADENCE
 * itself installed, but hasn't reinstalled since the rename, counts.
 */
export function hasStaleScopeManagedHook(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasStaleScopeManagedHook);
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o['_managedBy'] === 'cadence' && referencesStaleScope(o)) return true;
    return Object.values(o).some(hasStaleScopeManagedHook);
  }
  return false;
}

/**
 * Whether `value` carries a CADENCE-managed hook entry that is both present
 * AND current — i.e. {@link hasManagedCadenceMarker} is true and
 * {@link hasStaleScopeManagedHook} is false anywhere in the document. Shared
 * by `doctor`'s `checkHostHooks`/`checkCodexHooks` and the `config explain`
 * gather so the three never drift.
 *
 * Phase 250 (AC-5): a managed marker alone is no longer sufficient — an
 * entry installed before the npm-scope rename still carries
 * `_managedBy: "cadence"` but its `command` string invokes the old
 * `@manehorizons`-scoped package. That entry is stale, not properly managed,
 * so it no longer counts here. Composed at the whole-document level (not
 * folded into a single per-entry check) so that even one stale entry among
 * several managed entries is enough to report "not managed" — a real
 * install always rewrites every managed entry with the same command
 * (`host-claude-code/src/install.ts`), so a mixed document shouldn't occur
 * in practice, but this stays correct if it ever does. `doctor`'s existing
 * `host-install`/`codex-host-install` repair (`packages/core/src/doctor/fix.ts`)
 * already re-runs install and rewrites the command once this predicate
 * reports `false` — no change needed there.
 */
export function hasManagedCadence(value: unknown): boolean {
  return hasManagedCadenceMarker(value) && !hasStaleScopeManagedHook(value);
}

/**
 * Best-effort: whether the Claude Code adapter's CADENCE-managed hook entries
 * are present AND current (not stale-scope, per phase 250's AC-5) in
 * `<root>/.claude/settings.json`. Returns `false` on an absent, unreadable,
 * invalid-JSON, or stale-scope-only file — never throws. (Callers that need
 * to distinguish *invalid JSON* from *no marker* — like `doctor` — read the file
 * themselves and reuse {@link hasManagedCadence}.)
 */
export async function hostHooksInstalled(root: string): Promise<boolean> {
  const settings = join(root, '.claude', 'settings.json');
  if (!existsSync(settings)) return false;
  try {
    return hasManagedCadence(JSON.parse(await readFile(settings, 'utf8')));
  } catch {
    return false;
  }
}
