import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import {
  addAssumption,
  addRecommendation,
} from '../../src/intelligence/store.js';

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'dist', 'cli', 'index.js',
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

describe('cadence intelligence reconcile (Slice 17)', () => {
  it('AC-7: populated workspace → exit 0, stdout reports counts + updated files', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice17' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A1' });
    const r = await run(['intelligence', 'reconcile'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Reconciled 1 recommendations, 1 assumptions, 0 decisions\./);
    expect(r.stdout).toMatch(/Updated: recommendations\.json, RECOMMENDATIONS\.md, ASSUMPTIONS\.md, DECISIONS\.md\./);
  });

  it('AC-8: empty workspace → exit 0, stdout `No intelligence ledgers present.`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice17' });
    const r = await run(['intelligence', 'reconcile'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No intelligence ledgers present.\n');
  });
});
