import { Command } from 'commander';
import { installHooks, type InstallOptions } from './install.js';

const program = new Command();

program
  .name('keel-host-claude-code')
  .description('Claude Code host adapter for KEEL')
  .version('0.1.0');

program
  .command('install')
  .description('Write Claude Code hook entries to .claude/settings.json')
  .option('--cwd <dir>', 'project root', process.cwd())
  .option('--command <cmd>', 'base command to invoke (default: "npx @keel/core")')
  .option('--settings <path>', 'settings file path relative to cwd', '.claude/settings.json')
  .action(async (opts: { cwd: string; command?: string; settings: string }) => {
    try {
      const installOpts: InstallOptions = { settingsPath: opts.settings };
      if (opts.command !== undefined) installOpts.command = opts.command;
      await installHooks(opts.cwd, installOpts);
      process.stdout.write(
        `Installed KEEL hooks → ${opts.cwd}/${opts.settings}\n` +
          `Use 'claude --resume' or start a new session to activate.\n`,
      );
    } catch (err) {
      process.stderr.write(
        `install failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
