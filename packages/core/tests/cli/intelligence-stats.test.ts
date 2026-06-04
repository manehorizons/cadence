import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { addRecommendation } from '../../src/intelligence/store/recommendations.js';
import { addAssumption } from '../../src/intelligence/store/assumptions.js';
import { addIntelligenceDecision } from '../../src/intelligence/store/decisions.js';

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

describe('cadence intelligence stats (Slice 18)', () => {
  it('AC-8: populated workspace aggregate mode → exit 0, all 5 sections', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice18' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    await addIntelligenceDecision(active.root, {
      recommendationId: rec.id, title: 'D', rationale: 'r',
    });
    const r = await run(['intelligence', 'stats'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/# CADENCE Intelligence Stats/);
    expect(r.stdout).toMatch(/## Recommendations \(1\)/);
    expect(r.stdout).toMatch(/## Evidence \(0\)/);
    expect(r.stdout).toMatch(/## Assumptions \(1\)/);
    expect(r.stdout).toMatch(/## Decisions \(1\)/);
    expect(r.stdout).toMatch(/## Links/);
  });

  it('AC-9: --by-rec → exit 0, markdown table with one row per rec', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice18' });
    const rec = await addRecommendation(active.root, {
      title: 'do thing', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    const r = await run(['intelligence', 'stats', '--by-rec'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/# CADENCE Intelligence Stats — Per Rec/);
    expect(r.stdout).toMatch(/\| Rec \| Status \|/);
    expect(r.stdout).toMatch(new RegExp(`\\| ${rec.id} — do thing \\| candidate \\| 1 \\|`));
  });

  it('AC-10: empty workspace → exit 0, `No intelligence ledgers present.`', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice18' });
    const r = await run(['intelligence', 'stats'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('No intelligence ledgers present.\n');
  });

  it('AC-5: --format json populated → exit 0, JSON parses to IntelligenceStats shape', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    const r = await run(['intelligence', 'stats', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const stats = JSON.parse(r.stdout);
    expect(stats.recommendations.total).toBe(1);
    expect(stats.assumptions.total).toBe(1);
    expect(stats.assumptions.byStatus.open).toBe(1);
    expect(stats.links.brokenAssumptionLinks).toBe(0);
    expect(stats.perRec).toHaveLength(1);
  });

  it('AC-5: --format json empty workspace → JSON null', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const r = await run(['intelligence', 'stats', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toBeNull();
  });

  it('AC-8: invalid --format → exit 1 + stderr', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const r = await run(['intelligence', 'stats', '--format', 'xml'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/unsupported format: xml/);
  });

  it('AC-12: strict read-only — `.cadence/intelligence/` byte-equal before and after', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice18' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    const dir = join(active.root, '.cadence', 'intelligence');
    const before = await snapshotDir(dir);
    await run(['intelligence', 'stats'], active.root);
    const after = await snapshotDir(dir);
    expect(after.size).toBe(before.size);
    for (const [name, content] of before.entries()) {
      expect(after.get(name)).toBe(content);
    }
  });
});
