import type { McpTrustGrant, McpTrustLedger } from '@manehorizons/cadence-types';
import { TOOLS } from '../mcp/tools.js';
import { computeToolDefHash } from '../mcp/trust/def-hash.js';
import { readTrustLedger, writeTrustLedger } from '../mcp/trust/store.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence mcp trust grant/revoke/list` (phase 181, T4) — CLI-only, real-TTY,
 * operator-issued grants for the two `APPROVAL_BYPASS`-class MCP tools (plus
 * `SETTLE`, classified but left ungated this phase). Deliberately NOT exposed
 * as an MCP tool anywhere: an MCP client must never be able to self-attest or
 * self-grant its own trust — only a human on a real terminal, via this CLI
 * surface, can create a grant (DRAFT security constraint).
 *
 * All three functions gather no facts of their own beyond what the CLI layer
 * (`cli/commands/mcp.ts`) passes in (`version`) — the impure/pure split this
 * repo uses everywhere else.
 */

/** Capability classes that actually bypass the interactive TTY approval prompt
 * and therefore have something for a trust grant to gate. */
const GATED_CLASSES = new Set(['APPROVAL_BYPASS', 'SETTLE']);

export interface McpTrustGrantArgs {
  tool: string;
  /** Current CADENCE version, gathered by the CLI via `readPackageVersion()`. */
  version: string;
  /** Grant lifetime in days; omit for a grant that never expires. */
  ttlDays?: number;
}

export async function mcpTrustGrantService(
  repoRoot: string,
  args: McpTrustGrantArgs,
  io: CommandIO,
): Promise<CommandResult> {
  const tool = TOOLS.find((t) => t.name === args.tool);
  if (!tool) {
    io.err(
      `mcp trust grant refused: unknown tool "${args.tool}". ` +
        'Run `cadence mcp trust list` or check `cadence_progress`\'s tool catalog for valid names.\n',
    );
    return { exitCode: 1 };
  }

  if (!GATED_CLASSES.has(tool.capabilityClass)) {
    io.err(
      `mcp trust grant refused: nothing to gate — capability class ${tool.capabilityClass} ` +
        `does not require a trust grant. Only APPROVAL_BYPASS/SETTLE tools do; call ${tool.name} directly.\n`,
    );
    return { exitCode: 1 };
  }

  const now = new Date();
  const expiresAt =
    args.ttlDays !== undefined
      ? new Date(now.getTime() + args.ttlDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const grant: McpTrustGrant = {
    toolName: tool.name,
    capabilityClass: tool.capabilityClass,
    defHash: computeToolDefHash(tool),
    grantedAt: now.toISOString(),
    grantedVersion: args.version,
    expiresAt,
  };

  const ledger = await readTrustLedger(repoRoot);
  const next: McpTrustLedger = {
    ...ledger,
    grants: [...ledger.grants.filter((g) => g.toolName !== tool.name), grant],
  };
  await writeTrustLedger(repoRoot, next);

  io.out(
    `mcp trust grant: ${tool.name} granted (capability ${tool.capabilityClass}, version ${args.version}` +
      `${expiresAt ? `, expires ${expiresAt}` : ', never expires'})\n`,
  );
  return { exitCode: 0, data: grant };
}

export interface McpTrustRevokeArgs {
  tool: string;
}

export async function mcpTrustRevokeService(
  repoRoot: string,
  args: McpTrustRevokeArgs,
  io: CommandIO,
): Promise<CommandResult> {
  const ledger = await readTrustLedger(repoRoot);
  const existing = ledger.grants.find((g) => g.toolName === args.tool);
  if (!existing) {
    io.err(`mcp trust revoke refused: no grant found for tool "${args.tool}".\n`);
    return { exitCode: 1 };
  }

  const next: McpTrustLedger = {
    ...ledger,
    grants: ledger.grants.filter((g) => g.toolName !== args.tool),
  };
  await writeTrustLedger(repoRoot, next);

  io.out(`mcp trust revoke: ${args.tool} grant removed\n`);
  return { exitCode: 0 };
}

export interface McpTrustListArgs {
  /** Current CADENCE version, gathered by the CLI via `readPackageVersion()`. */
  version: string;
  json?: boolean;
}

export async function mcpTrustListService(
  repoRoot: string,
  args: McpTrustListArgs,
  io: CommandIO,
): Promise<CommandResult> {
  const ledger = await readTrustLedger(repoRoot);

  if (args.json) {
    io.out(`${JSON.stringify(ledger, null, 2)}\n`);
    return { exitCode: 0, data: ledger };
  }

  if (ledger.grants.length === 0) {
    io.out('mcp trust: no grants.\n');
    return { exitCode: 0, data: ledger };
  }

  const now = Date.now();
  io.out('tool | capability | granted (version) | expires | valid\n');
  for (const g of ledger.grants) {
    const notExpired = g.expiresAt === null || new Date(g.expiresAt).getTime() > now;
    const versionMatches = g.grantedVersion === args.version;
    const valid = notExpired && versionMatches ? 'yes' : 'no';
    io.out(
      `${g.toolName} | ${g.capabilityClass} | ${g.grantedAt} (v${g.grantedVersion}) | ` +
        `${g.expiresAt ?? 'never'} | ${valid}\n`,
    );
  }
  return { exitCode: 0, data: ledger };
}
