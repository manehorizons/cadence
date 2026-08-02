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
  promptScript?: string,
  extraEnv?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ANTHROPIC_API_KEY: '', // keep mock-fallback path for any deep code path
      ...extraEnv,
    };
    if (promptScript !== undefined) {
      env.CADENCE_PROMPTER_SCRIPT = promptScript;
    } else {
      delete env.CADENCE_PROMPTER_SCRIPT;
    }
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd, env });
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
    acIds
      .map((id) => `it('${id} coverage fixture', () => { expect(true).toBe(true); });`)
      .join('\n') + '\n';
  await writeFile(abs, body, 'utf8');
}

// AC-3: --interactive fires walker, records interactiveVerify, refuses on fail
// AC-3: explicit --ac overrides win even when interactive
// AC-4: gate auto-enables walker (would require strict-profile test; covered indirectly)
// AC-5: non-TTY refusal when prompter is needed and no script seam set
// AC-5: --no-interactive bypasses the gate

describe('settle --interactive (Phase 16)', () => {
  it('records interactiveVerify when user verdicts pass (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedCoverageTest(active.root, ['AC-1']);
    // Script: "pass" verdict for AC-1, then empty note
    const r = await run(
      ['settle', 'run', '--auto', '--interactive'],
      active.root,
      'pass\n\n',
    );
    expect(r.code).toBe(0);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.interactiveVerify['AC-1']).toEqual({ verdict: 'pass' });
    expect(summary.acResults[0]).toEqual({ id: 'AC-1', pass: true, evidence: 'assertion' });
  });

  it('refuses with stderr when user verdicts fail (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedCoverageTest(active.root, ['AC-1']);
    const r = await run(
      ['settle', 'run', '--auto', '--interactive'],
      active.root,
      'fail\nbroken\n',
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/interactive:\s*AC-1\s*fail.*broken/);
    // Refused settle now persists a SUMMARY with the refusing gate's
    // provenance (phase 170), where previously nothing was written.
    const summaryJsonPath = join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json');
    expect(existsSync(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.md'))).toBe(true);
    const summary = JSON.parse(await readFile(summaryJsonPath, 'utf8'));
    expect(summary.gates[summary.gates.length - 1]).toMatchObject({
      gate: 'interactive-verdict',
      status: 'refused',
    });
  });

  it('--force bypasses interactive refusal (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedCoverageTest(active.root, ['AC-1']);
    const r = await run(
      ['settle', 'run', '--auto', '--interactive', '--force'],
      active.root,
      'fail\nrejected by reviewer\n',
    );
    expect(r.code).toBe(0);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.acResults[0]).toMatchObject({
      id: 'AC-1',
      pass: false,
      note: 'rejected by reviewer',
    });
  });

  it('skip falls through to other gates (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedCoverageTest(active.root, ['AC-1']);
    // Skip → AC-1 falls through; structural says DONE → pass
    const r = await run(
      ['settle', 'run', '--auto', '--interactive'],
      active.root,
      'skip\n',
    );
    expect(r.code).toBe(0);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.interactiveVerify).toEqual({}); // skipped AC omitted
    expect(summary.acResults[0]).toEqual({ id: 'AC-1', pass: true, evidence: 'assertion' }); // structural pass
  });

  it('249-01/AC-3: T4 (Phase 29.8) skip without --auto still falls through to structural derivation and refuses an incomplete AC — refused SUMMARY records gates provenance + empty acResults (byte-identical refusal behavior otherwise)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    // NOTE: T1 deliberately left PENDING (not built).
    const r = await run(
      ['settle', 'run', '--interactive', '--allow-missing-coverage'],
      active.root,
      'skip\n',
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/AC-1/);
    // Phase 249: --interactive (without --auto) still sets
    // interactiveRequested unconditionally and refuses at the same
    // AC-derivation call site as the --auto BLOCKED-task case — same
    // family, now routed through writeRefusedSettleSummary, so a SUMMARY is
    // written, not withheld.
    const summaryJsonPath = join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json');
    expect(
      existsSync(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.md')),
    ).toBe(true);
    const summary = JSON.parse(await readFile(summaryJsonPath, 'utf8'));
    expect(summary.acResults).toEqual([]);
    expect(Array.isArray(summary.gates)).toBe(true);
    expect(summary.gates.length).toBeGreaterThan(0);
    expect(
      summary.gates.every((g: { status: string }) => g.status === 'ran' || g.status === 'skipped'),
    ).toBe(true);
    // This SUMMARY reflects THIS refusal's draft/progress, not a stale
    // artifact — draftId matches, and T1 (never built, no PROGRESS.json
    // entry) round-trips through buildTaskResults' no-record fallback.
    expect(summary.draftId).toBe('01-01');
    expect(summary.taskResults).toEqual([{ id: 'T1', status: 'BLOCKED', notes: '' }]);
  });

  it('T4 (Phase 29.8): --force still escapes the skip→structural refusal', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    const r = await run(
      ['settle', 'run', '--interactive', '--allow-missing-coverage', '--force'],
      active.root,
      'skip\n',
    );
    expect(r.code).toBe(0);
    expect(
      existsSync(join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json')),
    ).toBe(true);
  });

  it('explicit --ac override wins over interactive verdict (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedCoverageTest(active.root, ['AC-1']);
    // User says fail, but explicit --ac pass wins.
    const r = await run(
      [
        'settle',
        'run',
        '--auto',
        '--interactive',
        '--ac',
        'AC-1=pass:explicit-override',
      ],
      active.root,
      'fail\nuser-disagrees\n',
    );
    expect(r.code).toBe(0);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.acResults[0]).toEqual({
      id: 'AC-1',
      pass: true,
      note: 'explicit-override',
      evidence: 'assertion',
    });
  });

  // Phase 116 AC-4: a non-TTY interactive settle now skips the walker and passes,
  // recording a skipped marker in the SUMMARY (was: refuses, pre-116).
  it('Phase 116 AC-4: non-TTY auto-skips the interactive walker, passes, and marks the SUMMARY', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedCoverageTest(active.root, ['AC-1']);
    // No promptScript arg → non-TTY. Pre-116 this refused; now it auto-bypasses.
    const r = await run(['settle', 'run', '--auto', '--interactive'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/non-TTY; interactive-verdict walker skipped/);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.interactiveVerifySkipped).toBe('non-tty');
    expect(summary.interactiveVerify).toBeUndefined();
    // The other gates still decide: structural DONE → AC-1 passes.
    expect(summary.acResults[0]).toEqual({ id: 'AC-1', pass: true, evidence: 'assertion' });
  });

  // Phase 116 AC-5: CADENCE_REQUIRE_TTY=1 restores the pre-116 non-TTY refusal.
  it('Phase 116 AC-5: CADENCE_REQUIRE_TTY=1 still refuses in a non-TTY', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedCoverageTest(active.root, ['AC-1']);
    const r = await run(['settle', 'run', '--auto', '--interactive'], active.root, undefined, {
      CADENCE_REQUIRE_TTY: '1',
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/interactive:.*TTY/);
  });

  it('--no-interactive bypasses the gate (AC-5)', async () => {
    active = await tempRepo({ initialized: true });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedCoverageTest(active.root, ['AC-1']);
    const r = await run(
      ['settle', 'run', '--auto', '--no-interactive'],
      active.root,
    );
    expect(r.code).toBe(0);
    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    );
    expect(summary.interactiveVerify).toBeUndefined();
  });
});
