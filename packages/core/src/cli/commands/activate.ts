import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { loadConfig, writeConfig } from '../../config/loader.js';
import { CadenceConfigZ } from '@manehorizons/cadence-types';
import { NotInitializedError } from '../../errors.js';
import { processIO, type CommandIO, type CommandResult } from '../../services/io.js';
import { setPath } from '../../config-edit/apply.js';
import { assessReadiness, credsPresent, DEEP_VERIFY_SEAM } from '../../activate/assess.js';
import { planActivation, type ActivationScope } from '../../activate/plan.js';
import { renderText, renderJson, type ActivationResult } from '../../activate/render.js';
import { pingProvider, type ProviderPing } from '../../activate/ping.js';
import type { VerifierProvider } from '../../verify/verifier-factory.js';

export interface ActivateArgs {
  provider?: VerifierProvider | undefined;
  all?: boolean | undefined;
  noCheck?: boolean | undefined;
  json?: boolean | undefined;
  print?: boolean | undefined;
  isTty: boolean;
}

export interface ActivateDeps {
  ping: ProviderPing;
  env?: NodeJS.ProcessEnv;
  /** Interactive resolver (TTY). Returns null if the user aborts. */
  prompt?: (current: VerifierProvider) => Promise<{ provider: VerifierProvider; all: boolean } | null>;
}

const PROVIDERS: VerifierProvider[] = ['mock', 'anthropic', 'local', 'host-cli'];

async function readlinePrompt(
  current: VerifierProvider,
  io: CommandIO,
): Promise<{ provider: VerifierProvider; all: boolean } | null> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    io.out(`Current deep-verify provider: ${current}\n`);
    const p = (await rl.question('Provider to activate [anthropic/local/host-cli/mock]: ')).trim();
    if (!PROVIDERS.includes(p as VerifierProvider)) {
      io.err(`Not a provider: ${p}\n`);
      return null;
    }
    const broaden = (
      await rl.question('Enable the other verifier gates too? [y/N]: ')
    )
      .trim()
      .toLowerCase();
    return { provider: p as VerifierProvider, all: broaden === 'y' || broaden === 'yes' };
  } finally {
    rl.close();
  }
}

export async function runActivate(
  root: string,
  args: ActivateArgs,
  io: CommandIO,
  deps: ActivateDeps,
): Promise<CommandResult> {
  if (!existsSync(join(root, '.cadence', 'state.json'))) throw new NotInitializedError();

  const env = deps.env ?? process.env;
  const config = await loadConfig(root);
  const current = assessReadiness(config, env, root);

  let provider = args.provider;
  let scope: ActivationScope = args.all === true ? 'all' : 'deep-verify';

  if (provider === undefined) {
    if (!args.isTty) {
      io.err('activate needs --provider <mock|anthropic|local|host-cli> in a non-interactive shell.\n');
      return { exitCode: 1, data: { reason: 'no-provider' } };
    }
    const ans = await (deps.prompt ?? ((c) => readlinePrompt(c, io)))(current.provider);
    if (ans === null) return { exitCode: 1, data: { reason: 'aborted' } };
    provider = ans.provider;
    if (ans.all) scope = 'all';
  }

  const plan = planActivation({ provider, scope, currentConfig: config });
  const keyMissing = !credsPresent(provider, DEEP_VERIFY_SEAM, config, env, root);

  if (args.print === true) {
    const result: ActivationResult = { plan, wrote: false, keyMissing };
    emit(io, args, result);
    return { exitCode: 0, data: renderJson(result) };
  }

  if (plan.changes.length > 0) {
    const draft = structuredClone(config) as Record<string, unknown>;
    for (const c of plan.changes) {
      setPath(draft, [c.seam, 'provider'], c.to);
    }
    const parsed = CadenceConfigZ.safeParse(draft);
    if (!parsed.success) {
      io.err(`Could not write config: ${parsed.error.message}\n`);
      return { exitCode: 1, data: { reason: 'invalid-config' } };
    }
    await writeConfig(root, parsed.data);
  }

  let pingResult: ActivationResult['ping'];
  let exitCode = 0;

  // AC-2: a live provider key (env var or discovered elsewhere, e.g. .env)
  // must be proven with one real verification call, not merely assumed —
  // `--no-check` is the only opt-out. `cwd: root` keeps this call's key
  // discovery consistent with the `credsPresent` check above.
  if (args.noCheck !== true && provider !== 'mock' && !keyMissing) {
    pingResult = await deps.ping(provider, env, { cwd: root });
    if ('ok' in pingResult && pingResult.ok === false) exitCode = 1;
  }

  const result: ActivationResult = {
    plan,
    wrote: plan.changes.length > 0,
    keyMissing,
    ...(pingResult !== undefined ? { ping: pingResult } : {}),
  };
  emit(io, args, result);
  return { exitCode, data: renderJson(result) };
}

function emit(io: CommandIO, args: ActivateArgs, result: ActivationResult): void {
  const json = renderJson(result);
  if (args.json === true) {
    io.out(JSON.stringify(json, null, 2) + '\n');
  } else {
    io.out(renderText(result));
  }
}

export function registerActivateCommand(program: Command): void {
  program
    .command('activate')
    .description('Turn on real verification — pick a provider, validate the key, wire deep-verify')
    .option('--provider <provider>', 'mock | anthropic | local | host-cli')
    .option('--all', 'activate every verifier seam, not just deep-verify')
    .option('--no-check', 'skip the live provider credential check')
    .option('--print', 'show the plan without writing config')
    .option('--json', 'emit the result as JSON')
    .action(
      async (opts: {
        provider?: string;
        all?: boolean;
        check?: boolean;
        print?: boolean;
        json?: boolean;
      }) => {
        if (
          opts.provider !== undefined &&
          !PROVIDERS.includes(opts.provider as VerifierProvider)
        ) {
          process.stderr.write(
            `Not a provider: ${opts.provider} (expected mock|anthropic|local|host-cli)\n`,
          );
          process.exitCode = 1;
          return;
        }
        const res = await runActivate(
          process.cwd(),
          {
            provider: opts.provider as VerifierProvider | undefined,
            all: opts.all,
            noCheck: opts.check === false,
            print: opts.print,
            json: opts.json,
            isTty: Boolean(process.stdin.isTTY),
          },
          processIO(),
          { ping: pingProvider },
        );
        if (res.exitCode) process.exitCode = res.exitCode;
      },
    );
}
