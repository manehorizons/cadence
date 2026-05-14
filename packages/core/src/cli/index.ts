#!/usr/bin/env node
import { Command } from 'commander';
import { registerConfigCommand } from './commands/config.js';
import { registerInitCommand } from './commands/init.js';
import { registerDraftCommand } from './commands/draft.js';
import { registerHookCommand } from './commands/hook.js';
import { registerBuildCommand } from './commands/build.js';
import { registerDoneCommand } from './commands/done.js';
import { registerBlockCommand } from './commands/block.js';
import { registerNeedsContextCommand } from './commands/needs-context.js';
import { registerSettleCommand } from './commands/settle.js';
import { registerProgressCommand } from './commands/progress.js';
import { registerStatusCommand } from './commands/status.js';

const program = new Command();
program
  .name('cadence')
  .description('CADENCE — Coordinated AI-Driven Engineering with Notifications and Customizable Execution')
  .version('0.2.0-rc.1');

registerConfigCommand(program);
registerInitCommand(program);
registerDraftCommand(program);
registerHookCommand(program);
registerBuildCommand(program);
registerDoneCommand(program);
registerBlockCommand(program);
registerNeedsContextCommand(program);
registerSettleCommand(program);
registerProgressCommand(program);
registerStatusCommand(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
