import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    p.stderr.on('data', (b) => {
      stderr += b.toString();
    });
    p.on('exit', (code) => resolve({ code: code ?? 0, stderr }));
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
 * Set up a git workdir with an initial commit so `git diff HEAD` works —
 * required for the per-task-verify mock provider to diff declared files.
 * Mirrors the identically-named helper in build-per-task.test.ts.
 */
async function initGitRepo(root: string): Promise<void> {
  execSync('git init -q', { cwd: root, stdio: 'ignore' });
  execSync('git config user.email "test@cadence.local"', { cwd: root, stdio: 'ignore' });
  execSync('git config user.name "Cadence Test"', { cwd: root, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'ignore' });
  await writeFile(join(root, '.gitignore'), '.cadence/state.json\n');
  execSync('git add .gitignore', { cwd: root, stdio: 'ignore' });
  execSync('git commit -q -m init', { cwd: root, stdio: 'ignore' });
}

/** Strict profile puts `per-task-verify` in the effective gate set. */
async function setStrictProfile(root: string): Promise<void> {
  const cfgPath = join(root, '.cadence', 'config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  cfg.profile = 'strict';
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
}

describe('cadence done <id>', () => {
  it('records DONE with notes in PROGRESS.json (AC-1)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(['done', 'T1', '--notes=finished'], active.root);
    expect(r.code).toBe(0);

    const progress = JSON.parse(
      await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.status).toBe('DONE');
    expect(progress.tasks.T1.notes).toBe('finished');
  });

  it('records DONE with empty notes when --notes omitted', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    const r = await run(['done', 'T1'], active.root);
    expect(r.code).toBe(0);

    const progress = JSON.parse(
      await readFile(join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'), 'utf8'),
    );
    expect(progress.tasks.T1.status).toBe('DONE');
    expect(progress.tasks.T1.notes).toBe('');
  });

  it('exits non-zero with LoopViolation when not in BUILD (AC-2)', async () => {
    active = await tempRepo({ initialized: true });

    const r = await run(['done', 'T1'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/BUILD/i);
  });

  it('updates state.activeTask to the just-recorded task', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);

    await run(['done', 'T1'], active.root);

    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.activeTask?.id).toBe('T1');
    expect(state.activeTask?.status).toBe('DONE');
  });

  it(
    'refuses like `build task <id> --status=DONE` when per-task-verify refuses, and leaves ' +
      'PROGRESS.json unmutated (281-01/AC-1)',
    async () => {
      active = await tempRepo({ initialized: true });
      await initGitRepo(active.root);
      await setStrictProfile(active.root);
      await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
      await run(['draft', 'approve', '01-foundation', '01', '--no-approve'], active.root);

      // T1's declared file is `path/to/file.ts` (scaffold default), which
      // doesn't exist → `git diff HEAD -- path/to/file.ts` is empty →
      // MockPerTaskVerifier returns `'concerns'` (not refuse). Pick the
      // refuse path by emptying the files list via DRAFT edit — same fixture
      // shape as build-per-task.test.ts's "AC-4: gate refuses DONE when mock
      // has no diff" case, which pins the message `cadence build task
      // T1 --status=DONE` produces for this exact scenario: exit 1, stderr
      // matching `per-task-verify refused.*no files touched` +
      // `--allow-per-task-failure`, and no PROGRESS.json written.
      const draftPath = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
      let body = await readFile(draftPath, 'utf8');
      body = body.replace(/- files: `path\/to\/file\.ts`\n/, '');
      await writeFile(draftPath, body, 'utf8');

      const r = await run(['done', 'T1'], active.root);

      // `cadence done <id>` is documented as a shortcut for `cadence build
      // task <id> --status=DONE` and must carry the same guarantees. RED
      // today: done.ts (src/cli/commands/done.ts) calls recordTaskOutcome
      // directly and never runs runPerTaskVerifyGate/buildTaskService, so it
      // records DONE unconditionally instead of refusing — actual observed
      // behavior pre-fix: exit 0, PROGRESS.json IS written for T1.
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/per-task-verify refused.*no files touched/);
      expect(r.stderr).toMatch(/--allow-per-task-failure/);

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
    },
  );

  it(
    'refuses like `build task <id> --status=DONE` under a block-mode boundary breach, ' +
      'naming the stray file exactly as `build task` does (281-01/AC-2)',
    async () => {
      active = await tempRepo({ initialized: true });
      await initGitRepo(active.root);
      await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);

      // Force boundaryEnforcement: block and pin T1's declared file to
      // `src/allowed.ts` — same DRAFT shape as build-task-boundary.test.ts's
      // BLOCK_MODE_DRAFT fixture, which pins `cadence build task T1
      // --status=DONE`'s refusal for this exact scenario ("draft T1 fixture
      // (a)"): exit 1, stderr naming the stray file plus
      // `--allow-boundary-breach`, and no PROGRESS.json mutation.
      const draftPath = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
      let body = await readFile(draftPath, 'utf8');
      body = body.replace(/^status: PENDING$/m, 'status: PENDING\nboundaryEnforcement: block');
      body = body.replace(/- files: `path\/to\/file\.ts`\n/, '- files: `src/allowed.ts`\n');
      await writeFile(draftPath, body, 'utf8');
      await run(['draft', 'approve', '01-foundation', '01'], active.root);

      await mkdir(join(active.root, 'src'), { recursive: true });
      // T1's declared file.
      await writeFile(join(active.root, 'src/allowed.ts'), 'export const allowed = 1;\n');
      // The stray file: untracked, outside the union of all declared `files:`.
      await writeFile(join(active.root, 'src/stray.ts'), 'export const stray = 1;\n');

      const r = await run(['done', 'T1'], active.root);

      // `cadence done <id>` is documented as a shortcut for `cadence build
      // task <id> --status=DONE` and must carry the same record-time
      // boundary/redundancy guarantees. RED today: done.ts (src/cli/commands
      // /done.ts) calls recordTaskOutcome directly and never runs
      // buildTaskService's boundary-check step at all, so it records DONE
      // unconditionally regardless of boundaryEnforcement or stray files —
      // actual observed behavior pre-fix: exit 0, PROGRESS.json IS written
      // for T1.
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/stray\.ts/);
      expect(r.stderr).toMatch(/--allow-boundary-breach/);

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
    },
  );

  it(
    'records the git-derived touchedFiles like `build task` does in warn mode (the default), ' +
      'not an empty self-report (281-01/AC-3)',
    async () => {
      active = await tempRepo({ initialized: true });
      await initGitRepo(active.root);
      await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
      await run(['draft', 'approve', '01-foundation', '01'], active.root);
      // Default scaffold's T1 declares `path/to/file.ts` (nonexistent) --
      // declaredFiles.length === 1, not 0, so `build task`'s boundary/
      // redundancy step runs (not skipped) and computes ground-truth
      // touchedFiles even though boundaryEnforcement is left at its default
      // ('warn') -- mirrors build-task-boundary.test.ts's "T11 — AC-3 warn
      // mode (default enforcement)" fixture, just via `cadence done` instead
      // of `cadence build task --status=DONE`.

      await mkdir(join(active.root, 'src'), { recursive: true });
      await writeFile(join(active.root, 'src/stray.ts'), 'export const stray = 1;\n');

      const r = await run(['done', 'T1'], active.root);

      // `cadence done <id>` is documented as a shortcut for `cadence build
      // task <id> --status=DONE` and must carry the same ground-truth
      // touchedFiles guarantee, even in warn mode. RED today: done.ts
      // (src/cli/commands/done.ts) calls recordTaskOutcome directly with no
      // options object at all, so `gitTouchedFiles` is never populated and
      // record.ts's `options?.gitTouchedFiles ?? state.activeTask?.touchedFiles
      // ?? []` fallback resolves to the (never populated by `done`) empty
      // self-report -- actual observed behavior pre-fix: exit 0,
      // touchedFiles === [] (does not contain `src/stray.ts`).
      expect(r.code).toBe(0);

      const progress = JSON.parse(
        await readFile(
          join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json'),
          'utf8',
        ),
      );
      expect(progress.tasks.T1.touchedFiles).toContain('src/stray.ts');
    },
  );

  it(
    'refuses like `build task <id> --status=DONE` on an undeclared task id, the third ' +
      'gate `done` inherits from `buildTaskService` (281-01/AC-4)',
    async () => {
      active = await tempRepo({ initialized: true });
      await initGitRepo(active.root);
      await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
      await run(['draft', 'approve', '01-foundation', '01'], active.root);
      // Default scaffold's DRAFT declares only T1 -- `T99` is never a valid
      // id. Proves AC-4's third inherited gate (buildTaskService's phase-58
      // unknown-task-id guard, distinct from per-task-verify/T1 and the
      // boundary/redundancy check/T2 above): `cadence done T99` must refuse
      // exactly as `cadence build task T99 --status=DONE` always has, since
      // T4's fix routes `done` through the same validation. This case should
      // PASS immediately against the fixed done.ts (a proving test, not a
      // red-then-green regression test like T1/T2/T3) -- it was previously
      // only exercised indirectly via the "records DONE with empty notes"
      // case's T2 -> T1 fixture correction.
      const r = await run(['done', 'T99'], active.root);

      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/unknown task id "T99"/);
      expect(r.stderr).toMatch(/Valid ids.*T1/);

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
    },
  );
});
