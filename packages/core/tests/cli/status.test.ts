import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

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

describe('cadence status', () => {
  it('IDLE: renders header + NEXT line, exit 0', async () => {
    active = await tempRepo({ initialized: true, projectName: 'status-idle' });
    const r = await run(['status'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/CADENCE — status-idle/);
    expect(r.stdout).toMatch(/loop:\s+IDLE/);
    expect(r.stdout).toMatch(/NEXT: cadence draft new/);
  });

  it('BUILD with fresh approve: tasks PENDING, ACs pending', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const r = await run(['status'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/draft: 01-01/);
    expect(r.stdout).toMatch(/TASKS/);
    expect(r.stdout).toMatch(/T1\s+PENDING/);
    expect(r.stdout).toMatch(/\[\s\]\sAC-1/);
  });

  it('--json emits parseable structured output', async () => {
    active = await tempRepo({ initialized: true, projectName: 'status-json' });
    const r = await run(['status', '--json'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    const parsed = JSON.parse(r.stdout);
    expect(parsed.project).toBe('status-json');
    expect(parsed.loopPosition).toBe('IDLE');
    expect(parsed.schemaVersion).toBe(1);
    expect(typeof parsed.next.command).toBe('string');
    expect(parsed.next.command).toMatch(/cadence draft new/);
  });

  it('--json includes tasks and acs arrays in BUILD', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const r = await run(['status', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(Array.isArray(parsed.tasks)).toBe(true);
    expect(parsed.tasks.length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.acs)).toBe(true);
    expect(parsed.activeDraft).toBe('01-01');
  });

  it('status is read-only (state.json byte-equal before and after)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const { readFile } = await import('node:fs/promises');
    const before = await readFile(join(active.root, '.cadence/state.json'), 'utf8');
    await run(['status'], active.root);
    await run(['status', '--json'], active.root);
    const after = await readFile(join(active.root, '.cadence/state.json'), 'utf8');
    expect(after).toBe(before);
  });
});
