// packages/core/src/handoff/candidates.ts
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { HandoffCandidate } from '@manehorizons/cadence-types';
import { gitBestEffort, listSiblingWorktrees } from '../git/worktrees.js';
import { SimpleStateBackend } from '../state/simple.js';
import { locateFreshestHandoff, readKey } from './locate.js';

export interface HandoffMeta {
  generatedAt: string | null;
  label: string | null;
  loopPosition: string | null;
  activePhase: string | null;
  gitBranch: string | null;
  tier: string | null;
}

export function parseHandoffMeta(content: string): HandoffMeta {
  return {
    generatedAt: readKey(content, 'generated_at'),
    label: readKey(content, 'label'),
    loopPosition: readKey(content, 'loop_position'),
    activePhase: readKey(content, 'active_phase'),
    gitBranch: readKey(content, 'git_branch'),
    tier: readKey(content, 'tier'),
  };
}

/** Live current branch for the LOCAL worktree (siblings get theirs straight
 *  from `listSiblingWorktrees`'s porcelain scan). Never the doc's own
 *  `git_branch:` frontmatter, which is a snapshot from write-time and can go
 *  stale if the worktree is later moved/renamed/switched. */
async function localBranch(repoRoot: string): Promise<string | null> {
  const branch = (await gitBestEffort(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  return branch && branch !== 'HEAD' ? branch : null;
}

async function gatherLocalCandidate(repoRoot: string): Promise<HandoffCandidate | null> {
  try {
    let lastHandoff: string | null = null;
    let liveLoopPosition: string | null = null;
    try {
      const state = await new SimpleStateBackend(repoRoot).readState();
      lastHandoff = state.session.lastHandoff;
      liveLoopPosition = state.loopPosition;
    } catch {
      // Corrupt/missing local state degrades to null/null, matching
      // run-resume.ts — locateFreshestHandoff still works via directory glob.
    }

    const located = await locateFreshestHandoff(repoRoot, lastHandoff);
    if (!located) return null;

    const meta = parseHandoffMeta(located.content);
    return {
      path: located.path,
      fileName: basename(located.path),
      source: 'local',
      worktreePath: repoRoot,
      worktreeBranch: await localBranch(repoRoot),
      generatedAt: meta.generatedAt,
      label: meta.label,
      loopPosition: meta.loopPosition,
      activePhase: meta.activePhase,
      liveLoopPosition,
    };
  } catch {
    // Last-resort safety net: anything beyond the state read (e.g.
    // locateFreshestHandoff hitting EACCES/a TOCTOU race, or localBranch
    // throwing) must still degrade to "drop this worktree", not reject the
    // Promise.all in gatherHandoffCandidates and take sibling results with it.
    return null;
  }
}

/** Sibling state is read raw, never via `SimpleStateBackend` — a foreign
 *  worktree can be on an older/different schema and we only need one field,
 *  so a Zod-validating reader would throw for no benefit. */
async function readSiblingState(
  siblingPath: string,
): Promise<{ lastHandoff: string | null; loopPosition: string | null }> {
  try {
    const raw = await readFile(join(siblingPath, '.cadence', 'state.json'), 'utf8');
    const parsed = JSON.parse(raw) as {
      session?: { lastHandoff?: unknown };
      loopPosition?: unknown;
    };
    const lastHandoff =
      typeof parsed.session?.lastHandoff === 'string' ? parsed.session.lastHandoff : null;
    const loopPosition = typeof parsed.loopPosition === 'string' ? parsed.loopPosition : null;
    return { lastHandoff, loopPosition };
  } catch {
    return { lastHandoff: null, loopPosition: null };
  }
}

async function gatherSiblingCandidate(
  siblingPath: string,
  branch: string | null,
): Promise<HandoffCandidate | null> {
  try {
    const { lastHandoff, loopPosition } = await readSiblingState(siblingPath);
    const located = await locateFreshestHandoff(siblingPath, lastHandoff);
    if (!located) return null;

    const meta = parseHandoffMeta(located.content);
    return {
      path: located.path,
      fileName: basename(located.path),
      source: 'sibling',
      worktreePath: siblingPath,
      worktreeBranch: branch,
      generatedAt: meta.generatedAt,
      label: meta.label,
      loopPosition: meta.loopPosition,
      activePhase: meta.activePhase,
      liveLoopPosition: loopPosition,
    };
  } catch {
    return null;
  }
}

async function gatherSiblingCandidates(repoRoot: string): Promise<HandoffCandidate[]> {
  const siblings = await listSiblingWorktrees(repoRoot);
  const results = await Promise.all(
    siblings.map((s) => gatherSiblingCandidate(s.path, s.branch)),
  );
  return results.filter((c): c is HandoffCandidate => c !== null);
}

/**
 * Best-effort cross-worktree handoff discovery: the local worktree's freshest
 * handoff doc plus every sibling worktree's freshest doc, ranked newest-first
 * by `generatedAt`. Never throws — any per-worktree failure (missing/corrupt
 * state, no handoff dir, a vanished ghost worktree entry) just drops that
 * worktree from the result.
 */
export async function gatherHandoffCandidates(repoRoot: string): Promise<HandoffCandidate[]> {
  const [local, siblings] = await Promise.all([
    gatherLocalCandidate(repoRoot),
    gatherSiblingCandidates(repoRoot),
  ]);
  const all = [local, ...siblings].filter((c): c is HandoffCandidate => c !== null);
  return all.sort((a, b) => (b.generatedAt ?? '').localeCompare(a.generatedAt ?? ''));
}
