import type { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { processIO } from '../../services/io.js';
import { installMcpConfig, MCP_CLIENTS, type McpClient } from '../../mcp/install.js';

/** Read this package's version (dist/cli/commands/mcp.js → ../../../package.json). */
function readPackageVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '../../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function registerMcpCommand(program: Command): void {
  const cmd = program.command('mcp').description('Model Context Protocol surface');

  cmd
    .command('serve')
    .description('Run the CADENCE MCP server over stdio so any MCP host can drive the loop')
    .option('--repo <path>', 'repo root to operate on (default: current working directory)')
    .action(async (opts: { repo?: string }) => {
      const repoRoot = opts.repo ? resolve(process.cwd(), opts.repo) : process.cwd();
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
}
