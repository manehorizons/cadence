import type { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

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
}
