import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TEST_DIR, '..', '..', '..', '..');
const CADENCE_CLI = join(TEST_DIR, '..', '..', 'dist', 'cli', 'index.js');

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
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence draft new', () => {
  it('AC-5: creates the legacy DRAFT.md skeleton when no template is supplied', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    expect(r.code).toBe(0);
    const path = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
    expect(existsSync(path)).toBe(true);
    const content = await readFile(path, 'utf8');
    expect(content).toMatch(/^---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: PENDING\n---/);
    expect(content).toContain('# 01-01 — Demo');
    expect(content).toContain('## Objective\n\n_(one sentence)_');
  });

  it('AC-1: lists draft templates in help', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['draft', 'new', '--help'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('--template <name>');
    expect(r.stdout).toContain('bugfix | feature | refactor');
  });

  it('AC-1: refuses unknown templates before writing a draft', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(
      ['draft', 'new', '01-foundation', '01', '--title=Demo', '--template=nope'],
      active.root,
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('unknown template "nope"');
    expect(r.stderr).toContain('bugfix, feature, refactor');
    expect(existsSync(join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md'))).toBe(false);
  });

  it('AC-1: derives phase slug and task id from --title when positionals are omitted', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['draft', 'new', '--title=Auto Phase Id'], active.root);
    expect(r.code).toBe(0);
    const path = join(active.root, '.cadence/phases/01-auto-phase-id/01-01-DRAFT.md');
    expect(existsSync(path)).toBe(true);
    const content = await readFile(path, 'utf8');
    expect(content).toMatch(/^---\nphase: 01-auto-phase-id\nid: 01-01\ntier: standard\nstatus: PENDING\n---/);
    expect(content).toContain('# 01-01 — Auto Phase Id');
  });

  it('AC-2: bugfix template derives phase id and writes a complete first draft', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(
      ['draft', 'new', '--title=Fix login timeout', '--template=bugfix'],
      active.root,
    );
    expect(r.code).toBe(0);
    const path = join(active.root, '.cadence/phases/01-fix-login-timeout/01-01-DRAFT.md');
    expect(existsSync(path)).toBe(true);
    const content = await readFile(path, 'utf8');
    expect(content).toContain('# 01-01 — Fix login timeout');
    expect(content).toContain('Fix the user-visible defect: Fix login timeout.');
    expect(content).toContain('### AC-1: defect is reproduced by a regression test');
    expect(content).toContain('### T1: Reproduce the defect');
    expect(content).toContain('DO NOT broaden the fix beyond "Fix login timeout"');
    expect(content).not.toContain('_(one sentence)_');
    expect(content).not.toContain('_(task name)_');
  });

  it('AC-3: feature template writes feature-oriented tasks and boundaries', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(
      ['draft', 'new', '12-export', '03', '--title=Add CSV export', '--template=feature'],
      active.root,
    );
    expect(r.code).toBe(0);
    const content = await readFile(
      join(active.root, '.cadence/phases/12-export/12-03-DRAFT.md'),
      'utf8',
    );
    expect(content).toContain('phase: 12-export');
    expect(content).toContain('id: 12-03');
    expect(content).toContain('Add the user-facing capability: Add CSV export.');
    expect(content).toContain('### AC-2: edge case is handled deliberately');
    expect(content).toContain('### T1: Add the primary feature path');
    expect(content).toContain('DO NOT expand beyond the first useful slice');
  });

  it('AC-6: docs teach templates as editable first-real-DRAFT scaffolds', async () => {
    const readDoc = (path: string) => readFile(join(REPO_ROOT, path), 'utf8');
    const [readme, quickstart, commands] = await Promise.all([
      readDoc('README.md'),
      readDoc('docs/quickstart.md'),
      readDoc('docs/reference/commands.md'),
    ]);

    for (const doc of [readme, quickstart]) {
      expect(doc).toContain('cadence draft new --title "Fix login timeout" --template bugfix');
      expect(doc).toMatch(/scaffolds?|editable/i);
      expect(doc).toMatch(/not proof|do not prove/i);
    }
    expect(commands).toContain('--template <name>');
    expect(commands).toContain('bugfix \\| feature \\| refactor');
  });

  it('AC-4: refactor template emphasizes behavior preservation', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(
      ['draft', 'new', '--title=Split billing service', '--template=refactor'],
      active.root,
    );
    expect(r.code).toBe(0);
    const content = await readFile(
      join(active.root, '.cadence/phases/01-split-billing-service/01-01-DRAFT.md'),
      'utf8',
    );
    expect(content).toContain('Refactor the code to support: Split billing service.');
    expect(content).toContain('### AC-1: behavior is preserved');
    expect(content).toContain('### T1: Characterize current behavior');
    expect(content).toContain('DO NOT change public behavior');
  });

  it('AC-1: defaults the task number to 1 when only phase is supplied', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['draft', 'new', '12-manual', '--title=Manual'], active.root);
    expect(r.code).toBe(0);
    expect(existsSync(join(active.root, '.cadence/phases/12-manual/12-01-DRAFT.md'))).toBe(true);
  });

  it('transitions state to loopPosition=DRAFT and tracks the open draft', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    expect(r.code).toBe(0);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('DRAFT');
    expect(state.activePhase).toBe('01-foundation');
    expect(state.activeDraft).toBe('01-01');
    expect(state.openDrafts.map((d: { id: string }) => d.id)).toContain('01-01');
    const stateMd = await readFile(join(active.root, '.cadence/STATE.md'), 'utf8');
    expect(stateMd).toMatch(/Loop position:.*DRAFT/);
    expect(stateMd).toMatch(/01-01/);
  });

  it('refuses when loopPosition is not IDLE', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    // Now state is DRAFT — a second draft must be refused.
    const r = await run(['draft', 'new', '01-foundation', '02', '--title=Other'], active.root);
    expect(r.code).not.toBe(0);
    expect(existsSync(join(active.root, '.cadence/phases/01-foundation/01-02-DRAFT.md'))).toBe(false);
  });

  it('refuses when DRAFT already exists', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    const r = await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    expect(r.code).not.toBe(0);
  });
});
