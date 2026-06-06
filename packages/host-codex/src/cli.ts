import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installHooks, type InstallOptions } from './install.js';
import { installCommands, resolveCodexHome, type InstallCommandsOptions } from './install-commands.js';

// Read the real version from package.json so `--version` never drifts.
const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'),
) as { version: string };

const program = new Command();

program.name('cadence-host-codex').description('OpenAI Codex CLI host adapter for CADENCE').version(pkg.version);

program
  .command('install')
  .description('Write Codex hook config (.codex/hooks.json) and global slash-command prompts')
  .option('--cwd <dir>', 'project root', process.cwd())
  .option('--command <cmd>', 'base command for the shim (default: "npx @manehorizons/cadence-host-codex hook")')
  .option('--cadence <cmd>', 'base command the shim uses to invoke core (default: "npx @manehorizons/cadence-core")')
  .option('--codex-home <dir>', 'Codex home dir for prompts (default: $CODEX_HOME or ~/.codex)')
  .option('--no-hooks', 'skip writing .codex/hooks.json')
  .option('--no-commands', 'skip writing slash-command prompts')
  .option('--local', 'use absolute paths to the local workspace builds (monorepo dogfood)')
  .action(
    async (opts: {
      cwd: string;
      command?: string;
      cadence?: string;
      codexHome?: string;
      hooks: boolean;
      commands: boolean;
      local?: boolean;
    }) => {
      try {
        if (opts.hooks) {
          const installOpts: InstallOptions = {};
          if (opts.command !== undefined) installOpts.command = opts.command;
          if (opts.cadence !== undefined) installOpts.cadenceCommand = opts.cadence;
          if (opts.local) installOpts.local = true;
          await installHooks(opts.cwd, installOpts);
          process.stdout.write(`Installed CADENCE Codex hooks → ${opts.cwd}/.codex/hooks.json\n`);
        }
        if (opts.commands) {
          const cmdOpts: InstallCommandsOptions = {};
          if (opts.cadence !== undefined) cmdOpts.cadenceCommand = opts.cadence;
          if (opts.codexHome !== undefined) cmdOpts.codexHome = opts.codexHome;
          if (opts.local) cmdOpts.local = true;
          const promptsDir = join(resolveCodexHome(opts.codexHome), 'prompts');
          await installCommands(opts.cwd, cmdOpts);
          process.stdout.write(`Installed CADENCE slash-command prompts → ${promptsDir}/\n`);
          // Codex prompts are GLOBAL (no project-level dir yet — openai/codex#4734),
          // so they affect every project on this machine. Always say so.
          process.stderr.write(
            `warning: Codex slash-command prompts install GLOBALLY to ${promptsDir} and ` +
              'apply to EVERY project on this machine (Codex has no project-level prompt ' +
              'dir yet). Run `install --no-commands` to skip them.\n',
          );
        }
        process.stdout.write('Approve the new hooks in Codex, then start a new session to activate.\n');
        if (opts.local) {
          const surfaces: string[] = [];
          if (opts.hooks) surfaces.push('.codex/hooks.json');
          if (opts.commands) surfaces.push(`${join(resolveCodexHome(opts.codexHome), 'prompts')}/cadence-*.md`);
          if (surfaces.length > 0) {
            process.stderr.write(
              `warning: --local wrote machine-absolute paths into ${surfaces.join(' and ')}. ` +
                'Do NOT commit them — they cannot be resolved on other clones or machines. ' +
                'Run plain `install` (no --local) for the portable `cadence` form.\n',
            );
          }
        }
      } catch (err) {
        process.stderr.write(`install failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    },
  );

// NOTE: the `hook` shim subcommand is added in phase 68.

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
