import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stderr = '';
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ code: code ?? 0, stderr }));
  });
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence draft approve', () => {
  it('transitions state to loopPosition=BUILD', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    const r = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    expect(r.code).toBe(0);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.loopPosition).toBe('BUILD');
    expect(state.activeDraft).toBe('01-01');
  });

  it('refuses to approve when coherence is blocked', async () => {
    active = await tempRepo({ initialized: true });
    await writeFile(join(active.root, '.cadence/PROJECT.md'), 'DO NOT edit src/foo.ts.');
    await mkdir(join(active.root, '.cadence/phases/01-foundation'), { recursive: true });
    const path = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
    await writeFile(
      path,
      `---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: PENDING\n---\n\n# 01-01 — D\n\n## Objective\no\n\n## Acceptance Criteria\n\n### AC-1: a\nGiven x\nWhen y\nThen z\n\n## Tasks\n\n### T1: t\n- files: \`src/foo.ts\`\n- action: a\n- verify: v\n- done: AC-1\n\n## Boundaries\n`,
    );
    const r = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/PROJECT_FORBIDDEN/);
  });

  // AC-2 (Phase 23.1) — approve records draftReadAt on success
  it('successful approve writes draftReadAt as parseable ISO8601 (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    const before = Date.now();
    const r = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const after = Date.now();
    expect(r.code).toBe(0);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(typeof state.draftReadAt).toBe('string');
    const ms = Date.parse(state.draftReadAt);
    expect(Number.isNaN(ms)).toBe(false);
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });

  it('approve refused on coherence blocker leaves draftReadAt null (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    await writeFile(join(active.root, '.cadence/PROJECT.md'), 'DO NOT edit src/foo.ts.');
    await mkdir(join(active.root, '.cadence/phases/01-foundation'), { recursive: true });
    const path = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
    await writeFile(
      path,
      `---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: PENDING\n---\n\n# 01-01 — D\n\n## Objective\no\n\n## Acceptance Criteria\n\n### AC-1: a\nGiven x\nWhen y\nThen z\n\n## Tasks\n\n### T1: t\n- files: \`src/foo.ts\`\n- action: a\n- verify: v\n- done: AC-1\n\n## Boundaries\n`,
    );
    const r = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    expect(r.code).toBe(2);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.draftReadAt).toBeNull();
  });

  // AC-3 (Phase 23.2) — coherence-warn emission at approve time
  it('approve emits coherence-warn per warn issue with source=coherence.approve (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    const cfgPath = join(active.root, '.cadence/config.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    cfg.notify = { transport: 'file', file: join(active.root, '.cadence/anomalies.log') };
    await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
    const statePath = join(active.root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.decisions = [{ id: 'D1', phase: '01-foundation', title: 'Lock format of src/widget.ts', decidedAt: '2026-05-14T22:00:00.000Z' }];
    await writeFile(statePath, JSON.stringify(state, null, 2));
    await mkdir(join(active.root, '.cadence/phases/01-foundation'), { recursive: true });
    const path = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
    await writeFile(
      path,
      `---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: PENDING\n---\n\n# 01-01 — D\n\n## Objective\no\n\n## Acceptance Criteria\n\n### AC-1: a\nGiven x\nWhen y\nThen z\n\n## Tasks\n\n### T1: t\n- files: \`src/widget.ts\`\n- action: a\n- verify: v\n- done: AC-1\n\n## Boundaries\n`,
    );
    const r = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    expect(r.code).toBe(0);
    // State did transition to BUILD + draftReadAt was set.
    const stateAfter = JSON.parse(await readFile(statePath, 'utf8'));
    expect(stateAfter.loopPosition).toBe('BUILD');
    expect(typeof stateAfter.draftReadAt).toBe('string');
    // Event landed with the right shape + source.
    const logPath = join(active.root, '.cadence/anomalies.log');
    const lines = (await readFile(logPath, 'utf8')).split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    const ev = JSON.parse(lines[0]!);
    expect(ev.type).toBe('coherence-warn');
    expect(ev.context.source).toBe('coherence.approve');
  });

  it('re-approving the same draft updates the timestamp (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const first = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8')).draftReadAt as string;
    await new Promise((r) => setTimeout(r, 10));
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const second = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8')).draftReadAt as string;
    expect(Date.parse(second)).toBeGreaterThan(Date.parse(first));
  });
});
