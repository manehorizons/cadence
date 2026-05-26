import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { ContextPacketZ } from '@cadence/types';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
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

describe('cadence context', () => {
  it('writes artifacts and prints the Markdown packet', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ctx-cli' });
    const r = await run(['context', 'phase'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/# CADENCE Context Packet — phase/);

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'phase.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).schemaVersion).toBe(1);
    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'phase.md'),
      'utf8',
    );
    expect(md).toMatch(/## Loop/);
  });

  it('--json emits parseable JSON to stdout', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['context', 'handoff', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.scope).toBe('handoff');
    expect(() => ContextPacketZ.parse(parsed)).not.toThrow();
  });

  it('rejects an invalid scope with exit 2 and a clean message', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['context', 'bogus'], active.root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/invalid scope "bogus"/);
    expect(r.stdout).toBe('');
  });

  it('degrades cleanly with no .cadence backend', async () => {
    active = await tempRepo({ initialized: false });
    const r = await run(['context', 'phase'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/no CADENCE backend detected/);
  });
});

describe('cadence context review|agent (Slice 7)', () => {
  it('cadence context review writes review.json + review.md and prints MD to stdout', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ctx-cli-review' });
    const r = await run(['context', 'review'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^# CADENCE Context Packet — review/m);
    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'review.json'),
      'utf8',
    );
    const packet = ContextPacketZ.parse(JSON.parse(jsonRaw));
    expect(packet.scope).toBe('review');
    expect(packet.needsAttention).toBeDefined();
    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'review.md'),
      'utf8',
    );
    expect(md).toMatch(/## Needs Attention/);
  });

  it('cadence context agent writes agent.json + agent.md and prints MD to stdout', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ctx-cli-agent' });
    const r = await run(['context', 'agent'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^# CADENCE Context Packet — agent/m);
    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'agent.json'),
      'utf8',
    );
    const packet = ContextPacketZ.parse(JSON.parse(jsonRaw));
    expect(packet.scope).toBe('agent');
    expect('needsAttention' in packet).toBe(false);
    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'agent.md'),
      'utf8',
    );
    expect(md).not.toMatch(/- next action:/);
    expect(md).not.toMatch(/- state error:/);
  });

  it('cadence context review --json prints JSON to stdout instead of MD', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ctx-cli-review-json' });
    const r = await run(['context', 'review', '--json'], active.root);
    expect(r.code).toBe(0);
    const packet = JSON.parse(r.stdout);
    expect(packet.scope).toBe('review');
    expect(packet.needsAttention).toBeDefined();
  });

  it('invalid scope: process.exitCode = 2; stderr lists all four scopes', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ctx-cli-bogus' });
    const r = await run(['context', 'bogus'], active.root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/invalid scope "bogus"/);
    expect(r.stderr).toMatch(/expected: phase \| handoff \| review \| agent/);
  });

  it('--help mentions all four scopes via .description() tail', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ctx-cli-help' });
    const r = await run(['context', '--help'], active.root);
    expect(r.stdout).toMatch(/scope:\s+phase\s+\|\s+handoff\s+\|\s+review\s+\|\s+agent/);
  });
});
