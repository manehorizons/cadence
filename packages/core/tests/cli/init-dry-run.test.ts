import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

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

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence init --dry-run (phase 132, rec-20260619-005)', () => {
  it('AC-2: previews a fresh repo, creates no .cadence/, exits 0', async () => {
    active = await tempRepo();
    const before = await readdir(active.root);

    const r = await run(['init', '--name=demo', '--dry-run'], active.root);

    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/dry run/i);
    expect(r.stdout).toContain('demo');
    expect(r.stdout).toContain('.cadence/config.json');
    expect(r.stdout).toMatch(/nothing was written/i);

    // wrote nothing
    expect(existsSync(join(active.root, '.cadence'))).toBe(false);
    expect(await readdir(active.root)).toEqual(before);
  });

  it('AC-3: on an already-initialized repo it previews + says init would refuse, exit 0 (not 2)', async () => {
    active = await tempRepo({ initialized: true });
    const before = await readdir(join(active.root, '.cadence'));

    const dry = await run(['init', '--dry-run'], active.root);
    expect(dry.code).toBe(0);
    expect(dry.stdout).toMatch(/would refuse/i);
    expect(dry.stdout).toMatch(/already (initialized|exists)/i);
    // untouched
    expect(await readdir(join(active.root, '.cadence'))).toEqual(before);

    // contrast: a real init on the same repo refuses with exit 2
    const real = await run(['init'], active.root);
    expect(real.code).toBe(2);
    expect(real.stderr).toMatch(/already initialized/i);
  });

  it('AC-4: --gate-profile is reflected in the preview', async () => {
    active = await tempRepo();
    const r = await run(['init', '--gate-profile=strict', '--dry-run'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/gate profile\s+strict/);
  });

  it('AC-4: --activate with a key shows real verification on (anthropic), writes nothing', async () => {
    active = await tempRepo();
    const r = await run(['init', '--activate', '--dry-run'], active.root, {
      ANTHROPIC_API_KEY: 'sk-ant-test-DO-NOT-PERSIST',
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/anthropic/);
    expect(r.stdout).toMatch(/real verification on/i);
    expect(existsSync(join(active.root, '.cadence'))).toBe(false);
  });

  it('AC-4: --activate without a key stays on the mock placeholder', async () => {
    active = await tempRepo();
    const r = await run(['init', '--activate', '--dry-run'], active.root, {
      ANTHROPIC_API_KEY: '',
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/staying on mock/i);
  });

  it('AC-4: --demo lists the seeded demo phase in the would-write paths', async () => {
    active = await tempRepo();
    const r = await run(['init', '--demo', '--dry-run'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/demo phase\s+yes/);
    expect(r.stdout).toMatch(/01-demo/);
    expect(existsSync(join(active.root, '.cadence'))).toBe(false);
  });

  it('AC-5: --dry-run is documented (commands.md + quickstart) and carries a flag description', () => {
    const commands = readFileSync(
      join(__dirname, '../../../../docs/reference/commands.md'),
      'utf8',
    );
    const quickstart = readFileSync(
      join(__dirname, '../../../../docs/quickstart.md'),
      'utf8',
    );
    const initSrc = readFileSync(
      join(__dirname, '../../src/cli/commands/init.ts'),
      'utf8',
    );

    expect(commands).toMatch(/--dry-run/);
    expect(quickstart).toMatch(/cadence init --dry-run/);
    // the command registration carries a description for the flag
    expect(initSrc).toMatch(/'--dry-run',\s*\n\s*'[^']+'/);
  });
});
