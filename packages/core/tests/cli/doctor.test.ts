import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { emptyState } from '@thomas-powers-jr/cadence-types';

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

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence doctor', () => {
  it('AC-1: healthy project → exit 0', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-cli' });
    const r = await run(['doctor'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/node/);
    expect(r.stdout).toMatch(/initialized/);
  });

  it('AC-2: uninitialized dir → exit 1, no stack trace', async () => {
    active = await tempRepo({ initialized: false });
    const r = await run(['doctor'], active.root);
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toMatch(/cadence init/);
    // diagnosed, not crashed: no NotInitializedError bubble / no stack frames
    expect(r.stderr).not.toMatch(/NotInitializedError/);
    expect(r.stderr).not.toMatch(/^\s+at\s+/m);
  });

  it('AC-3: a problem renders name + severity + remediation', async () => {
    active = await tempRepo({ initialized: false });
    const r = await run(['doctor'], active.root);
    expect(r.stdout).toMatch(/initialized/);
    expect(r.stdout).toMatch(/error/);
    expect(r.stdout).toMatch(/cadence init/); // remediation
  });

  it('AC-4: --json emits a single parseable object with checks + ok', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['doctor', '--json'], active.root);
    const parsed = JSON.parse(r.stdout); // throws if not exactly one JSON value
    expect(typeof parsed.ok).toBe('boolean');
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.checks[0]).toHaveProperty('name');
    expect(parsed.checks[0]).toHaveProperty('severity');
    expect(parsed.checks[0]).toHaveProperty('remediation');
  });

  it('AC-5: warning-only project → exit 0', async () => {
    active = await tempRepo({ initialized: true });
    const dir = join(active.root, '.claude', 'commands');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'cadence-progress.md'),
      '<!-- managed-by: cadence -->\n\n!node /abs/path/cli/index.js progress\n',
    );
    const r = await run(['doctor'], active.root);
    expect(r.code).toBe(0); // a warning must not fail
    expect(r.stdout).toMatch(/warning/);
  });

  /**
   * T4 (phase 166, AC-4, fix round): the actual `cadence doctor` CLI path
   * (not just the MCP `doctorService` seam) must surface the coverage-mode
   * language-support check, since the CLI calls `runDoctor` directly.
   */
  it('AC-4 (phase 166, phase 167 registry-driven fix): coverageMode:assertion + an unrecognized project language → warning surfaced via the CLI', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-cli-lang' });
    // No package.json/pyproject.toml/go.mod/Cargo.toml/composer.json — detectProjectLanguage() → 'unknown'.
    // (python now has real assertion-mode support as of phase 167, so it no longer warns here.)

    const r = await run(['doctor'], active.root);
    expect(r.code).toBe(0); // a warning must not fail the report
    expect(r.stdout).toMatch(/coverage-mode-language-support/);
    expect(r.stdout).toMatch(/coverageMode is 'assertion'/);
    expect(r.stdout).toMatch(/cadence config edit coverageMode/);
  });
});

// Phase 196 (issue #177), T5: `cadence doctor --fix --resolve-state-conflict=local|incoming`
// actually acts on T4's conflict-marker diagnosis, end to end through the real CLI.
describe('cadence doctor --fix --resolve-state-conflict (phase 196, issue #177, AC-5)', () => {
  function conflictBody(local: unknown, incoming: unknown): string {
    return [
      '<<<<<<< HEAD',
      JSON.stringify(local, null, 2),
      '=======',
      JSON.stringify(incoming, null, 2),
      '>>>>>>> worktree-branch',
      '',
    ].join('\n');
  }

  async function seedConflict(root: string, projectName: string): Promise<void> {
    const base = emptyState(projectName);
    await writeFile(
      join(root, '.cadence', 'state.json'),
      conflictBody(
        { ...base, activePhase: '10', loopPosition: 'BUILD' as const },
        { ...base, activePhase: '11', loopPosition: 'SETTLE' as const },
      ),
    );
  }

  it('--resolve-state-conflict=local writes the local side and regenerates STATE.md', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-cli-resolve-local' });
    await seedConflict(active.root, 'doc-cli-resolve-local');

    const r = await run(['doctor', '--fix', '--resolve-state-conflict=local'], active.root);
    expect(r.code).toBe(0);

    const state = JSON.parse(await readFile(join(active.root, '.cadence', 'state.json'), 'utf8'));
    expect(state.activePhase).toBe('10');
    expect(state.loopPosition).toBe('BUILD');

    const stateMd = await readFile(join(active.root, '.cadence', 'STATE.md'), 'utf8');
    expect(stateMd).toContain('10');
  });

  it('--resolve-state-conflict=incoming writes the incoming side and regenerates STATE.md', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-cli-resolve-incoming' });
    await seedConflict(active.root, 'doc-cli-resolve-incoming');

    const r = await run(['doctor', '--fix', '--resolve-state-conflict=incoming'], active.root);
    expect(r.code).toBe(0);

    const state = JSON.parse(await readFile(join(active.root, '.cadence', 'state.json'), 'utf8'));
    expect(state.activePhase).toBe('11');
    expect(state.loopPosition).toBe('SETTLE');

    const stateMd = await readFile(join(active.root, '.cadence', 'STATE.md'), 'utf8');
    expect(stateMd).toContain('11');
  });

  it('--resolve-state-conflict=local against an already-clean state.json is a no-op, not an error', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-cli-resolve-clean' });
    const before = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');

    const r = await run(['doctor', '--fix', '--resolve-state-conflict=local'], active.root);
    expect(r.code).toBe(0);

    const after = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');
    expect(after).toBe(before);
  });

  it('--resolve-state-conflict=bogus → clear error, non-zero exit, nothing written', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-cli-resolve-bogus' });
    await seedConflict(active.root, 'doc-cli-resolve-bogus');
    const before = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');

    const r = await run(['doctor', '--fix', '--resolve-state-conflict=bogus'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/resolve-state-conflict/);
    expect(r.stderr).toMatch(/local.*incoming|incoming.*local/i);

    const after = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');
    expect(after).toBe(before);
  });

  it('--resolve-state-conflict=local without --fix → clear error, non-zero exit, nothing written', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-cli-resolve-noflag' });
    await seedConflict(active.root, 'doc-cli-resolve-noflag');
    const before = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');

    const r = await run(['doctor', '--resolve-state-conflict=local'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/--fix/);

    const after = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');
    expect(after).toBe(before);
  });
});
