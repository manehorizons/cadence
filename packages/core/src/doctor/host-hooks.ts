import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Deep-scan a parsed `.claude/settings.json` object for any
 * `_managedBy: "cadence"` entry — the marker the host adapter writes on the
 * lifecycle hooks it installs. Shared by `doctor`'s `checkHostHooks` and the
 * `config explain` gather so the two never drift.
 */
export function hasManagedCadence(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasManagedCadence);
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o['_managedBy'] === 'cadence') return true;
    return Object.values(o).some(hasManagedCadence);
  }
  return false;
}

/**
 * Best-effort: whether the Claude Code adapter's CADENCE-managed hook entries
 * are present in `<root>/.claude/settings.json`. Returns `false` on an absent,
 * unreadable, or invalid-JSON file — never throws. (Callers that need to
 * distinguish *invalid JSON* from *no marker* — like `doctor` — read the file
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
