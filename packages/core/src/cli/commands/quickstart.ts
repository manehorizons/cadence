import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SimpleStateBackend } from '../../state/simple.js';
import { resolveNextFreePhase } from '../../phases/next-free.js';
import { buildQuickstart, type QuickstartContext } from '../../quickstart/build.js';
import { renderText, renderJson } from '../../quickstart/render.js';
import { processIO, type CommandIO, type CommandResult } from '../../services/io.js';

/**
 * `cadence quickstart` — the read-only, never-failing front door. Detects whether
 * the repo is set up and prints a state-aware orientation. Post-init the "Next"
 * is the same move `cadence progress` gives (reused `nextAction`). Any gather
 * failure degrades to the uninitialized orientation — this is the first command
 * a newcomer runs, so it must never crash.
 */
export async function runQuickstart(
  root: string,
  args: { json?: boolean | undefined },
  io: CommandIO,
): Promise<CommandResult> {
  let ctx: QuickstartContext = { initialized: false };
  try {
    if (existsSync(join(root, '.cadence', 'state.json'))) {
      const state = await new SimpleStateBackend(root).readState();
      ctx = { initialized: true, state };
      if (state.loopPosition === 'IDLE') {
        const n = await resolveNextFreePhase(root);
        if (n !== null) ctx = { ...ctx, nextPhaseHint: n };
      }
    }
  } catch {
    // Never throw: fall back to the uninitialized orientation.
    ctx = { initialized: false };
  }

  const qs = buildQuickstart(ctx);
  if (args.json === true) {
    const data = renderJson(qs);
    io.out(JSON.stringify(data, null, 2) + '\n');
    return { exitCode: 0, data };
  }
  io.out(renderText(qs));
  return { exitCode: 0, data: { status: qs.status } };
}

export function registerQuickstartCommand(program: Command): void {
  program
    .command('quickstart')
    .description('Read-only front door: where you are + your next moves')
    .option('--json', 'emit the structured orientation as JSON')
    .action(async (opts: { json?: boolean }) => {
      const res = await runQuickstart(process.cwd(), { json: opts.json }, processIO());
      if (res.exitCode) process.exitCode = res.exitCode;
    });
}
