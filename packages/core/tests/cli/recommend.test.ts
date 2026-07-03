import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'dist',
  'cli',
  'index.js',
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

describe('cadence recommend', () => {
  it('writes artifacts and prints the ranked view', async () => {
    active = await tempRepo({ initialized: true, projectName: 'recommend-cli' });

    const r = await run(['recommend'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/# CADENCE Recommended Next Moves/);

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'recommend.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).schemaVersion).toBe(1);

    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'RECOMMEND.md'),
      'utf8',
    );
    expect(md).toMatch(/## Advisory/);
  });

  it('--json emits parseable JSON to stdout', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['recommend', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(Array.isArray(parsed.ranked)).toBe(true);
  });

  it('degrades cleanly with no .cadence backend', async () => {
    active = await tempRepo({ initialized: false });
    const r = await run(['recommend'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/No actionable recommendations\./);
  });

  it('--top 1 shows only the top-ranked recommendation but totals.ranked reports the full count', async () => {
    active = await tempRepo({ initialized: true, projectName: 'recommend-top' });
    await run(
      ['recommendation', 'add', '--title', 'first', '--summary', 's', '--priority', 'high', '--readiness', 'ready-for-milestone'],
      active.root,
    );
    await run(
      ['recommendation', 'add', '--title', 'second', '--summary', 's', '--priority', 'low', '--readiness', 'raw-idea'],
      active.root,
    );

    const r = await run(['recommend', '--top', '1', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ranked).toHaveLength(1);
    expect(parsed.totals.ranked).toBe(2);
  });

  it('--top 0 is rejected with exit 1', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['recommend', '--top', '0'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/--top must be a positive integer/i);
  });

  it('--top abc (non-numeric) is rejected with exit 1', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['recommend', '--top', 'abc'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/--top must be a positive integer/i);
  });
});
