import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
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

const DRAFT_PATH = '.cadence/phases/01-foundation/01-01-DRAFT.md';
const SIDECAR = '.cadence/phases/01-foundation/01-01-PLAN-REVIEW.json';
const LOG = '.cadence/anomalies.log';

/** strict×complex DRAFT (≥6 tasks). `goodAC=false` → empty G/W/T → MockPlanReviewVerifier fails. */
function draftBody(goodAC: boolean): string {
  const ac = goodAC
    ? '### AC-1: works\nGiven a precondition\nWhen an action\nThen an observable outcome\n'
    : '### AC-1: bad\nGiven\nWhen\nThen\n';
  const tasks = [1, 2, 3, 4, 5, 6]
    .map(
      (n) =>
        `### T${n}: t${n}\n- files: \`src/x${n}.ts\`\n- action: a\n- verify: v\n- done: AC-1\n`,
    )
    .join('\n');
  return `---
phase: 01-foundation
id: 01-01
tier: complex
profile: strict
---

# 01-01 — Demo

## Objective

Exercise plan-review convergence.

## Acceptance Criteria

${ac}

## Tasks

${tasks}

## Boundaries

- none
`;
}

async function arrange(root: string, goodAC: boolean): Promise<void> {
  await initGitRepo(root);
  const cfgPath = join(root, '.cadence/config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  cfg.notify = { transport: 'file' };
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
  await run(['draft', 'new', '01-foundation', '01', '--title=Demo', '--tier=complex'], root);
  await writeFile(join(root, DRAFT_PATH), draftBody(goodAC), 'utf8');
}

// strict×complex includes the manual `approve` gate; spawned CLI has no TTY →
// every `draft approve` MUST pass --no-approve (mirrors settle-code-review.test.ts).
const APPROVE = ['draft', 'approve', '01-foundation', '01', '--no-approve'];

async function loopPosition(root: string): Promise<string> {
  return JSON.parse(await readFile(join(root, '.cadence/state.json'), 'utf8')).loopPosition;
}
async function sidecar(root: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(root, SIDECAR), 'utf8'));
}

describe('cadence draft approve — plan-review convergence (Phase 35.1)', () => {
  it('AC-1: well-formed plan converges first try → BUILD, sidecar converged', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root, true);
    const r = await run(APPROVE, active.root);
    expect(r.code).toBe(0);
    expect(await loopPosition(active.root)).toBe('BUILD');
    const sc = await sidecar(active.root);
    // Phase 267 (267-01, dec-20260810-002): this repo's default init resolves
    // plan-review to mock, so a clean pass now persists `converged: false` +
    // `verdict: 'abstained'` on the sidecar (not a real pass) -- the BUILD
    // transition above (the real control-flow signal) is unaffected.
    expect(sc.converged).toBe(false);
  });

  it('AC-3: failing plan → reloop, exit 1, attempt 1/3, sidecar attempts:1', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root, false);
    const r = await run(APPROVE, active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/attempt 1\/3 did not pass/);
    expect(await loopPosition(active.root)).not.toBe('BUILD');
    const sc = await sidecar(active.root);
    expect(sc.attempts).toBe(1);
    expect(sc.converged).toBe(false);
    expect((sc.history as unknown[]).length).toBe(1);
    expect((sc.history as Array<{ verdict: string }>)[0]!.verdict).toBe('reloop');
  });

  it('AC-4: failing plan to MAX → escalate, unconditional anomaly under strict', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root, false);
    await run(APPROVE, active.root); // attempt 1 reloop
    await run(APPROVE, active.root); // attempt 2 reloop
    const r = await run(APPROVE, active.root); // attempt 3 escalate
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/did NOT converge after 3 attempts/);
    const sc = await sidecar(active.root);
    expect((sc.history as Array<{ verdict: string }>).at(-1)!.verdict).toBe('escalate');
    // strict×complex carries NO anomaly-notify gate — the anomaly fires
    // anyway (unconditional emission lock).
    const log = await readFile(join(active.root, LOG), 'utf8');
    expect(log).toMatch(/"type":"plan-review-unconverged"/);
  });

  it('AC-4: escalate + --allow-plan-review-failure → BUILD, history bypassed:true', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root, false);
    await run(APPROVE, active.root);
    await run(APPROVE, active.root);
    const r = await run([...APPROVE, '--allow-plan-review-failure'], active.root);
    expect(r.code).toBe(0);
    expect(await loopPosition(active.root)).toBe('BUILD');
    const sc = await sidecar(active.root);
    expect((sc.history as Array<{ bypassed?: boolean }>).at(-1)!.bypassed).toBe(true);
    const log = await readFile(join(active.root, LOG), 'utf8');
    expect(log).toMatch(/"type":"plan-review-unconverged"/);
  });

  it('AC-2: legacy 29.7-shape sidecar (no attempts) → treated as attempt 1', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root, false);
    // Write a legacy sidecar AFTER draft new, BEFORE approve, so it is read.
    await writeFile(
      join(active.root, SIDECAR),
      JSON.stringify({ draftId: '01-01', pass: false, provider: 'mock', findings: 1, at: '2026-05-15T00:00:00.000Z' }, null, 2) + '\n',
      'utf8',
    );
    const r = await run(APPROVE, active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/attempt 1\/3 did not pass/); // legacy → attemptsSoFar 0, NOT escalation
    const sc = await sidecar(active.root);
    expect(sc.attempts).toBe(1);
  });
});
