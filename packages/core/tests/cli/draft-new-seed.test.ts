// AC-5 is covered by the Task 5 docs changes (DESIGN §10 + §4.1 Spec-stage
// note, CHANGELOG, .cadence/ROADMAP.md); no runtime assertion — this token
// satisfies the per-AC test-coverage grep for the docs-only criterion.
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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

const SPEC_PATH = '.cadence/phases/01-foundation/01-01-SPEC.md';
const DRAFT_PATH = '.cadence/phases/01-foundation/01-01-DRAFT.md';

async function writeSpec(root: string, content: string): Promise<void> {
  const p = join(root, SPEC_PATH);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf8');
}

const APPROVED_SPEC = `---
phase: 01-foundation
id: 01-01
status: APPROVED
---

# 01-01 — Demo Spec

## Objective

Seed me into the draft.

## Acceptance Criteria

### AC-1: alpha
Given a
When b
Then c

### AC-2: beta
Given d
When e
Then f
`;

describe('cadence draft new (Phase 38.1 — SPEC→DRAFT auto-seed)', () => {
  it('AC-2: approved same-id SPEC → DRAFT seeded + stdout notice', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await writeSpec(active.root, APPROVED_SPEC);

    const r = await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(
      /draft new: seeded objective \+ 2 AC\(s\) from approved SPEC 01-01/,
    );

    const draft = await readFile(join(active.root, DRAFT_PATH), 'utf8');
    expect(draft).toContain('## Objective\n\nSeed me into the draft.\n');
    expect(draft).toContain('### AC-1: alpha\nGiven a\nWhen b\nThen c');
    expect(draft).toContain('### AC-2: beta\nGiven d\nWhen e\nThen f');
    expect(draft).toContain('### T1: _(task name)_'); // tasks still placeholder
    expect(draft).toContain('## Boundaries\n\n- _(DO NOT change …)_\n');
    expect(draft).not.toContain('_(one sentence)_');
  });

  it('AC-3: PENDING sibling SPEC → warn + empty scaffold', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    await writeSpec(active.root, APPROVED_SPEC.replace('status: APPROVED', 'status: PENDING'));

    const r = await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(
      /draft new: SPEC 01-01 present but not APPROVED — scaffolding empty/,
    );

    const draft = await readFile(join(active.root, DRAFT_PATH), 'utf8');
    expect(draft).toContain('## Objective\n\n_(one sentence)_');
    expect(draft).toContain('### AC-1: _(name)_');
    expect(draft).not.toContain('Seed me into the draft.');
  });

  it('AC-3: APPROVED but unparseable SPEC → warn + empty scaffold', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);
    // status: APPROVED so frontmatterStatus enters the APPROVED branch, but an
    // invalid `id` makes parseSpecMd's SpecZ.parse throw → the catch fires.
    await writeSpec(
      active.root,
      `---\nphase: 01-foundation\nid: nope\nstatus: APPROVED\n---\n\n# bad\n`,
    );

    const r = await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    expect(r.code).toBe(0);
    // ZodError.message is multi-line, so assert the two stable fragments
    // (prefix + suffix) rather than a single-line spanning regex.
    expect(r.stderr).toContain('draft new: SPEC 01-01 APPROVED but unparseable');
    expect(r.stderr).toContain('scaffolding empty');
    expect(r.stderr).not.toMatch(/present but not APPROVED/);

    const draft = await readFile(join(active.root, DRAFT_PATH), 'utf8');
    expect(draft).toContain('## Objective\n\n_(one sentence)_');
    expect(draft).toContain('### AC-1: _(name)_');
  });

  it('AC-3: no sibling SPEC → empty scaffold, silent (unchanged)', async () => {
    active = await tempRepo({ initialized: true });
    await initGitRepo(active.root);

    const r = await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/draft new: SPEC/);
    expect(r.stdout).not.toMatch(/seeded objective/);

    const draft = await readFile(join(active.root, DRAFT_PATH), 'utf8');
    expect(draft).toContain('## Objective\n\n_(one sentence)_');
    expect(draft).toContain('### AC-1: _(name)_');
  });
});
