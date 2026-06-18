import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    p.on('exit', (code) => resolve({ code: code ?? 0 }));
  });
}

async function draftApproveAndComplete(root: string): Promise<void> {
  await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], root);
  await run(['draft', 'approve', '01-foundation', '01'], root);
  await run(['build', 'task', 'T1', '--status=DONE'], root);
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence settle run', () => {
  it('writes SUMMARY.md + SUMMARY.json and returns to IDLE', async () => {
    active = await tempRepo({ initialized: true });
    await draftApproveAndComplete(active.root);
    const r = await run(['settle', 'run', '--ac', 'AC-1=pass'], active.root);
    expect(r.code).toBe(0);

    const dir = join(active.root, '.cadence/phases/01-foundation');
    expect(existsSync(join(dir, '01-01-SUMMARY.md'))).toBe(true);
    expect(existsSync(join(dir, '01-01-SUMMARY.json'))).toBe(true);

    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('IDLE');
    expect(state.openDrafts).toHaveLength(0);
  });

  it('records AC failure note in SUMMARY', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE_WITH_CONCERNS'], active.root);
    await run(['settle', 'run', '--ac', 'AC-1=fail:flaky'], active.root);
    const md = await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.md'), 'utf8');
    expect(md).toMatch(/AC-1.*FAIL/);
    expect(md).toContain('flaky');
  });

  it('AC-3: --ac-pass records the listed AC as PASS', async () => {
    active = await tempRepo({ initialized: true });
    await draftApproveAndComplete(active.root);
    const r = await run(['settle', 'run', '--ac-pass', 'AC-1'], active.root);
    expect(r.code).toBe(0);
    const md = await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.md'), 'utf8');
    expect(md).toMatch(/AC-1.*PASS/);
  });

  it('AC-3: --pass-all records all ACs as PASS', async () => {
    active = await tempRepo({ initialized: true });
    await draftApproveAndComplete(active.root);
    const r = await run(['settle', 'run', '--pass-all'], active.root);
    expect(r.code).toBe(0);
    const md = await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.md'), 'utf8');
    expect(md).toMatch(/AC-1.*PASS/);
  });
});
