import { runResume } from '../handoff/run-resume.js';
import { renderCandidateMenu } from '../handoff/pick.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence resume` as a service seam (phase 76) — read-only MCP adapter over
 * the shared `runResume` core. `data` is the full `ResumeResult` (found,
 * handoffPath, mode, doc, drift, context).
 */
export interface ResumeServiceArgs {
  mode?: 'brief' | 'full';
}

export async function resumeService(
  repoRoot: string,
  args: ResumeServiceArgs,
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const res = await runResume(repoRoot, args.mode ? { mode: args.mode } : {}, new Date(), io);
    if (!res.found) {
      if (res.candidates) {
        io.out(renderCandidateMenu(res.candidates));
        return { exitCode: 0, data: res };
      }
      io.out('resume: no handoff found — run `cadence handoff` to create one.\n');
      return { exitCode: 0, data: res };
    }
    if (res.drift) {
      io.out(
        `⚠ handoff written at ${res.drift.docLoopPosition}; live state now ${res.drift.liveLoopPosition}\n\n`,
      );
    }
    if (res.pickedSource === 'sibling') {
      io.out(`--- from sibling worktree: ${res.pickedWorktree} ---\n\n`);
    }
    io.out(`--- narrative from ${res.handoffPath} ---\n\n`);
    io.out(res.doc.endsWith('\n') ? res.doc : res.doc + '\n');
    if (res.pickedSource === 'sibling' && res.mode === 'full') {
      io.out(
        `\nlive context recompute skipped: ${res.pickedWorktree} is a different worktree — cd there and run \`cadence resume --full\` to get its live context\n`,
      );
    } else if (res.pickedSource === 'sibling' && res.mode === 'brief') {
      io.out(
        `\nbrief mode: ${res.pickedWorktree} is a different worktree — cd there and run \`cadence resume --full\` (or re-supply the same --pick/--path from there) to get its full doc + live context\n`,
      );
    }
    return { exitCode: 0, data: res };
  } catch (err) {
    io.err(`resume failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
