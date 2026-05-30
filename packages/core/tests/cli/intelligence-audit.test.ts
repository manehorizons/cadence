import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
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

  it('AC-6: --format json clean populated → JSON report with empty findings array', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    const r = await run(['intelligence', 'audit', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const report = JSON.parse(r.stdout);
    expect(report.findings).toEqual([]);
    expect(report.byKind['broken-assumption-link']).toEqual([]);
  });

  it('AC-6: --format json with findings → exit 1, JSON report includes findings', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
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
    const r = await run(['intelligence', 'audit', '--format', 'json'], active.root);
    expect(r.code).toBe(1);
    const report = JSON.parse(r.stdout);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].kind).toBe('orphan-assumption');
  });

  it('AC-6: --format json --quiet with findings → exit 0', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
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
    const r = await run(['intelligence', 'audit', '--format', 'json', '--quiet'], active.root);
    expect(r.code).toBe(0);
    const report = JSON.parse(r.stdout);
    expect(report.findings).toHaveLength(1);
  });

  it('AC-6: --format json empty workspace → JSON null', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const r = await run(['intelligence', 'audit', '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toBeNull();
  });

  it('AC-8: invalid --format → exit 1 + stderr', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const r = await run(['intelligence', 'audit', '--format', 'csv'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/unsupported format: csv/);
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

  describe('Slice 34.2: stale-converted-phase end-to-end', () => {
    it('rec converted to existing phase + phase dir present → clean audit (exit 0)', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice34_2' });
      const rec = await addRecommendation(active.root, {
        title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
        affectedAreas: [], affectedFiles: [],
      });
      await mkdir(join(active.root, '.cadence/phases/34.1-rec-phase-linkage'), { recursive: true });
      const cv = await run(
        ['recommendation', 'convert', rec.id, '--to-phase', '34.1-rec-phase-linkage'],
        active.root,
      );
      expect(cv.code).toBe(0);
      const r = await run(['intelligence', 'audit'], active.root);
      expect(r.code).toBe(0);
      expect(r.stdout).toBe('Audit clean: no integrity issues.\n');
    });

    it('rec converted to phase + phase dir deleted → exit 1 + stale-converted-phase section', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice34_2' });
      const rec = await addRecommendation(active.root, {
        title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
        affectedAreas: [], affectedFiles: [],
      });
      await mkdir(join(active.root, '.cadence/phases/34.1-x'), { recursive: true });
      const cv = await run(
        ['recommendation', 'convert', rec.id, '--to-phase', '34.1-x'],
        active.root,
      );
      expect(cv.code).toBe(0);
      // Simulate phase deletion by overwriting the rec ledger with a missing-phase ref.
      // (rmdir on the just-created dir would also work; this is just less fragile under fs caching.)
      const recPath = join(active.root, '.cadence/intelligence/recommendations.json');
      const ledger = JSON.parse(await readFile(recPath, 'utf8'));
      ledger.recommendations[0].convertedToPhaseId = 'deleted-phase';
      await writeFile(recPath, JSON.stringify(ledger), 'utf8');
      const r = await run(['intelligence', 'audit'], active.root);
      expect(r.code).toBe(1);
      expect(r.stdout).toMatch(/## Stale converted-to-phase Refs \(1\)/);
      expect(r.stdout).toMatch(new RegExp(`- ${rec.id} convertedToPhaseId missing phase: deleted-phase`));
    });

    it('JSON envelope carries stale-converted-phase finding', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice34_2' });
      const rec = await addRecommendation(active.root, {
        title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
        affectedAreas: [], affectedFiles: [],
      });
      // Hand-edit rec to have a bogus convertedToPhaseId (skip the convert command for brevity).
      const recPath = join(active.root, '.cadence/intelligence/recommendations.json');
      const ledger = JSON.parse(await readFile(recPath, 'utf8'));
      ledger.recommendations[0].status = 'converted';
      ledger.recommendations[0].convertedToPhaseId = 'ghost-phase';
      await writeFile(recPath, JSON.stringify(ledger), 'utf8');
      const r = await run(['intelligence', 'audit', '--format', 'json'], active.root);
      expect(r.code).toBe(1);
      const report = JSON.parse(r.stdout);
      expect(report.byKind['stale-converted-phase']).toHaveLength(1);
      expect(report.byKind['stale-converted-phase'][0]).toEqual({
        kind: 'stale-converted-phase',
        recommendationId: rec.id,
        missingPhaseId: 'ghost-phase',
      });
    });

    it('missing .cadence/phases dir is benign — converted refs surface as stale (correct default)', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice34_2' });
      const rec = await addRecommendation(active.root, {
        title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
        affectedAreas: [], affectedFiles: [],
      });
      // Plant a converted ref without ever creating .cadence/phases/ at all.
      const recPath = join(active.root, '.cadence/intelligence/recommendations.json');
      const ledger = JSON.parse(await readFile(recPath, 'utf8'));
      ledger.recommendations[0].status = 'converted';
      ledger.recommendations[0].convertedToPhaseId = '99-never-created';
      await writeFile(recPath, JSON.stringify(ledger), 'utf8');
      const r = await run(['intelligence', 'audit'], active.root);
      expect(r.code).toBe(1);
      expect(r.stdout).toMatch(/## Stale converted-to-phase Refs \(1\)/);
    });
  });

  describe('Slice 38: --filter-kind', () => {
    async function plantOrphanAssumption(root: string): Promise<void> {
      const rec = await addRecommendation(root, {
        title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
        affectedAreas: [], affectedFiles: [],
      });
      await addAssumption(root, { recommendationId: rec.id, text: 'A' });
      const asPath = join(root, '.cadence/intelligence/assumptions.json');
      const asJson = JSON.parse(await readFile(asPath, 'utf8'));
      asJson.assumptions.push({
        id: 'as-orphan-001',
        recommendationId: 'rec-missing',
        text: 'orphan',
        status: 'open',
        createdAt: '2026-05-20T00:00:00.000Z',
      });
      await writeFile(asPath, JSON.stringify(asJson));
    }

    it('AC-kind-1: --filter-kind matching → only that section, kind-echoed header, exit 1', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice38' });
      await plantOrphanAssumption(active.root);
      const r = await run(['intelligence', 'audit', '--filter-kind', 'orphan-assumption'], active.root);
      expect(r.code).toBe(1);
      expect(r.stdout).toMatch(/Found 1 integrity issue\(s\) of kind "orphan-assumption":/);
      expect(r.stdout).toMatch(/## Orphan Assumptions \(1\)/);
      expect(r.stdout).toMatch(/as-orphan-001 references missing rec: rec-missing/);
    });

    it('AC-kind-2: --filter-kind with zero of that kind (others present) → echo + exit 0', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice38' });
      await plantOrphanAssumption(active.root);
      const r = await run(['intelligence', 'audit', '--filter-kind', 'orphan-decision'], active.root);
      expect(r.code).toBe(0);
      expect(r.stdout).toBe('No intelligence audit findings of kind "orphan-decision".\n');
    });

    it('AC-kind-3: --filter-kind matching + --quiet → exit 0, still prints the section', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice38' });
      await plantOrphanAssumption(active.root);
      const r = await run(
        ['intelligence', 'audit', '--filter-kind', 'orphan-assumption', '--quiet'],
        active.root,
      );
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/Found 1 integrity issue\(s\) of kind "orphan-assumption":/);
    });

    it('AC-kind-4: --filter-kind + --format json → type-stable narrowed report', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice38' });
      await plantOrphanAssumption(active.root);
      const r = await run(
        ['intelligence', 'audit', '--filter-kind', 'orphan-assumption', '--format', 'json'],
        active.root,
      );
      expect(r.code).toBe(1);
      const report = JSON.parse(r.stdout);
      expect(report.findings).toHaveLength(1);
      expect(report.findings[0].kind).toBe('orphan-assumption');
      expect(Object.keys(report.byKind)).toHaveLength(8);
      expect(report.byKind['orphan-assumption']).toHaveLength(1);
      expect(report.byKind['broken-assumption-link']).toEqual([]);
      expect(report.byKind['stale-supersededby']).toEqual([]);
    });

    it('AC-kind-4b: --filter-kind with zero of that kind + --format json → empty narrowed report (not null, not text)', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice38' });
      await plantOrphanAssumption(active.root);
      const r = await run(
        ['intelligence', 'audit', '--filter-kind', 'orphan-decision', '--format', 'json'],
        active.root,
      );
      expect(r.code).toBe(0);
      const report = JSON.parse(r.stdout); // must be valid JSON, not the text echo
      expect(report).not.toBeNull();
      expect(report.findings).toEqual([]);
      expect(Object.keys(report.byKind)).toHaveLength(8);
      expect(report.byKind['orphan-decision']).toEqual([]);
      expect(report.byKind['orphan-assumption']).toEqual([]);
    });

    it('AC-kind-5: invalid --filter-kind → exit 1 + allowlist error, no ledgers needed', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice38' });
      const r = await run(['intelligence', 'audit', '--filter-kind', 'bogus'], active.root);
      expect(r.code).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toBe(
        "intelligence audit failed: invalid kind: 'bogus' (allowed: broken-assumption-link, broken-decision-link, broken-evidence-link, orphan-assumption, orphan-decision, orphan-evidence, stale-supersededby, stale-converted-phase)\n",
      );
    });

    it('AC-kind-6: filtered terminal Remediation shows ONLY the relevant family bullet', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice38' });
      await plantOrphanAssumption(active.root);
      const r = await run(['intelligence', 'audit', '--filter-kind', 'orphan-assumption'], active.root);
      expect(r.stdout).toMatch(/For orphan subjects:/);
      expect(r.stdout).not.toMatch(/For broken rec→subject links:/);
      expect(r.stdout).not.toMatch(/cadence decision reactivate <id>/);
      expect(r.stdout).not.toMatch(/For stale converted-to-phase refs:/);
    });
  });
});
