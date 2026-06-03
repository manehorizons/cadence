#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import { registerAllCommands } from './register.js';

// Read the real version from package.json so `--version` never drifts.
// Resolves dist/cli/index.js → ../../package.json (present in the published
// tarball and the source tree alike).
const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8'),
) as { version: string };

const program = new Command();
program
  .name('cadence')
  .description('CADENCE — a draft/build/settle framework for AI-assisted development with configurable quality gates')
  .version(pkg.version);

registerAllCommands(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
