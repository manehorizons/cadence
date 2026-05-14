import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@keel/testkit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEEL = join(__dirname, '../../dist/cli/index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [KEEL, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.stdin.end();
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('keel hook', () => {
  it('session-start prints a context payload', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const r = await run(['hook', 'session-start'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/KEEL session resumed/);
    expect(r.stdout).toMatch(/demo/);
  });

  it('subagent-result increments counter', async () => {
    active = await tempRepo({ initialized: true });
    await run(['hook', 'subagent-result'], active.root);
    await run(['hook', 'subagent-result'], active.root);
    const state = JSON.parse(await readFile(join(active.root, '.keel/state.json'), 'utf8'));
    expect(state.session.subagentSpawns).toBe(2);
  });

  it('unknown event exits 2', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['hook', 'made-up-event'], active.root);
    expect(r.code).toBe(2);
  });

  it('blocking hook exits 2 with block message on stderr', async () => {
    active = await tempRepo({ initialized: true });
    // Enable preToolUseBuildGate; loopPosition is IDLE so pre-tool-edit must block.
    const cfgPath = join(active.root, '.keel/config.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    cfg.hooks.preToolUseBuildGate = true;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
    const r = await run(['hook', 'pre-tool-edit'], active.root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/BUILD/);
  });
});
