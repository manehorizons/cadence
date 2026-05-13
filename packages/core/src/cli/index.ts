#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();
program.name('keel').description('KEEL — Keep Execution Aligned to Loop').version('0.1.0');

program.command('hello').description('smoke test').action(() => {
  console.log('keel: hello');
});

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
