import { describe, it, expect, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import type { McpTrustGrant } from '@manehorizons/cadence-types';
import { buildCadenceMcpServer } from '../../../src/mcp/server.js';
import { TOOLS, type ToolDef } from '../../../src/mcp/tools.js';
import { computeToolDefHash } from '../../../src/mcp/trust/def-hash.js';
import { writeTrustLedger } from '../../../src/mcp/trust/store.js';
import { enforceApprovalBypassGrant } from '../../../src/mcp/trust/enforce.js';
import { readPackageVersion } from '../../../src/version.js';

/**
 * T5 (phase 181) — the two `APPROVAL_BYPASS` MCP tools (`cadence_draft_approve`,
 * `cadence_spec_approve`) must refuse BEFORE `draftApproveService`/
 * `specApproveService` ever run, unless a valid, matching, unexpired trust
 * grant exists (AC-1). Covers `enforceApprovalBypassGrant` directly (unit
 * level) and the real MCP server end-to-end (integration level, per
 * `mcp-server.test.ts`'s `InMemoryTransport` pattern).
 */

function findTool(name: string): ToolDef {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}
const draftApproveTool = (): ToolDef => findTool('cadence_draft_approve');
const specApproveTool = (): ToolDef => findTool('cadence_spec_approve');

function grantFor(tool: ToolDef, overrides: Partial<McpTrustGrant> = {}): McpTrustGrant {
  return {
    toolName: tool.name,
    capabilityClass: 'APPROVAL_BYPASS',
    defHash: computeToolDefHash(tool),
    grantedAt: new Date().toISOString(),
    grantedVersion: readPackageVersion(),
    expiresAt: null,
    ...overrides,
  };
}

async function connect(repoRoot: string): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = buildCadenceMcpServer(repoRoot, readPackageVersion());
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as unknown as ToolResult;
}

const text = (r: ToolResult): string => r.content.map((c) => c.text ?? '').join('\n');

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('enforceApprovalBypassGrant (unit, phase 181 T5)', () => {
  it('AC-1: refuses naming a missing grant when no grant exists for the tool', async () => {
    active = await tempRepo({ initialized: true });
    const result = await enforceApprovalBypassGrant(active.root, draftApproveTool());
    // AC-1: refuse with a reason naming which envelope check failed
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no .*grant/i);
  });

  it('AC-1: passes when a valid, matching, unexpired grant exists', async () => {
    active = await tempRepo({ initialized: true });
    const tool = draftApproveTool();
    await writeTrustLedger(active.root, { schemaVersion: 1, grants: [grantFor(tool)] });
    const result = await enforceApprovalBypassGrant(active.root, tool);
    expect(result.ok).toBe(true);
  });

  it('AC-1: refuses naming a def-hash mismatch when the stored defHash is stale', async () => {
    active = await tempRepo({ initialized: true });
    const tool = draftApproveTool();
    await writeTrustLedger(active.root, {
      schemaVersion: 1,
      grants: [grantFor(tool, { defHash: 'stale-hash-deadbeef' })],
    });
    const result = await enforceApprovalBypassGrant(active.root, tool);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/def-hash|hash/i);
  });

  it('AC-1: refuses naming a version mismatch when grantedVersion differs from the running version', async () => {
    active = await tempRepo({ initialized: true });
    const tool = specApproveTool();
    await writeTrustLedger(active.root, {
      schemaVersion: 1,
      grants: [grantFor(tool, { grantedVersion: '0.0.1-not-the-running-version' })],
    });
    const result = await enforceApprovalBypassGrant(active.root, tool);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/version/i);
  });

  it('AC-1: refuses naming expiry when the grant is expired', async () => {
    active = await tempRepo({ initialized: true });
    const tool = draftApproveTool();
    await writeTrustLedger(active.root, {
      schemaVersion: 1,
      grants: [grantFor(tool, { expiresAt: new Date(Date.now() - 60_000).toISOString() })],
    });
    const result = await enforceApprovalBypassGrant(active.root, tool);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/expir/i);
  });

  it('covers both APPROVAL_BYPASS tools — cadence_spec_approve is also gated', async () => {
    active = await tempRepo({ initialized: true });
    const noGrant = await enforceApprovalBypassGrant(active.root, specApproveTool());
    expect(noGrant.ok).toBe(false);

    const tool = specApproveTool();
    await writeTrustLedger(active.root, { schemaVersion: 1, grants: [grantFor(tool)] });
    const withGrant = await enforceApprovalBypassGrant(active.root, tool);
    expect(withGrant.ok).toBe(true);
  });
});

describe('MCP integration: approval-bypass enforcement (phase 181 T5)', () => {
  it('AC-1: no grant -> cadence_draft_approve is refused over MCP; state.json/DRAFT unchanged', async () => {
    active = await tempRepo({ initialized: true });
    const { client, close } = await connect(active.root);
    try {
      const dn = await call(client, 'cadence_draft_new', { phase: '01-foundation', num: '01', title: 'Demo' });
      expect(dn.isError).toBeFalsy();

      const statePath = join(active.root, '.cadence/state.json');
      const draftPath = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
      const stateBefore = await readFile(statePath, 'utf8');
      const draftBefore = await readFile(draftPath, 'utf8');

      const da = await call(client, 'cadence_draft_approve', { phase: '01-foundation', num: '01' });
      // AC-1: refused with a reason naming which envelope check failed; no state.json/DRAFT write
      expect(da.isError).toBe(true);
      expect(text(da)).toMatch(/cadence_draft_approve refused/);

      expect(await readFile(statePath, 'utf8')).toBe(stateBefore);
      expect(await readFile(draftPath, 'utf8')).toBe(draftBefore);
      const state = JSON.parse(await readFile(statePath, 'utf8')) as { loopPosition: string };
      expect(state.loopPosition).toBe('DRAFT');
    } finally {
      await close();
    }
  });

  it('AC-1: no grant -> cadence_spec_approve is also refused over MCP (both tools gated)', async () => {
    active = await tempRepo({ initialized: true });
    const { client, close } = await connect(active.root);
    try {
      const sn = await call(client, 'cadence_spec_new', { phase: '02-spec', num: '01', title: 'Demo' });
      expect(sn.isError).toBeFalsy();

      const statePath = join(active.root, '.cadence/state.json');
      const stateBefore = await readFile(statePath, 'utf8');

      const sa = await call(client, 'cadence_spec_approve', { phase: '02-spec', num: '01' });
      expect(sa.isError).toBe(true);
      expect(text(sa)).toMatch(/cadence_spec_approve refused/);

      expect(await readFile(statePath, 'utf8')).toBe(stateBefore);
      const state = JSON.parse(await readFile(statePath, 'utf8')) as { loopPosition: string };
      expect(state.loopPosition).toBe('SPEC');
    } finally {
      await close();
    }
  });

  it('a valid, matching grant lets cadence_draft_approve proceed to the real service', async () => {
    active = await tempRepo({ initialized: true });
    const { client, close } = await connect(active.root);
    try {
      const dn = await call(client, 'cadence_draft_new', { phase: '03-granted', num: '01', title: 'Demo' });
      expect(dn.isError).toBeFalsy();

      await writeTrustLedger(active.root, {
        schemaVersion: 1,
        grants: [grantFor(draftApproveTool())],
      });

      const da = await call(client, 'cadence_draft_approve', { phase: '03-granted', num: '01' });
      // Enforcement did NOT block the call — it reached the real draftApproveService.
      expect(da.isError).toBeFalsy();
      expect((da.structuredContent as { loopPosition?: string }).loopPosition).toBe('BUILD');
    } finally {
      await close();
    }
    const state = JSON.parse(
      await readFile(join(active.root, '.cadence/state.json'), 'utf8'),
    ) as { loopPosition: string };
    expect(state.loopPosition).toBe('BUILD');
  });

  it('a valid, matching grant lets cadence_spec_approve proceed to the real service', async () => {
    active = await tempRepo({ initialized: true });
    const { client, close } = await connect(active.root);
    try {
      const sn = await call(client, 'cadence_spec_new', { phase: '04-granted-spec', num: '01', title: 'Demo' });
      expect(sn.isError).toBeFalsy();

      await writeTrustLedger(active.root, {
        schemaVersion: 1,
        grants: [grantFor(specApproveTool())],
      });

      const sa = await call(client, 'cadence_spec_approve', { phase: '04-granted-spec', num: '01' });
      expect(sa.isError).toBeFalsy();
    } finally {
      await close();
    }
    const state = JSON.parse(
      await readFile(join(active.root, '.cadence/state.json'), 'utf8'),
    ) as { loopPosition: string };
    expect(state.loopPosition).toBe('IDLE');
  });

  it('a grant against a stale defHash refuses cadence_draft_approve over MCP', async () => {
    active = await tempRepo({ initialized: true });
    const { client, close } = await connect(active.root);
    try {
      await call(client, 'cadence_draft_new', { phase: '05-stale', num: '01', title: 'Demo' });

      await writeTrustLedger(active.root, {
        schemaVersion: 1,
        grants: [grantFor(draftApproveTool(), { defHash: 'a-hash-that-no-longer-matches' })],
      });

      const da = await call(client, 'cadence_draft_approve', { phase: '05-stale', num: '01' });
      expect(da.isError).toBe(true);
      expect(text(da)).toMatch(/hash/i);
    } finally {
      await close();
    }
  });

  it('a grant with a mismatched grantedVersion refuses cadence_draft_approve over MCP', async () => {
    active = await tempRepo({ initialized: true });
    const { client, close } = await connect(active.root);
    try {
      await call(client, 'cadence_draft_new', { phase: '06-oldver', num: '01', title: 'Demo' });

      await writeTrustLedger(active.root, {
        schemaVersion: 1,
        grants: [grantFor(draftApproveTool(), { grantedVersion: '0.0.1-stale' })],
      });

      const da = await call(client, 'cadence_draft_approve', { phase: '06-oldver', num: '01' });
      expect(da.isError).toBe(true);
      expect(text(da)).toMatch(/version/i);
    } finally {
      await close();
    }
  });

  it('an expired grant refuses cadence_draft_approve over MCP', async () => {
    active = await tempRepo({ initialized: true });
    const { client, close } = await connect(active.root);
    try {
      await call(client, 'cadence_draft_new', { phase: '07-expired', num: '01', title: 'Demo' });

      await writeTrustLedger(active.root, {
        schemaVersion: 1,
        grants: [
          grantFor(draftApproveTool(), { expiresAt: new Date(Date.now() - 60_000).toISOString() }),
        ],
      });

      const da = await call(client, 'cadence_draft_approve', { phase: '07-expired', num: '01' });
      expect(da.isError).toBe(true);
      expect(text(da)).toMatch(/expir/i);
    } finally {
      await close();
    }
  });
});
