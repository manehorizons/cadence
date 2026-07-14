import type { Command } from 'commander';
import { resolve } from 'node:path';
import { processIO } from '../../services/io.js';
import { installMcpConfig, MCP_CLIENTS, type McpClient } from '../../mcp/install.js';
import { readPackageVersion } from '../../version.js';
import {
  mcpTrustGrantService,
  mcpTrustRevokeService,
  mcpTrustListService,
} from '../../services/mcp-trust-grant.js';

export function registerMcpCommand(program: Command): void {
  const cmd = program.command('mcp').description('Model Context Protocol surface');

  cmd
    .command('serve')
    .description('Run the CADENCE MCP server over stdio so any MCP host can drive the loop')
    .option('--repo <path>', 'repo root to operate on (default: current working directory)')
    .action(async (opts: { repo?: string }) => {
      const repoRoot = opts.repo ? resolve(process.cwd(), opts.repo) : process.cwd();
      // Configure the diagnostic logger from config.logging so a persistent
      // logging block takes effect (Phase 81). Best-effort — the logger stays
      // stderr-only, so it never collides with the stdio MCP protocol channel.
      const { loadConfig } = await import('../../config/loader.js');
      const { configureLoggerFromConfig } = await import('../../logging/logger.js');
      configureLoggerFromConfig(await loadConfig(repoRoot));
      // Lazy-import the SDK + server so ordinary CLI commands never load the MCP
      // dependency (phase 58 AC-7). Both modules pull in @modelcontextprotocol/sdk.
      const [{ buildCadenceMcpServer }, { StdioServerTransport }] = await Promise.all([
        import('../../mcp/server.js'),
        import('@modelcontextprotocol/sdk/server/stdio.js'),
      ]);
      const server = buildCadenceMcpServer(repoRoot, readPackageVersion());
      const transport = new StdioServerTransport();
      await server.connect(transport);
      // server now owns the transport and serves until stdin closes.
    });

  cmd
    .command('install')
    .description('Wire the CADENCE MCP server into a host by writing/merging .mcp.json')
    .option('--repo <path>', 'repo root to operate on (default: current working directory)')
    .option('--print', 'print the config snippet instead of writing a file')
    .option(
      '--client <client>',
      `target host: ${MCP_CLIENTS.join(' | ')} (default: claude-code; non-claude-code is print-only)`,
    )
    .action(async (opts: { repo?: string; print?: boolean; client?: string }) => {
      const repoRoot = opts.repo ? resolve(process.cwd(), opts.repo) : process.cwd();
      let client: McpClient | undefined;
      if (opts.client !== undefined) {
        if (!MCP_CLIENTS.includes(opts.client as McpClient)) {
          process.stderr.write(
            `mcp install: invalid --client '${opts.client}' (expected ${MCP_CLIENTS.join(' | ')})\n`,
          );
          process.exitCode = 1;
          return;
        }
        client = opts.client as McpClient;
      }
      const res = await installMcpConfig(
        repoRoot,
        { ...(opts.print ? { print: true } : {}), ...(client ? { client } : {}) },
        processIO(),
      );
      process.exitCode = res.exitCode;
    });

  const trust = cmd
    .command('trust')
    .description(
      'Operator-issued MCP tool trust grants (CLI-only, real-TTY — never exposed over MCP; ' +
        'an MCP client can never self-attest or self-grant its own trust)',
    );

  trust
    .command('grant')
    .description('Grant trust for an APPROVAL_BYPASS/SETTLE MCP tool')
    .option('--repo <path>', 'repo root to operate on (default: current working directory)')
    .requiredOption('--tool <name>', 'MCP tool name, e.g. cadence_draft_approve')
    .option('--ttl-days <n>', 'grant expires after N days (default: never expires)')
    .action(async (opts: { repo?: string; tool: string; ttlDays?: string }) => {
      const repoRoot = opts.repo ? resolve(process.cwd(), opts.repo) : process.cwd();
      const args: { tool: string; version: string; ttlDays?: number } = {
        tool: opts.tool,
        version: readPackageVersion(),
      };
      if (opts.ttlDays !== undefined) {
        const n = Number(opts.ttlDays);
        if (!Number.isFinite(n) || n <= 0) {
          process.stderr.write('mcp trust grant: --ttl-days must be a positive number\n');
          process.exitCode = 1;
          return;
        }
        args.ttlDays = n;
      }
      const res = await mcpTrustGrantService(repoRoot, args, processIO());
      process.exitCode = res.exitCode;
    });

  trust
    .command('revoke')
    .description('Revoke a previously granted MCP tool trust grant')
    .option('--repo <path>', 'repo root to operate on (default: current working directory)')
    .requiredOption('--tool <name>', 'MCP tool name, e.g. cadence_draft_approve')
    .action(async (opts: { repo?: string; tool: string }) => {
      const repoRoot = opts.repo ? resolve(process.cwd(), opts.repo) : process.cwd();
      const res = await mcpTrustRevokeService(repoRoot, { tool: opts.tool }, processIO());
      process.exitCode = res.exitCode;
    });

  trust
    .command('list')
    .description('List MCP tool trust grants')
    .option('--repo <path>', 'repo root to operate on (default: current working directory)')
    .option('--json', 'print the raw trust ledger as JSON')
    .action(async (opts: { repo?: string; json?: boolean }) => {
      const repoRoot = opts.repo ? resolve(process.cwd(), opts.repo) : process.cwd();
      const res = await mcpTrustListService(
        repoRoot,
        { version: readPackageVersion(), ...(opts.json ? { json: true } : {}) },
        processIO(),
      );
      process.exitCode = res.exitCode;
    });
}
