import { runRecommend } from '../intelligence/recommend.js';
import { renderRecommendMd } from '../intelligence/render-recommend.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence recommend` — ranked strategic recommendations (read-only).
 * `json: true` mirrors `--json`. `data` is the recommend report either way.
 */
export async function recommendService(
  repoRoot: string,
  args: { json?: boolean },
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const report = await runRecommend(repoRoot);
    if (args.json) {
      io.out(JSON.stringify(report) + '\n');
    } else {
      io.out(renderRecommendMd(report));
    }
    return { exitCode: 0, data: report };
  } catch (err) {
    io.err(`recommend failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
