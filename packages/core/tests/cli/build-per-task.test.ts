import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
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
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, ANTHROPIC_API_KEY: '' };
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

/** Set up a git workdir with an initial commit so `git diff HEAD` works. */
async function initGitRepo(root: string): Promise<void> {
  execSync('git init -q', { cwd: root, stdio: 'ignore' });
  execSync('git config user.email "test@cadence.local"', { cwd: root, stdio: 'ignore' });
  execSync('git config user.name "Cadence Test"', { cwd: root, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'ignore' });
  // Initial commit so HEAD exists.
  await writeFile(join(root, '.gitignore'), '.cadence/state.json\n');
  execSync('git add .gitignore', { cwd: root, stdio: 'ignore' });
  execSync('git commit -q -m init', { cwd: root, stdio: 'ignore' });
}

async function setStrictProfile(root: string): Promise<void> {
  const cfgPath = join(root, '.cadence', 'config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  cfg.profile = 'strict';
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
}

/**
 * Replace the scaffolded T1 task file with one matching a real on-disk path
 * so `git diff` against that file yields content. The default scaffold
 * declares `path/to/file.ts` which doesn't exist.
 */
async function rewireT1(root: string, relPath: string): Promise<void> {
  const draftPath = join(
    root,
    '.cadence/phases/01-foundation/01-01-DRAFT.md',
  );
  let body = await readFile(draftPath, 'utf8');
  body = body.replace(/- files: `path\/to\/file\.ts`/, `- files: \`${relPath}\``);
  await writeFile(draftPath, body, 'utf8');
}

describe('cadence build task (Phase 24.2 — per-task verifier gate)', () => {
  it('AC-4: gate refuses DONE when mock has no diff (concerns→pass path needs diff)', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await setStrictProfile(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(
      ['draft', 'approve', '01-foundation', '01', '--no-approve'],
      active.root,
    );
    // T1's declared file is `path/to/file.ts` (scaffold default) which
    // doesn't exist → `git diff HEAD -- path/to/file.ts` is empty →
    // MockPerTaskVerifier returns `'concerns'` (not refuse). Pick the
    // refuse path by emptying the files list via DRAFT edit.
    const draftPath = join(
      active.root,
      '.cadence/phases/01-foundation/01-01-DRAFT.md',
    );
    let body = await readFile(draftPath, 'utf8');
    body = body.replace(/- files: `path\/to\/file\.ts`\n/, '');
    await writeFile(draftPath, body, 'utf8');

    const r = await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/per-task-verify refused.*no files touched/);
    expect(r.stderr).toMatch(/--allow-per-task-failure/);

    // PROGRESS.json should not exist (record skipped).
    const progressPath = join(
      active.root,
      '.cadence/phases/01-foundation/01-01-PROGRESS.json',
    );
    let progressExists = true;
    try {
      await readFile(progressPath, 'utf8');
    } catch {
      progressExists = false;
    }
    expect(progressExists).toBe(false);
  });

  it('AC-5: --allow-per-task-failure records DONE with bypassed=true', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await setStrictProfile(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(
      ['draft', 'approve', '01-foundation', '01', '--no-approve'],
      active.root,
    );
    // Same refuse fixture as above.
    const draftPath = join(
      active.root,
      '.cadence/phases/01-foundation/01-01-DRAFT.md',
    );
    let body = await readFile(draftPath, 'utf8');
    body = body.replace(/- files: `path\/to\/file\.ts`\n/, '');
    await writeFile(draftPath, body, 'utf8');

    const r = await run(
      ['build', 'task', 'T1', '--status=DONE', '--allow-per-task-failure'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/proceeding past refuse verdict/);

    const progress = JSON.parse(
      await readFile(
        join(
          active.root,
          '.cadence/phases/01-foundation/01-01-PROGRESS.json',
        ),
        'utf8',
      ),
    );
    expect(progress.tasks.T1).toMatchObject({
      status: 'DONE',
      perTaskVerify: {
        verdict: 'refuse',
        provider: 'mock',
        bypassed: true,
      },
    });
  });

  it('AC-4: pass verdict records DONE with verdict on PROGRESS.json', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await setStrictProfile(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(
      ['draft', 'approve', '01-foundation', '01', '--no-approve'],
      active.root,
    );
    // Make T1 point at a real file with a real diff vs HEAD.
    await rewireT1(active.root, 'src/foo.ts');
    // Create the file as untracked (untracked files don't show in `git diff
    // HEAD -- <file>` unless added). Add + leave staged so the diff shows.
    await writeFile(join(active.root, 'src', 'foo.ts'), 'export const x = 1;\n').catch(
      async () => {
        execSync('mkdir src', { cwd: active!.root });
        await writeFile(
          join(active!.root, 'src', 'foo.ts'),
          'export const x = 1;\n',
        );
      },
    );
    execSync('git add src/foo.ts', { cwd: active.root, stdio: 'ignore' });
    // Staged-but-not-committed → `git diff HEAD -- src/foo.ts` includes it.

    const r = await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Recorded T1: DONE/);
    const progress = JSON.parse(
      await readFile(
        join(
          active.root,
          '.cadence/phases/01-foundation/01-01-PROGRESS.json',
        ),
        'utf8',
      ),
    );
    expect(progress.tasks.T1.perTaskVerify).toMatchObject({
      verdict: 'pass',
      provider: 'mock',
    });
    expect(progress.tasks.T1.perTaskVerify.bypassed).toBeUndefined();
  });

  it('AC-4: non-DONE status (BLOCKED) skips the gate entirely', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await setStrictProfile(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(
      ['draft', 'approve', '01-foundation', '01', '--no-approve'],
      active.root,
    );
    // Refuse fixture would fire under DONE; BLOCKED must bypass entirely.
    const draftPath = join(
      active.root,
      '.cadence/phases/01-foundation/01-01-DRAFT.md',
    );
    let body = await readFile(draftPath, 'utf8');
    body = body.replace(/- files: `path\/to\/file\.ts`\n/, '');
    await writeFile(draftPath, body, 'utf8');

    const r = await run(
      ['build', 'task', 'T1', '--status=BLOCKED', '--notes=stuck'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/per-task-verify/);
    const progress = JSON.parse(
      await readFile(
        join(
          active.root,
          '.cadence/phases/01-foundation/01-01-PROGRESS.json',
        ),
        'utf8',
      ),
    );
    expect(progress.tasks.T1.status).toBe('BLOCKED');
    expect(progress.tasks.T1.perTaskVerify).toBeUndefined();
  });

  it('AC-4: auto profile (gate not in set) skips the gate', async () => {
    active = await tempRepo({ initialized: true }); // default profile=auto
    await initGitRepo(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    // T1 files empty → would refuse under strict; under auto, the gate
    // isn't in the set so the verifier never runs.
    const draftPath = join(
      active.root,
      '.cadence/phases/01-foundation/01-01-DRAFT.md',
    );
    let body = await readFile(draftPath, 'utf8');
    body = body.replace(/- files: `path\/to\/file\.ts`\n/, '');
    await writeFile(draftPath, body, 'utf8');

    const r = await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/per-task-verify/);
    const progress = JSON.parse(
      await readFile(
        join(
          active.root,
          '.cadence/phases/01-foundation/01-01-PROGRESS.json',
        ),
        'utf8',
      ),
    );
    expect(progress.tasks.T1.status).toBe('DONE');
    expect(progress.tasks.T1.perTaskVerify).toBeUndefined();
  });
});
