import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.on('exit', (code) => resolve({ stdout, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence progress', () => {
  it('IDLE state suggests draft new', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['progress'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('cadence draft new --title "..."');
    expect(r.stdout).not.toContain('<phase>');
    expect(r.stdout).not.toContain('<num>');
  });

  it('DRAFT state (after `draft new`) suggests approve with real phase + num', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    const r = await run(['progress'], active.root);
    expect(r.stdout).toMatch(/cadence draft approve 01-foundation 01/);
    expect(r.stdout).not.toMatch(/<phase>|<num>/);
  });

  it('BUILD state suggests build task or settle', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const r = await run(['progress'], active.root);
    expect(r.stdout).toMatch(/cadence build task|cadence settle/);
  });

  // Phase 137 (rec-20260701-007 / audit F10): BUILD used to emit an
  // unrunnable compound "build task <id> ... OR settle run ..." command.
  it('137 AC-1: BUILD names the concrete first-pending task, not a compound command', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const r = await run(['progress'], active.root);
    expect(r.stdout).toMatch(/^Next: cadence build task T1 --status=DONE$/m);
    expect(r.stdout).not.toMatch(/OR/);
  });

  it('137 AC-1: BUILD names settle once every task is recorded', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    const r = await run(['progress'], active.root);
    expect(r.stdout).toMatch(/^Next: cadence settle run --auto$/m);
  });

  it('AC-1: --json emits a single { command, reason } object, no rendered text', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['progress', '--json'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/^Next:/m);
    expect(r.stdout).not.toMatch(/^Reason:/m);
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toEqual({
      command: 'cadence draft new --title "..."',
      reason: expect.any(String),
    });
  });

  it('AC-2: default (no --json) rendering is unchanged', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['progress'], active.root);
    expect(r.stdout).toMatch(/^Next: /);
    expect(r.stdout).toMatch(/^Reason: /m);
    expect(() => JSON.parse(r.stdout)).toThrow();
  });

  it('AC-3: --json composes with DRAFT and BUILD, matching the non-JSON command', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);

    const draftText = await run(['progress'], active.root);
    const draftJson = JSON.parse((await run(['progress', '--json'], active.root)).stdout);
    expect(draftText.stdout).toContain(draftJson.command);

    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const buildText = await run(['progress'], active.root);
    const buildJson = JSON.parse((await run(['progress', '--json'], active.root)).stdout);
    expect(buildText.stdout).toContain(buildJson.command);
  });
});
