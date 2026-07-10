import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface KeyDiscoveryResult {
  value: string | undefined;
  source: 'env' | 'dotenv' | undefined;
}

/** Strips one layer of matching single/double quotes, if present. */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/** Hand-rolled `.env` parser: `KEY=value` lines, `#` comments, blank lines skipped. */
function parseDotenv(contents: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = unquote(line.slice(eq + 1).trim());
    values.set(key, value);
  }
  return values;
}

/**
 * Finds a verifier key wherever it legitimately lives: the process env first,
 * then a `.env` file at the repo root (`cwd`). No OS keychain support and no
 * new runtime dependency — this repo has a zero-runtime-dependency bias.
 */
export function discoverKey(
  varName: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
): KeyDiscoveryResult {
  const fromEnv = env[varName];
  if (fromEnv) return { value: fromEnv, source: 'env' };

  const dotenvPath = join(cwd, '.env');
  if (!existsSync(dotenvPath)) return { value: undefined, source: undefined };

  let contents: string;
  try {
    contents = readFileSync(dotenvPath, 'utf8');
  } catch {
    return { value: undefined, source: undefined };
  }

  const fromDotenv = parseDotenv(contents).get(varName);
  if (fromDotenv) return { value: fromDotenv, source: 'dotenv' };

  return { value: undefined, source: undefined };
}
