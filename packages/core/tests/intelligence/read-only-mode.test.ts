/**
 * Phase 289 T2 — proof that read-only mode (CADENCE_READ_ONLY) leaves the
 * five investigation commands (`context handoff`, `recommend`, `inspect`,
 * `recommendation list`, `next`) unaffected (289-01/AC-2), and that every command's
 * inactive-mode (env var unset) behavior is byte-identical to pre-change
 * (289-01/AC-3).
 *
 * These are real CLI subprocess tests (same `spawn(dist/cli/index.js, ...)`
 * pattern as the existing `tests/cli/context.test.ts` /
 * `tests/cli/recommend.test.ts` / `tests/cli/inspect.test.ts` /
 * `tests/cli/next.test.ts` suites) rather than in-process calls, because
 * 289-01/AC-2's wording is about the actual `cadence <command>` invocations, and
 * because a subprocess is the only way to set `CADENCE_READ_ONLY` in the
 * *child's* environment without mutating this test runner's own
 * `process.env` (which the guard reads directly, and which vitest workers
 * may share across concurrently-running test files).
 *
 * T1 (already landed) wired `assertNotReadOnly` into ten intelligence-store
 * write entry points plus `runMilestoneExport`. None of the five
 * "read-only" commands under test here call any of those ten functions:
 * `runContext`/`runRecommend`/`runInspect` write their own derived
 * `.md`/`.json` output straight through `atomicWriteJSON`/`atomicWriteText`
 * (see `src/intelligence/context.ts`, `recommend.ts`, `inspect.ts`), and
 * `recommendation list` / `next` only call the `read*Ledger` readers — none
 * of which the guard touches. 289-01/AC-2 is therefore provable by exercising the
 * commands themselves under the env var, which is what this file does.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'dist',
  'cli',
  'index.js',
);

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

function run(args: string[], cwd: string, envOverride?: Record<string, string>): Promise<RunResult> {
  return new Promise((resolve) => {
    const env = envOverride ? { ...process.env, ...envOverride } : process.env;
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd, env });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

const READ_ONLY = { CADENCE_READ_ONLY: '1' };

let active: Fixture | null = null;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('289-01/AC-2: the five investigation commands are unaffected under read-only mode', () => {
  it('289-01/AC-2: cadence context handoff succeeds unchanged and writes context/handoff.{json,md}', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-context' });

    const baseline = await run(['context', 'handoff'], active.root);
    expect(baseline.code).toBe(0);

    const ro = await run(['context', 'handoff'], active.root, READ_ONLY);
    expect(ro.code).toBe(0);
    expect(ro.stderr).toBe('');
    // Same rendered Markdown packet shape as the non-read-only run — strip
    // the `Generated at:` line first, since each invocation legitimately
    // stamps its own real-time timestamp (that is not a read-only-mode
    // effect; a fresh non-read-only run two calls apart would differ the
    // same way).
    const stripGeneratedAt = (s: string): string => s.replace(/^Generated at: .*$/m, 'Generated at: <stamp>');
    expect(stripGeneratedAt(ro.stdout)).toBe(stripGeneratedAt(baseline.stdout));

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'handoff.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).schemaVersion).toBe(1);
    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'handoff.md'),
      'utf8',
    );
    expect(md).toMatch(/# CADENCE Context Packet — handoff/);
  });

  it('289-01/AC-2: cadence recommend succeeds unchanged and writes recommend.json / RECOMMEND.md', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-recommend' });

    const ro = await run(['recommend'], active.root, READ_ONLY);
    expect(ro.code).toBe(0);
    expect(ro.stderr).toBe('');
    expect(ro.stdout).toMatch(/# CADENCE Recommended Next Moves/);

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'recommend.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).schemaVersion).toBe(1);
    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'RECOMMEND.md'),
      'utf8',
    );
    expect(md).toMatch(/# CADENCE Recommended Next Moves/);
  });

  it('289-01/AC-2: cadence inspect succeeds unchanged and writes inspection.json / STRATEGY.md', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-inspect' });

    const ro = await run(['inspect'], active.root, READ_ONLY);
    expect(ro.code).toBe(0);
    expect(ro.stderr).toBe('');
    expect(ro.stdout).toMatch(/# CADENCE Strategic Status/);

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'inspection.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).schemaVersion).toBe(1);
    const md = await readFile(
      join(active.root, '.cadence', 'intelligence', 'STRATEGY.md'),
      'utf8',
    );
    expect(md).toMatch(/## Flags/);
  });

  it('289-01/AC-2: cadence recommendation list succeeds unchanged and still shows a seeded recommendation', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-rec-list' });
    // Seed a recommendation while NOT read-only (seeding is not part of the
    // command under test — only the subsequent `list` invocation is).
    const add = await run(
      ['recommendation', 'add', '--title', 'seeded rec', '--summary', 's'],
      active.root,
    );
    expect(add.code).toBe(0);

    const ro = await run(['recommendation', 'list'], active.root, READ_ONLY);
    expect(ro.code).toBe(0);
    expect(ro.stderr).toBe('');
    expect(ro.stdout).toContain('seeded rec');

    const roJson = await run(
      ['recommendation', 'list', '--format', 'json'],
      active.root,
      READ_ONLY,
    );
    expect(roJson.code).toBe(0);
    const parsed = JSON.parse(roJson.stdout) as Array<{ title: string }>;
    expect(parsed.some((r) => r.title === 'seeded rec')).toBe(true);
  });

  it('289-01/AC-2: cadence next succeeds unchanged at IDLE', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-next' });

    const ro = await run(['next'], active.root, READ_ONLY);
    expect(ro.code).toBe(0);
    expect(ro.stderr).toBe('');
    expect(ro.stdout).toMatch(/^Position: IDLE$/m);

    const roJson = await run(['next', '--json'], active.root, READ_ONLY);
    expect(roJson.code).toBe(0);
    const parsed = JSON.parse(roJson.stdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.position).toBe('IDLE');
  });
});

describe('289-01/AC-1: every enumerated ledger-mutating subcommand refuses under read-only mode via a real CLI subprocess', () => {
  // read-only-guard.test.ts (T1) proves refusal by importing the store's
  // write functions directly — necessary for 289-01/AC-5, but not sufficient
  // for 289-01/AC-1's own wording: "it exits non-zero" is a claim about the
  // `cadence <command>` process, not about an in-process function call. The
  // whole-branch review's independent deep-verify pass (host-cli provider)
  // flagged this gap directly: "no CLI test exercises all listed mutating
  // subcommands." These tests close it — real subprocesses, one per
  // AC-1-enumerated subcommand, asserting non-zero exit, the guard's message
  // on stderr, and (where a pre-existing ledger file is involved) that its
  // content is byte-unchanged by the refused attempt.
  it('289-01/AC-1: decision add refuses and never creates decisions.json', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-ac1-decision-add' });

    const ro = await run(
      ['decision', 'add', '--title', 'blocked', '--rationale', 'x'],
      active.root,
      READ_ONLY,
    );
    expect(ro.code).not.toBe(0);
    expect(ro.stdout).toBe('');
    expect(ro.stderr).toContain('CADENCE_READ_ONLY is set');
    expect(ro.stderr).toContain('addIntelligenceDecision');

    await expect(
      readFile(join(active.root, '.cadence', 'intelligence', 'decisions.json'), 'utf8'),
    ).rejects.toThrow(/ENOENT/);
  });

  it('289-01/AC-1: decision supersede (a transition) refuses and leaves decisions.json byte-unchanged', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-ac1-decision-transition' });
    const seeded = await run(
      ['decision', 'add', '--title', 'use postgres', '--rationale', 'concurrency'],
      active.root,
    );
    const decId = seeded.stdout.match(/Added (dec-\S+):/)?.[1];
    expect(decId).toBeDefined();
    const before = await readFile(
      join(active.root, '.cadence', 'intelligence', 'decisions.json'),
      'utf8',
    );

    const ro = await run(['decision', 'supersede', decId as string], active.root, READ_ONLY);
    expect(ro.code).not.toBe(0);
    expect(ro.stderr).toContain('CADENCE_READ_ONLY is set');
    expect(ro.stderr).toContain('runDecisionTransition');

    const after = await readFile(
      join(active.root, '.cadence', 'intelligence', 'decisions.json'),
      'utf8',
    );
    expect(after).toBe(before);
  });

  it('289-01/AC-1: assumption add refuses and never creates assumptions.json', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-ac1-assumption-add' });
    const seededRec = await run(
      ['recommendation', 'add', '--title', 'rec one', '--summary', 's1'],
      active.root,
    );
    const recId = seededRec.stdout.match(/Added (rec-\S+):/)?.[1];
    expect(recId).toBeDefined();

    const ro = await run(
      ['assumption', 'add', '--rec', recId as string, '--text', 'blocked'],
      active.root,
      READ_ONLY,
    );
    expect(ro.code).not.toBe(0);
    expect(ro.stdout).toBe('');
    expect(ro.stderr).toContain('CADENCE_READ_ONLY is set');
    expect(ro.stderr).toContain('addAssumption');

    await expect(
      readFile(join(active.root, '.cadence', 'intelligence', 'assumptions.json'), 'utf8'),
    ).rejects.toThrow(/ENOENT/);
  });

  it('289-01/AC-1: assumption validate (a transition) refuses and leaves assumptions.json byte-unchanged', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-ac1-assumption-transition' });
    const seededRec = await run(
      ['recommendation', 'add', '--title', 'rec one', '--summary', 's1'],
      active.root,
    );
    const recId = seededRec.stdout.match(/Added (rec-\S+):/)?.[1];
    const seededAsm = await run(
      ['assumption', 'add', '--rec', recId as string, '--text', 'the db is postgres'],
      active.root,
    );
    const asmId = seededAsm.stdout.match(/Added (as-\S+):/)?.[1];
    expect(asmId).toBeDefined();
    const before = await readFile(
      join(active.root, '.cadence', 'intelligence', 'assumptions.json'),
      'utf8',
    );

    const ro = await run(['assumption', 'validate', asmId as string], active.root, READ_ONLY);
    expect(ro.code).not.toBe(0);
    expect(ro.stderr).toContain('CADENCE_READ_ONLY is set');
    expect(ro.stderr).toContain('runAssumptionTransition');

    const after = await readFile(
      join(active.root, '.cadence', 'intelligence', 'assumptions.json'),
      'utf8',
    );
    expect(after).toBe(before);
  });

  it('289-01/AC-1: milestone propose (a ledger write) refuses and never creates milestones.json', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-ac1-milestone' });

    const ro = await run(['milestone', 'propose'], active.root, READ_ONLY);
    expect(ro.code).not.toBe(0);
    expect(ro.stdout).toBe('');
    expect(ro.stderr).toContain('CADENCE_READ_ONLY is set');
    expect(ro.stderr).toContain('writeMilestoneLedger');

    await expect(
      readFile(join(active.root, '.cadence', 'intelligence', 'milestones.json'), 'utf8'),
    ).rejects.toThrow(/ENOENT/);
  });

  it('289-01/AC-1: intelligence reconcile refuses and never creates recommendations.json', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-ac1-reconcile' });

    const ro = await run(['intelligence', 'reconcile'], active.root, READ_ONLY);
    expect(ro.code).not.toBe(0);
    expect(ro.stdout).toBe('');
    expect(ro.stderr).toContain('CADENCE_READ_ONLY is set');
    expect(ro.stderr).toContain('runIntelligenceReconcile');

    await expect(
      readFile(join(active.root, '.cadence', 'intelligence', 'recommendations.json'), 'utf8'),
    ).rejects.toThrow(/ENOENT/);
  });

  it('289-01/AC-1: recommendation add (a recommendation ledger-affecting subcommand) refuses and never creates recommendations.json', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-ac1-rec-add' });

    const ro = await run(
      ['recommendation', 'add', '--title', 'blocked', '--summary', 's'],
      active.root,
      READ_ONLY,
    );
    expect(ro.code).not.toBe(0);
    expect(ro.stdout).toBe('');
    expect(ro.stderr).toContain('CADENCE_READ_ONLY is set');
    expect(ro.stderr).toContain('writeIntelligenceLedgers');

    await expect(
      readFile(join(active.root, '.cadence', 'intelligence', 'recommendations.json'), 'utf8'),
    ).rejects.toThrow(/ENOENT/);
  });
});

describe('289-01/AC-3: behavior with CADENCE_READ_ONLY unset is byte-identical to pre-change', () => {
  // The strongest proof of 289-01/AC-3 is that the whole pre-existing test suite
  // for these packages (none of which ever set CADENCE_READ_ONLY) is still
  // 100% green after T1's guard was wired in — see this task's verify step
  // (`pnpm --filter @thomas-powers-jr/cadence-core test`), which re-confirms
  // that unmodified. The assertions below are an additional, explicit
  // sanity check pinned to a handful of representative commands: two
  // ledger-mutating commands that now sit behind the guard
  // (`decision add`, `recommendation add`) and one read-only command
  // (`recommendation list`), each run twice back-to-back with the env var
  // explicitly unset and asserted to produce identical exit code / stdout
  // shape both times — i.e. the guard is a total no-op on the unset path.
  it('289-01/AC-3: decision add succeeds identically on repeated invocations with CADENCE_READ_ONLY unset', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-inactive-decision' });
    vi.stubEnv('CADENCE_READ_ONLY', undefined);

    const first = await run(
      ['decision', 'add', '--title', 'use postgres', '--rationale', 'concurrency'],
      active.root,
    );
    expect(first.code).toBe(0);
    expect(first.stderr).toBe('');
    expect(first.stdout).toMatch(/^Added dec-.*: use postgres$/m);

    const second = await run(
      ['decision', 'add', '--title', 'use redis', '--rationale', 'caching'],
      active.root,
    );
    expect(second.code).toBe(0);
    expect(second.stderr).toBe('');
    expect(second.stdout).toMatch(/^Added dec-.*: use redis$/m);

    const listed = await run(['decision', 'list', '--format', 'json'], active.root);
    expect(listed.code).toBe(0);
    const decisions = JSON.parse(listed.stdout) as Array<{ title: string }>;
    expect(decisions.map((d) => d.title).sort()).toEqual(['use postgres', 'use redis']);
  });

  it('289-01/AC-3: recommendation add succeeds identically on repeated invocations with CADENCE_READ_ONLY unset', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-inactive-rec-add' });
    vi.stubEnv('CADENCE_READ_ONLY', undefined);

    const first = await run(
      ['recommendation', 'add', '--title', 'rec one', '--summary', 's1'],
      active.root,
    );
    expect(first.code).toBe(0);
    expect(first.stderr).toBe('');
    expect(first.stdout).toMatch(/^Added rec-.*: rec one$/m);

    const second = await run(
      ['recommendation', 'add', '--title', 'rec two', '--summary', 's2'],
      active.root,
    );
    expect(second.code).toBe(0);
    expect(second.stderr).toBe('');
    expect(second.stdout).toMatch(/^Added rec-.*: rec two$/m);

    const listed = await run(['recommendation', 'list', '--format', 'json'], active.root);
    expect(listed.code).toBe(0);
    const recs = JSON.parse(listed.stdout) as Array<{ title: string }>;
    expect(recs.map((r) => r.title).sort()).toEqual(['rec one', 'rec two']);
  });

  it('289-01/AC-3: recommendation list (a never-guarded reader) is unaffected by the guard being wired in elsewhere', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-inactive-list' });
    vi.stubEnv('CADENCE_READ_ONLY', undefined);
    await run(['recommendation', 'add', '--title', 'stable rec', '--summary', 's'], active.root);

    const first = await run(['recommendation', 'list'], active.root);
    const second = await run(['recommendation', 'list'], active.root);
    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(first.stdout).toBe(second.stdout);
    expect(first.stdout).toContain('stable rec');
  });

  // The four tests below cover, with CADENCE_READ_ONLY unset, the remaining
  // 289-01/AC-1-enumerated subcommands not already exercised above
  // (decision add, recommendation add) — a decision transition, an
  // assumption add + its transition, a milestone ledger write, and
  // reconcile — closing the same completeness gap the deep-verify pass
  // flagged for AC-1 (a selected subset of commands isn't every command).
  it('289-01/AC-3: decision supersede (a transition) succeeds with CADENCE_READ_ONLY unset', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-inactive-decision-transition' });
    vi.stubEnv('CADENCE_READ_ONLY', undefined);
    const seeded = await run(
      ['decision', 'add', '--title', 'use postgres', '--rationale', 'concurrency'],
      active.root,
    );
    const decId = seeded.stdout.match(/Added (dec-\S+):/)?.[1];
    expect(decId).toBeDefined();

    const res = await run(['decision', 'supersede', decId as string], active.root);
    expect(res.code).toBe(0);
    expect(res.stderr).toBe('');

    const shown = await run(['decision', 'show', decId as string], active.root);
    expect(shown.stdout).toContain('superseded');
  });

  it('289-01/AC-3: assumption add and assumption validate (a transition) succeed with CADENCE_READ_ONLY unset', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-inactive-assumption' });
    vi.stubEnv('CADENCE_READ_ONLY', undefined);
    const seededRec = await run(
      ['recommendation', 'add', '--title', 'rec one', '--summary', 's1'],
      active.root,
    );
    const recId = seededRec.stdout.match(/Added (rec-\S+):/)?.[1];
    expect(recId).toBeDefined();

    const added = await run(
      ['assumption', 'add', '--rec', recId as string, '--text', 'the db is postgres'],
      active.root,
    );
    expect(added.code).toBe(0);
    expect(added.stdout).toMatch(/^Added as-.*: the db is postgres$/m);
    const asmId = added.stdout.match(/Added (as-\S+):/)?.[1];
    expect(asmId).toBeDefined();

    const validated = await run(['assumption', 'validate', asmId as string], active.root);
    expect(validated.code).toBe(0);
    expect(validated.stderr).toBe('');

    const shown = await run(['assumption', 'show', asmId as string], active.root);
    expect(shown.stdout).toContain('validated');
  });

  it('289-01/AC-3: milestone propose (a ledger write) succeeds with CADENCE_READ_ONLY unset', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-inactive-milestone' });
    vi.stubEnv('CADENCE_READ_ONLY', undefined);

    const res = await run(['milestone', 'propose'], active.root);
    expect(res.code).toBe(0);
    expect(res.stderr).toBe('');

    const jsonRaw = await readFile(
      join(active.root, '.cadence', 'intelligence', 'milestones.json'),
      'utf8',
    );
    expect(JSON.parse(jsonRaw).schemaVersion).toBeDefined();
  });

  it('289-01/AC-3: intelligence reconcile succeeds with CADENCE_READ_ONLY unset', async () => {
    active = await tempRepo({ initialized: true, projectName: 'ro-inactive-reconcile' });
    vi.stubEnv('CADENCE_READ_ONLY', undefined);
    await run(['recommendation', 'add', '--title', 'rec one', '--summary', 's1'], active.root);

    const res = await run(['intelligence', 'reconcile'], active.root);
    expect(res.code).toBe(0);
    expect(res.stderr).toBe('');
    expect(res.stdout).toMatch(/^Reconciled \d+ recommendations/m);
  });
});
