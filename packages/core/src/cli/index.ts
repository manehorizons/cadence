#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Command, Help } from 'commander';
import { registerAllCommands } from './register.js';
import { checkNodeMajor } from './node-guard.js';
import { formatTopLevelError } from '../services/format-command-error.js';
import { readStage, ONBOARDING_STAGE_OPERATOR } from '../onboarding/state.js';

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
  .version(pkg.version)
  .option('--advanced', 'show the full command surface in `cadence help`, regardless of onboarding stage');

registerAllCommands(program);

// Progressive-disclosure help gating (phase 278, T7, AC-10). `cadence help`
// / `cadence --help` hide a small "Stage 2+" set of commands — right now
// just `doctor` — from the top-level command listing until the operator has
// earned it: either onboarding stage has advanced past Stage 1
// (`onboarding/state.ts`'s readStage() >= ONBOARDING_STAGE_OPERATOR) or the
// `--advanced` escape hatch above was passed. This mirrors `start/menu.ts`'s
// `visibleOptions()` (T8), which solved the identical problem for `cadence
// start`'s menu: T8 shipped with exactly one gated entry (`doctor`) and left
// everything else — including `activate` — visible, so this list matches
// that shipped precedent rather than the design handoff's broader "doctor,
// activate, profiles, host wiring" sketch, to keep the two gated surfaces
// consistent with each other.
//
// Command *registration* is untouched — every `.command(...)` call in
// register.ts still runs unconditionally, so `cli-reference.test.ts`'s diff
// of the registered command-name set against docs/reference/commands.md is
// unaffected. Only the *rendered* help text is filtered, via Commander's
// documented override hook: `configureHelp()`'s returned object is merged
// onto a fresh `Help` instance in `createHelp()` (commander/lib/command.js),
// so overriding `visibleCommands` here changes what `formatHelp()` prints
// without touching anything structural.
const STAGE_2_HELP_COMMANDS = new Set(['doctor']);
const defaultHelp = new Help();
program.configureHelp({
  visibleCommands(cmd) {
    const commands = defaultHelp.visibleCommands(cmd);
    // Only the top-level listing is gated. A subcommand's own `--help`
    // (e.g. `cadence recommendation --help`, which lists `add`/`list`/
    // `evidence`) renders its children unfiltered — those subcommands are
    // not part of the Stage 2+ set this task hides.
    if (cmd !== program) return commands;
    const advanced = (program.opts() as { advanced?: boolean }).advanced === true;
    if (advanced || readStage() >= ONBOARDING_STAGE_OPERATOR) return commands;
    return commands.filter((c) => !STAGE_2_HELP_COMMANDS.has(c.name()));
  },
});

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
  // Bare invocation — zero subcommands AND zero flags, e.g. a bare `npx
  // @thomas-powers-jr/cadence-core` or a bare `cadence` — dispatches to
  // `cadence demo` instead of falling through to commander's default
  // help-and-exit-1 behavior (phase 278, T3, AC-7). Any subcommand or flag
  // at all (`cadence --version`, `cadence help`, `cadence init`, ...) must
  // NOT trigger this, so the check is strict: nothing after `node <script>`.
  // Splicing `'demo'` onto argv and letting commander parse it normally
  // reuses `demo`'s real registration (`register.ts` → `commands/demo.ts`)
  // rather than duplicating its dispatch logic here.
  const argv = process.argv.slice(2).length === 0 ? [...process.argv, 'demo'] : process.argv;
  program.parseAsync(argv).catch((err) => {
    console.error(formatTopLevelError(err));
    process.exit(1);
  });
}
