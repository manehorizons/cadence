import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyState } from '@thomas-powers-jr/cadence-types';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { draftCheckService } from '../../src/services/draft-check.js';
import { SimpleStateBackend } from '../../src/state/simple.js';
import type { CommandIO } from '../../src/services/io.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(__dirname, '../../dist/cli/index.js');

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

const DRAFT = `---
phase: 01-foundation
id: 01-01
tier: standard
status: PENDING
---

# 01-01 — Demo

## Objective

Make widget glow.

## Acceptance Criteria

### AC-1: Glows
Given widget exists
When user enables glow
Then widget emits photons

## Tasks

### T1: Add flag
- files: \`src/widget.ts\`
- action: add prop
- verify: tests pass
- done: AC-1
- stop: halt if the flag changes widget's public API

## Boundaries
`;

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence draft check', () => {
  it('exits 0 when no coherence issues', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, '.cadence/phases/01-foundation'), { recursive: true });
    const path = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
    await writeFile(path, DRAFT);
    const r = await run(['draft', 'check', path], active.root);
    expect(r.code).toBe(0);
  });

  it('exits 2 when PROJECT.md forbids a touched file', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, '.cadence/phases/01-foundation'), { recursive: true });
    await writeFile(join(active.root, '.cadence/PROJECT.md'), '# proj\n\nDO NOT edit src/widget.ts.\n');
    const path = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
    await writeFile(path, DRAFT);
    const r = await run(['draft', 'check', path], active.root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/PROJECT_FORBIDDEN/);
  });

  // AC-2 (Phase 23.2) — coherence-warn emission
  it('emits one coherence-warn anomaly per warn issue (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    // Configure file transport with absolute path so notifier writes
    // into the temp repo, not the test cwd.
    const cfgPath = join(active.root, '.cadence/config.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    cfg.notify = { transport: 'file', file: join(active.root, '.cadence/anomalies.log') };
    await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
    // Seed a decision whose title contains the touched file → triggers DECISION_TOUCH warn.
    const statePath = join(active.root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.decisions = [{ id: 'D1', phase: '01-foundation', title: 'Lock format of src/widget.ts', decidedAt: '2026-05-14T22:00:00.000Z' }];
    await writeFile(statePath, JSON.stringify(state, null, 2));
    await mkdir(join(active.root, '.cadence/phases/01-foundation'), { recursive: true });
    const draftPath = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
    await writeFile(draftPath, DRAFT);
    const r = await run(['draft', 'check', draftPath], active.root);
    expect(r.code).toBe(0); // warn, not block
    expect(r.stderr).toMatch(/DECISION_TOUCH/);
    const logPath = join(active.root, '.cadence/anomalies.log');
    expect(existsSync(logPath)).toBe(true);
    const lines = (await readFile(logPath, 'utf8')).split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    const ev = JSON.parse(lines[0]!);
    expect(ev.type).toBe('coherence-warn');
    expect(ev.severity).toBe('warn');
    expect(ev.context.code).toBe('DECISION_TOUCH');
    expect(ev.context.source).toBe('coherence.check');
  });

  // AC-4 (Phase 23.2) — gate-absent short-circuit
  it('does not emit when anomaly-notify is not in the gate set (AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    const cfgPath = join(active.root, '.cadence/config.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    // auto × quick-fix cell has only anomaly-notify in its delta... actually
    // auto × quick-fix DOES include anomaly-notify. To eliminate it, switch
    // profile to strict (strict cells don't include anomaly-notify).
    cfg.profile = 'strict';
    cfg.notify = { transport: 'file', file: join(active.root, '.cadence/anomalies.log') };
    await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
    const statePath = join(active.root, '.cadence/state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.decisions = [{ id: 'D1', phase: '01-foundation', title: 'Lock format of src/widget.ts', decidedAt: '2026-05-14T22:00:00.000Z' }];
    await writeFile(statePath, JSON.stringify(state, null, 2));
    await mkdir(join(active.root, '.cadence/phases/01-foundation'), { recursive: true });
    const draftPath = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
    await writeFile(draftPath, DRAFT);
    const r = await run(['draft', 'check', draftPath], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/DECISION_TOUCH/);
    expect(existsSync(join(active.root, '.cadence/anomalies.log'))).toBe(false);
  });
});

// Phase 288 (288-01, T2): a DRAFT whose `## Acceptance Criteria` section is
// non-empty but contains only malformed (non-numeric) `### AC-<id>:`
// headings — e.g. `### AC-K1: ...` — must not silently parse to zero AC
// blocks and report `coherence: OK`. `parseDraftMd` (T1, already landed in
// this worktree) now throws a `CadenceError('...numeric...', 'COHERENCE_FAILED')`
// for this shape; this test proves that throw actually surfaces end-to-end
// through `draftCheckService`'s outer try/catch → `formatCommandError`,
// rather than merely asserting the parser throws in isolation (that's
// `draft-parser.test.ts`'s job, not this file's).
//
// Direct-call style against `draftCheckService` (not the CLI-spawn `run()`
// helper above) — mirrors `draft-new.test.ts`'s `captureIO()` +
// `SimpleStateBackend(...).commit(emptyState(...))` minimal-repo idiom,
// since this test needs no config.json (the throw happens before
// `draftCheckService` ever reaches `loadConfig`).
function captureIO(): { io: CommandIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

async function mkMalformedRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cadence-draft-check-malformed-'));
  await mkdir(join(root, '.cadence', 'phases'), { recursive: true });
  await new SimpleStateBackend(root).commit(emptyState('draft-check-malformed-test'));
  return root;
}

const MALFORMED_AC_DRAFT = `---
phase: 01-foundation
id: 01-01
tier: standard
status: PENDING
---

# 01-01 — Demo

## Objective

Make widget glow.

## Acceptance Criteria

### AC-K1: Something
Given widget exists
When user enables glow
Then widget emits photons

## Tasks

### T1: Add flag
- files: \`src/widget.ts\`
- action: add prop
- verify: tests pass
- done: AC-K1

## Boundaries
`;

describe('cadence draft check — malformed (non-numeric) AC heading fails loud (phase 288, T2)', () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root) {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
      root = undefined;
    }
  });

  it('288-01/AC-2: reports the malformed heading and a non-zero exit instead of "coherence: OK"', async () => {
    root = await mkMalformedRepo();
    const phaseDir = join(root, '.cadence/phases/01-foundation');
    await mkdir(phaseDir, { recursive: true });
    const draftPath = join(phaseDir, '01-01-DRAFT.md');
    await writeFile(draftPath, MALFORMED_AC_DRAFT);

    const { io, out, err } = captureIO();
    const res = await draftCheckService(root, { path: draftPath }, io);

    // The throw happens before draftCheckService's own coherence-check
    // gating layer (which would exit 2 on a blocking issue) — it's caught
    // by the outer try/catch and reported as a generic command failure (1).
    expect(res.exitCode).toBe(1);
    expect(out.join('')).not.toMatch(/coherence: OK/);
    expect(err.join('')).toMatch(/draft check failed:/);
    expect(err.join('')).toMatch(/numeric/i);
    expect(err.join('')).toMatch(/AC-K1/);
  });
});
