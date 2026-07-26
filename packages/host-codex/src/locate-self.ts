import { resolveAdapterLocalPaths } from '@manehorizons/cadence-host-toolkit/locate-self';
import type { LocalPaths } from '@manehorizons/cadence-host-toolkit/locate-self';

export type { LocalPaths };

/**
 * Resolve absolute paths to the local (workspace) builds of this adapter and
 * `@manehorizons/cadence-core`. Works both at runtime (running from
 * `packages/host-codex/dist/locate-self.js`) and under vitest (running from
 * `packages/host-codex/src/locate-self.ts`). Mirrors the Claude adapter.
 *
 * Thin wrapper (phase 222) around the shared toolkit implementation — the
 * only adapter-specific bit is passing *this* module's own `import.meta.url`
 * so the shared function anchors to host-codex's own package root.
 */
export function resolveLocalPaths(): LocalPaths {
  return resolveAdapterLocalPaths(import.meta.url);
}
