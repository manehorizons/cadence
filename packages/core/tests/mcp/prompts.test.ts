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

const promptText = (res: { messages: Array<{ content: { type: string; text?: string } }> }): string =>
  res.messages.map((m) => (m.content.type === 'text' ? m.content.text ?? '' : '')).join('\n');

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('MCP prompts (phase 77)', () => {
  // AC-2: prompts/list advertises the curated set + prompts capability declared
  it('AC-2: advertises the guided prompts', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const names = (await client.listPrompts()).prompts.map((p) => p.name).sort();
      expect(names).toEqual(
        ['cadence_draft', 'cadence_next', 'cadence_scout', 'cadence_settle'].sort(),
      );
      expect(client.getServerCapabilities()?.prompts).toBeDefined();
    } finally {
      await close();
    }
  });

  // AC-3: scout prompt interpolates the topic into the shared dialogue
  it('AC-3: scout prompt substitutes the topic for $ARGUMENTS', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const res = await client.getPrompt({
        name: 'cadence_scout',
        arguments: { topic: 'observability options' },
      });
      const text = promptText(res as never);
      expect(text).toContain('observability options');
      expect(text).not.toContain('$ARGUMENTS');
      expect(text).toContain('CADENCE scout'); // body came from the shared dialogue
    } finally {
      await close();
    }
  });

  // AC-4: workflow prompts return guidance text built from the shared module
  it('AC-4: next/draft/settle prompts return guidance', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const { client, close } = await connect(active.root);
    try {
      const next = promptText((await client.getPrompt({ name: 'cadence_next' })) as never);
      expect(next.length).toBeGreaterThan(0);

      const draft = promptText(
        (await client.getPrompt({
          name: 'cadence_draft',
          arguments: { phase: '80-demo', num: '01' },
        })) as never,
      );
      expect(draft).toContain('80-demo');

      const settle = promptText((await client.getPrompt({ name: 'cadence_settle' })) as never);
      expect(settle.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });
});
