import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd, env: { ...process.env, ANTHROPIC_API_KEY: '' } });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

const DRAFT_BODY = `---
phase: 01-foundation
id: 01-01
tier: standard
profile: auto
status: PENDING
---

# 01-01 - Demo

## Objective
Demo.

## Acceptance Criteria

### AC-1: ok
Given x
When y
Then z

## Tasks

### T1: do
- files: \`src/x.ts\`
- action: a
- verify: v
- done: AC-1

## Boundaries

- none
`;

const SPEC_BODY = `---
phase: 01-foundation
id: 01-01
status: PENDING
---

# 01-01 - Demo

## Objective
Demo.

## Acceptance Criteria

### AC-1: ok
Given x
When y
Then z

## Constraints

- none

## Open Questions

- none
`;

async function writeInvalidConfig(root: string): Promise<void> {
  await writeFile(join(root, '.cadence/config.json'), JSON.stringify({ loopEnforcement: 'nope' }));
}

async function seedDraft(root: string): Promise<void> {
  const phaseDir = join(root, '.cadence/phases/01-foundation');
  await mkdir(phaseDir, { recursive: true });
  await writeFile(join(phaseDir, '01-01-DRAFT.md'), DRAFT_BODY);
}

async function seedBuild(root: string): Promise<void> {
  await seedDraft(root);
  const phaseDir = join(root, '.cadence/phases/01-foundation');
  await writeFile(
    join(phaseDir, '01-01-PROGRESS.json'),
    JSON.stringify(
      {
        draftId: '01-01',
        tasks: {
          T1: { status: 'DONE', notes: 'n', touchedFiles: ['src/x.ts'], updatedAt: '2026-06-18T00:00:00.000Z' },
        },
      },
      null,
      2,
    ),
  );
  const statePath = join(root, '.cadence/state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.activePhase = '01-foundation';
  state.activeDraft = '01-01';
  state.loopPosition = 'BUILD';
  state.tier = 'standard';
  state.openDrafts = [{ id: '01-01', since: '2026-06-18T00:00:00.000Z' }];
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

async function seedSpec(root: string): Promise<void> {
  const phaseDir = join(root, '.cadence/phases/01-foundation');
  await mkdir(phaseDir, { recursive: true });
  await writeFile(join(phaseDir, '01-01-SPEC.md'), SPEC_BODY);
  const statePath = join(root, '.cadence/state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.activePhase = '01-foundation';
  state.activeSpec = '01-01';
  state.loopPosition = 'SPEC';
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('invalid config fails closed at gate-bearing command boundaries', () => {
  it('AC-3: draft approve refuses invalid config instead of using defaults', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root);
    await writeInvalidConfig(active.root);

    const r = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('config.json failed schema validation');
  });

  it('AC-3: build task refuses invalid config before per-task gates', async () => {
    active = await tempRepo({ initialized: true });
    await seedBuild(active.root);
    await writeInvalidConfig(active.root);

    const r = await run(['build', 'task', 'T1', '--status', 'DONE'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('config.json failed schema validation');
  });

  it('AC-3: spec approve refuses invalid config instead of using mock defaults', async () => {
    active = await tempRepo({ initialized: true });
    await seedSpec(active.root);
    await writeInvalidConfig(active.root);

    const r = await run(['spec', 'approve', '01-foundation', '01'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('config.json failed schema validation');
  });

  it('AC-3: settle refuses invalid config instead of weakening gates', async () => {
    active = await tempRepo({ initialized: true });
    await seedBuild(active.root);
    await writeInvalidConfig(active.root);

    const r = await run(['settle', 'run', '--ac', 'AC-1=pass', '--allow-missing-coverage'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('config.json failed schema validation');
  });
});
