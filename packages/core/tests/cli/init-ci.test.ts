import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, runGit, type Fixture } from '@thomas-powers-jr/cadence-testkit';

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

describe('cadence init --ci', () => {
  it('writes the workflow file and prints the branch-protection recipe', async () => {
    active = await tempRepo();
    await writeFile(join(active.root, 'package.json'), JSON.stringify({ name: 'demo' }));
    const res = await run(['init', '--name', 'demo', '--ci'], active.root);
    expect(res.code).toBe(0);
    const workflowPath = join(active.root, '.github', 'workflows', 'cadence-verify.yml');
    expect(existsSync(workflowPath)).toBe(true);
    const content = await readFile(workflowPath, 'utf8');
    expect(content).toContain('cadence verify phase --changed --base');
    expect(res.stdout).toContain('gh api repos/');
    expect(res.stdout).toContain('protection/required_status_checks');
  });

  it('refuses if the workflow file already exists, without overwriting it', async () => {
    active = await tempRepo();
    await mkdir(join(active.root, '.github', 'workflows'), { recursive: true });
    await writeFile(
      join(active.root, '.github', 'workflows', 'cadence-verify.yml'),
      'existing content\n',
    );
    const res = await run(['init', '--name', 'demo', '--ci'], active.root);
    expect(res.code).not.toBe(0);
    const content = await readFile(
      join(active.root, '.github', 'workflows', 'cadence-verify.yml'),
      'utf8',
    );
    expect(content).toBe('existing content\n');
  });

  it('resolves the real owner/repo from an origin remote when present', async () => {
    active = await tempRepo();
    runGit(active.root, ['init', '-q']);
    runGit(active.root, ['remote', 'add', 'origin', 'https://github.com/manehorizons/cadence.git']);
    await writeFile(join(active.root, 'package.json'), JSON.stringify({ name: 'demo' }));
    const res = await run(['init', '--name', 'demo', '--ci'], active.root);
    expect(res.stdout).toContain('repos/manehorizons/cadence/branches/');
  });
});
