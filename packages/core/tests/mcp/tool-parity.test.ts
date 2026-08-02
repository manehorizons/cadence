import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
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
        'cadence_recommendation_convert',
        'cadence_recommendation_archive',
        'cadence_doctor',
        'cadence_milestone_propose',
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

  // AC-153-1: recommendation_convert turns a recommendation into a phase
  it('AC-153-1: recommendation_convert sets status converted + convertedToPhaseId', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const added = await call(client, 'cadence_recommendation_add', {
        title: 'Convert me',
      });
      expect(added.isError).toBeFalsy();
      const id = String(added.structuredContent?.id);
      expect(id).toMatch(/^rec-/);

      // Scaffold the target phase directory the way an MCP-only client would:
      // cadence_draft_new (without fromRec, so this test exercises convert in
      // isolation from draft-new's own chained-convert path).
      const drafted = await call(client, 'cadence_draft_new', {
        phase: '153-convert-parity',
        num: '01',
        title: 'Convert parity phase',
      });
      expect(drafted.isError).toBeFalsy();

      const converted = await call(client, 'cadence_recommendation_convert', {
        recId: id,
        toPhase: '153-convert-parity',
      });
      expect(converted.isError).toBeFalsy();
      expect(converted.structuredContent?.status).toBe('converted');
      expect(converted.structuredContent?.convertedToPhaseId).toBe('153-convert-parity');
    } finally {
      await close();
    }
  });

  // AC-153-2: converting an unknown recommendation id errors gracefully
  it('AC-153-2: recommendation_convert with an unknown id errors gracefully', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const drafted = await call(client, 'cadence_draft_new', {
        phase: '153-convert-parity-2',
        num: '01',
        title: 'Convert parity phase 2',
      });
      expect(drafted.isError).toBeFalsy();

      const res = await call(client, 'cadence_recommendation_convert', {
        recId: 'rec-does-not-exist',
        toPhase: '153-convert-parity-2',
      });
      expect(res.isError).toBe(true);
      expect((await client.listTools()).tools.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  // AC-153-3: milestone_propose clusters an eligible recommendation into a
  // proposed milestone, matching cadence milestone propose's own clustering.
  it('AC-153-3: milestone_propose clusters an eligible recommendation', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const added = await call(client, 'cadence_recommendation_add', {
        title: 'Cluster me',
        readiness: 'ready-for-milestone',
      });
      expect(added.isError).toBeFalsy();
      const id = String(added.structuredContent?.id);
      expect(id).toMatch(/^rec-/);

      const promoted = await call(client, 'cadence_recommendation_promote', {
        id,
        status: 'accepted',
      });
      expect(promoted.isError).toBeFalsy();

      const proposed = await call(client, 'cadence_milestone_propose', {});
      expect(proposed.isError).toBeFalsy();
      const milestones = proposed.structuredContent?.milestones as
        | Array<{ status: string; recommendationIds: string[] }>
        | undefined;
      expect(Array.isArray(milestones)).toBe(true);
      expect(
        milestones?.some((m) => m.status === 'proposed' && m.recommendationIds.includes(id)),
      ).toBe(true);

      // idempotent / re-runnable: calling again preserves the proposed milestone
      const proposedAgain = await call(client, 'cadence_milestone_propose', {});
      expect(proposedAgain.isError).toBeFalsy();
      const milestonesAgain = proposedAgain.structuredContent?.milestones as
        | Array<{ status: string; recommendationIds: string[] }>
        | undefined;
      expect(
        milestonesAgain?.some((m) => m.status === 'proposed' && m.recommendationIds.includes(id)),
      ).toBe(true);
    } finally {
      await close();
    }
  });

  // AC-153-4: recommendation_archive moves a live recommendation into the
  // ledger's archived array, stamping archivedAt/archiveReason.
  it('AC-153-4: recommendation_archive moves a rec into the archived array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const added = await call(client, 'cadence_recommendation_add', {
        title: 'Archive me',
      });
      expect(added.isError).toBeFalsy();
      const id = String(added.structuredContent?.id);
      expect(id).toMatch(/^rec-/);

      const archived = await call(client, 'cadence_recommendation_archive', {
        recId: id,
      });
      expect(archived.isError).toBeFalsy();
      expect(archived.structuredContent?.id).toBe(id);
      expect(archived.structuredContent?.archiveReason).toBe('manual');
      expect(typeof archived.structuredContent?.archivedAt).toBe('string');

      // the archived rec drops out of the active recommend surface, matching
      // `cadence recommendation archive`'s CLI behavior (recommendations
      // resource mirrors `cadence recommend --json`, the ranked/active view).
      const rec = await client.readResource({ uri: 'cadence://recommendations' });
      expect((rec.contents[0] as { text?: string }).text).not.toContain(id);
    } finally {
      await close();
    }
  });

  // AC-153-5: archiving an unknown recommendation id errors gracefully
  it('AC-153-5: recommendation_archive with an unknown id errors gracefully', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const res = await call(client, 'cadence_recommendation_archive', {
        recId: 'rec-does-not-exist',
      });
      expect(res.isError).toBe(true);
      expect((await client.listTools()).tools.length).toBeGreaterThan(0);
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
