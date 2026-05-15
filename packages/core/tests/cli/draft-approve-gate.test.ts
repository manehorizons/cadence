import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';

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
  promptScript?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ANTHROPIC_API_KEY: '',
    };
    if (promptScript !== undefined) {
      env.CADENCE_PROMPTER_SCRIPT = promptScript;
    } else {
      delete env.CADENCE_PROMPTER_SCRIPT;
    }
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd, env });
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

/**
 * Force the project config into standard×standard so `'approve'` is in the
 * effective gate set. Default tempRepo profile is `auto`, which doesn't
 * carry the approve gate — these tests need it on.
 */
async function setStandardProfile(root: string): Promise<void> {
  const cfgPath = join(root, '.cadence', 'config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  cfg.profile = 'standard';
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
}

describe('cadence draft approve (Phase 24.1 — manual approve gate)', () => {
  it('AC-1 + AC-2: prompts and proceeds on "y"', async () => {
    active = await tempRepo({ initialized: true });
    await setStandardProfile(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    const r = await run(
      ['draft', 'approve', '01-foundation', '01'],
      active.root,
      'y\n',
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Approved 01-01; loopPosition=BUILD/);
    const state = JSON.parse(
      await readFile(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    expect(state.loopPosition).toBe('BUILD');
    expect(state.draftReadAt).toBeTruthy();
  });

  it('AC-3: refuses with exit 1 and no state mutation on "n"', async () => {
    active = await tempRepo({ initialized: true });
    await setStandardProfile(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    const before = JSON.parse(
      await readFile(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    expect(before.loopPosition).toBe('DRAFT'); // sanity: draft new put us in DRAFT
    const r = await run(
      ['draft', 'approve', '01-foundation', '01'],
      active.root,
      'n\n',
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/refused: user declined manual approve gate/);
    const after = JSON.parse(
      await readFile(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    expect(after.loopPosition).toBe('DRAFT'); // unchanged
    expect(after.draftReadAt).toBeFalsy();
  });

  it('AC-4: --no-approve bypasses the prompt', async () => {
    active = await tempRepo({ initialized: true });
    await setStandardProfile(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    // No promptScript → would refuse with TTY error if gate fired. --no-approve
    // bypasses, so this should succeed.
    const r = await run(
      ['draft', 'approve', '01-foundation', '01', '--no-approve'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Approved 01-01; loopPosition=BUILD/);
  });

  it('AC-5: non-TTY refuses with --no-approve hint when gate is on', async () => {
    active = await tempRepo({ initialized: true });
    await setStandardProfile(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    const r = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/manual-approve:.*TTY/);
    expect(r.stderr).toMatch(/--no-approve/);
    const state = JSON.parse(
      await readFile(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    expect(state.loopPosition).toBe('DRAFT'); // unchanged
  });

  it('AC-6: gate-aware — auto×standard (default) skips prompt', async () => {
    active = await tempRepo({ initialized: true }); // default profile=auto
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    // No CADENCE_PROMPTER_SCRIPT, no --no-approve. If the gate fired, this
    // would refuse on non-TTY. It should NOT fire under auto profile.
    const r = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Approved 01-01; loopPosition=BUILD/);
  });

  it('coherence blocker still refuses before the approve prompt', async () => {
    active = await tempRepo({ initialized: true });
    await setStandardProfile(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    // Seed PROJECT.md with a DO NOT directive matching the draft's default
    // task file (`path/to/file.ts`). Coherence then emits a block-severity
    // PROJECT_FORBIDDEN issue and approve refuses with exit 2 before any
    // prompt code path runs.
    await writeFile(
      join(active.root, '.cadence/PROJECT.md'),
      '# project\n\nDO NOT edit `path/to/file.ts`.\n',
      'utf8',
    );
    const r = await run(
      ['draft', 'approve', '01-foundation', '01'],
      active.root,
      'y\n', // even with `y` seeded, blocker fires first; prompt is never asked
    );
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/\[BLOCK\]/);
    const state = JSON.parse(
      await readFile(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    expect(state.loopPosition).toBe('DRAFT');
  });

  void mkdir;
  void existsSync;
});
