import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

/**
 * e2e tests for progressive-disclosure help gating (phase 278, T7, AC-10):
 * `cadence help` hides a small "Stage 2+" set of commands (`doctor`) from
 * its top-level listing until the operator has earned it — either
 * onboarding stage >= 2 (Operator) or the `--advanced` escape hatch.
 *
 * This spawns the real compiled CLI entry point (mirroring
 * `zero-arg-dispatch.test.ts`'s pattern for T3) rather than composing a
 * service call in-process, because the behavior under test is Commander's
 * own help renderer wired up in `cli/index.ts`'s module-level
 * `program.configureHelp(...)` — there is no exported function to call
 * directly. Each test points `CADENCE_HOME` (via the spawned child's `env`)
 * at a fresh temp dir, matching T5/T8's isolation pattern, so this suite
 * never reads or writes the real `$HOME/.cadence/onboarding.json`.
 */

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(
  args: string[],
  cwd: string,
  cadenceHome: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], {
      cwd,
      env: { ...process.env, CADENCE_HOME: cadenceHome },
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

describe('cadence help stage gating (278-01/AC-10)', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    while (dirs.length > 0) {
      const d = dirs.pop() as string;
      await rm(d, { recursive: true, force: true });
    }
  });

  async function freshHome(): Promise<string> {
    const d = await mkdtemp(join(tmpdir(), 'cadence-help-stage-'));
    dirs.push(d);
    return d;
  }

  it('278-01/AC-10: at stage 0 (fresh CADENCE_HOME, no onboarding.json), `cadence help` hides doctor', async () => {
    const home = await freshHome();
    const r = await run(['help'], home, home);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/\bdoctor\b/);
    // Sanity: this is real Commander help output, not an empty/broken run —
    // an always-visible command must still be present.
    expect(r.stdout).toMatch(/\binit\b/);
  });

  it('278-01/AC-10: `cadence --help` (the flag form) also hides doctor at stage 0', async () => {
    const home = await freshHome();
    const r = await run(['--help'], home, home);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/\bdoctor\b/);
  });

  it('278-01/AC-10: at stage 2 (pre-seeded onboarding.json), `cadence help` shows doctor', async () => {
    const home = await freshHome();
    await writeFile(join(home, 'onboarding.json'), JSON.stringify({ stage: 2 }), 'utf8');
    const r = await run(['help'], home, home);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/\bdoctor\b/);
  });

  it('278-01/AC-10: at stage 0 with --advanced, `cadence help` shows doctor', async () => {
    const home = await freshHome();
    const r = await run(['help', '--advanced'], home, home);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/\bdoctor\b/);
  });

  it('278-01/AC-10: --advanced also works before the subcommand (`cadence --advanced help`)', async () => {
    const home = await freshHome();
    const r = await run(['--advanced', 'help'], home, home);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/\bdoctor\b/);
  });

  it('278-01/AC-10: stage 1 (Driver) still hides doctor — the floor is Operator (stage 2), not Driver', async () => {
    const home = await freshHome();
    await writeFile(join(home, 'onboarding.json'), JSON.stringify({ stage: 1 }), 'utf8');
    const r = await run(['help'], home, home);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/\bdoctor\b/);
  });
});
