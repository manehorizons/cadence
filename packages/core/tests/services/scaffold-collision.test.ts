import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig, emptyState } from '@manehorizons/cadence-types';
import { specNewService } from '../../src/services/spec-new.js';
import { draftNewService } from '../../src/services/draft-new.js';
import type { CommandIO } from '../../src/services/io.js';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function captureIO(): { io: CommandIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

/** A cadence-initialized git repo (IDLE) with a sibling worktree holding `30-other`. */
async function setupMainWithSiblingAt30(parent: string): Promise<string> {
  const main = await realpath(await mkdtemp(join(parent, 'main-')));
  // cadence init
  await mkdir(join(main, '.cadence', 'phases'), { recursive: true });
  await writeFile(join(main, '.cadence', 'config.json'), JSON.stringify(defaultConfig, null, 2));
  await writeFile(join(main, '.cadence', 'state.json'), JSON.stringify(emptyState('collision-test'), null, 2));
  // git init + commit so a worktree can be added
  git(main, ['init', '-b', 'main']);
  git(main, ['config', 'user.email', 'test@example.com']);
  git(main, ['config', 'user.name', 'Test']);
  git(main, ['config', 'commit.gpgsign', 'false']);
  git(main, ['add', '.']);
  git(main, ['commit', '-m', 'init']);
  // sibling worktree with a colliding phase 30
  const sibling = join(parent, `wt30-${Date.now().toString(36)}`);
  git(main, ['worktree', 'add', '-b', 'feature-30', sibling]);
  await mkdir(join(sibling, '.cadence', 'phases', '30-other'), { recursive: true });
  await writeFile(join(sibling, '.cadence', 'phases', '30-other', '.keep'), '');
  return main;
}

describe('scaffold-time phase-collision guard (AC-4, AC-5)', () => {
  let parent: string;
  beforeAll(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), 'cadence-scaf-')));
  });
  afterAll(async () => {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  });

  it('AC-4: `spec new` refuses a number a sibling worktree holds, creating no file', async () => {
    const main = await setupMainWithSiblingAt30(parent);
    const { io, err } = captureIO();
    const res = await specNewService(main, { phase: '30-foo', num: '01' }, io);
    expect(res.exitCode).not.toBe(0);
    expect(err.join('')).toContain('phase 30 is in use by worktree');
    expect(err.join('')).toContain('suggested next free: 31');
    expect(existsSync(join(main, '.cadence', 'phases', '30-foo', '30-01-SPEC.md'))).toBe(false);
  });

  it('AC-5: `spec new --allow-phase-collision` proceeds past the sibling collision', async () => {
    const main = await setupMainWithSiblingAt30(parent);
    const { io } = captureIO();
    const res = await specNewService(main, { phase: '30-foo', num: '01', allowPhaseCollision: true }, io);
    expect(res.exitCode).toBe(0);
    expect(existsSync(join(main, '.cadence', 'phases', '30-foo', '30-01-SPEC.md'))).toBe(true);
  });

  it('AC-4: `draft new` refuses a sibling-held number, creating no file', async () => {
    const main = await setupMainWithSiblingAt30(parent);
    const { io, err } = captureIO();
    const res = await draftNewService(main, { phase: '30-foo', num: '01' }, io);
    expect(res.exitCode).not.toBe(0);
    expect(err.join('')).toContain('phase 30 is in use by worktree');
    expect(existsSync(join(main, '.cadence', 'phases', '30-foo', '30-01-DRAFT.md'))).toBe(false);
  });

  it('AC-3: a non-colliding number scaffolds normally (no false refusal)', async () => {
    const main = await setupMainWithSiblingAt30(parent);
    const { io } = captureIO();
    const res = await specNewService(main, { phase: '31-fresh', num: '01' }, io);
    expect(res.exitCode).toBe(0);
    expect(existsSync(join(main, '.cadence', 'phases', '31-fresh', '31-01-SPEC.md'))).toBe(true);
  });

  it('AC-7: phaseGuard.enabled=false lets a colliding number through', async () => {
    const main = await setupMainWithSiblingAt30(parent);
    const cfg = { ...defaultConfig, phaseGuard: { enabled: false, integrationRef: 'main' } };
    await writeFile(join(main, '.cadence', 'config.json'), JSON.stringify(cfg, null, 2));
    const { io } = captureIO();
    const res = await specNewService(main, { phase: '30-foo', num: '01' }, io);
    expect(res.exitCode).toBe(0);
    expect(existsSync(join(main, '.cadence', 'phases', '30-foo', '30-01-SPEC.md'))).toBe(true);
  });

  it('AC-5: the flag does NOT bypass the local same-dir existsSync refusal', async () => {
    const main = await setupMainWithSiblingAt30(parent);
    // pre-create the SPEC so existsSync fires
    await mkdir(join(main, '.cadence', 'phases', '40-dup'), { recursive: true });
    await writeFile(join(main, '.cadence', 'phases', '40-dup', '40-01-SPEC.md'), 'x');
    const before = await readFile(join(main, '.cadence', 'phases', '40-dup', '40-01-SPEC.md'), 'utf8');
    const { io, err } = captureIO();
    const res = await specNewService(main, { phase: '40-dup', num: '01', allowPhaseCollision: true }, io);
    expect(res.exitCode).toBe(2); // existsSync exit code, not the guard's
    expect(err.join('')).toContain('SPEC already exists');
    expect(await readFile(join(main, '.cadence', 'phases', '40-dup', '40-01-SPEC.md'), 'utf8')).toBe(before);
  });
});
