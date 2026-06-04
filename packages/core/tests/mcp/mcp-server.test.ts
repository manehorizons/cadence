import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { buildCadenceMcpServer } from '../../src/mcp/server.js';

/** Connect an in-process MCP client to a CADENCE server scoped to `repoRoot`. */
async function connect(repoRoot: string): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = buildCadenceMcpServer(repoRoot, '1.7.0-test');
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

const EXPECTED_TOOLS = [
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
];
const EXCLUDED = ['cadence_init', 'cadence_config', 'cadence_doctor', 'cadence_install', 'cadence_handoff', 'cadence_resume'];

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('MCP server surface (phase 58)', () => {
  // AC-1: serve handshake + exact tool discovery
  it('AC-1: handshake succeeds and advertises exactly the curated tool set', async () => {
    active = await tempRepo({ initialized: true });
    const { client, close } = await connect(active.root);
    try {
      expect(client.getServerVersion()?.name).toBe('cadence');
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([...EXPECTED_TOOLS].sort());
      for (const ex of EXCLUDED) expect(names).not.toContain(ex);
    } finally {
      await close();
    }
  });

  // AC-2: read tools return structured loop state without mutating
  it('AC-2: read tools return structured state and do not mutate .cadence', async () => {
    active = await tempRepo({ initialized: true });
    const statePath = join(active.root, '.cadence/state.json');
    const before = await readFile(statePath, 'utf8');
    const { client, close } = await connect(active.root);
    try {
      const progress = await call(client, 'cadence_progress');
      expect(progress.isError).toBeFalsy();
      expect(String((progress.structuredContent as { command?: string }).command)).toMatch(/draft new/);

      const status = await call(client, 'cadence_status', { json: true });
      expect(status.isError).toBeFalsy();
      expect((status.structuredContent as { loopPosition?: string }).loopPosition).toBe('IDLE');

      const recommend = await call(client, 'cadence_recommend', { json: true });
      expect(recommend.isError).toBeFalsy();
      expect(recommend.structuredContent).toBeDefined();
    } finally {
      await close();
    }
    expect(await readFile(statePath, 'utf8')).toBe(before);
  });

  // AC-3: write tools drive the loop end-to-end
  it('AC-3: draft_new → draft_approve → build_task → settle advances the loop to IDLE', async () => {
    active = await tempRepo({ initialized: true });
    const { client, close } = await connect(active.root);
    try {
      const dn = await call(client, 'cadence_draft_new', { phase: '01-foundation', num: '01', title: 'Demo' });
      expect(dn.isError).toBeFalsy();
      expect((dn.structuredContent as { id?: string }).id).toBe('01-01');

      const da = await call(client, 'cadence_draft_approve', { phase: '01-foundation', num: '01' });
      expect(da.isError).toBeFalsy();
      expect((da.structuredContent as { loopPosition?: string }).loopPosition).toBe('BUILD');

      const bt = await call(client, 'cadence_build_task', { taskId: 'T1', status: 'DONE' });
      expect(bt.isError).toBeFalsy();

      const settle = await call(client, 'cadence_settle', { auto: true, allowMissingCoverage: true });
      expect(settle.isError).toBeFalsy();
      expect((settle.structuredContent as { settled?: string }).settled).toBe('01-01');
    } finally {
      await close();
    }
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('IDLE');
    expect(existsSync(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'))).toBe(true);
  });

  // AC-4: command-boundary gates fire over MCP
  it('AC-4: draft_check reports a coherence blocker and settle refuses on a missing-coverage gate', async () => {
    active = await tempRepo({ initialized: true });
    // Coherence blocker: PROJECT.md forbids a file the DRAFT touches.
    await writeFile(join(active.root, '.cadence/PROJECT.md'), '# proj\n\nDO NOT edit src/widget.ts.\n');
    await mkdir(join(active.root, '.cadence/phases/01-foundation'), { recursive: true });
    await writeFile(
      join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md'),
      `---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: PENDING\n---\n\n# 01-01 — Demo\n\n## Objective\n\nGlow.\n\n## Acceptance Criteria\n\n### AC-1: Glows\nGiven x\nWhen y\nThen z\n\n## Tasks\n\n### T1: edit\n- files: \`src/widget.ts\`\n- action: edit\n- verify: tests\n- done: AC-1\n\n## Boundaries\n`,
    );
    const { client, close } = await connect(active.root);
    try {
      const check = await call(client, 'cadence_draft_check', { phase: '01-foundation', num: '01' });
      expect(check.isError).toBe(true);
      expect(text(check)).toMatch(/PROJECT_FORBIDDEN/);

      // Settle gate stack: missing test-coverage refuses without the bypass.
      await call(client, 'cadence_draft_new', { phase: '02-gate', num: '01', title: 'G' });
      await call(client, 'cadence_draft_approve', { phase: '02-gate', num: '01' });
      await call(client, 'cadence_build_task', { taskId: 'T1', status: 'DONE' });
      const settle = await call(client, 'cadence_settle', { auto: true }); // no allowMissingCoverage
      expect(settle.isError).toBe(true);
    } finally {
      await close();
    }
    // The refused settle left the loop in BUILD (gate fired, no state mutation).
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('BUILD');
  });

  // AC-5: typed errors become MCP error results, not crashes
  it('AC-5: a write tool on an uninitialized repo returns an error result and the server stays up', async () => {
    active = await tempRepo({ initialized: false });
    const { client, close } = await connect(active.root);
    try {
      const dn = await call(client, 'cadence_draft_new', { phase: '01-foundation', num: '01' });
      expect(dn.isError).toBe(true);
      expect(text(dn)).toMatch(/not initialized/i);
      expect(text(dn)).toMatch(/cadence init/);

      // Server still serves a subsequent call (it did not crash).
      const again = await call(client, 'cadence_progress');
      expect(again).toBeDefined();
    } finally {
      await close();
    }
  });

  // AC-6: --repo scopes the server to a target repo
  it('AC-6: the server writes into its repoRoot, not other repos or the cwd', async () => {
    const repoA = await tempRepo({ initialized: true });
    const repoB = await tempRepo({ initialized: true });
    try {
      const { client, close } = await connect(repoA.root);
      try {
        const dn = await call(client, 'cadence_draft_new', { phase: '07-scoped', num: '01', title: 'Scoped' });
        expect(dn.isError).toBeFalsy();
      } finally {
        await close();
      }
      expect(existsSync(join(repoA.root, '.cadence/phases/07-scoped/07-01-DRAFT.md'))).toBe(true);
      expect(existsSync(join(repoB.root, '.cadence/phases/07-scoped'))).toBe(false);
    } finally {
      await repoA.cleanup();
      await repoB.cleanup();
    }
  });
});
