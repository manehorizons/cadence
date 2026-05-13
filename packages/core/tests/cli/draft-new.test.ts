import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@keel/testkit';

const KEEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [KEEL, ...args], { cwd });
    let stdout = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.on('exit', (code) => resolve({ stdout, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('keel draft new', () => {
  it('creates a DRAFT.md skeleton under phases/<phase>/', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    expect(r.code).toBe(0);
    const path = join(active.root, '.keel/phases/01-foundation/01-01-DRAFT.md');
    expect(existsSync(path)).toBe(true);
    const content = await readFile(path, 'utf8');
    expect(content).toMatch(/^---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: PENDING\n---/);
    expect(content).toContain('# 01-01 — Demo');
  });

  it('refuses when DRAFT already exists', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    const r = await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    expect(r.code).not.toBe(0);
  });
});
