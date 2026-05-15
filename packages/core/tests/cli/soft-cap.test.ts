import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';

// AC-1..AC-5 (Phase 21.1) — auto × complex soft cap (DESIGN.md §4 M2).

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

async function seedDraft(
  root: string,
  tier: 'quick-fix' | 'standard' | 'complex',
  profile?: 'auto' | 'standard' | 'strict',
): Promise<void> {
  const phaseDir = join(root, '.cadence/phases/01-foundation');
  await mkdir(phaseDir, { recursive: true });
  const profileLine = profile ? `profile: ${profile}\n` : '';
  const body = `---\nphase: 01-foundation\nid: 01-01\ntier: ${tier}\n${profileLine}status: PENDING\n---\n\n# 01-01 — Demo\n\n## Objective\nDemo.\n\n## Acceptance Criteria\n\n### AC-1: ok\nGiven x\nWhen y\nThen z\n\n## Tasks\n\n### T1: do\n- files: \`src/x.ts\`\n- action: a\n- verify: v\n- done: AC-1\n\n## Boundaries\n\n- _(none)_\n`;
  await writeFile(join(phaseDir, '01-01-DRAFT.md'), body);
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('auto × complex soft cap — draft approve', () => {
  it('refuses to approve an auto + complex draft without --allow-auto-complex (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, 'complex'); // default profile: auto
    const r = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/auto × complex is soft-capped/);
    expect(r.stderr).toMatch(/--allow-auto-complex/);
    // State should NOT transition to BUILD.
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('IDLE');
    expect(state.activeDraft).toBeNull();
  });

  it('--allow-auto-complex bypasses the cap on approve (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, 'complex');
    const r = await run(
      ['draft', 'approve', '01-foundation', '01', '--allow-auto-complex'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/proceeding past soft cap/);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('BUILD');
    expect(state.tier).toBe('complex');
  });

  it('draft.profile: standard frontmatter override avoids the cap (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, 'complex', 'standard');
    // standard × complex carries the 'approve' gate (Phase 24.1); bypass.
    const r = await run(
      ['draft', 'approve', '01-foundation', '01', '--no-approve'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/soft-capped/);
  });

  it('auto + standard is never affected (AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, 'standard');
    const r = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/soft-capped/);
  });
});

describe('auto × complex soft cap — settle run', () => {
  it('refuses to settle an auto + complex draft without --allow-auto-complex (AC-1)', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, 'complex');
    // Approve with the override so we can get into BUILD, then settle without it.
    await run(
      ['draft', 'approve', '01-foundation', '01', '--allow-auto-complex'],
      active.root,
    );
    await run(['done', 'T1', '--notes=ok'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/settle run refused: auto × complex/);
    // Loop position should remain BUILD (no transition).
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('BUILD');
  });

  it('--allow-auto-complex bypasses the cap on settle (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, 'complex');
    await run(
      ['draft', 'approve', '01-foundation', '01', '--allow-auto-complex'],
      active.root,
    );
    await run(['done', 'T1', '--notes=ok'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--allow-missing-coverage', '--allow-auto-complex'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/proceeding past soft cap/);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('IDLE');
  });

  it('auto + standard is never affected by the cap (AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, 'standard');
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['done', 'T1', '--notes=ok'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/soft-capped|soft cap/);
  });

  it('strict + complex (softCap=false) is never affected by the cap (AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    await seedDraft(active.root, 'complex', 'strict');
    // Strict + complex requires plan-review + security-audit + interactive-verdict
    // — way out of scope for this fixture. We only assert approval doesn't refuse
    // *for the soft-cap reason*. The strict profile may still impose other gates
    // (and that's fine — separate test concerns).
    const r = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    expect(r.stderr).not.toMatch(/soft-capped/);
  });
});
