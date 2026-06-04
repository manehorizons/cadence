import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
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

describe('cadence doctor', () => {
  it('AC-1: healthy project → exit 0', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-cli' });
    const r = await run(['doctor'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/node/);
    expect(r.stdout).toMatch(/initialized/);
  });

  it('AC-2: uninitialized dir → exit 1, no stack trace', async () => {
    active = await tempRepo({ initialized: false });
    const r = await run(['doctor'], active.root);
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toMatch(/cadence init/);
    // diagnosed, not crashed: no NotInitializedError bubble / no stack frames
    expect(r.stderr).not.toMatch(/NotInitializedError/);
    expect(r.stderr).not.toMatch(/^\s+at\s+/m);
  });

  it('AC-3: a problem renders name + severity + remediation', async () => {
    active = await tempRepo({ initialized: false });
    const r = await run(['doctor'], active.root);
    expect(r.stdout).toMatch(/initialized/);
    expect(r.stdout).toMatch(/error/);
    expect(r.stdout).toMatch(/cadence init/); // remediation
  });

  it('AC-4: --json emits a single parseable object with checks + ok', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['doctor', '--json'], active.root);
    const parsed = JSON.parse(r.stdout); // throws if not exactly one JSON value
    expect(typeof parsed.ok).toBe('boolean');
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.checks[0]).toHaveProperty('name');
    expect(parsed.checks[0]).toHaveProperty('severity');
    expect(parsed.checks[0]).toHaveProperty('remediation');
  });

  it('AC-5: warning-only project → exit 0', async () => {
    active = await tempRepo({ initialized: true });
    const dir = join(active.root, '.claude', 'commands');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'cadence-progress.md'),
      '<!-- managed-by: cadence -->\n\n!node /abs/path/cli/index.js progress\n',
    );
    const r = await run(['doctor'], active.root);
    expect(r.code).toBe(0); // a warning must not fail
    expect(r.stdout).toMatch(/warning/);
  });
});
