import type { Command } from 'commander';
import { runExplain } from '../../services/explain.js';
import { processIO } from '../../services/io.js';

export function registerExplainCommand(program: Command): void {
  program
    .command('explain')
    .argument('[concept]', 'concept to explain (loop | gates | tiers | profiles | config)')
    .description('Print an in-terminal explanation of a CADENCE concept')
    .action((concept: string | undefined) => {
      const res = runExplain(concept === undefined ? {} : { concept }, processIO());
      process.exitCode = res.exitCode;
    });
}
