import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { installHooks, type InstallOptions } from './install.js';
import { installCommands, type InstallCommandsOptions } from './install-commands.js';
import { routeHookEvent } from './shim.js';

const program = new Command();

program
  .name('keel-host-claude-code')
  .description('Claude Code host adapter for KEEL')
  .version('0.1.0');

program
  .command('install')
  .description('Write Claude Code hook entries and slash commands into the project')
  .option('--cwd <dir>', 'project root', process.cwd())
  .option('--command <cmd>', 'base command for the shim (default: "npx @keel/host-claude-code")')
  .option('--keel <cmd>', 'base command the shim uses to invoke core (default: "npx @keel/core")')
  .option('--settings <path>', 'settings file path relative to cwd', '.claude/settings.json')
  .option('--no-hooks', 'skip writing hooks to settings.json')
  .option('--no-commands', 'skip writing slash commands to .claude/commands/')
  .option('--local', 'use absolute paths to the local workspace builds (monorepo dogfood)')
  .action(
    async (opts: {
      cwd: string;
      command?: string;
      keel?: string;
      settings: string;
      hooks: boolean;
      commands: boolean;
      local?: boolean;
    }) => {
      try {
        if (opts.hooks) {
          const installOpts: InstallOptions = { settingsPath: opts.settings };
          if (opts.command !== undefined) installOpts.command = opts.command;
          if (opts.keel !== undefined) installOpts.keelCommand = opts.keel;
          if (opts.local) installOpts.local = true;
          await installHooks(opts.cwd, installOpts);
          process.stdout.write(`Installed KEEL hooks → ${opts.cwd}/${opts.settings}\n`);
        }
        if (opts.commands) {
          const cmdOpts: InstallCommandsOptions = {};
          if (opts.keel !== undefined) cmdOpts.keelCommand = opts.keel;
          if (opts.local) cmdOpts.local = true;
          await installCommands(opts.cwd, cmdOpts);
          process.stdout.write(`Installed KEEL slash commands → ${opts.cwd}/.claude/commands/\n`);
        }
        process.stdout.write('Start a new Claude Code session to activate.\n');
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
  .description('Shim invoked by Claude Code hooks: translates stdin and calls keel hook <event>')
  .option('--keel <cmd>', 'base command to invoke core (default: "npx @keel/core")', 'npx @keel/core')
  .action(async (opts: { keel: string }) => {
    try {
      let raw = '';
      if (!process.stdin.isTTY) {
        for await (const chunk of process.stdin) raw += chunk.toString();
      }
      const { abstractEvent, translatedStdin } = routeHookEvent(raw);
      if (abstractEvent === null) return; // exit 0 silently for unmapped events
      const [exe, ...baseArgs] = opts.keel.split(/\s+/).filter(Boolean);
      if (!exe) {
        process.stderr.write('--keel command is empty\n');
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
