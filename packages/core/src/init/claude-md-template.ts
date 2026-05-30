import type { Profile } from '@manehorizons/cadence-types';

/**
 * Phase 26.2 — CLAUDE.md scaffold. `cadence init` writes a CLAUDE.md at the
 * repo root with a managed region delimited by these markers. `cadence init
 * --claude-md` regenerates ONLY the managed region, preserving any content
 * the user added outside it. A CLAUDE.md with no markers is treated as
 * fully user-owned and left untouched.
 */

export const MANAGED_START = '<!-- cadence:managed:start -->';
export const MANAGED_END = '<!-- cadence:managed:end -->';

export interface ClaudeMdOptions {
  projectName: string;
  gateProfile: Profile;
  preset: string;
}

/** The managed block (markers inclusive). Regenerated verbatim by `--claude-md`. */
export function renderManagedBlock(opts: ClaudeMdOptions): string {
  return `${MANAGED_START}
## CADENCE

This project uses **CADENCE** — a disciplined draft → approve → build → settle
loop. Do not freelance multi-step work; run it through the loop.

- **Project:** ${opts.projectName}
- **Config preset:** ${opts.preset}
- **Gate profile:** ${opts.gateProfile} (gates scale with profile × tier — see DESIGN.md §4)

### Where state lives

- \`.cadence/ROADMAP.md\` — phases and milestones
- \`.cadence/STATE.md\` — current loop position, active draft/phase (derived; do not hand-edit)
- \`.cadence/phases/<phase>/\` — per-phase DRAFT / PROGRESS / SUMMARY
- \`DESIGN.md\` — architecture + the gate universe; project \`README.md\` — usage

### The loop

1. \`cadence draft new <phase> <num> --title=…\` — scaffold a DRAFT
2. edit the DRAFT (Objective, Acceptance Criteria, Tasks, Boundaries)
3. \`cadence draft approve <phase> <num>\` — coherence + gate checks, enter BUILD
4. \`cadence build task <id> --status=DONE\` — record each task
5. \`cadence settle run --auto\` — derive AC verdicts, write SUMMARY, return to IDLE

Run \`cadence progress\` anytime for the next suggested step. Regenerate this
block with \`cadence init --claude-md\`; edits outside the markers are kept.
${MANAGED_END}`;
}

/** Full default file when no CLAUDE.md exists yet. */
export function renderClaudeMd(opts: ClaudeMdOptions): string {
  return `# ${opts.projectName}

${renderManagedBlock(opts)}
`;
}

export type MergeMode = 'created' | 'regenerated' | 'preserved';

export interface MergeResult {
  content: string;
  mode: MergeMode;
}

/**
 * Merge a fresh managed block into an existing CLAUDE.md.
 *
 * - no existing file (empty/whitespace) → full render (`created`)
 * - both markers present → replace the inclusive span, keep prefix/suffix
 *   byte-for-byte (`regenerated`)
 * - content present but markers absent → return unchanged (`preserved`)
 */
export function mergeManagedBlock(
  existing: string | null,
  opts: ClaudeMdOptions,
): MergeResult {
  if (existing === null || existing.trim().length === 0) {
    return { content: renderClaudeMd(opts), mode: 'created' };
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
