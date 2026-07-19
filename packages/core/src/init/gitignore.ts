import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Phase 196 (issue #177) — CADENCE-owned ephemeral state that must never be
 * a tracked file: per-worktree loop position (`state.json`/`STATE.md`),
 * local trust decisions (`mcp-trust.json`), and the intelligence scratch
 * cache. Tracking any of these guarantees a real git merge conflict the
 * moment two CADENCE worktrees on different phases sync. See
 * docs/concepts.md.
 */
export const CADENCE_OWNED_GITIGNORE_ENTRIES: readonly string[] = [
  '.cadence/state.json',
  '.cadence/STATE.md',
  '.cadence/mcp-trust.json',
  '.cadence/intelligence/context/',
] as const;

const GITIGNORE_HEADER = '# cadence-owned ephemeral state (see docs/concepts.md)';

/**
 * Pure planner: given the current contents of a `.gitignore` file, return
 * only the CADENCE-owned entries that are not already present as an exact
 * line. Returns `[]` when all four are already present (idempotent).
 */
export function planGitignoreEntries(existingContent: string): string[] {
  const existingLines = new Set(existingContent.split('\n'));
  return CADENCE_OWNED_GITIGNORE_ENTRIES.filter((entry) => !existingLines.has(entry));
}

/**
 * Impure writer: ensure `<root>/.gitignore` contains all four CADENCE-owned
 * entries, appending only what's missing behind a header comment. No-op
 * (no write) when everything is already present.
 */
export async function ensureGitignoreEntries(root: string): Promise<void> {
  const path = join(root, '.gitignore');
  let existingContent: string;
  try {
    existingContent = await readFile(path, 'utf8');
  } catch {
    existingContent = '';
  }

  const missing = planGitignoreEntries(existingContent);
  if (missing.length === 0) {
    return;
  }

  const needsLeadingNewline = existingContent.length > 0 && !existingContent.endsWith('\n');
  const prefix = needsLeadingNewline ? existingContent + '\n' : existingContent;
  const block = [GITIGNORE_HEADER, ...missing].join('\n');
  const nextContent = prefix + block + '\n';

  await writeFile(path, nextContent);
}
