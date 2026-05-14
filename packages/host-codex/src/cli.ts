import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { installHooks, type InstallOptions } from './install.js';
import { installCommands, type InstallCommandsOptions } from './install-commands.js';
import { routeHookEvent } from './shim.js';

const program = new Command();

program.name('keel-host-codex').description('Codex CLI host adapter for KEEL').version('0.1.0');

program
  .command('install')
  .description('Write Codex hook entries and Agent Skills into the project')
  .option('--cwd <dir>', 'project root', process.cwd())
  .option('--command <cmd>', 'base command for the shim (default: "npx @keel/host-codex hook")')
  .option('--keel <cmd>', 'base command the shim uses to invoke core (default: "npx @keel/core")')
  .option('--settings <path>', 'hooks file path relative to cwd', '.codex/hooks.json')
  .option('--skills <path>', 'skills dir relative to cwd', '.agents/skills')
  .option('--allow-implicit', 'allow Codex to invoke KEEL skills implicitly')
  .option('--no-hooks', 'skip writing hooks to .codex/hooks.json')
  .option('--no-commands', 'skip writing Agent Skills to .agents/skills/')
  .action(
    async (opts: {
      cwd: string;
      command?: string;
      keel?: string;
      settings: string;
      skills: string;
      allowImplicit?: boolean;
      hooks: boolean;
      commands: boolean;
    }) => {
      try {
        if (opts.hooks) {
          const installOpts: InstallOptions = { settingsPath: opts.settings };
          if (opts.command !== undefined) installOpts.command = opts.command;
          if (opts.keel !== undefined) installOpts.keelCommand = opts.keel;
          await installHooks(opts.cwd, installOpts);
          process.stdout.write(`Installed KEEL hooks → ${opts.cwd}/${opts.settings}\n`);
        }
        if (opts.commands) {
          const cmdOpts: InstallCommandsOptions = { skillsDir: opts.skills };
          if (opts.keel !== undefined) cmdOpts.keelCommand = opts.keel;
          if (opts.allowImplicit) cmdOpts.allowImplicit = true;
          await installCommands(opts.cwd, cmdOpts);
          process.stdout.write(`Installed KEEL skills → ${opts.cwd}/${opts.skills}/\n`);
        }
        process.stdout.write('Start a new Codex session to activate.\n');
        process.stdout.write(
          'Note: PreToolUse/PostToolUse hooks do not yet fire for apply_patch ' +
            '(openai/codex#16732). Matchers are installed so the adapter activates ' +
            'automatically when upstream lands the fix.\n',
        );
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
  .description('Shim invoked by Codex hooks: translates stdin and calls keel hook <event>')
  .option(
    '--keel <cmd>',
    'base command to invoke core (default: "npx @keel/core")',
    'npx @keel/core',
  )
  .action(async (opts: { keel: string }) => {
    try {
      let raw = '';
      if (!process.stdin.isTTY) {
        for await (const chunk of process.stdin) raw += chunk.toString();
      }
      const { abstractEvent, translatedStdin } = routeHookEvent(raw);
      if (abstractEvent === null) return;
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
