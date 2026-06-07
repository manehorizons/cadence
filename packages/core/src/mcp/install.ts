import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandIO, CommandResult } from '../services/io.js';

/**
 * `cadence mcp install` (phase 78) — paste-free wiring of the MCP server into a
 * host. Pure merge/snippet helpers + a thin file-I/O service. Deliberately
 * SDK-free: registering this command must not load `@modelcontextprotocol/sdk`
 * (only `mcp serve` does).
 */

export type McpClient = 'claude-code' | 'claude-desktop' | 'cursor';
export const MCP_CLIENTS: readonly McpClient[] = ['claude-code', 'claude-desktop', 'cursor'];

export const CADENCE_MCP_ENTRY = { command: 'cadence', args: ['mcp', 'serve'] } as const;

const cadenceEntry = (): { command: string; args: string[] } => ({
  command: CADENCE_MCP_ENTRY.command,
  args: [...CADENCE_MCP_ENTRY.args],
});

/**
 * Merge the cadence server entry into existing `.mcp.json` text (or create
 * fresh when null). Non-destructive: preserves unknown top-level keys and any
 * existing `mcpServers`; only the `cadence` key is set. Idempotent. Throws on
 * malformed / non-object JSON (the caller must not overwrite in that case).
 */
export function mergeMcpConfig(existing: string | null): string {
  let root: Record<string, unknown> = {};
  if (existing !== null && existing.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(existing);
    } catch {
      throw new Error('.mcp.json is not valid JSON — fix or remove it, then re-run');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('.mcp.json must be a JSON object');
    }
    root = parsed as Record<string, unknown>;
  }
  const existingServers = root.mcpServers;
  const servers: Record<string, unknown> =
    existingServers && typeof existingServers === 'object' && !Array.isArray(existingServers)
      ? { ...(existingServers as Record<string, unknown>) }
      : {};
  servers.cadence = cadenceEntry();
  root.mcpServers = servers;
  return JSON.stringify(root, null, 2) + '\n';
}

/** The paste-ready snippet (same `mcpServers` shape across hosts). */
export function mcpSnippet(): string {
  return JSON.stringify({ mcpServers: { cadence: cadenceEntry() } }, null, 2) + '\n';
}

/** Where to paste the snippet for a given host. */
export function clientHint(client: McpClient): string {
  switch (client) {
    case 'claude-code':
      return 'Add to .mcp.json in your project root (Claude Code reads it automatically).';
    case 'claude-desktop':
      return 'Add to claude_desktop_config.json (Settings → Developer → Edit Config).';
    case 'cursor':
      return 'Add to ~/.cursor/mcp.json (or .cursor/mcp.json in your project).';
  }
}

export interface InstallOptions {
  print?: boolean;
  client?: McpClient;
}

/**
 * Install/merge the cadence MCP server config. Only Claude Code's `.mcp.json` is
 * written; `--print` or any other client emits the snippet + a path hint and
 * writes nothing.
 */
export async function installMcpConfig(
  repoRoot: string,
  opts: InstallOptions,
  io: CommandIO,
): Promise<CommandResult> {
  const client = opts.client ?? 'claude-code';
  if (opts.print || client !== 'claude-code') {
    io.out(mcpSnippet());
    io.out(`\n${clientHint(client)}\n`);
    return { exitCode: 0, data: { wrote: false, client } };
  }

  const path = join(repoRoot, '.mcp.json');
  let existing: string | null = null;
  try {
    existing = await readFile(path, 'utf8');
  } catch {
    existing = null;
  }
  let merged: string;
  try {
    merged = mergeMcpConfig(existing);
  } catch (err) {
    io.err(`${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
  const action = existing === null ? 'created' : 'updated';
  await writeFile(path, merged, 'utf8');
  io.out(`mcp install: ${action} ${path} (mcpServers.cadence)\n`);
  return { exitCode: 0, data: { wrote: true, path, action, client } };
}
