import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@keel/testkit';

const KEEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [KEEL, ...args], { cwd });
    let stderr = '';
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ code: code ?? 0, stderr }));
  });
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('keel draft approve', () => {
  it('transitions state to loopPosition=BUILD', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    const r = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    expect(r.code).toBe(0);
    const state = JSON.parse(await readFile(join(active.root, '.keel/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('BUILD');
    expect(state.activeDraft).toBe('01-01');
  });

  it('refuses to approve when coherence is blocked', async () => {
    active = await tempRepo({ initialized: true });
    await writeFile(join(active.root, '.keel/PROJECT.md'), 'DO NOT edit src/foo.ts.');
    await mkdir(join(active.root, '.keel/phases/01-foundation'), { recursive: true });
    const path = join(active.root, '.keel/phases/01-foundation/01-01-DRAFT.md');
    await writeFile(
      path,
      `---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: PENDING\n---\n\n# 01-01 — D\n\n## Objective\no\n\n## Acceptance Criteria\n\n### AC-1: a\nGiven x\nWhen y\nThen z\n\n## Tasks\n\n### T1: t\n- files: \`src/foo.ts\`\n- action: a\n- verify: v\n- done: AC-1\n\n## Boundaries\n`,
    );
    const r = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/PROJECT_FORBIDDEN/);
  });
});
