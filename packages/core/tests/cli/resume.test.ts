// packages/core/tests/cli/resume.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { SimpleStateBackend } from '../../src/state/simple.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');
function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CLI, ...args], { cwd });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}
let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence resume', () => {
  it('AC-24: with no handoff, prints a hint and exits 0', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['resume'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/no handoff found/i);
    expect(r.stdout).toMatch(/cadence handoff/);
  });

  it('AC-25: --full replays the whole freshest doc', async () => {
    active = await tempRepo({ initialized: true });
    await run(['handoff', '--label', 'cli'], active.root);
    const r = await run(['resume', '--full'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/# Session Handoff/);
    expect(r.stdout).toMatch(/SESSION-\d{4}-\d{2}-\d{2}-cli\.md/);
  });

  it('AC-26: --json --full emits a parseable ResumeResult with context', async () => {
    active = await tempRepo({ initialized: true });
    await run(['handoff'], active.root);
    const r = await run(['resume', '--json', '--full'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.found).toBe(true);
    expect(parsed.mode).toBe('full');
    expect(parsed.context.scope).toBe('handoff');
  });

  it('AC-29: defaults to brief output with a full-mode pointer', async () => {
    active = await tempRepo({ initialized: true });
    await run(['handoff', '--label', 'cli'], active.root);
    const r = await run(['resume'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('## Next action');
    expect(r.stdout).not.toContain('## CADENCE context');
    expect(r.stdout).toMatch(/cadence resume --full/);
  });

  it('AC-32: --json carries mode; context is null in brief', async () => {
    active = await tempRepo({ initialized: true });
    await run(['handoff'], active.root);
    const brief = JSON.parse((await run(['resume', '--json'], active.root)).stdout);
    expect(brief.mode).toBe('brief');
    expect(brief.context).toBeNull();
  });

  it('AC-34: --full and --brief together are rejected with exit 1', async () => {
    active = await tempRepo({ initialized: true });
    await run(['handoff'], active.root);
    const r = await run(['resume', '--full', '--brief'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/mutually exclusive/i);
  });

  it('AC-35: --brief forces brief output even when state has drifted', async () => {
    active = await tempRepo({ initialized: true });
    await run(['handoff'], active.root);
    const backend = new SimpleStateBackend(active.root);
    const state = await backend.readState();
    const moved = state.loopPosition === 'IDLE' ? 'BUILD' : 'IDLE';
    await backend.commit({ ...state, loopPosition: moved as typeof state.loopPosition });
    const r = await run(['resume', '--brief', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.mode).toBe('brief'); // --brief wins over the drift heuristic
    expect(parsed.context).toBeNull();
    expect(parsed.drift).not.toBeNull(); // drift is still detected + reported
  });
});
