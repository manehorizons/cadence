import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

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

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function addSecondTask(root: string, block: string): Promise<void> {
  const draftPath = join(root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
  let body = await readFile(draftPath, 'utf8');
  body = body.replace('## Boundaries', `${block}\n\n## Boundaries`);
  await writeFile(draftPath, body, 'utf8');
}

describe('cadence dispatch plan', () => {
  it('IDLE (no active BUILD draft): reports nothing to plan, exit 0', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['dispatch', 'plan'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/nothing to plan/);
  });

  it('single independent task lands in wave 1, --json includes a rendered packet', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01', '--no-approve'], active.root);
    const r = await run(['dispatch', 'plan', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.waves).toEqual([
      {
        wave: 1,
        tasks: [
          {
            id: 'T1',
            name: expect.any(String),
            packet: expect.stringContaining('T1'),
            recommendedIsolation: 'worktree',
          },
        ],
      },
    ]);
  });

  it('text mode groups tasks by wave without requiring --json', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01', '--no-approve'], active.root);
    const r = await run(['dispatch', 'plan'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Wave 1:/);
    expect(r.stdout).toMatch(/T1/);
  });

  it('a task already DONE is excluded, and every-task-terminal reports nothing to dispatch', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01', '--no-approve'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    const r = await run(['dispatch', 'plan'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/nothing to dispatch/);
  });

  it('an unparseable PROGRESS.json degrades to empty (no tasks started), never crashes', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01', '--no-approve'], active.root);
    const progPath = join(active.root, '.cadence/phases/01-foundation/01-01-PROGRESS.json');
    await writeFile(progPath, '{ not valid json', 'utf8');
    const r = await run(['dispatch', 'plan'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Wave 1:/);
    expect(r.stdout).toMatch(/T1/);
  });

  it('a dependency cycle is a non-zero exit naming the cycle', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await addSecondTask(
      active.root,
      '### T2: second task\n- files: `b.ts`\n- action: b\n- verify: b\n- depends: T2\n- done: AC-1',
    );
    // Make T1 depend on T2 too, forming a cycle T1 -> T2 -> T2 is not quite
    // a cycle by itself (T2 depends on itself is trivially a cycle) — use
    // that directly: T2 depending on T2 is the smallest reproducible cycle.
    await run(['draft', 'approve', '01-foundation', '01', '--no-approve'], active.root);
    const r = await run(['dispatch', 'plan'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/cycle/i);
  });
});
