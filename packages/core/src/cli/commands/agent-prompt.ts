import type { Command } from 'commander';
import { processIO, type CommandIO, type CommandResult } from '../../services/io.js';
import { renderAgentPrompt } from '../../agent-prompt/render.js';

/**
 * `cadence agent-prompt [--goal <text>] [--json]` — print a copy-paste prompt
 * that tells an AI agent to scaffold the first real CADENCE phase. Pure render
 * (no state I/O); shares `renderAgentPrompt` with `cadence init`'s output.
 */
export function runAgentPrompt(
  args: { goal?: string | undefined; json?: boolean | undefined },
  io: CommandIO,
): CommandResult {
  const goal = args.goal !== undefined && args.goal.trim() !== '' ? args.goal.trim() : null;
  const prompt = renderAgentPrompt(goal ?? undefined);
  if (args.json === true) {
    const data = { goal, prompt };
    io.out(JSON.stringify(data, null, 2) + '\n');
    return { exitCode: 0, data };
  }
  io.out(prompt);
  return { exitCode: 0, data: { goal } };
}

export function registerAgentPromptCommand(program: Command): void {
  program
    .command('agent-prompt')
    .description('Print a copy-paste prompt that hands the loop to your AI agent')
    .option('--goal <text>', 'bake a specific goal into the prompt')
    .option('--json', 'emit { goal, prompt } as JSON')
    .action((opts: { goal?: string; json?: boolean }) => {
      const res = runAgentPrompt({ goal: opts.goal, json: opts.json }, processIO());
      if (res.exitCode) process.exitCode = res.exitCode;
    });
}
