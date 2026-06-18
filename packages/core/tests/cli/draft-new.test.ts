import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

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

describe('cadence draft new', () => {
  it('creates a DRAFT.md skeleton under phases/<phase>/', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    expect(r.code).toBe(0);
    const path = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
    expect(existsSync(path)).toBe(true);
    const content = await readFile(path, 'utf8');
    expect(content).toMatch(/^---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: PENDING\n---/);
    expect(content).toContain('# 01-01 — Demo');
  });

  it('AC-1: derives phase slug and task id from --title when positionals are omitted', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['draft', 'new', '--title=Auto Phase Id'], active.root);
    expect(r.code).toBe(0);
    const path = join(active.root, '.cadence/phases/01-auto-phase-id/01-01-DRAFT.md');
    expect(existsSync(path)).toBe(true);
    const content = await readFile(path, 'utf8');
    expect(content).toMatch(/^---\nphase: 01-auto-phase-id\nid: 01-01\ntier: standard\nstatus: PENDING\n---/);
    expect(content).toContain('# 01-01 — Auto Phase Id');
  });

  it('AC-1: defaults the task number to 1 when only phase is supplied', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['draft', 'new', '12-manual', '--title=Manual'], active.root);
    expect(r.code).toBe(0);
    expect(existsSync(join(active.root, '.cadence/phases/12-manual/12-01-DRAFT.md'))).toBe(true);
  });

  it('transitions state to loopPosition=DRAFT and tracks the open draft', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    expect(r.code).toBe(0);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('DRAFT');
    expect(state.activePhase).toBe('01-foundation');
    expect(state.activeDraft).toBe('01-01');
    expect(state.openDrafts.map((d: { id: string }) => d.id)).toContain('01-01');
    const stateMd = await readFile(join(active.root, '.cadence/STATE.md'), 'utf8');
    expect(stateMd).toMatch(/Loop position:.*DRAFT/);
    expect(stateMd).toMatch(/01-01/);
  });

  it('refuses when loopPosition is not IDLE', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    // Now state is DRAFT — a second draft must be refused.
    const r = await run(['draft', 'new', '01-foundation', '02', '--title=Other'], active.root);
    expect(r.code).not.toBe(0);
    expect(existsSync(join(active.root, '.cadence/phases/01-foundation/01-02-DRAFT.md'))).toBe(false);
  });

  it('refuses when DRAFT already exists', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    const r = await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    expect(r.code).not.toBe(0);
  });
});
