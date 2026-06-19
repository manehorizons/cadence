import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

async function patchConfig(
  root: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const path = join(root, '.cadence/config.json');
  const cfg = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...cfg, ...patch }, null, 2), 'utf8');
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

// AC-5 + AC-6: anomaly-notify fires under auto+standard profiles, is silent
// when the gate is off or transport=none.

describe('cadence settle anomaly notify (AC-5, AC-6)', () => {
  it('AC-3: auto profile + --force + BLOCKED task → stderr lists bypass and anomaly lines', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=BLOCKED'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--force', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/settle bypass \[error\] settle:/);
    expect(r.stderr).toMatch(/settle bypass \[warn\] test-coverage:/);
    // Two anomalies expected: ac-blocked + force-used. Coverage-bypassed too,
    // since the test-coverage gate is in the auto×standard set.
    expect(r.stderr).toMatch(/cadence anomaly \[warn\] ac-blocked:/);
    expect(r.stderr).toMatch(/cadence anomaly \[error\] force-used:/);
    expect(r.stderr).toMatch(/cadence anomaly \[warn\] coverage-bypassed:/);
  });

  it('AC-1/AC-3: strict profile records summary bypasses without anomaly transport', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { profile: 'strict' });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    // strict × any tier carries the 'approve' gate (Phase 24.1); bypass per-invocation.
    await run(['draft', 'approve', '01-foundation', '01', '--no-approve'], active.root);
    await run(['build', 'task', 'T1', '--status=BLOCKED'], active.root);
    const r = await run(
      [
        'settle',
        'run',
        '--auto',
        '--force',
        '--allow-missing-coverage',
        '--no-interactive',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/settle bypass \[error\] settle:/);
    expect(r.stderr).toMatch(/settle bypass \[warn\] test-coverage:/);
    expect(r.stderr).not.toMatch(/cadence anomaly/);
    expect(existsSync(join(active.root, '.cadence/anomalies.log'))).toBe(false);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.gateBypasses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gate: 'settle', flag: '--force', severity: 'error' }),
        expect.objectContaining({
          gate: 'test-coverage',
          flag: '--allow-missing-coverage',
          severity: 'warn',
        }),
      ]),
    );
  });

  it('transport=none under auto profile → silent + no file (AC-6)', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { notify: { transport: 'none' } });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=BLOCKED'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--force', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/settle bypass \[error\] settle:/);
    expect(r.stderr).toMatch(/settle bypass \[warn\] test-coverage:/);
    expect(r.stderr).not.toMatch(/cadence anomaly/);
    expect(existsSync(join(active.root, '.cadence/anomalies.log'))).toBe(false);
  });

  it('transport=file writes NDJSON to .cadence/anomalies.log (AC-5)', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, {
      notify: { transport: 'file', file: '.cadence/anomalies.log' },
    });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=BLOCKED'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--force', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/settle bypass \[error\] settle:/);
    expect(r.stderr).toMatch(/settle bypass \[warn\] test-coverage:/);
    expect(r.stderr).not.toMatch(/cadence anomaly \[/);
    const logPath = join(active.root, '.cadence/anomalies.log');
    expect(existsSync(logPath)).toBe(true);
    const lines = (await readFile(logPath, 'utf8')).trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    const parsed = lines.map((l) => JSON.parse(l));
    const types = parsed.map((p) => p.type);
    expect(types).toContain('ac-blocked');
    expect(types).toContain('force-used');
    expect(types).toContain('coverage-bypassed');
  });

  it('AC-1/AC-3: coverage bypass records summary audit and emits warning', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(0);
    // Coverage was bypassed → that single event is still expected.
    expect(r.stderr).toMatch(/settle bypass \[warn\] test-coverage:/);
    expect(r.stderr).toMatch(/cadence anomaly \[warn\] coverage-bypassed:/);
    expect(r.stderr).not.toMatch(/ac-blocked/);
    expect(r.stderr).not.toMatch(/force-used/);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.gateBypasses).toEqual([
      expect.objectContaining({
        gate: 'test-coverage',
        flag: '--allow-missing-coverage',
        severity: 'warn',
      }),
    ]);
  });
});
