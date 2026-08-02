import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
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

/**
 * Phase 214 (T4): relax gates.evidenceFloor to 'unverified' for fixtures in
 * this file that deliberately have no real AC coverage (they're testing the
 * test-coverage gate's own bypass/skip behavior, not evidence-floor) —
 * without this, defaultConfig's schema-level 'mention' floor would newly
 * refuse them since 'unverified' evidence never meets 'mention'.
 */
async function relaxEvidenceFloor(root: string): Promise<void> {
  const configPath = join(root, '.cadence', 'config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.gates = { ...(config.gates ?? {}), evidenceFloor: 'unverified' };
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

async function seedCoverageTest(
  root: string,
  acIds: string[],
  filename = 'packages/core/tests/foo.test.ts',
): Promise<void> {
  const abs = join(root, filename);
  await mkdir(dirname(abs), { recursive: true });
  const body =
    acIds
      .map((id) => `it('${id} coverage fixture', () => { expect(true).toBe(true); });`)
      .join('\n') + '\n';
  await writeFile(abs, body, 'utf8');
}

// AC-2: gate fires under standard/auto-standard profiles and refuses on
// uncovered ACs. AC-3: gate is skipped under auto × quick-fix.
// AC-4: scanner config overridability is covered upstream in
// packages/types/tests/config.test.ts (verification.testGlobs Zod tests).
// AC-5: explicit --ac overrides are respected even when the gate is on.
// AC-6: this whole file is the dogfood proof for Phase 14 — if it runs
// green AND each AC has at least one referencing test, settle will pass.

describe('settle test-coverage gate (Phase 14)', () => {
  it('refuses when --auto runs with uncovered ACs (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    const r = await run(['settle', 'run', '--auto'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/coverage:\s*AC-1\s*has no linked test/);
    expect(r.stderr).toMatch(/--allow-missing-coverage/);
    // Refused settle now persists a SUMMARY with the refusing gate's
    // provenance (phase 170), where previously nothing was written.
    const summaryJsonPath = join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json');
    expect(existsSync(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.md'))).toBe(true);
    expect(existsSync(summaryJsonPath)).toBe(true);
    const summary = JSON.parse(await readFile(summaryJsonPath, 'utf8'));
    expect(summary.gates[summary.gates.length - 1]).toMatchObject({
      gate: 'test-coverage',
      status: 'refused',
    });
  });

  it('passes when each AC has a linked test (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedCoverageTest(active.root, ['AC-1']);
    const r = await run(['settle', 'run', '--auto'], active.root);
    expect(r.code).toBe(0);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.acResults[0]).toEqual({ id: 'AC-1', pass: true, evidence: 'assertion' });
    expect(summary.gateBypasses).toBeUndefined();
  });

  it('explicit --ac override bypasses the gate for that AC (AC-5)', async () => {
    active = await tempRepo({ initialized: true });
    await relaxEvidenceFloor(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    // No test files seeded; rely on explicit override for AC-1.
    const r = await run(
      ['settle', 'run', '--auto', '--ac', 'AC-1=pass:manual'],
      active.root,
    );
    expect(r.code).toBe(0);
  });

  it('--allow-missing-coverage bypasses the gate entirely (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    await relaxEvidenceFloor(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/settle bypass \[warn\] test-coverage:/);
    expect(r.stderr).not.toMatch(/coverage:\s*AC-/);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.gateBypasses).toEqual([
      expect.objectContaining({
        gate: 'test-coverage',
        flag: '--allow-missing-coverage',
        severity: 'warn',
      }),
    ]);
  });

  it('gate is skipped under auto × quick-fix profile/tier (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await relaxEvidenceFloor(active.root);
    // Force quick-fix tier in the DRAFT — auto × quick-fix excludes test-coverage.
    await run(
      ['draft', 'new', '01-foundation', '01', '--title=Demo', '--tier=quick-fix'],
      active.root,
    );
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    const r = await run(['settle', 'run', '--auto'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/coverage:/);
  });
});
