import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installHooks, type InstallOptions } from './install.js';
import { installCommands, type InstallCommandsOptions } from './install-commands.js';
import { routeHookEvent } from './shim.js';

// Read the real version from package.json so `--version` never drifts.
// Resolves dist/cli.js → ../package.json.
const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'),
) as { version: string };

const program = new Command();

program
  .name('cadence-host-claude-code')
  .description('Claude Code host adapter for CADENCE')
  .version(pkg.version);

program
  .command('install')
  .description('Write Claude Code hook entries and slash commands into the project')
  .option('--cwd <dir>', 'project root', process.cwd())
  .option('--command <cmd>', 'base command for the shim (default: "npx @manehorizons/cadence-host-claude-code")')
  .option('--cadence <cmd>', 'base command the shim uses to invoke core (default: "npx @manehorizons/cadence-core")')
  .option('--settings <path>', 'settings file path relative to cwd', '.claude/settings.json')
  .option('--no-hooks', 'skip writing hooks to settings.json')
  .option('--no-commands', 'skip writing slash commands to .claude/commands/')
  .option('--local', 'use absolute paths to the local workspace builds (monorepo dogfood)')
  .action(
    async (opts: {
      cwd: string;
      command?: string;
      cadence?: string;
      settings: string;
      hooks: boolean;
      commands: boolean;
      local?: boolean;
    }) => {
      try {
        if (opts.hooks) {
          const installOpts: InstallOptions = { settingsPath: opts.settings };
          if (opts.command !== undefined) installOpts.command = opts.command;
          if (opts.cadence !== undefined) installOpts.cadenceCommand = opts.cadence;
          if (opts.local) installOpts.local = true;
          await installHooks(opts.cwd, installOpts);
          process.stdout.write(`Installed CADENCE hooks → ${opts.cwd}/${opts.settings}\n`);
        }
        if (opts.commands) {
          const cmdOpts: InstallCommandsOptions = {};
          if (opts.cadence !== undefined) cmdOpts.cadenceCommand = opts.cadence;
          if (opts.local) cmdOpts.local = true;
          await installCommands(opts.cwd, cmdOpts);
          process.stdout.write(`Installed CADENCE slash commands → ${opts.cwd}/.claude/commands/\n`);
        }
        process.stdout.write('Start a new Claude Code session to activate.\n');
        if (opts.local) {
          // --local bakes machine-absolute paths into EVERY surface it writes —
          // both the hooks (settings.json) and the slash commands
          // (.claude/commands/cadence-*.md). Name each surface that was actually
          // written so none gets committed by accident. The command files were
          // the silent offender before this enumeration existed: the warning
          // named only settings.json, so machine-absolute command files were
          // committed unflagged and broke on every other clone/machine.
          const surfaces: string[] = [];
          if (opts.hooks) surfaces.push(opts.settings);
          if (opts.commands) surfaces.push('.claude/commands/cadence-*.md');
          if (surfaces.length > 0) {
            process.stderr.write(
              `warning: --local wrote machine-absolute paths into ${surfaces.join(' and ')}. ` +
                'Do NOT commit them — they cannot be resolved on other clones or ' +
                'machines. Add them to .gitignore and re-run `install --local` per ' +
                'machine, or run plain `install` (no --local) to write the portable ' +
                '`cadence` form that is safe to commit.\n',
            );
          }
        }
      } catch (err) {
        process.stderr.write(
          `install failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    },
  );

program
  .command('hook')
  .description('Shim invoked by Claude Code hooks: translates stdin and calls cadence hook <event>')
  .option('--cadence <cmd>', 'base command to invoke core (default: "npx @manehorizons/cadence-core")', 'npx @manehorizons/cadence-core')
  .action(async (opts: { cadence: string }) => {
    try {
      let raw = '';
      if (!process.stdin.isTTY) {
        for await (const chunk of process.stdin) raw += chunk.toString();
      }
      const { abstractEvent, translatedStdin } = routeHookEvent(raw);
      if (abstractEvent === null) return; // exit 0 silently for unmapped events
      const [exe, ...baseArgs] = opts.cadence.split(/\s+/).filter(Boolean);
      if (!exe) {
        process.stderr.write('--cadence command is empty\n');
        process.exitCode = 1;
        return;
      }
      const child = spawn(exe, [...baseArgs, 'hook', abstractEvent], {
        stdio: ['pipe', 'inherit', 'inherit'],
        shell: process.platform === 'win32',
      });
      child.stdin.write(translatedStdin);
      child.stdin.end();
      await new Promise<void>((resolve) => {
        child.on('exit', (code) => {
          process.exitCode = code ?? 0;
          resolve();
        });
        child.on('error', (err) => {
          process.stderr.write(`shim spawn failed: ${err.message}\n`);
          process.exitCode = 1;
          resolve();
        });
      });
    } catch (err) {
      process.stderr.write(
        `hook shim failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
