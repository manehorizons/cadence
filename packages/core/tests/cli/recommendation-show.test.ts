import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import {
  addAssumption,
  addIntelligenceDecision,
  addRecommendation,
  runAssumptionTransition,
  runDecisionTransition,
} from '../../src/intelligence/store.js';

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
        /* skip non-files / dirs */
      }
    }
  } catch {
    /* dir missing */
  }
  return out;
}

describe('cadence recommendation show (Slice 14)', () => {
  it('AC-8: existing rec → exit 0, stdout contains header + summary + buckets', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice14' });
    const rec = await addRecommendation(active.root, {
      title: 'do thing',
      summary: 'a summary',
      priority: 'medium',
      readiness: 'raw-idea',
      affectedAreas: ['core'],
      affectedFiles: ['src/foo.ts'],
    });
    const r = await run(['recommendation', 'show', rec.id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`# ${rec.id} — do thing`);
    expect(r.stdout).toMatch(/## Summary[\s\S]*?a summary/);
    expect(r.stdout).toMatch(/## Assumptions \(0\/0\)/);
    expect(r.stdout).toMatch(/## Decisions \(0\/0\)/);
    expect(r.stdout).toMatch(/## Evidence \(0\)/);
  });

  it('AC-9: unknown id → exit 1, stderr `recommendation <id> not found`, no stdout', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice14' });
    const r = await run(['recommendation', 'show', 'rec-bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe('recommendation rec-bogus not found\n');
    expect(r.stdout).toBe('');
  });

  it('AC-10: --open-assumptions-only filters; header shows shown/total', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice14' });
    const rec = await addRecommendation(active.root, {
      title: 't',
      summary: 's',
      priority: 'medium',
      readiness: 'raw-idea',
      affectedAreas: [],
      affectedFiles: [],
    });
    const a1 = await addAssumption(active.root, { recommendationId: rec.id, text: 'open one' });
    const a2 = await addAssumption(active.root, { recommendationId: rec.id, text: 'will validate' });
    await runAssumptionTransition(active.root, a2.id, 'validate');
    const r = await run(
      ['recommendation', 'show', rec.id, '--open-assumptions-only'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/## Assumptions \(1\/2\)/);
    expect(r.stdout).toMatch(new RegExp(`### ${a1.id} — open one`));
    expect(r.stdout).not.toMatch(new RegExp(`### ${a2.id}`));
  });

  it('AC-11: --active-decisions-only filters; header shows shown/total', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice14' });
    const rec = await addRecommendation(active.root, {
      title: 't',
      summary: 's',
      priority: 'medium',
      readiness: 'raw-idea',
      affectedAreas: [],
      affectedFiles: [],
    });
    const d1 = await addIntelligenceDecision(active.root, {
      recommendationId: rec.id,
      title: 'active one',
      rationale: 'r',
    });
    const d2 = await addIntelligenceDecision(active.root, {
      recommendationId: rec.id,
      title: 'will supersede',
      rationale: 'r',
    });
    await runDecisionTransition(active.root, d2.id, 'supersede');
    const r = await run(
      ['recommendation', 'show', rec.id, '--active-decisions-only'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/## Decisions \(1\/2\)/);
    expect(r.stdout).toMatch(new RegExp(`### ${d1.id} — active one`));
    expect(r.stdout).not.toMatch(new RegExp(`### ${d2.id}`));
  });

  it('AC-13: strict read-only — `.cadence/intelligence/` byte-equal before and after', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice14' });
    const rec = await addRecommendation(active.root, {
      title: 't',
      summary: 's',
      priority: 'medium',
      readiness: 'raw-idea',
      affectedAreas: [],
      affectedFiles: [],
    });
    await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    await addIntelligenceDecision(active.root, {
      recommendationId: rec.id,
      title: 'D',
      rationale: 'r',
    });
    const dir = join(active.root, '.cadence', 'intelligence');
    const before = await snapshotDir(dir);
    const r = await run(['recommendation', 'show', rec.id], active.root);
    expect(r.code).toBe(0);
    const after = await snapshotDir(dir);
    expect(after.size).toBe(before.size);
    for (const [name, content] of before.entries()) {
      expect(after.get(name)).toBe(content);
    }
  });

  it('AC-1: --format json → exit 0, stdout parses to envelope with all 5 keys', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const a = await addAssumption(active.root, { recommendationId: rec.id, text: 'A' });
    const d = await addIntelligenceDecision(active.root, {
      recommendationId: rec.id, title: 'D', rationale: 'r',
    });
    const r = await run(
      ['recommendation', 'show', rec.id, '--format', 'json'],
      active.root,
    );
    expect(r.code).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.recommendation.id).toBe(rec.id);
    expect(env.linkedAssumptions).toHaveLength(1);
    expect(env.linkedAssumptions[0].id).toBe(a.id);
    expect(env.linkedDecisions).toHaveLength(1);
    expect(env.linkedDecisions[0].id).toBe(d.id);
    expect(env.linkedEvidence).toEqual([]);
    expect(env.filters).toEqual({
      openAssumptionsOnly: false,
      activeDecisionsOnly: false,
    });
  });

  it('AC-2: filter flags reflected in envelope; linked arrays PRE-filter', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const a1 = await addAssumption(active.root, { recommendationId: rec.id, text: 'A1' });
    const a2 = await addAssumption(active.root, { recommendationId: rec.id, text: 'A2' });
    // validate a2 so it's no longer open
    const { runAssumptionTransition } = await import('../../src/intelligence/store.js');
    await runAssumptionTransition(active.root, a2.id, 'validate');
    const r = await run(
      ['recommendation', 'show', rec.id, '--format', 'json', '--open-assumptions-only', '--active-decisions-only'],
      active.root,
    );
    expect(r.code).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.filters.openAssumptionsOnly).toBe(true);
    expect(env.filters.activeDecisionsOnly).toBe(true);
    // PRE-filter: both assumptions in envelope (consumer applies filter downstream)
    expect(env.linkedAssumptions.map((a: { id: string }) => a.id).sort()).toEqual([a1.id, a2.id].sort());
  });

  it('AC-8: invalid --format → exit 1 + stderr', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const r = await run(['recommendation', 'show', rec.id, '--format', 'bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/unsupported format: bogus/);
  });

  it('AC-9: unknown id with --format json → exit 1, stderr, no stdout JSON', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const r = await run(['recommendation', 'show', 'rec-bogus', '--format', 'json'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe('recommendation rec-bogus not found\n');
    expect(r.stdout).toBe('');
  });

  it('missing <id> arg → commander usage error + non-zero exit', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice14' });
    const r = await run(['recommendation', 'show'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/missing required argument/i);
  });
});
