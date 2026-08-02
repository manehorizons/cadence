import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig, emptyState } from '@thomas-powers-jr/cadence-types';
import { settleService } from '../../src/services/settle.js';
import type { CommandIO } from '../../src/services/io.js';

// deja:new per-file test fixture helper, matching this suite's existing convention (settle-auto-archive.test.ts, settle-collision.test.ts, settle-ship-ref.test.ts, scaffold-collision.test.ts each define their own copy rather than importing across test files)
function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

// deja:new per-file test fixture helper, matching this suite's existing convention (doctor.test.ts and others each define their own copy rather than importing across test files)
function captureIO(): { io: CommandIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

const PHASE = '174-retro-fixture';

function draftMd(): string {
  return `---
phase: ${PHASE}
id: 174-01
tier: standard
status: APPROVED
---

# 174-01 — Retro fixture

## Objective

Exercise the retro artifact + offer wiring.

## Acceptance Criteria

### AC-1: it settles
Given a thing
When it runs
Then it settles.

## Tasks

### T1: do
- files: \`x.ts\`
- action: do
- verify: do
- done: AC-1

## Boundaries

- none
`;
}

async function setupRepo(
  parent: string,
  opts: { retro?: { enabled?: boolean; offerGithubIssue?: boolean }; taskStatus?: string } = {},
): Promise<string> {
  const root = await realpath(await mkdtemp(join(parent, 'main-')));
  const phaseDir = join(root, '.cadence', 'phases', PHASE);
  await mkdir(phaseDir, { recursive: true });
  const config = {
    ...defaultConfig,
    retro: { enabled: opts.retro?.enabled ?? true, offerGithubIssue: opts.retro?.offerGithubIssue ?? true },
    // Phase 214 (T4): this fixture has no real AC-1 coverage and predates
    // gates.evidenceFloor (defaultConfig's schema-level floor is 'mention')
    // — relax it to 'unverified' so this file's retro-artifact assertions
    // aren't newly refused by the unrelated evidence-floor gate.
    gates: { sealed: [], evidenceFloor: 'unverified' as const },
  };
  await writeFile(join(root, '.cadence', 'config.json'), JSON.stringify(config, null, 2));
  const state = {
    ...emptyState('settle-retro-fixture'),
    loopPosition: 'BUILD' as const,
    activePhase: PHASE,
    activeDraft: '174-01',
  };
  await writeFile(join(root, '.cadence', 'state.json'), JSON.stringify(state, null, 2));
  await writeFile(join(phaseDir, '174-01-DRAFT.md'), draftMd());
  await writeFile(
    join(phaseDir, '174-01-PROGRESS.json'),
    JSON.stringify({ draftId: '174-01', tasks: { T1: { status: opts.taskStatus ?? 'DONE' } } }, null, 2),
  );
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'init']);
  return root;
}

// deja:new per-file test fixture helper, matching this suite's existing convention (packages/host-codex/tests/install-commands.test.ts defines its own copy rather than being imported cross-package)
async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('settle writes + offers a retro artifact (Phase 174)', () => {
  let parent: string;
  const savedEnv = process.env.CADENCE_PROMPTER_SCRIPT;
  beforeAll(async () => {
    parent = await realpath(await mkdtemp(join(tmpdir(), 'cadence-settle-retro-')));
  });
  afterAll(async () => {
    await rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.CADENCE_PROMPTER_SCRIPT;
    else process.env.CADENCE_PROMPTER_SCRIPT = savedEnv;
  });

  it('writes RETRO.json/.md on a successful settle', async () => {
    const root = await setupRepo(parent);
    const { io } = captureIO();
    const res = await settleService(root, { auto: true, allowMissingCoverage: true }, io);
    expect(res.exitCode).toBe(0);
    const base = join(root, '.cadence', 'phases', PHASE, '174-01-RETRO');
    expect(await exists(`${base}.json`)).toBe(true);
    expect(await exists(`${base}.md`)).toBe(true);
  });

  it('does NOT write a retro artifact when retro.enabled is false', async () => {
    const root = await setupRepo(parent, { retro: { enabled: false } });
    const { io } = captureIO();
    const res = await settleService(root, { auto: true, allowMissingCoverage: true }, io);
    expect(res.exitCode).toBe(0);
    const base = join(root, '.cadence', 'phases', PHASE, '174-01-RETRO');
    expect(await exists(`${base}.json`)).toBe(false);
  });

  it('does NOT write a retro artifact on a refused settle', async () => {
    // Force a refusal: an unresolved AC with no --auto/--force.
    const root = await setupRepo(parent, { taskStatus: 'PENDING' });
    const { io } = captureIO();
    const res = await settleService(root, {}, io);
    expect(res.exitCode).toBe(1);
    const base = join(root, '.cadence', 'phases', PHASE, '174-01-RETRO');
    expect(await exists(`${base}.json`)).toBe(false);
  });

  it('records a clean-run digest as "no friction detected" when settle has no bypasses/rough tasks', async () => {
    const root = await setupRepo(parent);
    const { io } = captureIO();
    // Deliberately --force instead of --allow-missing-coverage: the
    // test-coverage gate's `coverageBypassed` flag is set unconditionally
    // whenever --allow-missing-coverage is passed (regardless of whether a
    // bypass was actually needed) — see gates/coverage.ts. --force alone,
    // with a structurally-clean DONE task, passes the gate without flipping
    // that flag, so this is the genuinely friction-free path.
    const res = await settleService(root, { auto: true, force: true }, io);
    expect(res.exitCode).toBe(0);
    const md = await readFile(join(root, '.cadence', 'phases', PHASE, '174-01-RETRO.md'), 'utf8');
    expect(md).toContain('No friction detected this settle.');
  });

  it('never offers the GitHub issue on a non-TTY run with no CADENCE_PROMPTER_SCRIPT set', async () => {
    delete process.env.CADENCE_PROMPTER_SCRIPT;
    const root = await setupRepo(parent);
    const { io, out, err } = captureIO();
    const res = await settleService(root, { auto: true, allowMissingCoverage: true }, io);
    expect(res.exitCode).toBe(0);
    expect(out.some((l) => l.includes('File a GitHub issue'))).toBe(false);
    expect(err.some((l) => l.includes('Filed'))).toBe(false);
  });

  it('never spawns a real gh process on a friction-having settle driven by CADENCE_PROMPTER_SCRIPT off a non-TTY test process (regression: caused a real hang on Windows CI)', async () => {
    // Reproduces the exact CI failure: CADENCE_PROMPTER_SCRIPT makes
    // resolveInteractivity report 'interactive' (it's this codebase's
    // scripted-prompt-answer test seam, not a real TTY), and a coverage
    // bypass gives the retro digest real friction. Without the isRealTTY
    // gate, runRetroOffer would spawn a real, unmocked `gh repo view` here —
    // this test process's own process.stdin.isTTY is falsy (a real vitest/CI
    // process, not an interactive terminal), so this exercises the same
    // "scripted but not a real terminal" combination that hung Windows CI.
    process.env.CADENCE_PROMPTER_SCRIPT = 'irrelevant\n';
    const root = await setupRepo(parent);
    const { io, out, err } = captureIO();
    const start = Date.now();
    const res = await settleService(root, { auto: true, allowMissingCoverage: true }, io);
    const elapsedMs = Date.now() - start;
    expect(res.exitCode).toBe(0);
    expect(elapsedMs).toBeLessThan(5000); // a real gh spawn attempt would take vastly longer (or hang)
    expect(out.some((l) => l.includes('File a GitHub issue'))).toBe(false);
    expect(err.some((l) => l.includes('Filed'))).toBe(false);
    expect(err.some((l) => l.includes('gh CLI unavailable'))).toBe(false); // never even tried to resolve a target
  });

  it('reaches IDLE regardless of the retro offer step (state transition does not depend on it)', async () => {
    const root = await setupRepo(parent);
    const { io } = captureIO();
    // No CADENCE_PROMPTER_SCRIPT, no friction in this fixture anyway (clean settle) — the
    // offer is a no-op either way, so this does NOT itself regression-test call order (the
    // actual ordering guarantee — runRetroOffer is called strictly after backend.commit() —
    // is structural, verified by reading settle.ts, not by a spy in this test). This test
    // only confirms settle's state transition doesn't depend on the offer step succeeding.
    const res = await settleService(root, { auto: true, allowMissingCoverage: true }, io);
    expect(res.exitCode).toBe(0);
    const state = JSON.parse(await readFile(join(root, '.cadence', 'state.json'), 'utf8'));
    expect(state.loopPosition).toBe('IDLE');
    expect(state.activeDraft).toBeNull();
  });
});
