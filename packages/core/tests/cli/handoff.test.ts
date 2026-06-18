// packages/core/tests/cli/handoff.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');
function run(
  args: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CLI, ...args], {
      cwd,
      ...(env ? { env: { ...process.env, ...env } } : {}),
    });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}
let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence handoff', () => {
  it('AC-21: writes a SESSION doc and prints its path', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['handoff', '--label', 'cli'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/SESSION-\d{4}-\d{2}-\d{2}-cli\.md/);
  });

  it('AC-22: --json emits a parseable result', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['handoff', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.stamped).toBe(true);
    expect(typeof parsed.path).toBe('string');
  });

  it('AC-23: refusing to clobber exits 2', async () => {
    active = await tempRepo({ initialized: true });
    // Pin the clock for both runs so the same-day collision is deterministic —
    // a wall-clock run straddling UTC midnight would otherwise produce two
    // different SESSION dates and never clobber (rec-20260618-001).
    const pinned = { CADENCE_NOW: '2026-06-17T12:00:00Z' };
    await run(['handoff', '--label', 'dup'], active.root, pinned);
    const r = await run(['handoff', '--label', 'dup'], active.root, pinned);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/already exists/);
  });
});
