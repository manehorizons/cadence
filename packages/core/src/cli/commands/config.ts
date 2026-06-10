import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, writeConfig } from '../../config/loader.js';
import { CadenceConfigZ } from '@manehorizons/cadence-types';
import { NotInitializedError } from '../../errors.js';
import { processIO, type CommandIO, type CommandResult } from '../../services/io.js';
import { buildExplanation } from '../../config-explain/build.js';
import { gatherExplainContext } from '../../config-explain/gather.js';
import { isKnownField, renderJson, renderText, type RenderOptions } from '../../config-explain/render.js';
import { getPath, setPath, coerce } from '../../config-edit/apply.js';

/**
 * `cadence config explain [field]` — render the active config in plain language
 * (phase 92). Loads the config, gathers the impure {@link gatherExplainContext},
 * builds the explanation with the phase-91 pure core, and renders text / JSON.
 * Pure over its `io` sink; the CLI action wires real streams + exit code.
 *
 * Complements `cadence config doctor` (config-conflict pairs) and `cadence
 * doctor` (structural host/state health): this surface *explains* what the
 * config does and flags config-semantic foot-guns, pointing at those for the
 * full checks.
 */
export async function runConfigExplain(
  root: string,
  args: { field?: string | undefined; all?: boolean | undefined; json?: boolean | undefined },
  io: CommandIO,
): Promise<CommandResult> {
  if (!existsSync(join(root, '.cadence', 'state.json'))) {
    throw new NotInitializedError();
  }
  const config = await loadConfig(root);
  const ctx = await gatherExplainContext(root);
  const exp = buildExplanation(config, ctx);

  if (args.json === true) {
    const data = renderJson(exp);
    io.out(JSON.stringify(data, null, 2) + '\n');
    return { exitCode: 0, data };
  }

  const field = args.field?.trim();
  if (field !== undefined && field !== '' && !isKnownField(config, field)) {
    io.err(renderText(exp, { field }));
    return { exitCode: 1, data: { unknownField: field } };
  }

  const opts: RenderOptions = {};
  if (field !== undefined && field !== '') opts.field = field;
  if (args.all === true) opts.all = true;
  io.out(renderText(exp, opts));
  return { exitCode: 0 };
}

export function registerConfigCommand(program: Command): void {
  const cmd = program.command('config').description('Read/write CADENCE config');

  cmd
    .command('get <key>')
    .description('Print a config value (dotted path)')
    .action(async (key: string) => {
      const cfg = await loadConfig(process.cwd());
      const value = getPath(cfg as unknown as Record<string, unknown>, key.split('.'));
      if (value === undefined) {
        console.error(`Unknown key: ${key}`);
        process.exit(2);
      }
      console.log(typeof value === 'string' ? value : JSON.stringify(value));
    });

  cmd
    .command('set <key> <value>')
    .description('Update a config value and validate against schema')
    .action(async (key: string, raw: string) => {
      const cfg = await loadConfig(process.cwd());
      const draft = structuredClone(cfg) as Record<string, unknown>;
      setPath(draft, key.split('.'), coerce(raw));
      const result = CadenceConfigZ.safeParse(draft);
      if (!result.success) {
        console.error(`Invalid ${key}: ${result.error.message}`);
        process.exit(2);
      }
      await writeConfig(process.cwd(), result.data);
      console.log(`set ${key} = ${raw}`);
    });

  cmd
    .command('doctor')
    .description('Diagnose config conflicts')
    .action(async () => {
      const cfg = await loadConfig(process.cwd());
      const issues: string[] = [];
      if (cfg.loopEnforcement === 'strict' && cfg.commitCadence === 'manual') {
        issues.push('strict loopEnforcement with manual commit cadence: unfinished work cannot be settled cleanly.');
      }
      if (cfg.hooks.preToolUseBuildGate && cfg.loopEnforcement === 'reminder') {
        issues.push('preToolUseBuildGate=true with loopEnforcement=reminder: gate blocks edits but loop is unenforced.');
      }
      if (issues.length === 0) {
        console.log('No config conflicts detected.');
      } else {
        for (const i of issues) console.log(`- ${i}`);
        process.exit(1);
      }
    });

  cmd
    .command('explain [field]')
    .description('Explain the active config in plain language — gates, providers, warnings')
    .option('--all', 'show every config key, grouped')
    .option('--json', 'emit the structured explanation as JSON')
    .action(async (field: string | undefined, opts: { all?: boolean; json?: boolean }) => {
      const res = await runConfigExplain(
        process.cwd(),
        { field, all: opts.all, json: opts.json },
        processIO(),
      );
      if (res.exitCode) process.exitCode = res.exitCode;
    });
}
