import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(__dirname, '../../dist/cli/index.js');

function run(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

function readConfig(root: string): { text: string; cfg: any } {
  const text = readFileSync(join(root, '.cadence/config.json'), 'utf8');
  return { text, cfg: JSON.parse(text) };
}

/** Writes a sentinel script + returns the CADENCE_HOST_WIRE_CMD override env
 * that makes `maybeWireHost`'s spawn write a WIRED marker file instead of
 * actually invoking the real host-install subprocess (matches the pattern in
 * init.test.ts's --wire-host coverage). */
async function sentinelHostWireEnv(root: string): Promise<NodeJS.ProcessEnv> {
  const sentinel = join(root, 'sentinel.cjs');
  await writeFile(
    sentinel,
    "require('fs').writeFileSync(require('path').join(process.cwd(),'WIRED'),'ok');",
  );
  return { CADENCE_HOST_WIRE_CMD: JSON.stringify([process.execPath, sentinel]) };
}

const DEMO_DRAFT = join('.cadence', 'phases', '01-demo', '01-01-DRAFT.md');
const FAKE_KEY = 'sk-ant-test-DO-NOT-PERSIST';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence init --full (phase 188)', () => {
  it('AC-1: --full wires host, seeds demo, and activates verification when preconditions are met', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'), { recursive: true });
    const wireEnv = await sentinelHostWireEnv(active.root);
    const r = await run(['init', '--name=demo', '--full'], active.root, {
      ...wireEnv,
      ANTHROPIC_API_KEY: FAKE_KEY,
    });
    expect(r.code).toBe(0);
    // host wired via the CADENCE_HOST_WIRE_CMD seam, no prompt (non-TTY spawn).
    expect(existsSync(join(active.root, 'WIRED'))).toBe(true);
    // demo phase seeded.
    expect(existsSync(join(active.root, DEMO_DRAFT))).toBe(true);
    const state = JSON.parse(
      readFileSync(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    expect(state.loopPosition).toBe('DRAFT');
    // real verification activated.
    const { text, cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('anthropic');
    expect(text).not.toContain(FAKE_KEY);
  });

  it('AC-2: --full degrades safely with no workspace and no key — exit 0, no hang, demo still seeded', async () => {
    active = await tempRepo();
    // No .claude/ workspace, no ANTHROPIC_API_KEY, and no CADENCE_HOST_WIRE_CMD
    // override — if init tried to actually spawn a real host-install command
    // this would either hang or fail; asserting a prompt-fast exit proves it
    // was skipped rather than attempted.
    const r = await run(['init', '--name=demo', '--full'], active.root, {
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    expect(existsSync(join(active.root, 'WIRED'))).toBe(false);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('mock');
    // demo phase still seeded — --demo's precondition (none) is independent of
    // host/activation preconditions.
    expect(existsSync(join(active.root, DEMO_DRAFT))).toBe(true);
    const state = JSON.parse(
      readFileSync(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    expect(state.loopPosition).toBe('DRAFT');
  });

  it('AC-4: bare init (no --full) is unchanged — no demo, no activation, host wire only prompts (skipped non-TTY)', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'), { recursive: true });
    const wireEnv = await sentinelHostWireEnv(active.root);
    // Deliberately no --full, --wire-host, --demo, or --activate. Spawned
    // non-interactively (no TTY on a piped child process), so the host-wire
    // prompt path resolves to "skip" rather than hanging on stdin.
    const r = await run(['init', '--name=demo'], active.root, {
      ...wireEnv,
      ANTHROPIC_API_KEY: FAKE_KEY,
    });
    expect(r.code).toBe(0);
    expect(existsSync(join(active.root, 'WIRED'))).toBe(false);
    expect(existsSync(join(active.root, DEMO_DRAFT))).toBe(false);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('mock');
    const state = JSON.parse(
      readFileSync(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    expect(state.loopPosition).toBe('IDLE');
    // current messaging blocks unchanged: generic first-loop guidance prints,
    // the --full-only summary language does not.
    expect(r.stdout).toMatch(/Your first loop/);
    expect(r.stdout).not.toMatch(/Demo phase ready/);
  });

  it('AC-5: --full --skip-host-wire keeps the host unwired while demo-seed and activation still apply', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'), { recursive: true });
    const wireEnv = await sentinelHostWireEnv(active.root);
    const r = await run(
      ['init', '--name=demo', '--full', '--skip-host-wire'],
      active.root,
      { ...wireEnv, ANTHROPIC_API_KEY: FAKE_KEY },
    );
    expect(r.code).toBe(0);
    // explicit --skip-host-wire overrides --full's implied --wire-host.
    expect(existsSync(join(active.root, 'WIRED'))).toBe(false);
    // --full's other two defaults still apply.
    expect(existsSync(join(active.root, DEMO_DRAFT))).toBe(true);
    const { cfg } = readConfig(active.root);
    expect(cfg.verifier.provider).toBe('anthropic');
  });

  it('AC-3: everything-present run prints one consolidated summary with all three lines "done"', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.claude'), { recursive: true });
    const wireEnv = await sentinelHostWireEnv(active.root);
    const r = await run(['init', '--name=demo', '--full'], active.root, {
      ...wireEnv,
      ANTHROPIC_API_KEY: FAKE_KEY,
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Full setup summary');
    expect(r.stdout).toContain(
      'host wire     done: npx @thomas-powers-jr/cadence-host-claude-code install',
    );
    expect(r.stdout).toContain('demo phase    done: 01-demo');
    expect(r.stdout).toContain('activation    done: anthropic');
  });

  it('AC-3: nothing-present run prints one consolidated summary with skipped-and-reason lines (demo still done)', async () => {
    active = await tempRepo();
    // No .claude/ workspace, no ANTHROPIC_API_KEY, and no CADENCE_HOST_WIRE_CMD
    // override — mirrors AC-2's "nothing present" fixture.
    const r = await run(['init', '--name=demo', '--full'], active.root, {
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Full setup summary');
    expect(r.stdout).toContain('host wire     skipped: no .claude/ workspace detected');
    // --demo has no precondition, so it's still "done" even though host wire
    // and activation are skipped — proves the summary reports each
    // sub-feature independently rather than a single all-or-nothing verdict.
    expect(r.stdout).toContain('demo phase    done: 01-demo');
    expect(r.stdout).toContain(
      'activation    skipped: no ANTHROPIC_API_KEY — staying on mock',
    );
  });

  it('AC-3: bare --activate (no --full) never prints the "Full setup summary" block', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--activate'], active.root, {
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain('Full setup summary');
  });
});
