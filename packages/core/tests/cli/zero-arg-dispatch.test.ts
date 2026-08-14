import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

/**
 * e2e tests for the zero-arg dispatch (phase 278, T3, AC-7): a truly bare
 * `cadence` (or bare `npx @thomas-powers-jr/cadence-core`) invocation — no
 * subcommand, no flags at all — must run `cadence demo` instead of falling
 * through to commander's default help-and-exit-1 behavior. This spawns the
 * real compiled CLI entry point (not a composed service call, unlike
 * `demo.test.ts`/`tutorial.test.ts`) because the behavior under test lives in
 * `cli/index.ts`'s argv-parsing bootstrap itself, which only runs when the
 * module is the real process entry point (see `index.test.ts`'s note on the
 * entry-point guard).
 *
 * Fix-round (whole-branch review, phase 278): the zero-arg case genuinely
 * completes a full `cadence demo` run, and T6 wired `advanceStage(1)` into
 * `runDemo`'s success path, so without an isolated `CADENCE_HOME` this suite
 * was writing to the real `~/.cadence/onboarding.json` on every run — the
 * reviewer watched its mtime move across two full-suite runs. Every spawn
 * below now points `CADENCE_HOME` at a fresh `mkdtemp` dir per test, matching
 * `help-stage-gating.test.ts`/`demo.test.ts`'s isolation pattern.
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

describe('cadence zero-arg dispatch', () => {
  let scratch: string | null = null;
  let cadenceHome: string | null = null;

  beforeEach(async () => {
    cadenceHome = await mkdtemp(join(tmpdir(), 'cadence-zero-arg-home-'));
  });

  afterEach(async () => {
    if (scratch) {
      await rm(scratch, { recursive: true, force: true });
      scratch = null;
    }
    if (cadenceHome) {
      await rm(cadenceHome, { recursive: true, force: true });
      cadenceHome = null;
    }
  });

  // a truly bare invocation (zero argv entries past the script
  // path) runs the same refuse-then-succeed walkthrough as `cadence demo`,
  // to completion, non-interactively, exiting 0 — reachable from a bare
  // `npx` with no subcommand typed at all.
  it('278-01/AC-7: bare invocation (zero args) dispatches to cadence demo and exits 0', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'cadence-zero-arg-'));
    const r = await run([], scratch, cadenceHome as string);
    expect(r.code).toBe(0);
    // The demo's own opening banner (demo/run.ts) — proves dispatch actually
    // reached `runDemo`, not just that *some* command ran and exited 0.
    expect(r.stdout).toContain('CADENCE demo — one real loop, and the moment it refuses');
    // The refuse-then-succeed narrative ran to its real close (mirrors the
    // in-process assertions demo.test.ts makes on the same walkthrough).
    expect(r.stdout).toContain('SETTLE REFUSED');
    expect(r.stdout).toMatch(/the loop closed/);
  }, 20000);

  // Negative case: `cadence --version` is a non-empty argv (one flag) and
  // must NOT trigger the zero-arg dispatch — it should print the version and
  // exit 0, never touching `runDemo` at all.
  it('cadence --version does NOT dispatch to demo', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'cadence-zero-arg-'));
    const r = await run(['--version'], scratch, cadenceHome as string);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain('CADENCE demo');
    expect(r.stdout).not.toContain('SETTLE REFUSED');
  });

  // Negative case: `cadence help` is a non-empty argv (one subcommand) and
  // must NOT trigger the zero-arg dispatch either — only a truly empty argv
  // (nothing at all after the script path) counts as "bare".
  it('cadence help does NOT dispatch to demo', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'cadence-zero-arg-'));
    const r = await run(['help'], scratch, cadenceHome as string);
    expect(r.stdout).not.toContain('CADENCE demo');
    expect(r.stdout).not.toContain('SETTLE REFUSED');
    // Commander's help output lists the registered subcommands, including
    // `demo` itself — proof this ran commander's help renderer, not the demo
    // walkthrough.
    expect(r.stdout).toMatch(/demo/);
  });
});
