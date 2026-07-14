import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Read this package's own version from its `package.json` (phase 181, T5).
 *
 * Resolved relative to this module's own location (`src/version.ts` under
 * vitest/ts-node, `dist/version.js` once built) rather than `process.cwd()`,
 * so it works regardless of what repo the CLI/MCP server is currently
 * operating on via `--repo`. `dist/version.js` sits directly under `dist/`,
 * which is a sibling of `package.json` — same for `src/version.ts` under
 * `src/` — so one `..` reaches the package root in both cases.
 *
 * Moved here from `cli/commands/mcp.ts` (phase 181, T5 architecture fix):
 * `packages/core/src/mcp/trust/enforce.ts` (a core MCP-module file) also
 * needs "the current running version" to compare against a trust grant's
 * `grantedVersion`, and importing a CLI-command file from a core MCP module
 * would be a backwards dependency. This is the shared home for both callers.
 */
// deja:new relocating the existing cli/commands/mcp.ts readPackageVersion verbatim into a shared module so mcp/trust/enforce.ts (core) never imports a CLI-layer file — the old local definition is deleted in this same change and re-imports from here (phase 181 T5)
export function readPackageVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
