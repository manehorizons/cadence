import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { runStart, type StartDeps } from '../../src/cli/commands/start.js';
import { bufferIO } from '../../src/services/io.js';
import { resolvePick, type StartOption } from '../../src/start/menu.js';
import { advanceStage, ONBOARDING_STAGE_OPERATOR } from '../../src/onboarding/state.js';

function deps(over: Partial<StartDeps> = {}): StartDeps & { spawned: StartOption[] } {
  const spawned: StartOption[] = [];
  return {
    spawn: async (o: StartOption) => {
      spawned.push(o);
      return 0;
    },
    initialized: () => false,
    spawned,
    ...over,
  };
}

// Every test points CADENCE_HOME at a fresh mkdtemp dir (matching T5's
// tests/onboarding/state.test.ts pattern) so this suite never reads or
// writes the real $HOME/.cadence/onboarding.json, and so onboarding stage
// is deterministic (defaults to 0 — First Contact — unless a test advances
// it explicitly).
let dir: string;
let savedCadenceHome: string | undefined;

beforeEach(async () => {
  savedCadenceHome = process.env.CADENCE_HOME;
  dir = await mkdtemp(join(tmpdir(), 'cadence-start-'));
  process.env.CADENCE_HOME = dir;
});

afterEach(async () => {
  if (savedCadenceHome === undefined) {
    delete process.env.CADENCE_HOME;
  } else {
    process.env.CADENCE_HOME = savedCadenceHome;
  }
  await rm(dir, { recursive: true, force: true });
});

describe('runStart', () => {
  it('emits the structured menu for --json and never spawns (AC-5)', async () => {
    const io = bufferIO();
    const d = deps();
    // --advanced: this test predates progressive disclosure (phase 278) and
    // asserts on the full 7-option catalog; stage 0 (the fresh CADENCE_HOME
    // default here) would otherwise hide the doctor entry (278-01/AC-11 below).
    const res = await runStart('/repo', { json: true, advanced: true, isTty: false }, io, d);
    expect(res.exitCode).toBe(0);
    const json = JSON.parse(io.stdout());
    expect(json.options).toHaveLength(7);
    expect(json.recommendation.command).toContain('tutorial');
    expect(d.spawned).toHaveLength(0);
  });

  it('prints the menu and exits 0 in a non-TTY (AC-6)', async () => {
    const io = bufferIO();
    const d = deps();
    const res = await runStart('/repo', { isTty: false }, io, d);
    expect(res.exitCode).toBe(0);
    expect(io.stdout()).toContain('What are you doing?');
    expect(io.stdout()).toContain('Recommended: npx -y @thomas-powers-jr/cadence-core tutorial');
    expect(d.spawned).toHaveLength(0);
  });

  it('prints an IDLE template recommendation when initialized state says IDLE', async () => {
    const io = bufferIO();
    const d = deps({
      initialized: () => true,
      recommendation: async () => ({
        command: 'cadence draft new --title "Fix login timeout" --template bugfix',
        reason: 'You are set up and idle.',
      }),
    });
    await runStart('/repo', { isTty: false }, io, d);
    expect(io.stdout()).toContain('--template bugfix');
    expect(io.stdout()).toContain('You are set up and idle.');
  });

  it('dispatches a core option via --pick --yes (AC-7)', async () => {
    const io = bufferIO();
    const d = deps();
    const res = await runStart('/repo', { pick: 2, yes: true, isTty: false }, io, d);
    expect(res.exitCode).toBe(0);
    expect(d.spawned).toEqual([
      expect.objectContaining({ runner: 'cadence', args: ['init'] }),
    ]);
  });

  it('138 AC-3: dispatches cadence activate via --pick 7 --yes', async () => {
    const io = bufferIO();
    const d = deps();
    const res = await runStart('/repo', { pick: 7, yes: true, isTty: false }, io, d);
    expect(res.exitCode).toBe(0);
    expect(d.spawned).toEqual([
      expect.objectContaining({ runner: 'cadence', args: ['activate'] }),
    ]);
  });

  it('250-01/AC-8: dispatches a host option through npx (AC-7)', async () => {
    const io = bufferIO();
    const d = deps();
    await runStart('/repo', { pick: 3, yes: true, isTty: false }, io, d);
    expect(d.spawned[0]).toMatchObject({
      runner: 'npx',
      args: ['-y', '@thomas-powers-jr/cadence-host-claude-code', 'install'],
    });
  });

  it('exits non-zero on an invalid --pick and never spawns (AC-8)', async () => {
    const io = bufferIO();
    const d = deps();
    const res = await runStart('/repo', { pick: 99, yes: true, isTty: false }, io, d);
    expect(res.exitCode).toBe(1);
    expect(d.spawned).toHaveLength(0);
    expect(io.stderr()).toContain('Not an option');
  });

  it('prints the command without spawning when confirm is declined (AC-9)', async () => {
    const io = bufferIO();
    const d = deps({ confirm: async () => false });
    const res = await runStart('/repo', { pick: 2, isTty: true }, io, d);
    expect(res.exitCode).toBe(0);
    expect(d.spawned).toHaveLength(0);
    expect(io.stdout()).toContain('cadence init');
  });

  it('spawns when confirm is accepted (AC-9)', async () => {
    const io = bufferIO();
    const d = deps({ confirm: async () => true });
    await runStart('/repo', { pick: 2, isTty: true }, io, d);
    expect(d.spawned).toHaveLength(1);
  });

  it('quits with exit 0 when the interactive prompt returns null (AC-10)', async () => {
    const io = bufferIO();
    const d = deps({ prompt: async () => null });
    const res = await runStart('/repo', { isTty: true }, io, d);
    expect(res.exitCode).toBe(0);
    expect(d.spawned).toHaveLength(0);
  });

  it('dispatches the prompted option (AC-10)', async () => {
    const io = bufferIO();
    const chosen = resolvePick(6)!;
    const d = deps({ prompt: async () => chosen, confirm: async () => true });
    await runStart('/repo', { isTty: true }, io, d);
    expect(d.spawned).toEqual([chosen]);
  });

  it('propagates a non-zero spawn exit code with a fallback line (AC-11)', async () => {
    const io = bufferIO();
    const d = deps({ spawn: async () => 2 });
    const res = await runStart('/repo', { pick: 2, yes: true, isTty: false }, io, d);
    expect(res.exitCode).toBe(2);
    expect(io.stderr().toLowerCase()).toContain('run it yourself');
  });

  it('annotates the init option when the repo is initialized (AC-12)', async () => {
    const io = bufferIO();
    const d = deps({ initialized: () => true });
    await runStart('/repo', { isTty: false }, io, d);
    expect(io.stdout()).toContain('already set up');
  });

  describe('progressive-disclosure menu gating (278-01/AC-11)', () => {
    it('278-01/AC-11: at stage 0 (fresh CADENCE_HOME, no --advanced), the rendered text menu hides the doctor entry', async () => {
      const io = bufferIO();
      const d = deps();
      await runStart('/repo', { isTty: false }, io, d);
      expect(io.stdout()).not.toContain('cadence doctor');
      expect(io.stdout()).not.toContain('Check my setup is healthy');
    });

    it('278-01/AC-11: at stage 1 (no --advanced), the rendered text menu still hides the doctor entry', async () => {
      const io = bufferIO();
      const d = deps();
      await advanceStage(1);
      await runStart('/repo', { isTty: false }, io, d);
      expect(io.stdout()).not.toContain('cadence doctor');
      expect(io.stdout()).not.toContain('Check my setup is healthy');
    });

    it('278-01/AC-11: at stage 2 (Operator) or above, the rendered text menu shows the doctor entry', async () => {
      const io = bufferIO();
      const d = deps();
      await advanceStage(ONBOARDING_STAGE_OPERATOR);
      await runStart('/repo', { isTty: false }, io, d);
      expect(io.stdout()).toContain('cadence doctor');
      expect(io.stdout()).toContain('Check my setup is healthy');
    });

    it('278-01/AC-11: --advanced shows the doctor entry at stage 0', async () => {
      const io = bufferIO();
      const d = deps();
      await runStart('/repo', { advanced: true, isTty: false }, io, d);
      expect(io.stdout()).toContain('cadence doctor');
      expect(io.stdout()).toContain('Check my setup is healthy');
    });

    it('278-01/AC-11: --json options omit doctor at stage 0 and include it with --advanced', async () => {
      const io = bufferIO();
      const d = deps();
      const hidden = await runStart('/repo', { json: true, isTty: false }, io, d);
      const hiddenOptions = (hidden.data as { options: StartOption[] }).options;
      expect(hiddenOptions.some((o) => o.display === 'cadence doctor')).toBe(false);

      const io2 = bufferIO();
      const shown = await runStart('/repo', { json: true, advanced: true, isTty: false }, io2, d);
      const shownOptions = (shown.data as { options: StartOption[] }).options;
      expect(shownOptions.some((o) => o.display === 'cadence doctor')).toBe(true);
    });

    it('278-01/AC-11: a hidden option is still directly reachable via --pick <n> (display-only gating)', async () => {
      const io = bufferIO();
      const d = deps({ confirm: async () => true });
      const res = await runStart('/repo', { pick: 6, yes: true, isTty: false }, io, d);
      expect(res.exitCode).toBe(0);
      expect(d.spawned).toEqual([
        expect.objectContaining({ runner: 'cadence', args: ['doctor'] }),
      ]);
    });
  });
});

/**
 * e2e tests for `start --advanced` against the REAL compiled binary
 * (fix-round, whole-branch review, phase 278). The in-process `runStart()`
 * suite above passes `args.advanced` directly and can never observe how
 * Commander actually resolves the `--advanced` flag from real argv — which
 * is exactly why the reviewer's finding was invisible to it: `cli/index.ts`
 * (T7) registers a program-level `--advanced` option, and `start.ts` (T8)
 * used to register a second, identically-named `--advanced` option on the
 * `start` subcommand itself. Commander v14 resolves a flag name declared on
 * both a parent and a child to the PARENT's option, so the subcommand
 * action's `opts()` never actually received it — `start --advanced --json`
 * silently rendered the stage-0 (hidden-doctor) menu regardless of argument
 * order. The fix removes the local declaration and reads the flag via
 * `command.optsWithGlobals()` instead; these tests spawn the real dist
 * binary (mirroring `zero-arg-dispatch.test.ts`/`help-stage-gating.test.ts`)
 * so Commander's real parser is actually exercised, in every argument order
 * the reviewer's repro named. Each spawn points `CADENCE_HOME` at a fresh
 * `mkdtemp` dir (stage 0, no onboarding.json) so the doctor entry would be
 * hidden by default absent `--advanced`.
 */
describe('cadence start --advanced (278-01/AC-11, real binary)', () => {
  const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');
  const dirs: string[] = [];

  afterEach(async () => {
    while (dirs.length > 0) {
      const d = dirs.pop() as string;
      await rm(d, { recursive: true, force: true });
    }
  });

  async function freshHome(): Promise<string> {
    const d = await mkdtemp(join(tmpdir(), 'cadence-start-advanced-'));
    dirs.push(d);
    return d;
  }

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

  it('278-01/AC-11: `start --advanced --json` includes the doctor entry at stage 0', async () => {
    const home = await freshHome();
    const r = await run(['start', '--advanced', '--json'], home, home);
    expect(r.code).toBe(0);
    const json = JSON.parse(r.stdout) as { options: Array<{ display: string }> };
    expect(json.options.some((o) => o.display === 'cadence doctor')).toBe(true);
  });

  it('278-01/AC-11: `start --json --advanced` (flag order reversed) includes the doctor entry', async () => {
    const home = await freshHome();
    const r = await run(['start', '--json', '--advanced'], home, home);
    expect(r.code).toBe(0);
    const json = JSON.parse(r.stdout) as { options: Array<{ display: string }> };
    expect(json.options.some((o) => o.display === 'cadence doctor')).toBe(true);
  });

  it('278-01/AC-11: `--advanced start --json` (global flag before the subcommand) includes the doctor entry', async () => {
    const home = await freshHome();
    const r = await run(['--advanced', 'start', '--json'], home, home);
    expect(r.code).toBe(0);
    const json = JSON.parse(r.stdout) as { options: Array<{ display: string }> };
    expect(json.options.some((o) => o.display === 'cadence doctor')).toBe(true);
  });

  it('278-01/AC-11: `start --json` with no --advanced still hides the doctor entry at stage 0 (regression guard)', async () => {
    const home = await freshHome();
    const r = await run(['start', '--json'], home, home);
    expect(r.code).toBe(0);
    const json = JSON.parse(r.stdout) as { options: Array<{ display: string }> };
    expect(json.options.some((o) => o.display === 'cadence doctor')).toBe(false);
  });

  it('278-01/AC-10: `help --advanced` (T7\'s own use of the same global flag) still works unchanged', async () => {
    const home = await freshHome();
    const r = await run(['help', '--advanced'], home, home);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/\bdoctor\b/);
  });
});
