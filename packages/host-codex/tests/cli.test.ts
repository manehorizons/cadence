import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '../dist/cli.js');

function run(args: string[], env?: Record<string, string>): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.stdin.end();
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

async function tempDir(prefix: string): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), prefix));
  cleanup.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

describe('cadence-host-codex install (AC-3)', () => {
  it('AC-3: writes hooks.json + global prompts and reports both', async () => {
    const root = await tempDir('cadence-codex-cli-');
    const home = await tempDir('cadence-codex-home-');
    const r = await run(['install', '--cwd', root, '--codex-home', home]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Installed CADENCE.*hooks/i);
    expect(r.stdout).toMatch(/Installed CADENCE.*prompts/i);
    const cfg = JSON.parse(await readFile(join(root, '.codex/hooks.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0]._managedBy).toBe('cadence');
    expect(await readFile(join(home, 'prompts/cadence-progress.md'), 'utf8')).toContain('cadence progress');
  });

  it('AC-3: always warns that prompts install GLOBALLY', async () => {
    const root = await tempDir('cadence-codex-cli-');
    const home = await tempDir('cadence-codex-home-');
    const r = await run(['install', '--cwd', root, '--codex-home', home]);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/global/i);
    expect(r.stderr).toMatch(/prompts/i);
  });

  it('AC-3: --no-commands skips prompts (and its global warning)', async () => {
    const root = await tempDir('cadence-codex-cli-');
    const home = await tempDir('cadence-codex-home-');
    const r = await run(['install', '--cwd', root, '--codex-home', home, '--no-commands']);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/prompts/i);
    expect(r.stderr).not.toMatch(/global/i);
  });

  it('AC-3: --no-hooks skips hooks.json', async () => {
    const root = await tempDir('cadence-codex-cli-');
    const home = await tempDir('cadence-codex-home-');
    const r = await run(['install', '--cwd', root, '--codex-home', home, '--no-hooks']);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/Installed CADENCE.*hooks/i);
  });

  it('AC-4: --local warns about machine-absolute paths in both surfaces', async () => {
    const root = await tempDir('cadence-codex-cli-');
    const home = await tempDir('cadence-codex-home-');
    const r = await run(['install', '--cwd', root, '--codex-home', home, '--local']);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/machine-absolute/i);
    expect(r.stderr).toMatch(/\.codex\/hooks\.json/);
    expect(r.stderr).toMatch(/prompts/i);
  });
});

describe('cadence-host-codex --version', () => {
  it('reports the version from package.json (no hardcoded drift)', async () => {
    const pkg = JSON.parse(await readFile(join(__dirname, '../package.json'), 'utf8')) as { version: string };
    const r = await run(['--version']);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(pkg.version);
  });
});
