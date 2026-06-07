import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { buildCadenceMcpServer } from '../../src/mcp/server.js';

async function connect(repoRoot: string): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = buildCadenceMcpServer(repoRoot, '1.16.0-test');
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

const call = (client: Client, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> =>
  client.callTool({ name, arguments: args }) as unknown as Promise<ToolResult>;

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('MCP tool parity (phase 76)', () => {
  // AC-1: the five new tools are advertised alongside the phase-58 set
  it('AC-1: advertises handoff/resume/recommendation/doctor tools', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      for (const t of [
        'cadence_handoff',
        'cadence_resume',
        'cadence_recommendation_add',
        'cadence_recommendation_promote',
        'cadence_doctor',
      ]) {
        expect(names).toContain(t);
      }
      // phase-58 tools still present
      expect(names).toContain('cadence_settle');
    } finally {
      await close();
    }
  });

  // AC-2: handoff writes a SESSION doc; a duplicate is a clean error
  it('AC-2: handoff writes a SESSION doc and duplicates error gracefully', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const r1 = await call(client, 'cadence_handoff', { label: 'parity', noGit: true });
      expect(r1.isError).toBeFalsy();
      expect(String(r1.structuredContent?.path)).toMatch(/SESSION-.*parity\.md$/);

      const r2 = await call(client, 'cadence_handoff', { label: 'parity', noGit: true });
      expect(r2.isError).toBe(true);
      // server still serving afterwards
      expect((await client.listTools()).tools.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  // AC-3: resume replays the freshest handoff, read-only
  it('AC-3: resume replays the freshest handoff', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      await call(client, 'cadence_handoff', { label: 'r', noGit: true });
      const res = await call(client, 'cadence_resume', {});
      expect(res.isError).toBeFalsy();
      expect(res.structuredContent?.found).toBe(true);
      expect(String(res.structuredContent?.handoffPath)).toMatch(/SESSION-.*r\.md$/);
      expect(['brief', 'full']).toContain(String(res.structuredContent?.mode));
    } finally {
      await close();
    }
  });

  // AC-4: recommendation add then promote round-trips, visible via the resource
  it('AC-4: recommendation add then promote advances readiness', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const added = await call(client, 'cadence_recommendation_add', {
        title: 'Test rec from MCP',
        readiness: 'raw-idea',
      });
      expect(added.isError).toBeFalsy();
      const id = String(added.structuredContent?.id);
      expect(id).toMatch(/^rec-/);
      expect(added.structuredContent?.readiness).toBe('raw-idea');

      const promoted = await call(client, 'cadence_recommendation_promote', {
        id,
        readiness: 'needs-evidence',
      });
      expect(promoted.isError).toBeFalsy();
      expect(promoted.structuredContent?.readiness).toBe('needs-evidence');

      // observable via the cadence://recommendations resource
      const rec = await client.readResource({ uri: 'cadence://recommendations' });
      expect((rec.contents[0] as { text?: string }).text).toContain(id);
    } finally {
      await close();
    }
  });

  // AC-5: doctor returns a structured report
  it('AC-5: doctor returns a structured health report', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const res = await call(client, 'cadence_doctor', {});
      expect(Array.isArray(res.structuredContent?.checks)).toBe(true);
      expect(typeof res.structuredContent?.ok).toBe('boolean');
    } finally {
      await close();
    }
  });

  // AC-6: a failing tool call returns an error result and the server keeps serving
  it('AC-6: promoting an unknown id errors gracefully', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const res = await call(client, 'cadence_recommendation_promote', {
        id: 'rec-does-not-exist',
        readiness: 'needs-evidence',
      });
      expect(res.isError).toBe(true);
      expect((await client.listTools()).tools.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });
});
