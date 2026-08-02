import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
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

  it('AC-3: renderDemoDraft is init --demo\'s single-source renderer', () => {
    // renderDemoDraft is the one source for the init --demo seed; assert its shape.
    const { id, content } = renderDemoDraft('00-demo', '01');
    expect(id).toBe('00-01');
    expect(content).toMatch(/### AC-1:/);
    expect(content).toMatch(/### T1:/);
    // Phase 129: the tutorial intentionally no longer shares this template — it
    // owns a separate `renderSumDraft` so it can stage a genuinely test-verifiable
    // AC. init --demo stays the sole consumer of renderDemoDraft.
    const tutSrc = readFileSync(
      join(__dirname, '../../src/cli/commands/tutorial.ts'),
      'utf8',
    );
    expect(tutSrc).not.toMatch(/renderDemoDraft/);
    expect(tutSrc).toMatch(/renderSumDraft/);
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

    // Phase 214 (T4): the default init preset's gates.evidenceFloor
    // ('executed'/'assertion' depending on preset) refuses an explicit
    // --ac pass with no real coverage (--allow-missing-coverage doesn't
    // touch evidence, only the test-coverage gate) — relax it to
    // 'unverified' so this end-to-end settle assertion isn't newly refused
    // by the unrelated evidence-floor gate.
    {
      const cfgPath = join(active.root, '.cadence/config.json');
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
      cfg.gates = { ...(cfg.gates ?? {}), evidenceFloor: 'unverified' };
      writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    }

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

// Phase 135 (rec-20260701-005 / audit F5): --demo left the loop in DRAFT but
// init still printed the generic "Your first loop" block (step 1: draft new)
// and the "Hand it to your AI agent" block/agent prompt — both refuse
// immediately (loopPosition is DRAFT) if followed, conflicting with the
// correct "Demo phase ready" instructions printed right below them.
describe('cadence init --demo next-step suppression (phase 135, rec-20260701-005)', () => {
  it('AC-1: --demo suppresses the generic "Your first loop" block', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--demo'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/Your first loop/);
    expect(r.stdout).not.toMatch(/cadence draft new --title "Fix login timeout"/);
  });

  it('AC-2: --demo suppresses the "Hand it to your AI agent" block', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--demo'], active.root);
    expect(r.stdout).not.toMatch(/Hand it to your AI agent/);
    expect(r.stdout).not.toMatch(/Reprint with your goal/);
  });

  it('AC-3: --demo still prints the "Demo phase ready" instructions', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--demo'], active.root);
    expect(r.stdout).toMatch(/Demo phase ready/);
    expect(r.stdout).toMatch(/cadence draft approve 01-demo 01/);
    expect(r.stdout).toMatch(/cadence done T1/);
    expect(r.stdout).toMatch(/cadence settle run --ac AC-1=pass/);
  });

  it('AC-4: without --demo, both generic blocks still print unchanged', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root);
    expect(r.stdout).toMatch(/Your first loop/);
    expect(r.stdout).toMatch(/cadence draft new --title "Fix login timeout"/);
    expect(r.stdout).toMatch(/Hand it to your AI agent/);
    expect(r.stdout).not.toMatch(/Demo phase ready/);
  });
});
