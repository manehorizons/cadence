import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture, MockHostAdapter } from '@keel/testkit';

const KEEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [KEEL, ...args], { cwd });
    let stdout = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.on('exit', (code) => resolve({ code: code ?? 0, stdout }));
  });
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('end-to-end: empty repo → draft → build → settle via mock host', () => {
  it('walks the full loop and produces all expected artifacts', async () => {
    active = await tempRepo();
    const host = new MockHostAdapter();

    expect((await run(['init', '--name=phase-1-smoke'], active.root)).code).toBe(0);
    expect(existsSync(join(active.root, '.keel/state.json'))).toBe(true);

    await host.dispatchHook('session-start', { event: 'session-start', cwd: active.root });
    expect(host.calls[0]?.event).toBe('session-start');

    expect((await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root)).code).toBe(0);
    expect((await run(['draft', 'approve', '01-foundation', '01'], active.root)).code).toBe(0);

    let state = JSON.parse(await readFile(join(active.root, '.keel/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('BUILD');

    expect((await run(['build', 'task', 'T1', '--status=DONE'], active.root)).code).toBe(0);
    expect((await run(['settle', 'run', '--ac', 'AC-1=pass'], active.root)).code).toBe(0);

    state = JSON.parse(await readFile(join(active.root, '.keel/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('IDLE');
    expect(existsSync(join(active.root, '.keel/phases/01-foundation/01-01-SUMMARY.md'))).toBe(true);
    expect(existsSync(join(active.root, '.keel/phases/01-foundation/01-01-SUMMARY.json'))).toBe(true);
  });
});
