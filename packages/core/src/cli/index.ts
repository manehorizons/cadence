#!/usr/bin/env node
import { Command } from 'commander';
import { registerConfigCommand } from './commands/config.js';
import { registerInitCommand } from './commands/init.js';
import { registerDraftCommand } from './commands/draft.js';
import { registerHookCommand } from './commands/hook.js';
import { registerBuildCommand } from './commands/build.js';
import { registerSettleCommand } from './commands/settle.js';

const program = new Command();
program.name('keel').description('KEEL — Keep Execution Aligned to Loop').version('0.1.0');

registerConfigCommand(program);
registerInitCommand(program);
registerDraftCommand(program);
registerHookCommand(program);
registerBuildCommand(program);
registerSettleCommand(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
