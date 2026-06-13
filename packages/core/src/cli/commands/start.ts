import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { processIO, type CommandIO, type CommandResult } from '../../services/io.js';
import { resolvePick, START_OPTIONS, type StartOption } from '../../start/menu.js';
import { renderMenu, renderJson, renderConfirm } from '../../start/render.js';

export interface StartArgs {
  pick?: number | undefined;
  yes?: boolean | undefined;
  json?: boolean | undefined;
  isTty: boolean;
}

export interface StartDeps {
  /** Spawn an option's runner; resolves to its exit code. */
  spawn: (option: StartOption) => Promise<number>;
  /** Interactive menu pick (TTY). Returns the option, or null to quit. */
  prompt?: (initialized: boolean) => Promise<StartOption | null>;
  /** Interactive confirm (TTY). Returns true to run. */
  confirm?: (option: StartOption) => Promise<boolean>;
  /** State probe (defaults to checking .cadence/state.json). */
  initialized?: (root: string) => boolean;
}

/** The real spawn: cadence binary self-spawn, or npx for host packages. */
export function defaultSpawn(option: StartOption): Promise<number> {
  const self = process.argv[1];
  if (option.runner === 'cadence' && self === undefined) {
    process.stderr.write('Could not locate the cadence binary to launch.\n');
    return Promise.resolve(1);
  }
  const cmd = option.runner === 'cadence' ? process.execPath : 'npx';
  const args = option.runner === 'cadence' ? [self as string, ...option.args] : option.args;
  // On Windows, npx is `npx.cmd` and spawn() can't resolve it without a shell.
  // Args are static literals from menu.ts (no user input), so shell is safe here.
  const useShell = option.runner === 'npx' && process.platform === 'win32';
  return new Promise((resolve) => {
    const child = nodeSpawn(cmd, args, { stdio: 'inherit', shell: useShell });
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', (err) => {
      process.stderr.write(`Failed to launch ${cmd}: ${err.message}\n`);
      resolve(1);
    });
  });
}

function defaultInitialized(root: string): boolean {
  return existsSync(join(root, '.cadence', 'state.json'));
}

async function readlinePick(initialized: boolean, io: CommandIO): Promise<StartOption | null> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const ans = (await rl.question('Pick a number (or q to quit): ')).trim().toLowerCase();
      if (ans === 'q' || ans === '') return null;
      const n = Number.parseInt(ans, 10);
      const opt = Number.isNaN(n) ? undefined : resolvePick(n);
      if (opt) return opt;
      io.err(`Not an option: ${ans}\n`);
    }
  } finally {
    rl.close();
  }
}

async function readlineConfirm(option: StartOption): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question(renderConfirm(option))).trim().toLowerCase();
    return ans === '' || ans === 'y' || ans === 'yes';
  } finally {
    rl.close();
  }
}

export async function runStart(
  root: string,
  args: StartArgs,
  io: CommandIO,
  deps: StartDeps,
): Promise<CommandResult> {
  const initialized = (deps.initialized ?? defaultInitialized)(root);

  if (args.json === true) {
    const data = renderJson(initialized);
    io.out(JSON.stringify(data, null, 2) + '\n');
    return { exitCode: 0, data };
  }

  // Resolve the selection.
  let option: StartOption | null;
  if (args.pick !== undefined) {
    option = resolvePick(args.pick) ?? null;
    if (option === null) {
      io.err(
        `Not an option: ${args.pick} (expected 1–${START_OPTIONS.length}). ` +
          'Run `cadence start` for the menu.\n',
      );
      return { exitCode: 1, data: { reason: 'bad-pick' } };
    }
  } else if (!args.isTty) {
    io.out(renderMenu(initialized));
    return { exitCode: 0, data: { reason: 'menu-only' } };
  } else {
    io.out(renderMenu(initialized));
    option = await (deps.prompt ?? ((i) => readlinePick(i, io)))(initialized);
    if (option === null) return { exitCode: 0, data: { reason: 'quit' } };
  }

  // Confirm unless --yes.
  if (args.yes !== true) {
    const ok = await (deps.confirm ?? readlineConfirm)(option);
    if (!ok) {
      io.out(`Run it yourself when ready:\n  ${option.display}\n`);
      return { exitCode: 0, data: { reason: 'declined', command: option.display } };
    }
  }

  // Dispatch.
  const code = await deps.spawn(option);
  if (code !== 0) {
    io.err(
      `\nThat didn't finish cleanly (exit ${code}). You can run it yourself:\n  ${option.display}\n`,
    );
  }
  return { exitCode: code, data: { ran: option.display, exitCode: code } };
}

export function registerStartCommand(program: Command): void {
  program
    .command('start')
    .description("Interactive onboarding — pick what you're doing, and run it")
    .option('--pick <n>', 'select a menu option non-interactively', (v) => Number.parseInt(v, 10))
    .option('--yes', 'skip the confirm and run the picked option')
    .option('--json', 'emit the menu as JSON')
    .action(async (opts: { pick?: number; yes?: boolean; json?: boolean }) => {
      const res = await runStart(
        process.cwd(),
        {
          pick: opts.pick,
          yes: opts.yes,
          json: opts.json,
          isTty: Boolean(process.stdin.isTTY),
        },
        processIO(),
        { spawn: defaultSpawn },
      );
      if (res.exitCode) process.exitCode = res.exitCode;
    });
}
