import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SimpleStateBackend } from '../state/simple.js';
import { nextAction, type NextActionHints } from '../progress.js';
import { resolveNextFreePhase } from '../phases/next-free.js';
import { parseDraftMd } from '../parse/draft-parser.js';
import type { CommandIO, CommandResult } from './io.js';

interface ProgressJson {
  draftId: string;
  tasks: Record<string, { status: string }>;
}

/**
 * Phase 137 — best-effort first-pending-task lookup for the BUILD hint.
 * Returns `undefined` (not computable) on any missing/unreadable file, so
 * `nextAction` falls back to its pre-137 compound message rather than
 * blocking `cadence progress`.
 */
async function resolveBuildHint(
  repoRoot: string,
  phase: string,
  draftId: string,
): Promise<{ firstPendingTaskId: string | null } | undefined> {
  const draftPath = join(repoRoot, '.cadence', 'phases', phase, `${draftId}-DRAFT.md`);
  if (!existsSync(draftPath)) return undefined;
  try {
    const draft = parseDraftMd(await readFile(draftPath, 'utf8'));
    const progPath = join(repoRoot, '.cadence', 'phases', phase, `${draftId}-PROGRESS.json`);
    const progress: ProgressJson = existsSync(progPath)
      ? (JSON.parse(await readFile(progPath, 'utf8')) as ProgressJson)
      : { draftId, tasks: {} };
    const firstPending = draft.tasks.find((t) => progress.tasks[t.id] === undefined);
    return { firstPendingTaskId: firstPending?.id ?? null };
  } catch {
    return undefined;
  }
}

/**
 * `cadence progress` — the single recommended next action (read-only).
 * Returns `data: { command, reason }` for structured consumers.
 * `args.json` mirrors `--json` (same pattern as `recommendService`).
 */
export async function progressService(
  repoRoot: string,
  io: CommandIO,
  args: { json?: boolean } = {},
): Promise<CommandResult> {
  try {
    const backend = new SimpleStateBackend(repoRoot);
    const state = await backend.readState();
    // Only IDLE's and BUILD's suggestions need extra (best-effort) reads;
    // skip both entirely at every other loop position.
    let hints: NextActionHints | undefined;
    if (state.loopPosition === 'IDLE') {
      const n = await resolveNextFreePhase(repoRoot);
      if (n !== null) hints = { nextPhaseNumber: n };
    } else if (state.loopPosition === 'BUILD' && state.activePhase && state.activeDraft) {
      const build = await resolveBuildHint(repoRoot, state.activePhase, state.activeDraft);
      if (build !== undefined) hints = { build };
    }
    const action = nextAction(state, hints);
    const data = { command: action.command, reason: action.reason };
    if (args.json) {
      io.out(JSON.stringify(data) + '\n');
    } else {
      io.out(`Next: ${action.command}\n`);
      io.out(`Reason: ${action.reason}\n`);
    }
    return { exitCode: 0, data };
  } catch (err) {
    io.err(`progress failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
