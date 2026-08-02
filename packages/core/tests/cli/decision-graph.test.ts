import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { addIntelligenceDecision } from '../../src/intelligence/store/decisions.js';

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

describe('cadence decision graph (Slice 29)', () => {
  it('AC-1: isolated decision → exit 0, two-section output with (none) in each', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice29' });
    const d = await addIntelligenceDecision(active.root, {
      title: 'only one',
      rationale: 'alone',
    });
    const r = await run(['decision', 'graph', d.id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`# ${d.id} — only one (active)`);
    expect(r.stdout).toMatch(/## Supersedes\n\(none\)/);
    expect(r.stdout).toMatch(/## Superseded by\n\(none\)/);
  });

  it('AC-2: missing root id → exit 1 + stderr message', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice29' });
    const r = await run(['decision', 'graph', 'dec-missing'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('decision graph failed: decision dec-missing not found');
    expect(r.stdout).toBe('');
  });

  it('AC-3: linear forward chain renders as arrow chain', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice29' });
    const d1 = await addIntelligenceDecision(active.root, {
      title: 'first', rationale: 'r1',
    });
    const d2 = await addIntelligenceDecision(active.root, {
      title: 'second', rationale: 'r2',
    });
    const d3 = await addIntelligenceDecision(active.root, {
      title: 'third', rationale: 'r3',
    });
    // Manually wire the supersededBy chain via the JSON ledger (avoids
    // depending on the supersede transition's state contract).
    const ledgerPath = join(active.root, '.cadence', 'intelligence', 'decisions.json');
    const raw = JSON.parse(await readFile(ledgerPath, 'utf8'));
    for (const dec of raw.decisions) {
      if (dec.id === d1.id) { dec.status = 'superseded'; dec.supersededBy = d2.id; }
      if (dec.id === d2.id) { dec.status = 'superseded'; dec.supersededBy = d3.id; }
    }
    await writeFile(ledgerPath, JSON.stringify(raw, null, 2) + '\n', 'utf8');

    const r = await run(['decision', 'graph', d1.id], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`## Superseded by\n${d1.id} → ${d2.id} → ${d3.id}`);
    expect(r.stdout).toMatch(/## Supersedes\n\(none\)/);
  });

  it('AC-9: --format json emits the structured envelope', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice29' });
    const d1 = await addIntelligenceDecision(active.root, {
      title: 'first', rationale: 'r1',
    });
    const d2 = await addIntelligenceDecision(active.root, {
      title: 'second', rationale: 'r2',
    });
    const ledgerPath = join(active.root, '.cadence', 'intelligence', 'decisions.json');
    const raw = JSON.parse(await readFile(ledgerPath, 'utf8'));
    for (const dec of raw.decisions) {
      if (dec.id === d1.id) { dec.status = 'superseded'; dec.supersededBy = d2.id; }
    }
    await writeFile(ledgerPath, JSON.stringify(raw, null, 2) + '\n', 'utf8');

    const r = await run(['decision', 'graph', d1.id, '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.decision.id).toBe(d1.id);
    expect(env.ancestors).toEqual([]);
    expect(env.descendants).toHaveLength(1);
    expect(env.descendants[0].decision.id).toBe(d2.id);
    expect(env.descendants[0]).not.toHaveProperty('cycle');
    expect(env.descendants[0]).not.toHaveProperty('missingId');
  });

  it('AC-9: --format json envelope contains nested ancestors tree', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice29' });
    const d1 = await addIntelligenceDecision(active.root, {
      title: 'parent', rationale: 'r1',
    });
    const d2 = await addIntelligenceDecision(active.root, {
      title: 'child', rationale: 'r2',
    });
    const ledgerPath = join(active.root, '.cadence', 'intelligence', 'decisions.json');
    const raw = JSON.parse(await readFile(ledgerPath, 'utf8'));
    for (const dec of raw.decisions) {
      if (dec.id === d2.id) { dec.status = 'superseded'; dec.supersededBy = d1.id; }
    }
    await writeFile(ledgerPath, JSON.stringify(raw, null, 2) + '\n', 'utf8');

    const r = await run(['decision', 'graph', d1.id, '--format', 'json'], active.root);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.stdout);
    expect(env.ancestors).toHaveLength(1);
    expect(env.ancestors[0].decision.id).toBe(d2.id);
    expect(env.ancestors[0].ancestors).toEqual([]);
    expect(env.descendants).toEqual([]);
  });

  it('AC-12: invalid --format → exit 1 + stderr message', async () => {
    active = await tempRepo({ initialized: true, projectName: 'slice29' });
    const d = await addIntelligenceDecision(active.root, {
      title: 'x', rationale: 'r',
    });
    const r = await run(['decision', 'graph', d.id, '--format', 'xml'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('decision graph failed: unsupported format: xml');
    expect(r.stdout).toBe('');
  });
});
