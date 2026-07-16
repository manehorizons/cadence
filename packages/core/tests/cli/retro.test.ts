import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import type { RetroDigest } from '@manehorizons/cadence-types';

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'dist', 'cli', 'index.js',
);

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

describe('cadence retro (phase 186)', () => {
  it('AC-3: --format terminal (default) renders the rollup for a repo with real retro artifacts', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli' });
    const phasesDir = join(active.root, '.cadence/phases');
    await mkdir(join(phasesDir, '170-a'), { recursive: true });
    await mkdir(join(phasesDir, '171-b'), { recursive: true });

    const digestA: RetroDigest = {
      bypasses: [{ gate: 'test-coverage', flag: '--flag', reason: 'r', severity: 'warn' }],
      roughTasks: [],
      findings: {},
    };
    const digestB: RetroDigest = {
      bypasses: [{ gate: 'test-coverage', flag: '--flag', reason: 'r', severity: 'warn' }],
      roughTasks: [],
      findings: {},
    };
    await writeFile(join(phasesDir, '170-a', '170-01-RETRO.json'), JSON.stringify(digestA));
    await writeFile(join(phasesDir, '171-b', '171-01-RETRO.json'), JSON.stringify(digestB));

    const r = await run(['retro'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/# Retro Rollup/);
    expect(r.stdout).toMatch(/test-coverage/);
    expect(r.stdout).toMatch(/### Recurring/);
  });

  it('AC-3: --format json produces valid JSON matching the RetroRollup shape', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli' });
    const phasesDir = join(active.root, '.cadence/phases');
    await mkdir(join(phasesDir, '170-a'), { recursive: true });

    const digest: RetroDigest = {
      bypasses: [],
      roughTasks: [{ id: 'T1', status: 'BLOCKED', notes: '' }],
      findings: {},
    };
    await writeFile(join(phasesDir, '170-a', '170-01-RETRO.json'), JSON.stringify(digest));

    const r = await run(['retro', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const rollup = JSON.parse(r.stdout);
    expect(rollup.totalPhases).toBe(1);
    expect(rollup.phasesWithFriction).toBe(1);
    expect(rollup.roughTaskStatuses.oneOff).toEqual([
      { key: 'BLOCKED', count: 1, phaseIds: ['170-a'] },
    ]);
  });

  it('AC-4: no .cadence/phases directory → clear empty-state message, exit 0', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli' });
    const r = await run(['retro'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No retro artifacts found.\n');
  });

  it('AC-4: --format json empty state → JSON null (never an empty object)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli' });
    const r = await run(['retro', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('null\n');
    expect(JSON.parse(r.stdout)).toBeNull();
  });

  it('AC-4: phases present but none with a *-RETRO.json → empty-state message, exit 0', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli' });
    await mkdir(join(active.root, '.cadence/phases', '170-a'), { recursive: true });
    const r = await run(['retro'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No retro artifacts found.\n');
  });

  it('AC-5: a malformed retro artifact surfaces a stderr notice, and the rollup still computes over remaining valid phases', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli' });
    const phasesDir = join(active.root, '.cadence/phases');
    await mkdir(join(phasesDir, '170-good'), { recursive: true });
    await mkdir(join(phasesDir, '171-bad'), { recursive: true });

    const goodDigest: RetroDigest = {
      bypasses: [{ gate: 'test-coverage', flag: '--flag', reason: 'r', severity: 'warn' }],
      roughTasks: [],
      findings: {},
    };
    await writeFile(join(phasesDir, '170-good', '170-01-RETRO.json'), JSON.stringify(goodDigest));
    await writeFile(join(phasesDir, '171-bad', '171-01-RETRO.json'), '{ not valid json');

    const r = await run(['retro'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('note: skipping malformed retro artifact');
    expect(r.stderr).toContain('171-01-RETRO.json');
    expect(r.stdout).toMatch(/# Retro Rollup/);
  });

  it('invalid --format → exit 1 + stderr, no stdout output', async () => {
    active = await tempRepo({ initialized: true, projectName: 'retro-cli' });
    const r = await run(['retro', '--format', 'xml'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/retro failed: unsupported format: xml/);
    expect(r.stdout).toBe('');
  });
});
