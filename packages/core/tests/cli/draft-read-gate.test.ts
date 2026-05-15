import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';

// AC-3, AC-4, AC-5 (Phase 23.1) — DRAFT-read mtime gate.

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

async function patchConfig(root: string, patch: Record<string, unknown>): Promise<void> {
  const path = join(root, '.cadence/config.json');
  const cfg = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...cfg, ...patch }, null, 2));
}

async function seedDraft(
  root: string,
  profile: 'auto' | 'standard' | 'strict',
  tier: 'quick-fix' | 'standard' | 'complex',
): Promise<string> {
  const phaseDir = join(root, '.cadence/phases/01-foundation');
  await mkdir(phaseDir, { recursive: true });
  const body = `---\nphase: 01-foundation\nid: 01-01\ntier: ${tier}\nprofile: ${profile}\nstatus: PENDING\n---\n\n# 01-01 — Demo\n\n## Objective\nDemo.\n\n## Acceptance Criteria\n\n### AC-1: ok\nGiven x\nWhen y\nThen z\n\n## Tasks\n\n### T1: do\n- files: \`src/x.ts\`\n- action: a\n- verify: v\n- done: AC-1\n\n## Boundaries\n\n- _(none)_\n`;
  const path = join(phaseDir, '01-01-DRAFT.md');
  await writeFile(path, body);
  return path;
}

async function touchFuture(path: string, msInFuture = 5000): Promise<void> {
  const future = new Date(Date.now() + msInFuture);
  await utimes(path, future, future);
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('DRAFT-read mtime gate (Phase 23.1)', () => {
  it('refuses settle when DRAFT.md mtime is newer than draftReadAt (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    // standard × standard cell has draft-read in gate set per DESIGN §4.2.
    const draftPath = await seedDraft(active.root, 'standard', 'standard');
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    // Edit the DRAFT after approve.
    await touchFuture(draftPath, 5000);
    const r = await run(
      ['settle', 'run', '--auto', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/DRAFT\.md was edited after approve/);
    expect(r.stderr).toMatch(/--allow-stale-draft/);
    // No SUMMARY written; state still BUILD.
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('BUILD');
    expect(existsSync(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'))).toBe(false);
  });

  it('--allow-stale-draft bypasses the gate and logs INFO trace (AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    const draftPath = await seedDraft(active.root, 'standard', 'standard');
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await touchFuture(draftPath, 5000);
    await run(['done', 'T1', '--notes=ok'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--allow-missing-coverage', '--allow-stale-draft'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/proceeding past draft-read gate/);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('IDLE');
  });

  it('DRAFT not modified after approve → no refusal (AC-5)', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, 'standard', 'standard');
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['done', 'T1', '--notes=ok'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/DRAFT\.md was edited/);
  });

  it('draftReadAt=null (legacy or never-approved) → no refusal regardless of mtime (AC-5)', async () => {
    active = await tempRepo({ initialized: true });
    const draftPath = await seedDraft(active.root, 'standard', 'standard');
    // Manually bypass approve: write the state.json to put us in BUILD without touching draftReadAt.
    const statePath = join(active.root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.activePhase = '01-foundation';
    state.activeDraft = '01-01';
    state.loopPosition = 'BUILD';
    state.tier = 'standard';
    state.openDrafts = [{ id: '01-01', since: new Date().toISOString() }];
    // draftReadAt stays null (or absent — legacy state.json shape).
    delete state.draftReadAt;
    await writeFile(statePath, JSON.stringify(state, null, 2));
    await touchFuture(draftPath, 5000); // would normally trip the gate
    await run(['done', 'T1', '--notes=ok'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/DRAFT\.md was edited/);
  });

  it('gate not in gate set (auto profile) → no refusal regardless of mtime (AC-5)', async () => {
    active = await tempRepo({ initialized: true });
    // auto × standard cell has only test-coverage + anomaly-notify; no draft-read.
    const draftPath = await seedDraft(active.root, 'auto', 'standard');
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await touchFuture(draftPath, 5000);
    await run(['done', 'T1', '--notes=ok'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/DRAFT\.md was edited/);
  });
});
