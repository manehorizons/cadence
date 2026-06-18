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

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence draft new', () => {
  it('AC-1 (phase 120): infers phase slug and task number from --title', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['draft', 'new', '--title=My Feature'], active.root);
    expect(r.code).toBe(0);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.activePhase).toMatch(/^\d+-my-feature$/);
    expect(state.activeDraft).toMatch(/^\d+-01$/);
    const path = join(active.root, '.cadence/phases', state.activePhase, `${state.activeDraft}-DRAFT.md`);
    expect(existsSync(path)).toBe(true);
  });

  it('AC-1 AC-2 (phase 127): --brief seeds a usable draft with inferred phase', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(
      [
        'draft',
        'new',
        '--title=Add greeting module',
        '--brief=Add a greet(name) helper with one test',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.activePhase).toMatch(/^\d+-add-greeting-module$/);
    expect(state.activeDraft).toMatch(/^\d+-01$/);

    const path = join(active.root, '.cadence/phases', state.activePhase, `${state.activeDraft}-DRAFT.md`);
    const content = await readFile(path, 'utf8');
    expect(content).toContain('## Objective\n\nAdd a greet(name) helper with one test.\n');
    expect(content).toContain('### AC-1: Add greeting module\nGiven the current project state');
    expect(content).toContain('### T1: Add greeting module');
    expect(content).toContain('- action: Add a greet(name) helper with one test.');
    expect(content).toContain('## Boundaries\n\n- Keep changes scoped to Add greeting module.\n');
    expect(content).not.toContain('_(one sentence)_');
    expect(content).not.toContain('_(task name)_');
  });

  it('AC-3 (phase 127): --brief refuses blank text before creating a draft', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(
      [
        'draft',
        'new',
        '127-guided-first-phase-drafting',
        '01',
        '--title=Empty',
        '--brief=   ',
      ],
      active.root,
    );

    expect(r.code).toBe(1);
    expect(r.stderr).toContain('draft new refused: --brief cannot be empty');
    expect(
      existsSync(
        join(
          active.root,
          '.cadence/phases/127-guided-first-phase-drafting/127-01-DRAFT.md',
        ),
      ),
    ).toBe(false);
  });

  it('creates a DRAFT.md skeleton under phases/<phase>/', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    expect(r.code).toBe(0);
    const path = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
    expect(existsSync(path)).toBe(true);
    const content = await readFile(path, 'utf8');
    expect(content).toMatch(/^---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: PENDING\n---/);
    expect(content).toContain('# 01-01 — Demo');
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

  it('AC-3 (phase 119): invalid config fails closed before scaffolding', async () => {
    active = await tempRepo({ initialized: true });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(active.root, '.cadence/config.json'), JSON.stringify({ loopEnforcement: 'nope' }));

    const r = await run(['draft', 'new', '01-invalid-config', '01', '--title=Demo'], active.root);

    expect(r.code).toBe(1);
    expect(r.stderr).toContain('config.json failed schema validation');
    expect(existsSync(join(active.root, '.cadence/phases/01-invalid-config'))).toBe(false);
  });
});
