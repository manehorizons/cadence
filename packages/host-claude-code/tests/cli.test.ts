import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '../dist/cli.js');

function run(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CLI, ...args]);
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

async function tempDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'keel-cc-cli-'));
  cleanup.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

describe('keel-host-claude-code install', () => {
  it('writes settings.json and slash commands into --cwd', async () => {
    const root = await tempDir();
    const r = await run(['install', '--cwd', root]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Installed KEEL hooks/);
    expect(r.stdout).toMatch(/Installed KEEL slash commands/);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0]._managedBy).toBe('keel');
    const progress = await readFile(join(root, '.claude/commands/keel-progress.md'), 'utf8');
    expect(progress).toMatch(/!keel progress/);
  });

  it('--no-commands skips slash command writing', async () => {
    const root = await tempDir();
    const r = await run(['install', '--cwd', root, '--no-commands']);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/Installed KEEL slash commands/);
    const { access } = await import('node:fs/promises');
    let exists = true;
    try {
      await access(join(root, '.claude/commands/keel-progress.md'));
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  it('--no-hooks skips settings.json writing', async () => {
    const root = await tempDir();
    const r = await run(['install', '--cwd', root, '--no-hooks']);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/Installed KEEL hooks/);
    expect(r.stdout).toMatch(/Installed KEEL slash commands/);
  });

  it('honors --command override (shim invocation)', async () => {
    const root = await tempDir();
    const r = await run(['install', '--cwd', root, '--command', 'node /abs/shim.js hook']);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe('node /abs/shim.js hook');
  });

  it('honors --keel override (appended to default shim)', async () => {
    const root = await tempDir();
    const r = await run(['install', '--cwd', root, '--keel', 'node /abs/k.js']);
    expect(r.code).toBe(0);
    const cfg = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8'));
    expect(cfg.hooks.SessionStart[0].hooks[0].command).toBe(
      'npx @keel/host-claude-code hook --keel "node /abs/k.js"',
    );
  });
});
