import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
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

async function snapshotDir(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const entries = await readdir(dir);
    for (const name of entries) {
      const full = join(dir, name);
      try {
        const txt = await readFile(full, 'utf8');
        out.set(name, txt);
      } catch {
        /* skip */
      }
    }
  } catch {
    /* missing */
  }
  return out;
}

describe('cadence intelligence audit (Slice 19)', () => {
  it('AC-10: clean workspace → exit 0, stdout `Audit clean: no integrity issues.`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice19' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    const r = await run(['intelligence', 'audit'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('Audit clean: no integrity issues.\n');
  });

  it('AC-11: findings present → exit 1, stdout has findings sections', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice19' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    // Manually plant an orphan assumption pointing at a missing rec
    const asPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const asJson = JSON.parse(await readFile(asPath, 'utf8'));
    asJson.assumptions.push({
      id: 'as-orphan-001',
      recommendationId: 'rec-missing',
      text: 'orphan',
      status: 'open',
      createdAt: '2026-05-20T00:00:00.000Z',
    });
    await writeFile(asPath, JSON.stringify(asJson));
    const r = await run(['intelligence', 'audit'], active.root);
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/Found 1 integrity issue/);
    expect(r.stdout).toMatch(/## Orphan Assumptions \(1\)/);
    expect(r.stdout).toMatch(/as-orphan-001 references missing rec: rec-missing/);
    expect(r.stdout).toMatch(/## Remediation/);
  });

  it('AC-12: --quiet with findings → exit 0, same stdout', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice19' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    const asPath = join(active.root, '.cadence/intelligence/assumptions.json');
    const asJson = JSON.parse(await readFile(asPath, 'utf8'));
    asJson.assumptions.push({
      id: 'as-orphan-001',
      recommendationId: 'rec-missing',
      text: 'orphan',
      status: 'open',
      createdAt: '2026-05-20T00:00:00.000Z',
    });
    await writeFile(asPath, JSON.stringify(asJson));
    const r = await run(['intelligence', 'audit', '--quiet'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Found 1 integrity issue/);
  });

  it('AC-13: empty workspace → exit 0, `No intelligence ledgers present.`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice19' });
    const r = await run(['intelligence', 'audit'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No intelligence ledgers present.\n');
  });

  it('AC-15: strict read-only — `.cadence/intelligence/` byte-equal before and after', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice19' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    const dir = join(active.root, '.cadence', 'intelligence');
    const before = await snapshotDir(dir);
    await run(['intelligence', 'audit'], active.root);
    const after = await snapshotDir(dir);
    expect(after.size).toBe(before.size);
    for (const [name, content] of before.entries()) {
      expect(after.get(name)).toBe(content);
    }
  });
});
