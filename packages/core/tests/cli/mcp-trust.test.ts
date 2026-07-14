import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { TOOLS } from '../../src/mcp/tools.js';
import { computeToolDefHash } from '../../src/mcp/trust/def-hash.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(HERE, '..', '..', 'dist', 'cli', 'index.js');
const CORE_PACKAGE_JSON = join(HERE, '..', '..', 'package.json');

async function packageVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(CORE_PACKAGE_JSON, 'utf8')) as { version: string };
  return pkg.version;
}

function run(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence mcp trust', () => {
  it('AC-1: grant then list shows the entry with the correct defHash/capabilityClass/grantedVersion', async () => {
    active = await tempRepo({ initialized: true });
    const version = await packageVersion();
    const tool = TOOLS.find((t) => t.name === 'cadence_draft_approve');
    expect(tool).toBeDefined();
    const expectedHash = computeToolDefHash(tool!);

    const grant = await run(['mcp', 'trust', 'grant', '--tool', 'cadence_draft_approve'], active.root);
    expect(grant.code).toBe(0);
    expect(grant.stderr).toBe('');

    const list = await run(['mcp', 'trust', 'list', '--json'], active.root);
    expect(list.code).toBe(0);
    const ledger = JSON.parse(list.stdout);
    expect(ledger.grants).toHaveLength(1);
    const entry = ledger.grants[0];
    expect(entry.toolName).toBe('cadence_draft_approve');
    expect(entry.capabilityClass).toBe('APPROVAL_BYPASS');
    expect(entry.defHash).toBe(expectedHash);
    expect(entry.grantedVersion).toBe(version);
    expect(entry.expiresAt).toBeNull();
  });

  it('revoke removes a previously-granted entry; list afterward shows it gone', async () => {
    active = await tempRepo({ initialized: true });
    expect(
      (await run(['mcp', 'trust', 'grant', '--tool', 'cadence_spec_approve'], active.root)).code,
    ).toBe(0);

    const before = JSON.parse(
      (await run(['mcp', 'trust', 'list', '--json'], active.root)).stdout,
    );
    expect(before.grants.map((g: { toolName: string }) => g.toolName)).toContain(
      'cadence_spec_approve',
    );

    const revoke = await run(['mcp', 'trust', 'revoke', '--tool', 'cadence_spec_approve'], active.root);
    expect(revoke.code).toBe(0);
    expect(revoke.stderr).toBe('');

    const after = JSON.parse((await run(['mcp', 'trust', 'list', '--json'], active.root)).stdout);
    expect(after.grants.map((g: { toolName: string }) => g.toolName)).not.toContain(
      'cadence_spec_approve',
    );
  });

  it('revoke refuses cleanly when no grant exists for that tool', async () => {
    active = await tempRepo({ initialized: true });
    const revoke = await run(['mcp', 'trust', 'revoke', '--tool', 'cadence_draft_approve'], active.root);
    expect(revoke.code).toBe(1);
    expect(revoke.stderr).toMatch(/no grant found for tool "cadence_draft_approve"/);
  });

  it('grant against a READ_ONLY tool is refused with exit 1 and does not write the ledger', async () => {
    active = await tempRepo({ initialized: true });
    const readOnlyTool = TOOLS.find((t) => t.name === 'cadence_progress');
    expect(readOnlyTool?.capabilityClass).toBe('READ_ONLY');

    const r = await run(['mcp', 'trust', 'grant', '--tool', 'cadence_progress'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/nothing to gate/);
    expect(r.stderr).toMatch(/READ_ONLY/);

    expect(existsSync(join(active.root, '.cadence', 'mcp-trust.json'))).toBe(false);
  });

  it('grant against an unknown tool name is refused with exit 1', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['mcp', 'trust', 'grant', '--tool', 'cadence_does_not_exist'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/unknown tool "cadence_does_not_exist"/);
    expect(existsSync(join(active.root, '.cadence', 'mcp-trust.json'))).toBe(false);
  });

  it('--ttl-days sets a real expiresAt in the future; omitting it leaves expiresAt null', async () => {
    active = await tempRepo({ initialized: true });

    const withTtl = await run(
      ['mcp', 'trust', 'grant', '--tool', 'cadence_draft_approve', '--ttl-days', '7'],
      active.root,
    );
    expect(withTtl.code).toBe(0);

    const withoutTtl = await run(['mcp', 'trust', 'grant', '--tool', 'cadence_spec_approve'], active.root);
    expect(withoutTtl.code).toBe(0);

    const ledger = JSON.parse((await run(['mcp', 'trust', 'list', '--json'], active.root)).stdout);
    const ttlEntry = ledger.grants.find(
      (g: { toolName: string }) => g.toolName === 'cadence_draft_approve',
    );
    const noTtlEntry = ledger.grants.find(
      (g: { toolName: string }) => g.toolName === 'cadence_spec_approve',
    );

    expect(ttlEntry.expiresAt).not.toBeNull();
    const expiresAtMs = new Date(ttlEntry.expiresAt).getTime();
    const now = Date.now();
    expect(expiresAtMs).toBeGreaterThan(now + 6 * 24 * 60 * 60 * 1000);
    expect(expiresAtMs).toBeLessThan(now + 8 * 24 * 60 * 60 * 1000);

    expect(noTtlEntry.expiresAt).toBeNull();
  });

  it('list with no grants renders readable text (not JSON) by default', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['mcp', 'trust', 'list'], active.root);
    expect(r.code).toBe(0);
    expect(() => JSON.parse(r.stdout)).toThrow();
  });

  it('re-granting the same tool replaces the prior grant rather than duplicating it', async () => {
    active = await tempRepo({ initialized: true });
    expect(
      (await run(['mcp', 'trust', 'grant', '--tool', 'cadence_draft_approve'], active.root)).code,
    ).toBe(0);
    expect(
      (
        await run(
          ['mcp', 'trust', 'grant', '--tool', 'cadence_draft_approve', '--ttl-days', '3'],
          active.root,
        )
      ).code,
    ).toBe(0);

    const ledger = JSON.parse((await run(['mcp', 'trust', 'list', '--json'], active.root)).stdout);
    const matches = ledger.grants.filter(
      (g: { toolName: string }) => g.toolName === 'cadence_draft_approve',
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].expiresAt).not.toBeNull();
  });
});
