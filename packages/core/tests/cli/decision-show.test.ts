import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import {
  addIntelligenceDecision,
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

describe('cadence decision show (Slice 16)', () => {
  it('AC-9: tied decision → exit 0, header + status + cross-ref + decided + rationale', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice16' });
    const rec = await addRecommendation(active.root, {
      title: 'do thing', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const d = await addIntelligenceDecision(active.root, {
      recommendationId: rec.id,
      title: 'use approach A',
      rationale: 'cheapest path',
    });
    const r = await run(['decision', 'show', d.id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`# ${d.id} — use approach A`);
    expect(r.stdout).toMatch(/- status: active/);
    expect(r.stdout).toContain(`- recommendation: ${rec.id} — do thing`);
    expect(r.stdout).toMatch(/- decided: /);
    expect(r.stdout).toContain('cheapest path');
  });

  it('AC-9: untied decision → exit 0, no recommendation bullet', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice16' });
    const d = await addIntelligenceDecision(active.root, {
      title: 'standalone',
      rationale: 'r',
    });
    const r = await run(['decision', 'show', d.id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`# ${d.id} — standalone`);
    expect(r.stdout).not.toMatch(/- recommendation:/);
  });

  it('AC-10: unknown id → exit 1, stderr `decision <id> not found`, no stdout', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice16' });
    const r = await run(['decision', 'show', 'dec-bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe('decision dec-bogus not found\n');
    expect(r.stdout).toBe('');
  });

  it('AC-12: strict read-only — `.cadence/intelligence/` byte-equal before and after', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice16' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const d = await addIntelligenceDecision(active.root, {
      recommendationId: rec.id, title: 'D', rationale: 'r',
    });
    const dir = join(active.root, '.cadence', 'intelligence');
    const before = await snapshotDir(dir);
    await run(['decision', 'show', d.id], active.root);
    const after = await snapshotDir(dir);
    expect(after.size).toBe(before.size);
    for (const [name, content] of before.entries()) {
      expect(after.get(name)).toBe(content);
    }
  });

  it('AC-4: --format json (tied) → envelope { decision, recommendation }', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const rec = await addRecommendation(active.root, {
      title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
      affectedAreas: [], affectedFiles: [],
    });
    const d = await addIntelligenceDecision(active.root, {
      recommendationId: rec.id, title: 'D', rationale: 'r',
    });
    const r = await run(['decision', 'show', d.id, '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.decision.id).toBe(d.id);
    expect(env.recommendation.id).toBe(rec.id);
  });

  it('AC-4: --format json (untied) → recommendation: null', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const d = await addIntelligenceDecision(active.root, { title: 'untied', rationale: 'r' });
    const r = await run(['decision', 'show', d.id, '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.decision.id).toBe(d.id);
    expect(env.recommendation).toBeNull();
  });

  it('Slice 31 AC-13: --format json envelope decision.supersedes is present array (default empty)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice31' });
    const d = await addIntelligenceDecision(active.root, { title: 'x', rationale: 'r' });
    const r = await run(['decision', 'show', d.id, '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.decision.supersedes).toEqual([]);
  });

  it('AC-8: invalid --format → exit 1 + stderr', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice20' });
    const d = await addIntelligenceDecision(active.root, { title: 'x', rationale: 'r' });
    const r = await run(['decision', 'show', d.id, '--format', 'yaml'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/unsupported format: yaml/);
  });

  it('missing <id> arg → commander usage error', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice16' });
    const r = await run(['decision', 'show'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/missing required argument/i);
  });
});
