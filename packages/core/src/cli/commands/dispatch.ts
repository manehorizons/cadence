import type { Command } from 'commander';
import { dispatchPlanService } from '../../services/dispatch.js';
import { processIO } from '../../services/io.js';

export function registerDispatchCommand(program: Command): void {
  const cmd = program
    .command('dispatch')
    .description('Compute wave-based subagent dispatch plans');

  cmd
    .command('plan')
    .description('Compute the next dispatch wave(s) from the active BUILD draft')
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      const args: { json?: boolean } = {};
      if (opts.json) args.json = true;
      const { exitCode } = await dispatchPlanService(process.cwd(), processIO(), args);
      if (exitCode) process.exitCode = exitCode;
    });
}
