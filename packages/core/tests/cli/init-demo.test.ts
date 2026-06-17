import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { renderDemoDraft } from '../../src/init/demo-draft.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(__dirname, '../../dist/cli/index.js');

function run(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

const DEMO_DRAFT = join('.cadence', 'phases', '01-demo', '01-01-DRAFT.md');

describe('cadence init --demo (phase 109, rec-20260617-002)', () => {
  it('AC-1: --demo leaves a ready-to-approve demo phase in DRAFT', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--demo'], active.root);
    expect(r.code).toBe(0);
    expect(existsSync(join(active.root, DEMO_DRAFT))).toBe(true);
    const state = JSON.parse(
      readFileSync(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    expect(state.loopPosition).toBe('DRAFT');
    expect(r.stdout).toMatch(/Demo phase ready/);
    expect(r.stdout).toMatch(/cadence draft approve 01-demo 01/);
  });

  it('AC-2: the seeded DRAFT carries Objective + AC-1 + T1 (no hand-edit)', async () => {
    active = await tempRepo();
    await run(['init', '--name=demo', '--demo'], active.root);
    const draft = readFileSync(join(active.root, DEMO_DRAFT), 'utf8');
    expect(draft).toMatch(/## Objective/);
    expect(draft).not.toMatch(/_\(one sentence\)_/); // not a placeholder
    expect(draft).toMatch(/### AC-1:/);
    expect(draft).toMatch(/### T1:/);
    expect(draft).toMatch(/done: AC-1/);
  });

  it('AC-3: the toy template is a single shared renderer (no duplicate literal)', () => {
    // renderDemoDraft is the one source; assert its shape.
    const { id, content } = renderDemoDraft('00-demo', '01');
    expect(id).toBe('00-01');
    expect(content).toMatch(/### AC-1:/);
    expect(content).toMatch(/### T1:/);
    // tutorial.ts consumes it and no longer carries its own template literal.
    const tutSrc = readFileSync(
      join(__dirname, '../../src/cli/commands/tutorial.ts'),
      'utf8',
    );
    expect(tutSrc).toMatch(/renderDemoDraft/);
    expect(tutSrc).not.toMatch(/tier: quick-fix/); // template no longer inlined here
  });

  it('AC-4: init without --demo seeds no demo phase and stays IDLE', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root);
    expect(r.code).toBe(0);
    expect(existsSync(join(active.root, '.cadence/phases/01-demo'))).toBe(false);
    const state = JSON.parse(
      readFileSync(join(active.root, '.cadence/state.json'), 'utf8'),
    );
    expect(state.loopPosition).toBe('IDLE');
    expect(r.stdout).not.toMatch(/Demo phase ready/);
  });

  it('AC-5: the seeded loop settles clean end-to-end', async () => {
    active = await tempRepo();
    const init = await run(['init', '--name=demo', '--demo'], active.root);
    expect(init.code).toBe(0);

    const approve = await run(['draft', 'approve', '01-demo', '01'], active.root);
    expect(approve.code).toBe(0);

    const done = await run(['done', 'T1'], active.root);
    expect(done.code).toBe(0);

    const settle = await run(
      ['settle', 'run', '--ac', 'AC-1=pass', '--allow-missing-coverage'],
      active.root,
    );
    expect(settle.code).toBe(0);
    expect(
      existsSync(join(active.root, '.cadence/phases/01-demo/01-01-SUMMARY.md')),
    ).toBe(true);
  });
});
