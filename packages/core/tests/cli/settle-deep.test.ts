import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';

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

async function seedCoverageTest(
  root: string,
  acIds: string[],
  filename = 'packages/core/tests/foo.test.ts',
): Promise<void> {
  const abs = join(root, filename);
  await mkdir(dirname(abs), { recursive: true });
  const body =
    `// Coverage fixture for ${acIds.join(', ')}\n` +
    acIds.map((id) => `// covers ${id}`).join('\n') +
    '\n';
  await writeFile(abs, body, 'utf8');
}

// AC-3: --deep fires verifier and records SUMMARY.deepVerify per AC; refuses on fail
// AC-3: when 'deep-verify' is in the gate set, --deep auto-enabled
// AC-4: explicit --ac overrides win over --deep refusal
// AC-5: --allow-verifier-failure on transport failure path (covered via factory mock fallback)

describe('settle --deep (Phase 15)', () => {
  it('records deepVerify in SUMMARY when --deep is set + ACs covered (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedCoverageTest(active.root, ['AC-1']);
    const r = await run(['settle', 'run', '--auto', '--deep'], active.root);
    expect(r.code).toBe(0);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.deepVerify).toBeDefined();
    expect(summary.deepVerify['AC-1']).toMatchObject({
      pass: true,
      provider: 'mock',
    });
    expect(summary.deepVerify['AC-1'].reason).toMatch(/linked test/);
  });

  it('refuses with stderr when verifier marks AC fail (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    // No test files seeded; mock verifier marks every AC as fail (no linked test).
    // BUT the coverage gate fires first under default profile. So bypass with --allow-missing-coverage.
    const r = await run(
      ['settle', 'run', '--auto', '--deep', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/deep-verify:\s*AC-1\s*failed/);
    expect(r.stderr).toMatch(/no linked test found/);
  });

  it('explicit --ac override bypasses deep-verify refusal (AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    // No coverage, no test refs — mock would fail AC-1, but explicit override wins.
    const r = await run(
      [
        'settle',
        'run',
        '--auto',
        '--deep',
        '--allow-missing-coverage',
        '--ac',
        'AC-1=pass:manual',
      ],
      active.root,
    );
    expect(r.code).toBe(0);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    // Override wins in acResults; deepVerify still records mock's verdict for AC-1.
    expect(summary.acResults[0]).toMatchObject({ id: 'AC-1', pass: true, note: 'manual' });
    expect(summary.deepVerify['AC-1']).toMatchObject({ pass: false });
  });

  it('--force bypasses deep-verify refusal (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    const r = await run(
      ['settle', 'run', '--auto', '--deep', '--allow-missing-coverage', '--force'],
      active.root,
    );
    expect(r.code).toBe(0);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.deepVerify['AC-1'].pass).toBe(false);
  });

  it('does not run verifier when --deep is absent and deep-verify not in gate set (AC-3)', async () => {
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
    expect(summary.deepVerify).toBeUndefined();
  });
});
