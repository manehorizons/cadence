import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Phase 189 — CONTRIBUTING.md scaffold. `cadence init` writes a
 * CONTRIBUTING.md at the repo root with a managed region delimited by these
 * markers, pointing the next teammate who clones the repo (with `.cadence/`
 * already committed) at `cadence onboard` for per-machine setup instead of
 * `cadence init` (which refuses once `.cadence/` exists). A CONTRIBUTING.md
 * with no markers is treated as fully user-owned and left untouched — same
 * merge contract as `claude-md-template.ts`, deliberately duplicated below
 * (not imported) because it targets a different file with different
 * content and no shared `--contributing-md` regeneration flag.
 */

export const MANAGED_START = '<!-- cadence:managed:start -->';
export const MANAGED_END = '<!-- cadence:managed:end -->';

export interface ContributingMdOptions {
  projectName: string;
}

/** The managed block (markers inclusive). */
export function renderManagedBlock(opts: ContributingMdOptions): string {
  return `${MANAGED_START}
## Onboarding (CADENCE)

This repo uses **CADENCE** — \`.cadence/\` is already committed. If you just
cloned ${opts.projectName}, run \`cadence onboard\` to install host hooks and
check provider readiness on your machine; do not run \`cadence init\`, which
refuses because \`.cadence/\` already exists.
${MANAGED_END}`;
}

// deja:new mirrors renderClaudeMd's shape by design (Phase 189 T3 spec: "mirror
// the writeClaudeMd/writeAgentsMd mergeManagedBlock pattern"), but renders a
// different target file (CONTRIBUTING.md, not CLAUDE.md) with unrelated
// content and no shared options shape (ContributingMdOptions has no
// gateProfile/preset/regenerateCommand) — importing renderClaudeMd would
// force an unrelated file's default-body shape onto this one.
/** Full default file when no CONTRIBUTING.md exists yet. */
export function renderContributingMd(opts: ContributingMdOptions): string {
  return `# Contributing to ${opts.projectName}

${renderManagedBlock(opts)}
`;
}

export type MergeMode = 'created' | 'regenerated' | 'preserved';

export interface MergeResult {
  content: string;
  mode: MergeMode;
}

// deja:new structurally mirrors claude-md-template.ts's mergeManagedBlock by
// design (same spec line above), but operates on ContributingMdOptions /
// renderContributingMd, a distinct type and renderer for a distinct file.
// Importing the CLAUDE.md version would couple CONTRIBUTING.md's merge
// contract to CLAUDE.md's option shape for no shared benefit — the two
// files evolve independently (e.g. CONTRIBUTING.md has no --agents-md-style
// sibling or regenerateCommand knob).
/**
 * Merge a fresh managed block into an existing CONTRIBUTING.md.
 *
 * - no existing file (empty/whitespace) → full render (`created`)
 * - both markers present → replace the inclusive span, keep prefix/suffix
 *   byte-for-byte (`regenerated`)
 * - content present but markers absent → return unchanged (`preserved`)
 */
export function mergeManagedBlock(
  existing: string | null,
  opts: ContributingMdOptions,
): MergeResult {
  if (existing === null || existing.trim().length === 0) {
    return { content: renderContributingMd(opts), mode: 'created' };
  }

  const startIdx = existing.indexOf(MANAGED_START);
  const endIdx = existing.indexOf(MANAGED_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { content: existing, mode: 'preserved' };
  }

  const prefix = existing.slice(0, startIdx);
  const suffix = existing.slice(endIdx + MANAGED_END.length);
  return {
    content: `${prefix}${renderManagedBlock(opts)}${suffix}`,
    mode: 'regenerated',
  };
}

/**
 * Merge the managed onboarding block into `<cwd>/CONTRIBUTING.md`, creating
 * the file if absent. Mirrors `writeClaudeMd`/`writeAgentsMd` in `init.ts`,
 * but — unlike those — owns its own read/write since it has no standalone
 * `--contributing-md` regeneration flag to share the merge helper with.
 */
export async function writeContributingMd(
  cwd: string,
  opts: ContributingMdOptions,
): Promise<MergeMode> {
  const path = join(cwd, 'CONTRIBUTING.md');
  const existing = existsSync(path) ? await readFile(path, 'utf8') : null;
  const merged = mergeManagedBlock(existing, opts);
  if (merged.mode !== 'preserved') {
    await writeFile(path, merged.content);
  }
  return merged.mode;
}
