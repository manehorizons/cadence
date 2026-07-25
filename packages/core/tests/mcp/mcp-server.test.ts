import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import type { McpTrustGrant } from '@manehorizons/cadence-types';
import { buildCadenceMcpServer } from '../../src/mcp/server.js';
import { TOOLS, type ToolDef } from '../../src/mcp/tools.js';
import { computeToolDefHash } from '../../src/mcp/trust/def-hash.js';
import { writeTrustLedger } from '../../src/mcp/trust/store.js';
import { readPackageVersion } from '../../src/version.js';

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

/**
 * Phase 221 (T4): CLI/MCP parity fixture — spawns the built CLI binary
 * (`dist/cli/index.js`, same pattern as `tests/cli/next.test.ts` /
 * `verify-coverage.test.ts` / `explain.test.ts`) against the exact same
 * `tempRepo` fixture root a parity test already drove through the MCP tool,
 * so the two code paths are compared against identical on-disk state.
 */
const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function runCli(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

/**
 * Phase 181 (mcp-tool-trust-envelope): `cadence_draft_approve` and
 * `cadence_spec_approve` are `APPROVAL_BYPASS` tools and now refuse without a
 * valid trust grant on file (see `mcp/trust/enforce.ts`). Tests exercising
 * the normal approve-call path need to seed a grant first — same pattern as
 * `tests/mcp/trust/enforce.test.ts`: a real `computeToolDefHash` against the
 * tool's live `ToolDef`, `grantedVersion` from `readPackageVersion()`, and
 * `expiresAt: null`.
 */
function findTool(name: string): ToolDef {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

function grantFor(tool: ToolDef): McpTrustGrant {
  return {
    toolName: tool.name,
    capabilityClass: tool.capabilityClass,
    defHash: computeToolDefHash(tool),
    grantedAt: new Date().toISOString(),
    grantedVersion: readPackageVersion(),
    expiresAt: null,
  };
}

async function grantApprovalBypass(repoRoot: string, toolName: string): Promise<void> {
  await writeTrustLedger(repoRoot, { schemaVersion: 1, grants: [grantFor(findTool(toolName))] });
}

const EXPECTED_TOOLS = [
  'cadence_progress',
  'cadence_status',
  'cadence_recommend',
  // phase 221 — MCP/CLI parity for next/verify/explain
  'cadence_next',
  'cadence_verify_coverage',
  'cadence_verify_phase',
  'cadence_explain',
  'cadence_draft_new',
  'cadence_draft_check',
  'cadence_draft_approve',
  'cadence_build_task',
  'cadence_settle',
  'cadence_spec_new',
  'cadence_spec_approve',
  // phase 76 — tool parity
  'cadence_handoff',
  'cadence_resume',
  'cadence_recommendation_add',
  'cadence_recommendation_promote',
  // phase 153 — MCP parity for the intelligence lifecycle
  'cadence_recommendation_convert',
  'cadence_recommendation_archive',
  'cadence_doctor',
  'cadence_milestone_propose',
];
const EXCLUDED = ['cadence_init', 'cadence_config', 'cadence_install'];

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
    // Phase 214 (T4): no real AC-1 coverage seeded here and predates
    // gates.evidenceFloor (defaultConfig's schema-level floor is 'mention')
    // — relax it to 'unverified' so this end-to-end loop-advance assertion
    // isn't newly refused by the unrelated evidence-floor gate.
    {
      const cfgPath = join(active.root, '.cadence', 'config.json');
      const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
      cfg.gates = { ...(cfg.gates ?? {}), evidenceFloor: 'unverified' };
      await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
    }
    const { client, close } = await connect(active.root);
    try {
      const dn = await call(client, 'cadence_draft_new', { phase: '01-foundation', num: '01', title: 'Demo' });
      expect(dn.isError).toBeFalsy();
      expect((dn.structuredContent as { id?: string }).id).toBe('01-01');

      await grantApprovalBypass(active.root, 'cadence_draft_approve');
      const da = await call(client, 'cadence_draft_approve', { phase: '01-foundation', num: '01' });
      expect(da.isError).toBeFalsy();
      expect((da.structuredContent as { loopPosition?: string }).loopPosition).toBe('BUILD');

      const bt = await call(client, 'cadence_build_task', { taskId: 'T1', status: 'DONE' });
      expect(bt.isError).toBeFalsy();

      // Phase 216: cadence_settle is now gated by the trust envelope too.
      await grantApprovalBypass(active.root, 'cadence_settle');
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
      await grantApprovalBypass(active.root, 'cadence_draft_approve');
      await call(client, 'cadence_draft_approve', { phase: '02-gate', num: '01' });
      await call(client, 'cadence_build_task', { taskId: 'T1', status: 'DONE' });
      // Phase 216: grant cadence_settle's own envelope so this exercises the
      // coverage gate specifically, not the (already-covered) trust refusal.
      await grantApprovalBypass(active.root, 'cadence_settle');
      const settle = await call(client, 'cadence_settle', { auto: true }); // no allowMissingCoverage
      expect(settle.isError).toBe(true);
      expect(text(settle)).toMatch(/coverage/i);
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

/**
 * Phase 221 (T4): MCP/CLI behavior parity for the four tools T3 relocated
 * into `services/{next,verify,explain}.ts` and registered in `mcp/tools.ts`
 * (`cadence_next`, `cadence_verify_coverage`, `cadence_verify_phase`,
 * `cadence_explain`). Each test drives both surfaces against the identical
 * on-disk fixture state and asserts real output equality — not just that
 * both "succeeded" — so a future edit that special-cases one call path
 * (e.g. threading a new arg into the CLI wrapper but not the MCP tool, or
 * vice versa) shows up as a real assertion failure here.
 */
const VERIFY_PHASE_DRAFT = `---
phase: 200-example-phase
id: 200-01
tier: standard
status: PENDING
---

# 200-01 — Example

## Objective

Example.

## Acceptance Criteria

### AC-1: example
Given a precondition
When an action
Then an outcome

## Tasks

### T1: Implement
- files: \`src/example.ts\`, \`src/example.test.ts\`
- action: implement
- verify: tests pass
- done: AC-1

## Boundaries

- None.
`;

describe('MCP/CLI parity — next/verify/explain (phase 221 T4)', () => {
  it('cadence_next: MCP structuredContent matches CLI `next --json` for the same IDLE repo state', async () => {
    active = await tempRepo({ initialized: true });
    const { client, close } = await connect(active.root);
    try {
      const mcp = await call(client, 'cadence_next', { json: true });
      expect(mcp.isError).toBeFalsy();

      const cli = await runCli(['next', '--json'], active.root);
      expect(cli.code).toBe(0);
      const cliParsed: unknown = JSON.parse(cli.stdout);

      expect(mcp.structuredContent).toEqual(cliParsed);
      expect((mcp.structuredContent as { schemaVersion?: number }).schemaVersion).toBe(1);
      expect((mcp.structuredContent as { position?: string }).position).toBe('IDLE');
    } finally {
      await close();
    }
  });

  it('cadence_verify_coverage: MCP structuredContent matches CLI `verify coverage --explain --json` for a real test-file fixture', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, 'packages/pkg'), { recursive: true });
    await writeFile(
      join(active.root, 'packages/pkg/a.test.ts'),
      "it('doc (AC-8)', () => { expect(1).toBe(1); });\n",
    );
    const { client, close } = await connect(active.root);
    try {
      const mcp = await call(client, 'cadence_verify_coverage', { explain: 'AC-8', json: true });
      expect(mcp.isError).toBeFalsy();

      const cli = await runCli(['verify', 'coverage', '--explain', 'AC-8', '--json'], active.root);
      expect(cli.code).toBe(0);
      const cliParsed: unknown = JSON.parse(cli.stdout);

      expect(mcp.structuredContent).toEqual(cliParsed);
      expect((mcp.structuredContent as { satisfied?: boolean }).satisfied).toBe(true);
    } finally {
      await close();
    }
  });

  it('cadence_verify_phase: MCP structuredContent matches CLI `verify phase --json --no-test-run` for a settled-phase fixture', async () => {
    active = await tempRepo({ initialized: true });
    const dir = join(active.root, '.cadence/phases/200-example-phase');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '200-01-DRAFT.md'), VERIFY_PHASE_DRAFT);
    await writeFile(
      join(dir, '200-01-SUMMARY.json'),
      JSON.stringify({
        schemaVersion: 1,
        draftId: '200-01',
        completedAt: '2026-07-20T00:00:00.000Z',
        acResults: [{ id: 'AC-1', pass: true, evidence: 'executed' }],
        taskResults: [{ id: 'T1', status: 'DONE', notes: '' }],
        decisions: [],
        deferred: [],
        skillAudit: { required: [], invoked: [] },
      }),
    );
    await mkdir(join(active.root, 'src'), { recursive: true });
    await writeFile(join(active.root, 'src/example.ts'), 'export const x = 1;\n');
    await writeFile(
      join(active.root, 'src/example.test.ts'),
      "it('covers AC-1', () => { expect(1).toBe(1); });\n",
    );
    const { client, close } = await connect(active.root);
    try {
      const mcp = await call(client, 'cadence_verify_phase', {
        phase: '200-example-phase',
        num: '01',
        json: true,
        testRun: false,
      });
      expect(mcp.isError).toBeFalsy();

      const cli = await runCli(
        ['verify', 'phase', '200-example-phase', '01', '--json', '--no-test-run'],
        active.root,
      );
      expect(cli.code).toBe(0);
      const cliParsed: unknown = JSON.parse(cli.stdout);

      expect(mcp.structuredContent).toEqual(cliParsed);
      expect((mcp.structuredContent as { mode?: string }).mode).toBe('single');
    } finally {
      await close();
    }
  });

  it('cadence_explain: MCP text + structuredContent match CLI `explain <concept>` output', async () => {
    active = await tempRepo({ initialized: true });
    const { client, close } = await connect(active.root);
    try {
      const mcp = await call(client, 'cadence_explain', { concept: 'loop' });
      expect(mcp.isError).toBeFalsy();

      const cli = await runCli(['explain', 'loop'], active.root);
      expect(cli.code).toBe(0);

      expect(text(mcp)).toBe(cli.stdout.trimEnd());
      expect(mcp.structuredContent).toEqual({ concept: 'loop' });
    } finally {
      await close();
    }
  });
});
