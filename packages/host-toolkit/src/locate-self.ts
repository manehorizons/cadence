import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LocalPaths {
  /** Absolute path to a host adapter's compiled CLI entry (dist/cli.js). */
  shimCli: string;
  /** Absolute path to the workspace @thomas-powers-jr/cadence-core CLI entry (dist/cli/index.js). */
  coreCli: string;
}

/**
 * Resolves absolute paths to the local (workspace) builds of a host adapter
 * and `@thomas-powers-jr/cadence-core`, given the URL of a module living at that
 * adapter's own package root (i.e. `packages/<adapter>/src/locate-self.ts` or
 * `packages/<adapter>/dist/locate-self.js`). Designed to work both at runtime
 * (compiled, running from `dist/`) and under vitest (running from `src/`).
 *
 * Shared by every host adapter (phase 222 — formerly duplicated verbatim in
 * `host-claude-code/src/locate-self.ts` and `host-codex/src/locate-self.ts`).
 * This works across adapters because every adapter package lives at the same
 * depth under `packages/`, so the relative hop up to
 * `packages/core/dist/cli/index.js` is identical regardless of which adapter
 * is asking — the caller only needs to supply *its own* `import.meta.url` so
 * the function anchors to the right adapter directory.
 */
export function resolveAdapterLocalPaths(adapterModuleUrl: string): LocalPaths {
  const here = dirname(fileURLToPath(adapterModuleUrl));
  const distDir = basename(here) === 'src' ? resolve(here, '..', 'dist') : here;
  const adapterRoot = resolve(distDir, '..');
  return {
    shimCli: resolve(distDir, 'cli.js'),
    coreCli: resolve(adapterRoot, '..', 'core', 'dist', 'cli', 'index.js'),
  };
}
