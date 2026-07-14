import { z } from 'zod';

// Phase 181: capability classes for MCP tools (`packages/core/src/mcp/tools.ts`).
// `APPROVAL_BYPASS` and `SETTLE` are the classes whose calls skip the
// interactive TTY approval prompt CLI usage would otherwise show — the trust
// envelope (this file) is what re-constrains them. `SETTLE` is classified but
// left ungated this phase (see DRAFT Boundaries).
export const McpCapabilityClassZ = z.enum([
  'READ_ONLY',
  'LEDGER_WRITE',
  'LOOP_WRITE',
  'APPROVAL_BYPASS',
  'SETTLE',
]);
export type McpCapabilityClass = z.infer<typeof McpCapabilityClassZ>;

// A single operator-issued grant of trust for one gated MCP tool. Bound to a
// structural hash of the tool's live definition (name + description +
// inputSchema shape) so a schema-stable-looking but behavior-changed server
// can't silently retain a prior caller's trust (revoke-on-version-change).
export const McpTrustGrantZ = z.object({
  toolName: z.string().min(1),
  capabilityClass: McpCapabilityClassZ,
  defHash: z.string().min(1),
  grantedAt: z.string().datetime({ offset: true }),
  grantedVersion: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
});
export type McpTrustGrant = z.infer<typeof McpTrustGrantZ>;

// File-backed ledger of grants, stored at `.cadence/mcp-trust.json` — a
// sibling of `state.json`/`intelligence/*.json`, never a `state.json` field
// (DRAFT Boundaries).
export const McpTrustLedgerZ = z.object({
  schemaVersion: z.number().int(),
  grants: z.array(McpTrustGrantZ).default([]),
});
export type McpTrustLedger = z.infer<typeof McpTrustLedgerZ>;

export function emptyMcpTrustLedger(): McpTrustLedger {
  return { schemaVersion: 1, grants: [] };
}
