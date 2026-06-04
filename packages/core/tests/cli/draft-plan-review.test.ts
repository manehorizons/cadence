import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

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

async function initGitRepo(root: string): Promise<void> {
  execSync('git init -q', { cwd: root, stdio: 'ignore' });
  execSync('git config user.email "test@cadence.local"', { cwd: root, stdio: 'ignore' });
  execSync('git config user.name "Cadence Test"', { cwd: root, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'ignore' });
  await writeFile(join(root, '.gitignore'), '.cadence/state.json\n');
  execSync('git add .gitignore', { cwd: root, stdio: 'ignore' });
  execSync('git commit -q -m init', { cwd: root, stdio: 'ignore' });
}

async function setProfile(root: string, profile: string): Promise<void> {
  const cfgPath = join(root, '.cadence', 'config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  cfg.profile = profile;
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
}

const DRAFT_PATH = '.cadence/phases/25-plan-review/25-01-DRAFT.md';

/**
 * Overwrite the scaffolded DRAFT with a complex-tier plan (6 tasks). When
 * `acBlank` the single AC omits its `Then` clause so the mock plan-review
 * verifier yields `pass=false` with an `AC-1 has empty then` finding.
 */
async function writeComplexDraft(
  root: string,
  opts: { acBlank: boolean },
): Promise<void> {
  const ac = opts.acBlank
    ? `### AC-1: incomplete\nGiven a precondition\nWhen an action\n`
    : `### AC-1: complete\nGiven a precondition\nWhen an action\nThen an outcome\n`;
  const tasks = [1, 2, 3, 4, 5, 6]
    .map(
      (n) =>
        `### T${n}: stub ${n}\n- files: \`src/foo.ts\`\n- action: stub\n- verify: stub\n- done: AC-1\n`,
    )
    .join('\n');
  const body = `---
phase: 25-plan-review
id: 25-01
tier: complex
status: PENDING
---

# 25-01 — demo

## Objective

Build a demonstrable thing.

## Acceptance Criteria

${ac}
## Tasks

${tasks}
## Boundaries

- DO NOT widen scope
`;
  await writeFile(join(root, DRAFT_PATH), body, 'utf8');
}

async function loopPosition(root: string): Promise<string> {
  const state = JSON.parse(
    await readFile(join(root, '.cadence', 'state.json'), 'utf8'),
  );
  return state.loopPosition;
}

describe('cadence draft approve (Phase 25.1 — plan-review gate)', () => {
  it('AC-4: refuses approve on a failing plan under strict×complex', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await setProfile(active.root, 'strict');
    await run(['draft', 'new', '25-plan-review', '01', '--tier=complex'], active.root);
    await writeComplexDraft(active.root, { acBlank: true });

    const r = await run(
      ['draft', 'approve', '25-plan-review', '01', '--no-approve'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/plan-review: high — AC-1 has empty then/);
    expect(r.stderr).toMatch(/--allow-plan-review-failure/);
    expect(await loopPosition(active.root)).toBe('DRAFT');
  });

  it('AC-5: --allow-plan-review-failure proceeds to BUILD with a trace', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await setProfile(active.root, 'strict');
    await run(['draft', 'new', '25-plan-review', '01', '--tier=complex'], active.root);
    await writeComplexDraft(active.root, { acBlank: true });

    const r = await run(
      [
        'draft',
        'approve',
        '25-plan-review',
        '01',
        '--no-approve',
        '--allow-plan-review-failure',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/plan-review: high — AC-1 has empty then/);
    expect(r.stderr).toMatch(
      /--allow-plan-review-failure set; proceeding past 1 finding/,
    );
    expect(await loopPosition(active.root)).toBe('BUILD');
  });

  it('AC-4: a complete plan approves cleanly under strict×complex', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await setProfile(active.root, 'strict');
    await run(['draft', 'new', '25-plan-review', '01', '--tier=complex'], active.root);
    await writeComplexDraft(active.root, { acBlank: false });

    const r = await run(
      ['draft', 'approve', '25-plan-review', '01', '--no-approve'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/plan-review:/);
    expect(await loopPosition(active.root)).toBe('BUILD');
  });

  it('AC-5 (Phase 29.7 G3): plan-review persists a sidecar artifact on pass', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await setProfile(active.root, 'strict');
    await run(['draft', 'new', '25-plan-review', '01', '--tier=complex'], active.root);
    await writeComplexDraft(active.root, { acBlank: false });

    const r = await run(
      ['draft', 'approve', '25-plan-review', '01', '--no-approve'],
      active.root,
    );
    expect(r.code).toBe(0);
    const rec = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/25-plan-review/25-01-PLAN-REVIEW.json'),
        'utf8',
      ),
    );
    expect(rec.draftId).toBe('25-01');
    expect(rec.pass).toBe(true);
    expect(rec.provider).toBe('mock');
    expect(typeof rec.findings).toBe('number');
    expect(typeof rec.at).toBe('string');
  });

  it('AC-4: auto profile (gate not in set) skips the gate entirely', async () => {
    active = await tempRepo({ initialized: true }); // default profile=auto
    await initGitRepo(active.root);
    await run(['draft', 'new', '25-plan-review', '01', '--tier=complex'], active.root);
    await writeComplexDraft(active.root, { acBlank: true });

    // auto×complex is soft-capped — bypass that (unrelated gate) so we can
    // observe that plan-review never ran.
    const r = await run(
      [
        'draft',
        'approve',
        '25-plan-review',
        '01',
        '--allow-auto-complex',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/plan-review:/);
    expect(await loopPosition(active.root)).toBe('BUILD');
  });
});
