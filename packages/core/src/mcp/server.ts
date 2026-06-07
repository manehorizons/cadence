import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { bufferIO } from '../services/io.js';
import { TOOLS } from './tools.js';
import { registerResources } from './resources.js';

/**
 * Build the CADENCE MCP server (phase 58) — a third surface alongside the CLI
 * and the Claude-Code hook adapter. Registers the curated tool set; each tool
 * runs its shared service with a buffered `io` and serializes the captured text
 * plus structured `data` into the tool result. Pure: the caller owns transport
 * (`StdioServerTransport` in production, `InMemoryTransport` in tests).
 */
export function buildCadenceMcpServer(repoRoot: string, version: string): McpServer {
  const server = new McpServer({ name: 'cadence', version });

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        const io = bufferIO();
        try {
          const result = await tool.run(repoRoot, args ?? {}, io);
          const text = (io.stdout() || io.stderr()).trimEnd();
          const out: CallToolResult = {
            content: [
              { type: 'text', text: text.length > 0 ? text : result.exitCode === 0 ? 'ok' : 'failed' },
            ],
            isError: result.exitCode !== 0,
          };
          if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
            out.structuredContent = result.data as Record<string, unknown>;
          }
          return out;
        } catch (err) {
          // A thrown error (vs a non-zero exitCode) becomes an error tool result,
          // not a transport crash — the server keeps serving subsequent calls.
          const msg = err instanceof Error ? err.message : String(err);
          return { content: [{ type: 'text', text: `${tool.name} failed: ${msg}` }], isError: true };
        }
      },
    );
  }

  registerResources(server, repoRoot);

  return server;
}

/** The curated tool names this server advertises (handy for tests/AC-1). */
export const TOOL_NAMES: readonly string[] = TOOLS.map((t) => t.name);
