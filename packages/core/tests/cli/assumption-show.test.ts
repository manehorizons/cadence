import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { addRecommendation } from '../../src/intelligence/store/recommendations.js';
import { addAssumption } from '../../src/intelligence/store/assumptions.js';

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

describe('cadence assumption show (Slice 16)', () => {
  it('AC-7: existing assumption tied to rec → exit 0, header + status + recommendation cross-ref + recorded', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice16' });
    const rec = await addRecommendation(active.root, {
      title: 'do thing', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const a = await addAssumption(active.root, { recommendationId: rec.id, text: 'an A' });
    const r = await run(['assumption', 'show', a.id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`# ${a.id} — an A`);
    expect(r.stdout).toMatch(/- status: open/);
    expect(r.stdout).toContain(`- recommendation: ${rec.id} — do thing`);
    expect(r.stdout).toMatch(/- recorded: /);
  });

  it('AC-8: unknown id → exit 1, stderr `assumption <id> not found`, no stdout', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice16' });
    const r = await run(['assumption', 'show', 'as-bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe('assumption as-bogus not found\n');
    expect(r.stdout).toBe('');
  });

  it('AC-12: strict read-only — `.cadence/intelligence/` byte-equal before and after', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice16' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const a = await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    const dir = join(active.root, '.cadence', 'intelligence');
    const before = await snapshotDir(dir);
    await run(['assumption', 'show', a.id], active.root);
    const after = await snapshotDir(dir);
    expect(after.size).toBe(before.size);
    for (const [name, content] of before.entries()) {
      expect(after.get(name)).toBe(content);
    }
  });

  it('AC-3: --format json → envelope { assumption, recommendation }', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const rec = await addRecommendation(active.root, {
      title: 'do thing', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const a = await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    const r = await run(['assumption', 'show', a.id, '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.assumption.id).toBe(a.id);
    expect(env.recommendation.id).toBe(rec.id);
  });

  it('AC-3: --format json with tied-but-missing rec → recommendation: null', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const a = await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    // Manually delete the rec from JSON to simulate orphan
    const recPath = join(active.root, '.cadence/intelligence/recommendations.json');
    const { readFile, writeFile } = await import('node:fs/promises');
    const recJson = JSON.parse(await readFile(recPath, 'utf8'));
    recJson.recommendations = [];
    await writeFile(recPath, JSON.stringify(recJson));
    const r = await run(['assumption', 'show', a.id, '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.assumption.id).toBe(a.id);
    expect(env.recommendation).toBeNull();
  });

  it('AC-8: invalid --format → exit 1 + stderr', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const a = await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    const r = await run(['assumption', 'show', a.id, '--format', 'bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/unsupported format: bogus/);
  });

  it('missing <id> arg → commander usage error', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice16' });
    const r = await run(['assumption', 'show'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/missing required argument/i);
  });
});
