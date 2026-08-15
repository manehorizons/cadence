import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { defaultConfig } from '@thomas-powers-jr/cadence-types';

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

/**
 * Replaces the default-template's whole `## Tasks` section with `tasksBody`
 * — used to script a specific multi-task wave scenario (AC-1/AC-2/AC-5)
 * without depending on `draft add-task`'s missing name/action/verify flags.
 */
async function setTasks(root: string, tasksBody: string): Promise<void> {
  const draftPath = join(root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
  let body = await readFile(draftPath, 'utf8');
  body = body.replace(/## Tasks\n\n[\s\S]*?\n\n## Boundaries/, `## Tasks\n\n${tasksBody}\n\n## Boundaries`);
  await writeFile(draftPath, body, 'utf8');
}

/** Strips the classifier's Execution/Model lines back out of a rendered packet — the AC-5 strip-then-compare technique against T1's pre-change fixture. */
function stripVerdictLines(packet: string): string {
  return packet
    .split('\n')
    .filter((line) => !/^\*\*Execution:\*\* /.test(line) && !/^\*\*Model:\*\* /.test(line))
    .join('\n');
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
            // The default-template T1 (1 file, 0 depends) heuristically
            // classifies mechanical; alone in its wave, well under
            // largeTaskTokens, and contextUtilization is always null — no
            // trigger fires, so it stays inline.
            execution: 'inline',
            modelClass: 'mechanical',
            model: defaultConfig.modelPerClass.mechanical,
            reasons: [],
          },
        ],
      },
    ]);
    expect(parsed.signals).toStrictEqual({ contextUtilization: null });
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

  it('279-01/AC-1: batch trigger fires for a wave with >= mechanicalBatchMin mechanical tasks, sparing a complex sibling', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Batch'], active.root);
    await setTasks(
      active.root,
      [
        '### T1: Mechanical one\n- files: `a.ts`\n- action: do a\n- verify: a done\n- done: AC-1',
        '### T2: Mechanical two\n- files: `b.ts`\n- action: do b\n- verify: b done\n- done: AC-1',
        '### T3: Mechanical three\n- files: `c.ts`\n- action: do c\n- verify: c done\n- done: AC-1',
        '### T4: Complex one\n- files: `d.ts`, `e.ts`, `f.ts`, `g.ts`\n- action: do d\n- verify: d done\n- done: AC-1',
      ].join('\n\n'),
    );
    await run(['draft', 'approve', '01-foundation', '01', '--no-approve'], active.root);
    const r = await run(['dispatch', 'plan', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.waves).toHaveLength(1);
    expect(parsed.waves[0].tasks).toHaveLength(4);
    const tasksById = Object.fromEntries(parsed.waves[0].tasks.map((t) => [t.id, t]));

    const threshold = defaultConfig.subagentPolicy.mechanicalBatchMin; // 3
    const expectedReason = `mechanicalBatchMin: wave 1 has 3 mechanical task(s) (threshold ${threshold})`;
    for (const id of ['T1', 'T2', 'T3']) {
      expect(tasksById[id].modelClass).toBe('mechanical');
      expect(tasksById[id].execution).toBe('dispatch');
      expect(tasksById[id].reasons).toEqual([expectedReason]);
    }
    // The complex sibling shares the same mechanical-heavy wave but never
    // inherits the mechanicalBatchMin reason, and — absent any other
    // trigger — stays inline.
    expect(tasksById.T4.modelClass).toBe('complex');
    expect(tasksById.T4.reasons.some((x) => x.includes('mechanicalBatchMin'))).toBe(false);
    expect(tasksById.T4.reasons).toEqual([]);
    expect(tasksById.T4.execution).toBe('inline');
  });

  it('279-01/AC-2: size trigger fires for a task with a large declared file; a small/missing-file task stays inline', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Size'], active.root);
    // Real on-disk file large enough that declaredFileBytes/4 alone (15000)
    // clears largeTaskTokens (8000) regardless of packetChars.
    await writeFile(join(active.root, 'large.ts'), 'x'.repeat(60_000), 'utf8');
    await setTasks(
      active.root,
      [
        '### T1: Small task\n- files: `small.ts`\n- action: do small\n- verify: small done\n- done: AC-1',
        '### T2: Large task\n- files: `large.ts`\n- action: do large\n- verify: large done\n- done: AC-1',
      ].join('\n\n'),
    );
    await run(['draft', 'approve', '01-foundation', '01', '--no-approve'], active.root);
    const r = await run(['dispatch', 'plan', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const tasksById = Object.fromEntries(parsed.waves[0].tasks.map((t) => [t.id, t]));

    // T1's declared file ('small.ts') does not exist on disk — a documented
    // estimator limitation, contributes 0 bytes, never a silent guess.
    expect(tasksById.T1.execution).toBe('inline');
    expect(tasksById.T1.reasons.some((x) => x.includes('largeTaskTokens'))).toBe(false);

    expect(tasksById.T2.execution).toBe('dispatch');
    const threshold = defaultConfig.subagentPolicy.largeTaskTokens; // 8000
    expect(
      tasksById.T2.reasons.some(
        (x) => x.includes('largeTaskTokens') && x.includes('estimated weight') && x.includes(`threshold ${threshold}`),
      ),
    ).toBe(true);
  });

  it('279-01/AC-3: budget signal is always null and never cited, even with contextBudgetThreshold at its config minimum (0.3)', async () => {
    active = await tempRepo({ initialized: true });
    const configPath = join(active.root, '.cadence/config.json');
    const cfg = JSON.parse(await readFile(configPath, 'utf8'));
    cfg.subagentPolicy = { ...cfg.subagentPolicy, contextBudgetThreshold: 0.3 };
    await writeFile(configPath, JSON.stringify(cfg, null, 2), 'utf8');

    await run(['draft', 'new', '01-foundation', '01', '--title=Budget'], active.root);
    await setTasks(
      active.root,
      [
        '### T1: One\n- files: `a.ts`\n- action: do a\n- verify: a done\n- done: AC-1',
        '### T2: Two\n- files: `b.ts`\n- action: do b\n- verify: b done\n- done: AC-1',
      ].join('\n\n'),
    );
    await run(['draft', 'approve', '01-foundation', '01', '--no-approve'], active.root);
    const r = await run(['dispatch', 'plan', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.signals).toStrictEqual({ contextUtilization: null });
    for (const wave of parsed.waves) {
      for (const task of wave.tasks) {
        expect(task.reasons.some((x) => x.includes('contextBudgetThreshold'))).toBe(false);
      }
    }
  });

  it('279-01/AC-5: non-regression against T1\'s pre-DP-A fixture — base packet byte-identical, new fields purely additive', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Baseline'], active.root);
    // Reconstructs the identical scripted scenario T1's fixture was captured
    // from: one wave, two disjoint-file tasks, one with a declared (but
    // not-on-disk) file and one without — reconstructed from the fixture's
    // own packet text, which embeds the DRAFT's objective/action/verify/
    // done strings verbatim.
    await setTasks(
      active.root,
      [
        '### T1: First task with a real file\n- files: `src/real-file.ts`\n- action: do the first thing\n- verify: the first thing is done\n- done: AC-1',
        '### T2: Second task with no declared files\n- action: do the second thing\n- verify: the second thing is done\n- done: AC-1',
      ].join('\n\n'),
    );
    await run(['draft', 'approve', '01-foundation', '01', '--no-approve'], active.root);
    const r = await run(['dispatch', 'plan', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);

    const fixturePath = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'fixtures',
      'dispatch',
      'pre-dp-a-plan.json',
    );
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));

    expect(Object.keys(parsed)).toEqual(['waves', 'signals']);
    expect(parsed.signals).toStrictEqual({ contextUtilization: null });
    expect(parsed.waves).toHaveLength(fixture.waves.length);

    for (let wi = 0; wi < fixture.waves.length; wi++) {
      const fixtureWave = fixture.waves[wi];
      const actualWave = parsed.waves[wi];
      expect(actualWave.wave).toBe(fixtureWave.wave);
      expect(actualWave.tasks).toHaveLength(fixtureWave.tasks.length);

      for (let ti = 0; ti < fixtureWave.tasks.length; ti++) {
        const fixtureTask = fixtureWave.tasks[ti];
        const actualTask = actualWave.tasks[ti];

        expect(actualTask.id).toBe(fixtureTask.id);
        expect(actualTask.name).toBe(fixtureTask.name);
        expect(actualTask.recommendedIsolation).toBe(fixtureTask.recommendedIsolation);
        // The raw packet must differ from the fixture (it carries a spliced
        // **Execution:** line the fixture never had) — stripping that line
        // is what recovers byte-identity with the pre-change baseline, not
        // an accidental no-op.
        expect(actualTask.packet).not.toBe(fixtureTask.packet);
        expect(stripVerdictLines(actualTask.packet)).toBe(fixtureTask.packet);

        // New fields: present, additive-only (appended strictly after the
        // pre-existing keys — matters for the byte comparison above), and
        // deterministic for this default-config, no-class-lines scenario:
        // T1 and T2 share wave 1 but mechanicalCount there is 2, below the
        // default mechanicalBatchMin (3), and both are well under
        // largeTaskTokens with contextUtilization always null — no trigger
        // fires for either, so both are 'inline' with an empty reasons[].
        expect(Object.keys(actualTask)).toEqual([
          'id',
          'name',
          'packet',
          'recommendedIsolation',
          'execution',
          'modelClass',
          'model',
          'reasons',
        ]);
        expect(actualTask.execution).toBe('inline');
        expect(actualTask.modelClass).toBe('mechanical');
        expect(actualTask.model).toBe(defaultConfig.modelPerClass.mechanical);
        expect(actualTask.reasons).toEqual([]);
      }
    }
  });
});
