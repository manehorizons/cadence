import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';

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

describe('cadence recommendation', () => {
  it('adds a manual recommendation and renders it', async () => {
    active = await tempRepo({ initialized: true, projectName: 'recommendation-cli' });

    const r = await run([
      'recommendation',
      'add',
      '--title',
      'Add milestone pre-mortems',
      '--summary',
      'Capture likely failure modes before milestone export.',
      '--priority',
      'high',
      '--readiness',
      'ready-for-milestone',
      '--area',
      'core',
      '--file',
      'packages/core/src/cli/commands/recommendation.ts',
      '--evidence',
      'Approved Praxis design requires milestone pre-mortems.',
    ], active.root);

    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/Added rec-\d{8}-001/);

    const raw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'recommendations.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw);
    expect(parsed.recommendations[0].title).toBe('Add milestone pre-mortems');

    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'RECOMMENDATIONS.md'),
      'utf8',
    );
    expect(md).toMatch(/Add milestone pre-mortems/);
  });

  it('lists recommendations', async () => {
    active = await tempRepo({ initialized: true });
    await run([
      'recommendation',
      'add',
      '--title',
      'Add context packets',
      '--summary',
      'Create compact context packet artifacts.',
    ], active.root);

    const r = await run(['recommendation', 'list'], active.root);

    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/rec-\d{8}-001/);
    expect(r.stdout).toMatch(/Add context packets/);
  });
});
