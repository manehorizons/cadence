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

const SPEC_PATH = '.cadence/phases/36-x/36-01-SPEC.md';
const SIDECAR = '.cadence/phases/36-x/36-01-SPEC-REVIEW.json';
const LOG = '.cadence/anomalies.log';

// good: objective + AC w/ GWT + >=1 constraint (MockSpecReview floor).
// bad: AC with empty Given/When/Then → MockSpecReview HIGH findings.
function specBody(good: boolean): string {
  const ac = good
    ? '### AC-1: works\nGiven a precondition\nWhen an action\nThen an observable outcome\n'
    : '### AC-1: bad\nGiven\nWhen\nThen\n';
  const constraints = good ? '- host-agnostic\n' : '- host-agnostic\n';
  return `---
phase: 36-x
id: 36-01
status: PENDING
---

# 36-01 — demo

## Objective

Build a demonstrable thing.

## Acceptance Criteria

${ac}

## Constraints

${constraints}

## Open Questions

- none
`;
}

async function arrange(root: string): Promise<void> {
  await initGitRepo(root);
  const cfgPath = join(root, '.cadence/config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  cfg.notify = { transport: 'file' };
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
  await run(['spec', 'new', '36-x', '01', '--title=Demo'], root);
}
async function setSpec(root: string, good: boolean): Promise<void> {
  await writeFile(join(root, SPEC_PATH), specBody(good), 'utf8');
}
async function state(root: string): Promise<{ loopPosition: string; activeSpec: string | null }> {
  return JSON.parse(await readFile(join(root, '.cadence/state.json'), 'utf8'));
}
async function sidecar(root: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(root, SIDECAR), 'utf8'));
}
const APPROVE = ['spec', 'approve', '36-x', '01'];

describe('cadence spec stage (Phase 36.1)', () => {
  it('AC-1 (a): spec new from IDLE → SPEC.md + loopPosition SPEC + activeSpec', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root);
    expect(existsSync(join(active.root, SPEC_PATH))).toBe(true);
    const s = await state(active.root);
    expect(s.loopPosition).toBe('SPEC');
    expect(s.activeSpec).toBe('36-01');
  });

  it('AC-1 (h): spec new rejects path traversal phase slugs before writing', async () => {
    active = await tempRepo({ initialized: true, projectName: 'spec_traversal' });

    const r = await run(
      ['spec', 'new', '36-x/../../../escape-proof', '01', '--title=Traversal'],
      active.root,
    );

    expect(r.code).toBe(1);
    expect(r.stderr).toContain('invalid phase slug');
    expect(existsSync(join(active.root, 'escape-proof/36-01-SPEC.md'))).toBe(false);
    expect(existsSync(join(active.root, '.cadence/phases/36-x'))).toBe(false);
  });

  it('AC-1 (b): draft new refused while SPEC', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root);
    const r = await run(['draft', 'new', '36-x', '01', '--title=x'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/not IDLE/);
    expect(r.stderr).toMatch(/spec/i);
  });

  it('AC-3 (c): good SPEC → approve pass → APPROVED + IDLE + activeSpec null; draft new unblocked', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root);
    await setSpec(active.root, true);
    const r = await run(APPROVE, active.root);
    expect(r.code).toBe(0);
    expect(await readFile(join(active.root, SPEC_PATH), 'utf8')).toMatch(/^status: APPROVED$/m);
    const s = await state(active.root);
    expect(s.loopPosition).toBe('IDLE');
    expect(s.activeSpec).toBeNull();
    expect((await sidecar(active.root)).converged).toBe(true);
    const dn = await run(['draft', 'new', '36-x', '01', '--title=x'], active.root);
    expect(dn.code).toBe(0);
  });

  it('AC-4 (d): bad SPEC → reloop exit 1, attempt 1/3, sidecar attempts:1, stays SPEC', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root);
    await setSpec(active.root, false);
    const r = await run(APPROVE, active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/attempt 1\/3 did not pass/);
    expect((await sidecar(active.root)).attempts).toBe(1);
    expect((await state(active.root)).loopPosition).toBe('SPEC');
  });

  it('AC-5 (e): bad SPEC ×3 → escalate, unconditional spec-review-unconverged anomaly', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root);
    await setSpec(active.root, false);
    await run(APPROVE, active.root);
    await run(APPROVE, active.root);
    const r = await run(APPROVE, active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/did NOT converge after 3 attempts/);
    const log = await readFile(join(active.root, LOG), 'utf8');
    expect(log).toMatch(/"type":"spec-review-unconverged"/);
  });

  it('AC-5 (f): escalate + --allow-spec-review-failure → IDLE, history bypassed:true', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root);
    await setSpec(active.root, false);
    await run(APPROVE, active.root);
    await run(APPROVE, active.root);
    const r = await run([...APPROVE, '--allow-spec-review-failure'], active.root);
    expect(r.code).toBe(0);
    const s = await state(active.root);
    expect(s.loopPosition).toBe('IDLE');
    expect(s.activeSpec).toBeNull();
    const sc = await sidecar(active.root);
    expect((sc.history as Array<{ bypassed?: boolean }>).at(-1)!.bypassed).toBe(true);
    expect(await readFile(join(active.root, LOG), 'utf8')).toMatch(/"type":"spec-review-unconverged"/);
  });

  it('AC-3 (g): absent sidecar → first bad approve = attempt 1/3 (attemptsSoFar 0)', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root);
    await setSpec(active.root, false);
    expect(existsSync(join(active.root, SIDECAR))).toBe(false);
    const r = await run(APPROVE, active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/attempt 1\/3 did not pass/);
    expect((await sidecar(active.root)).attempts).toBe(1);
  });
});
