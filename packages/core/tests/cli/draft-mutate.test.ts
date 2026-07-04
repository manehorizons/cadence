import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { parseDraftMd } from '../../src/parse/draft-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(__dirname, '../../dist/cli/index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

const DRAFT_PATH = '.cadence/phases/01-foundation/01-01-DRAFT.md';

const PENDING_DRAFT = `---
phase: 01-foundation
id: 01-01
tier: standard
status: PENDING
---

# 01-01 — Demo

## Objective

Make widget glow.

## Acceptance Criteria

### AC-1: Glows
Given widget exists
When user enables glow
Then widget emits photons

## Tasks

### T1: Add flag
- files: \`src/widget.ts\`
- action: add prop
- verify: tests pass
- done: AC-1

## Boundaries

- Do not change \`src/legacy.ts\`
`;

const APPROVED_DRAFT = PENDING_DRAFT.replace('status: PENDING', 'status: APPROVED');

async function seedDraft(root: string, content: string): Promise<string> {
  await mkdir(join(root, '.cadence/phases/01-foundation'), { recursive: true });
  const path = join(root, DRAFT_PATH);
  await writeFile(path, content);
  return path;
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence draft set-objective', () => {
  it('AC-1: replaces only the Objective section on a PENDING draft', async () => {
    active = await tempRepo({ initialized: true });
    const path = await seedDraft(active.root, PENDING_DRAFT);
    const r = await run(
      ['draft', 'set-objective', '01-foundation', '01', '--text=Make widget sparkle.'],
      active.root,
    );
    expect(r.code).toBe(0);
    const content = await readFile(path, 'utf8');
    const d = parseDraftMd(content);
    expect(d.objective).toBe('Make widget sparkle.');
    expect(d.acceptanceCriteria).toHaveLength(1);
    expect(d.tasks).toHaveLength(1);
    expect(d.boundaries).toEqual(['Do not change `src/legacy.ts`']);
  });

  it('AC-4: refuses (exit 1, clear stderr) and leaves the file unmodified when status is not PENDING', async () => {
    active = await tempRepo({ initialized: true });
    const path = await seedDraft(active.root, APPROVED_DRAFT);
    const r = await run(
      ['draft', 'set-objective', '01-foundation', '01', '--text=Nope.'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/not PENDING/);
    const content = await readFile(path, 'utf8');
    expect(content).toBe(APPROVED_DRAFT);
  });

  it('refuses when --text is not supplied', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, PENDING_DRAFT);
    const r = await run(['draft', 'set-objective', '01-foundation', '01'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/--text/);
  });
});

describe('cadence draft add-ac', () => {
  it('AC-2: appends a sequential AC block visible via parseDraftMd', async () => {
    active = await tempRepo({ initialized: true });
    const path = await seedDraft(active.root, PENDING_DRAFT);
    const r = await run(
      [
        'draft', 'add-ac', '01-foundation', '01',
        '--given=a fresh session', '--when=user retries', '--then=it succeeds', '--name=Retries',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    const content = await readFile(path, 'utf8');
    const d = parseDraftMd(content);
    expect(d.acceptanceCriteria).toHaveLength(2);
    expect(d.acceptanceCriteria[1]).toEqual({
      id: 'AC-2',
      name: 'Retries',
      given: 'a fresh session',
      when: 'user retries',
      then: 'it succeeds',
    });
  });

  it('AC-4: refuses on a non-PENDING draft and leaves the file unmodified', async () => {
    active = await tempRepo({ initialized: true });
    const path = await seedDraft(active.root, APPROVED_DRAFT);
    const r = await run(
      ['draft', 'add-ac', '01-foundation', '01', '--given=g', '--when=w', '--then=t'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/not PENDING/);
    expect(await readFile(path, 'utf8')).toBe(APPROVED_DRAFT);
  });

  it('refuses when a required flag is missing', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, PENDING_DRAFT);
    const r = await run(
      ['draft', 'add-ac', '01-foundation', '01', '--given=g', '--when=w'],
      active.root,
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/--then/);
  });
});

describe('cadence draft add-task', () => {
  it('AC-3: appends a sequential Task block visible via parseDraftMd', async () => {
    active = await tempRepo({ initialized: true });
    const path = await seedDraft(active.root, PENDING_DRAFT);
    const r = await run(
      [
        'draft', 'add-task', '01-foundation', '01',
        '--files=src/a.ts,src/b.ts', '--action=wire it up', '--verify=tests pass', '--done=AC-1',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    const content = await readFile(path, 'utf8');
    const d = parseDraftMd(content);
    expect(d.tasks).toHaveLength(2);
    expect(d.tasks[1]).toMatchObject({
      id: 'T2',
      files: ['src/a.ts', 'src/b.ts'],
      action: 'wire it up',
      verify: 'tests pass',
      done: 'AC-1',
    });
  });

  it('AC-3: refuses (exit 1, stderr names the unknown id) and leaves the file unmodified when --done references an unknown AC id', async () => {
    active = await tempRepo({ initialized: true });
    const path = await seedDraft(active.root, PENDING_DRAFT);
    const r = await run(
      [
        'draft', 'add-task', '01-foundation', '01',
        '--files=src/a.ts', '--action=a', '--verify=v', '--done=AC-9',
      ],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('AC-9');
    expect(await readFile(path, 'utf8')).toBe(PENDING_DRAFT);
  });

  it('AC-4: refuses on a non-PENDING draft and leaves the file unmodified', async () => {
    active = await tempRepo({ initialized: true });
    const path = await seedDraft(active.root, APPROVED_DRAFT);
    const r = await run(
      [
        'draft', 'add-task', '01-foundation', '01',
        '--files=src/a.ts', '--action=a', '--verify=v', '--done=AC-1',
      ],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/not PENDING/);
    expect(await readFile(path, 'utf8')).toBe(APPROVED_DRAFT);
  });

  it('refuses when a required flag is missing', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, PENDING_DRAFT);
    const r = await run(
      ['draft', 'add-task', '01-foundation', '01', '--files=src/a.ts', '--action=a', '--verify=v'],
      active.root,
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/--done/);
  });
});
