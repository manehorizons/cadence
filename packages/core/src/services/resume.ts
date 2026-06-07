import { runResume } from '../handoff/run-resume.js';
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
    const res = await runResume(repoRoot, args.mode ? { mode: args.mode } : {});
    if (!res.found) {
      io.out('resume: no handoff found — run `cadence handoff` to create one.\n');
      return { exitCode: 0, data: res };
    }
    if (res.drift) {
      io.out(
        `⚠ handoff written at ${res.drift.docLoopPosition}; live state now ${res.drift.liveLoopPosition}\n\n`,
      );
    }
    io.out(`--- narrative from ${res.handoffPath} ---\n\n`);
    io.out(res.doc.endsWith('\n') ? res.doc : res.doc + '\n');
    return { exitCode: 0, data: res };
  } catch (err) {
    io.err(`resume failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
