import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { processIO, type CommandIO, type CommandResult } from '../../services/io.js';
import { resolvePick, visibleOptions, START_OPTIONS, type StartOption } from '../../start/menu.js';
import {
  renderMenu,
  renderJson,
  renderConfirm,
  type StartRecommendation,
} from '../../start/render.js';
import { SimpleStateBackend } from '../../state/simple.js';
import { readStage } from '../../onboarding/state.js';

export interface StartArgs {
  pick?: number | undefined;
  yes?: boolean | undefined;
  json?: boolean | undefined;
  /** Show the full menu regardless of onboarding stage (278-01/AC-11). */
  advanced?: boolean | undefined;
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
  /** Recommendation probe (defaults to the live repo state). */
  recommendation?: (root: string, initialized: boolean) => Promise<StartRecommendation>;
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

async function defaultRecommendation(
  root: string,
  initialized: boolean,
): Promise<StartRecommendation> {
  if (!initialized) {
    return {
      command: 'npx -y @thomas-powers-jr/cadence-core tutorial',
      reason: 'Fastest first touch: runs a real loop in a throwaway sandbox and writes nothing here.',
    };
  }
  try {
    const state = await new SimpleStateBackend(root).readState();
    if (state.loopPosition === 'IDLE') {
      return {
        command: 'cadence draft new --title "Fix login timeout" --template bugfix',
        reason: 'You are set up and idle; start a first real DRAFT from an editable template.',
      };
    }
    return {
      command: 'cadence progress',
      reason: 'You already have an active loop; let CADENCE print the next exact command.',
    };
  } catch {
    return {
      command: 'cadence doctor',
      reason: 'This repo looks initialized, but state could not be read cleanly.',
    };
  }
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
  const recommendation = await (deps.recommendation ?? defaultRecommendation)(
    root,
    initialized,
  );

  // Progressive-disclosure filtering of the *rendered* menu only
  // (278-01/AC-11). `resolvePick`/`--pick <n>` below always resolves
  // against the full, unfiltered `START_OPTIONS` — a hidden option still
  // works if the caller already knows its number.
  const options = visibleOptions(readStage(), args.advanced === true);

  if (args.json === true) {
    const data = renderJson(initialized, recommendation, options);
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
    io.out(renderMenu(initialized, recommendation, options));
    return { exitCode: 0, data: { reason: 'menu-only' } };
  } else {
    io.out(renderMenu(initialized, recommendation, options));
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
    // NOTE: `--advanced` is intentionally NOT declared here. It is a
    // program-level option (`cli/index.ts`, T7) shared with `cadence help
    // --advanced`; Commander v14 resolves a flag name declared on both a
    // parent and a child to the PARENT's option, so a second local
    // declaration of the same flag would silently never reach this
    // action's `opts()` (278-01/AC-11 fix-round finding). Read it via
    // `command.optsWithGlobals()` below instead — one flag, one meaning.
    .action(async (opts: { pick?: number; yes?: boolean; json?: boolean }, command: Command) => {
      const advanced = (command.optsWithGlobals() as { advanced?: boolean }).advanced === true;
      const res = await runStart(
        process.cwd(),
        {
          pick: opts.pick,
          yes: opts.yes,
          json: opts.json,
          advanced,
          isTty: Boolean(process.stdin.isTTY),
        },
        processIO(),
        { spawn: defaultSpawn },
      );
      if (res.exitCode) process.exitCode = res.exitCode;
    });
}
