import { Command } from 'commander';
import { loadConfig, writeConfig } from '../../config/loader.js';
import { KeelConfigZ } from '@keel/types';

function getPath(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return cur;
}

function setPath(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!;
    if (!(k in cur) || typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[path[path.length - 1]!] = value;
}

function coerce(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  if (raw.trim() !== '' && !Number.isNaN(n) && Number.isFinite(n)) return n;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function registerConfigCommand(program: Command): void {
  const cmd = program.command('config').description('Read/write KEEL config');

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
      const result = KeelConfigZ.safeParse(draft);
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
}
