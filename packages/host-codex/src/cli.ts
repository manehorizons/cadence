import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installHooks, type InstallOptions } from './install.js';
import { installCommands, resolveCodexHome, type InstallCommandsOptions } from './install-commands.js';
import { routeHookEvent } from './shim.js';
import { codexCapabilities } from './capabilities.js';

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

program
  .command('hook')
  .description('Shim invoked by Codex hooks: translates stdin and calls cadence hook <event>')
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
      // Phase 222 AC-3: embed this host's declared capabilities so core can
      // check `agentIdentification` before relying on ctx.agentId/agentType
      // (see packages/core/src/hooks/handlers.ts). Best-effort — if
      // translatedStdin isn't a JSON object for some reason, send it through
      // unmodified rather than throwing.
      let stdinToSend = translatedStdin;
      try {
        const parsed: unknown = JSON.parse(translatedStdin);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          stdinToSend = JSON.stringify({ ...parsed, hostCapabilities: codexCapabilities });
        }
      } catch {
        // translatedStdin wasn't valid JSON (routeHookEvent only guarantees
        // this when abstractEvent !== null, which is already checked above,
        // but degrade rather than assume) — send the original through.
      }
      const child = spawn(exe, [...baseArgs, 'hook', abstractEvent], {
        stdio: ['pipe', 'inherit', 'inherit'],
        shell: process.platform === 'win32',
      });
      child.stdin.write(stdinToSend);
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
      process.stderr.write(`hook shim failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
