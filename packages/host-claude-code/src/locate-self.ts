import { resolveAdapterLocalPaths } from '@thomas-powers-jr/cadence-host-toolkit/locate-self';
import type { LocalPaths } from '@thomas-powers-jr/cadence-host-toolkit/locate-self';

export type { LocalPaths };

/**
 * Resolves absolute paths to the local (workspace) builds of this adapter
 * and `@thomas-powers-jr/cadence-core`. Designed to work both at runtime (running
 * from `packages/host-claude-code/dist/locate-self.js`) and under vitest
 * (running from `packages/host-claude-code/src/locate-self.ts`).
 *
 * Thin wrapper (phase 222) around the shared toolkit implementation — the
 * only adapter-specific bit is passing *this* module's own `import.meta.url`
 * so the shared function anchors to host-claude-code's own package root.
 */
export function resolveLocalPaths(): LocalPaths {
  return resolveAdapterLocalPaths(import.meta.url);
}
