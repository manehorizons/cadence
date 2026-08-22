import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

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

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

/**
 * Phase 288 (288-01, T3): a genuinely-empty-AC draft — the `## Acceptance
 * Criteria` and `## Tasks` sections parse cleanly to zero blocks each (no
 * malformed heading — that's T1's separate failure mode). Hand-written
 * directly to `.cadence/phases/**` (mirrors `soft-cap.test.ts`/
 * `settle-anomaly.test.ts`'s `seedDraft` idiom) rather than going through
 * `draft new`, since every template seeds a placeholder AC-1.
 */
async function seedZeroAcDraft(root: string): Promise<void> {
  const phaseDir = join(root, '.cadence/phases/01-foundation');
  await mkdir(phaseDir, { recursive: true });
  const body =
    `---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: PENDING\n---\n\n` +
    `# 01-01 — Demo\n\n` +
    `## Objective\n\nDemo.\n\n` +
    `## Acceptance Criteria\n\n` +
    `## Tasks\n\n` +
    `## Boundaries\n\n- _(none)_\n`;
  await writeFile(join(phaseDir, '01-01-DRAFT.md'), body);
}

describe('cadence settle run --auto — genuinely-empty AC set (288-01 T3)', () => {
  it('288-01/AC-4: settle names the empty AC set explicitly instead of a silent vacuous pass', async () => {
    active = await tempRepo({ initialized: true });
    await seedZeroAcDraft(active.root);
    const approve = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    expect(approve.code).toBe(0);

    const r = await run(['settle', 'run', '--auto'], active.root);
    expect(r.code).toBe(0);
    // The explicit, named notice — distinct from a generic assurance grade.
    expect(r.stderr).toMatch(/zero acceptance criteria/i);
    expect(r.stderr).toMatch(/nothing.*can be verified/i);

    const summaryPath = join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json');
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    expect(summary.acResults).toEqual([]);
  });

  it('negative control: a normal (non-empty-AC) settle never prints the zero-AC notice', async () => {
    active = await tempRepo({ initialized: true });
    const draftPath = join(active.root, '.cadence/phases/01-foundation');
    await mkdir(draftPath, { recursive: true });
    const body =
      `---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: PENDING\n---\n\n` +
      `# 01-01 — Demo\n\n` +
      `## Objective\n\nDemo.\n\n` +
      `## Acceptance Criteria\n\n` +
      `### AC-1: Works\nGiven a\nWhen b\nThen c\n\n` +
      `## Tasks\n\n` +
      `## Boundaries\n\n- _(none)_\n`;
    await writeFile(join(draftPath, '01-01-DRAFT.md'), body);
    const approve = await run(['draft', 'approve', '01-foundation', '01'], active.root);
    expect(approve.code).toBe(0);

    const r = await run(['settle', 'run', '--auto', '--ac', 'AC-1', '--allow-missing-coverage'], active.root);
    expect(r.stderr).not.toMatch(/zero acceptance criteria/i);
  });
});
