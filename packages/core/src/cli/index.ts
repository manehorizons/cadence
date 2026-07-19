#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import { registerAllCommands } from './register.js';
import { checkNodeMajor } from './node-guard.js';
import { formatTopLevelError } from '../services/format-command-error.js';

const nodeCheck = checkNodeMajor(process.versions.node);
if (!nodeCheck.ok) {
  console.error(nodeCheck.message);
  process.exit(1);
}

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

// Re-exported so `tests/cli/index.test.ts` can unit-test the exact function
// this file's top-level catch calls, without importing this whole script
// (see the guard below). The single implementation lives in
// `services/format-command-error.ts` — the same module every command
// service's own `catch` uses for its `"<cmd> failed: ..."` line, so a
// `StateCorruptError`'s `cadence doctor --fix` pointer (issue #177 / AC-6)
// has one source of truth whether it surfaces from a service's own catch or
// this backstop.
export { formatTopLevelError };

// Only actually run the CLI when this module is the real entry point (`node
// dist/cli/index.js ...`, which is how both the published `bin/cadence.cjs`
// launcher and every CLI test spawn it). This guards `parseAsync(process.argv)`
// from firing against an unrelated argv (e.g. the test runner's own) when this
// module is imported in-process to unit-test `formatTopLevelError` above.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  program.parseAsync(process.argv).catch((err) => {
    console.error(formatTopLevelError(err));
    process.exit(1);
  });
}
