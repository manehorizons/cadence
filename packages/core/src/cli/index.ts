#!/usr/bin/env node
import { Command } from 'commander';
import { registerAllCommands } from './register.js';

const program = new Command();
program
  .name('cadence')
  .description('CADENCE — Coordinated AI-Driven Engineering with Notifications and Customizable Execution')
  .version('0.2.0-rc.1');

registerAllCommands(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
