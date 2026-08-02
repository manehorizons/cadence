/**
 * Phase 39.1 AC-7: bit-identical transcript anchor for the gate extraction.
 *
 * Tasks 1-4 extracted the test-coverage gate and the deep-verify gate out of
 * settle.ts into gates/coverage.ts + gates/deep-verify.ts. The extraction is
 * meant to be byte-identical to the inlined code it replaced. This file locks
 * the externally-observable refusal transcripts so future gate phases cannot
 * silently drift them.
 *
 * Existing coverage (do NOT duplicate):
 *   - packages/core/tests/cli/settle-coverage.test.ts — full AC-2/3/5 matrix
 *     for the coverage-gate refusal path (toMatch assertions).
 *   - packages/core/tests/cli/settle-deep.test.ts — full AC-3/4 matrix
 *     for the deep-verify refusal path (toMatch assertions).
 *
 * This file adds two NAMED SNAPSHOT ANCHORS (one per gate) referencing AC-7.
 * A snapshot locks the full stderr string, not just a substring, so any
 * future wording change in coverage.ts or deep-verify.ts will fail here.
 * The accompanying toContain call makes the snapshot's meaning self-evident.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
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

function run(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], {
      cwd,
      env: { ...process.env, ANTHROPIC_API_KEY: '' }, // force mock-fallback path
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('Phase 39.1 AC-7: bit-identical gate refusal transcripts', () => {
  /**
   * AC-7 anchor — coverage gate refusal transcript.
   *
   * Locks the full stderr emitted by gates/coverage.ts when an AC has no
   * linked test. Any wording change in coverage.ts will fail this snapshot.
   * The toContain assertion makes the snapshot's meaning self-evident.
   */
  it('coverage gate: refusal stderr is bit-identical after extraction (AC-7)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    // No test files seeded → coverage gate fires on AC-1.
    const r = await run(['settle', 'run', '--auto'], active.root);
    expect(r.code).toBe(1);
    // Self-evident key line (Phase 139: assertion-mode wording is now the
    // default; the build-test-must-pass notice fires first since no
    // testCommand is configured). Phase 166 (T3, AC-3) split this refusal
    // into a glob-miss vs. span-miss cause; no test files are seeded here,
    // so the glob-miss variant fires.
    expect(r.stderr).toContain('coverage: AC-1 has no linked test');
    expect(r.stderr).toContain(
      'settle run refused (assertion mode): no test files matched configured globs for AC-1',
    );
    // Snapshot locks the full transcript (bit-identical anchor):
    expect(r.stderr).toMatchSnapshot();
  });

  /**
   * AC-7 anchor — deep-verify gate refusal transcript.
   *
   * Locks the full stderr emitted by gates/deep-verify.ts when the mock
   * verifier rejects an AC. Coverage gate is bypassed via
   * --allow-missing-coverage so the deep path is reached.
   * Any wording change in deep-verify.ts will fail this snapshot.
   */
  it('deep-verify gate: refusal stderr is bit-identical after extraction (AC-7)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    // No test files seeded; mock verifier rejects AC-1. Coverage gate bypassed
    // so the deep gate is the one that refuses.
    const r = await run(
      ['settle', 'run', '--auto', '--deep', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(1);
    // Self-evident key line:
    expect(r.stderr).toContain('deep-verify: AC-1 failed');
    expect(r.stderr).toContain('settle run --deep refused');
    // Snapshot locks the full transcript (bit-identical anchor):
    expect(r.stderr).toMatchSnapshot();
  });
});
