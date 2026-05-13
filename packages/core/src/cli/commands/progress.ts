import { Command } from 'commander';
import { SimpleStateBackend } from '../../state/simple.js';
import { nextAction } from '../../progress.js';

export function registerProgressCommand(program: Command): void {
  program
    .command('progress')
    .description('Show single recommended next action')
    .action(async () => {
      try {
        const backend = new SimpleStateBackend(process.cwd());
        const state = await backend.readState();
        const action = nextAction(state);
        console.log(`Next: ${action.command}`);
        console.log(`Reason: ${action.reason}`);
      } catch (err) {
        process.stderr.write(`progress failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}
