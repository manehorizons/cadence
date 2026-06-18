import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { buildCadenceMcpServer } from '../../src/mcp/server.js';

/** Connect an in-process MCP client to a CADENCE server scoped to `repoRoot`. */
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

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('MCP resources (phase 75)', () => {
  // AC-1: resources/list advertises the curated static cadence:// set with mimeTypes
  it('AC-1: lists the curated static resources with correct uris and mimeTypes', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const { resources } = await client.listResources();
      const byUri = new Map(resources.map((r) => [r.uri, r]));
      expect(byUri.get('cadence://state')?.mimeType).toBe('text/markdown');
      expect(byUri.get('cadence://state.json')?.mimeType).toBe('application/json');
      expect(byUri.get('cadence://roadmap')?.mimeType).toBe('text/markdown');
      expect(byUri.get('cadence://project')?.mimeType).toBe('text/markdown');
      expect(byUri.get('cadence://recommendations')?.mimeType).toBe('application/json');
    } finally {
      await close();
    }
  });

  // AC-2: resources/read round-trips each static resource against the on-disk artifact
  it('AC-2: reads each static resource, matching the bytes the CLI reads', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const root = active.root;
    const { client, close } = await connect(root);
    try {
      const readUri = async (uri: string): Promise<string> => {
        const res = await client.readResource({ uri });
        return (res.contents[0] as { text?: string }).text ?? '';
      };
      expect(await readUri('cadence://state')).toBe(
        await readFile(join(root, '.cadence/STATE.md'), 'utf8'),
      );
      expect(await readUri('cadence://state.json')).toBe(
        await readFile(join(root, '.cadence/state.json'), 'utf8'),
      );
      expect(await readUri('cadence://roadmap')).toBe(
        await readFile(join(root, '.cadence/ROADMAP.md'), 'utf8'),
      );
      expect(await readUri('cadence://project')).toBe(
        await readFile(join(root, '.cadence/PROJECT.md'), 'utf8'),
      );
      // recommendations is the recommend --json payload — valid JSON
      const recs = await readUri('cadence://recommendations');
      expect(() => JSON.parse(recs)).not.toThrow();
    } finally {
      await close();
    }
  });

  // AC-3: templated phase resources are advertised and resolve to phase artifacts
  it('AC-3: lists phase resource templates and reads draft/summary', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const root = active.root;
    const dir = join(root, '.cadence/phases/01-demo');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '01-01-DRAFT.md'), '# draft body\n');
    await writeFile(join(dir, '01-01-SUMMARY.md'), '# summary body\n');
    const { client, close } = await connect(root);
    try {
      const { resourceTemplates } = await client.listResourceTemplates();
      const patterns = resourceTemplates.map((t) => t.uriTemplate);
      expect(patterns).toContain('cadence://phase/{phase}/draft');
      expect(patterns).toContain('cadence://phase/{phase}/summary');

      const draft = await client.readResource({ uri: 'cadence://phase/01-demo/draft' });
      expect((draft.contents[0] as { text?: string }).text).toBe('# draft body\n');
      const summary = await client.readResource({ uri: 'cadence://phase/01-demo/summary' });
      expect((summary.contents[0] as { text?: string }).text).toBe('# summary body\n');
    } finally {
      await close();
    }
  });

  // AC-4: a missing artifact yields a clean error and the server keeps serving
  it('AC-4: missing artifact rejects gracefully without crashing the server', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const root = active.root;
    const dir = join(root, '.cadence/phases/02-empty');
    await mkdir(dir, { recursive: true });
    const { client, close } = await connect(root);
    try {
      await expect(
        client.readResource({ uri: 'cadence://phase/02-empty/summary' }),
      ).rejects.toThrow();
      // server still serves a subsequent request
      const { resources } = await client.listResources();
      expect(resources.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it('AC-6: rejects unsafe phase slugs in templated resources', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      await expect(
        client.readResource({ uri: 'cadence://phase/01-x%2F..%2F..%2Fescape/draft' }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  // AC-5: tool surface unchanged and the resources capability is now declared
  it('AC-5: existing tool set is unchanged and resources capability is declared', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      // the phase-58 curated tools remain advertised (no regression)
      for (const t of [
        'cadence_progress',
        'cadence_status',
        'cadence_recommend',
        'cadence_draft_new',
        'cadence_draft_check',
        'cadence_draft_approve',
        'cadence_build_task',
        'cadence_settle',
        'cadence_spec_new',
        'cadence_spec_approve',
      ]) {
        expect(names).toContain(t);
      }
      expect(client.getServerCapabilities()?.resources).toBeDefined();
    } finally {
      await close();
    }
  });
});
