import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execFileSync } from 'node:child_process';
import { rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

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

function hooksPathUnset(cwd: string): boolean {
  try {
    execFileSync('git', ['config', '--local', 'core.hooksPath'], { cwd });
    return false;
  } catch {
    return true;
  }
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence doctor --fix', () => {
  it('AC-2: --fix applies the auto repairs in-process', async () => {
    active = await tempRepo({ initialized: true });
    execFileSync('git', ['init', '-q'], { cwd: active.root });
    // Phase 133: the git-hooks check is only auto-fixable when .githooks/ exists.
    await mkdir(join(active.root, '.githooks'), { recursive: true });
    const r = await run(['doctor', '--fix'], active.root);
    const hp = execFileSync('git', ['config', '--local', 'core.hooksPath'], {
      cwd: active.root,
    })
      .toString()
      .trim();
    expect(hp).toBe('.githooks');
    expect(r.stdout).toMatch(/git-hooks/);
  });

  it('AC-3: --fix --dry-run writes nothing and prints the plan', async () => {
    active = await tempRepo({ initialized: true });
    execFileSync('git', ['init', '-q'], { cwd: active.root });
    await rm(join(active.root, '.cadence', 'STATE.md'));
    const r = await run(['doctor', '--fix', '--dry-run'], active.root);
    expect(hooksPathUnset(active.root)).toBe(true);
    expect(existsSync(join(active.root, '.cadence', 'STATE.md'))).toBe(false);
    expect(r.stdout).toMatch(/dry.run/i);
  });

  it('AC-5: manual findings are reported as guidance, no prompt (non-TTY-safe)', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['doctor', '--fix'], active.root);
    expect(r.code).toBe(0); // warnings don't fail; no hang on a non-TTY
    expect(r.stdout).toMatch(/verification-readiness/);
    expect(r.stdout).toMatch(/cadence activate/); // guidance, not auto-applied
  });

  it('AC-5: --fix --json carries the plan and applied outcomes', async () => {
    active = await tempRepo({ initialized: true });
    execFileSync('git', ['init', '-q'], { cwd: active.root });
    const r = await run(['doctor', '--fix', '--json'], active.root);
    const parsed = JSON.parse(r.stdout);
    expect(parsed).toHaveProperty('report');
    expect(parsed).toHaveProperty('fixPlan');
    expect(parsed).toHaveProperty('fixesApplied');
    expect(parsed).toHaveProperty('postFixReport');
    expect(Array.isArray(parsed.fixesApplied)).toBe(true);
  });

  it('AC-3: idempotent — a second --fix has nothing left to apply for git-hooks', async () => {
    active = await tempRepo({ initialized: true });
    execFileSync('git', ['init', '-q'], { cwd: active.root });
    await run(['doctor', '--fix'], active.root);
    const r2 = await run(['doctor', '--fix', '--json'], active.root);
    const parsed = JSON.parse(r2.stdout);
    const ids = parsed.fixPlan.actions.map((a: { fixId: string | null }) => a.fixId);
    expect(ids).not.toContain('git-hooks');
  });
});
