import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

async function readSummary(root: string): Promise<{ md: string; json: { acResults: { id: string; pass: boolean; note?: string }[] } }> {
  const base = join(root, '.cadence/phases/01-foundation/01-01-SUMMARY');
  const md = await readFile(`${base}.md`, 'utf8');
  const json = JSON.parse(await readFile(`${base}.json`, 'utf8'));
  return { md, json };
}

async function readState(root: string): Promise<{ loopPosition: string }> {
  return JSON.parse(await readFile(join(root, '.cadence/state.json'), 'utf8'));
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence settle run --auto', () => {
  it('all tasks DONE → every AC recorded pass automatically', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    const r = await run(['settle', 'run', '--auto', '--allow-missing-coverage'], active.root);
    expect(r.code).toBe(0);
    const { json } = await readSummary(active.root);
    expect(json.acResults).toEqual([{ id: 'AC-1', pass: true, evidence: 'unverified' }]);
    expect((await readState(active.root)).loopPosition).toBe('IDLE');
  });

  it('NEEDS_CONTEXT task → exit 1, stderr names AC + task as needs-context (not blocked)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=NEEDS_CONTEXT'], active.root);
    const r = await run(['settle', 'run', '--auto', '--allow-missing-coverage'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/AC-1 needs-context/);
    expect(r.stderr).not.toMatch(/AC-1 blocked/);
    expect(r.stderr).toMatch(/T1/);
    expect((await readState(active.root)).loopPosition).toBe('BUILD');
  });

  it('--auto --force with NEEDS_CONTEXT records SUMMARY note as needs context', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=NEEDS_CONTEXT'], active.root);
    const r = await run(['settle', 'run', '--auto', '--force', '--allow-missing-coverage'], active.root);
    expect(r.code).toBe(0);
    const { json, md } = await readSummary(active.root);
    expect(json.acResults[0]).toMatchObject({ id: 'AC-1', pass: false });
    expect(json.acResults[0].note).toMatch(/T1.*needs context/);
    expect(json.acResults[0].note).not.toMatch(/blocked/);
    expect(md).toMatch(/AC-1.*FAIL/);
    expect(md).toMatch(/needs context/);
  });

  it('BLOCKED task → exit 1, stderr names AC + task, state still BUILD, no SUMMARY', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=BLOCKED'], active.root);
    const r = await run(['settle', 'run', '--auto', '--allow-missing-coverage'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/AC-1 blocked/);
    expect(r.stderr).toMatch(/T1/);
    expect(existsSync(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.md'))).toBe(false);
    expect((await readState(active.root)).loopPosition).toBe('BUILD');
  });

  it('PENDING task (no build record) → exit 1, refuses to settle', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const r = await run(['settle', 'run', '--auto', '--allow-missing-coverage'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/AC-1 pending/);
    expect((await readState(active.root)).loopPosition).toBe('BUILD');
  });

  it('--auto --force settles past blockers; blocked ACs recorded fail with auto-note', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=BLOCKED'], active.root);
    const r = await run(['settle', 'run', '--auto', '--force', '--allow-missing-coverage'], active.root);
    expect(r.code).toBe(0);
    const { json, md } = await readSummary(active.root);
    expect(json.acResults[0]).toMatchObject({ id: 'AC-1', pass: false });
    expect(json.acResults[0].note).toMatch(/T1.*blocked/);
    expect(md).toMatch(/AC-1.*FAIL/);
    expect((await readState(active.root)).loopPosition).toBe('IDLE');
  });

  it('explicit --ac overrides --auto derivation for that id', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--ac', 'AC-1=fail:override'],
      active.root,
    );
    expect(r.code).toBe(0);
    const { json } = await readSummary(active.root);
    expect(json.acResults).toEqual([{ id: 'AC-1', pass: false, note: 'override', evidence: 'unverified' }]);
  });

  // AC-1 (Phase 165) — parseVerifier accepts 'host-cli' as a valid --verifier
  // value instead of rejecting it with InvalidArgumentError.
  it('accepts --verifier host-cli without rejecting it as an invalid provider (AC-1)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--verifier', 'host-cli', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.stderr).not.toMatch(/invalid --verifier/);
    expect(r.code).toBe(0);
  });

  it('legacy --ac-only flow is unchanged (no --auto)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=BLOCKED'], active.root);
    // Without --auto, settle accepts the explicit verdicts as-is even if
    // tasks are BLOCKED. Today's behavior preserved.
    const r = await run(['settle', 'run', '--ac', 'AC-1=fail:manual'], active.root);
    expect(r.code).toBe(0);
    const { json } = await readSummary(active.root);
    expect(json.acResults).toEqual([{ id: 'AC-1', pass: false, note: 'manual', evidence: 'unverified' }]);
  });
});
