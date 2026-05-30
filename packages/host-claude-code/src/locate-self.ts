import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LocalPaths {
  /** Absolute path to this adapter's compiled CLI entry (dist/cli.js). */
  shimCli: string;
  /** Absolute path to the workspace @manehorizons/cadence-core CLI entry (dist/cli/index.js). */
  coreCli: string;
}

/**
 * Resolves absolute paths to the local (workspace) builds of this adapter
 * and `@manehorizons/cadence-core`. Designed to work both at runtime (running from
 * `packages/host-claude-code/dist/locate-self.js`) and under vitest
 * (running from `packages/host-claude-code/src/locate-self.ts`).
 */
export function resolveLocalPaths(): LocalPaths {
  const here = dirname(fileURLToPath(import.meta.url));
  const distDir = basename(here) === 'src' ? resolve(here, '..', 'dist') : here;
  const adapterRoot = resolve(distDir, '..');
  return {
    shimCli: resolve(distDir, 'cli.js'),
    coreCli: resolve(adapterRoot, '..', 'core', 'dist', 'cli', 'index.js'),
  };
}
