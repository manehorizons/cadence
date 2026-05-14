import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@cadence/testkit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(__dirname, '../../dist/cli/index.js');

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

const DRAFT = `---
phase: 01-foundation
id: 01-01
tier: standard
status: PENDING
---

# 01-01 — Demo

## Objective

Make widget glow.

## Acceptance Criteria

### AC-1: Glows
Given widget exists
When user enables glow
Then widget emits photons

## Tasks

### T1: Add flag
- files: \`src/widget.ts\`
- action: add prop
- verify: tests pass
- done: AC-1

## Boundaries
`;

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence draft check', () => {
  it('exits 0 when no coherence issues', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, '.cadence/phases/01-foundation'), { recursive: true });
    const path = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
    await writeFile(path, DRAFT);
    const r = await run(['draft', 'check', path], active.root);
    expect(r.code).toBe(0);
  });

  it('exits 2 when PROJECT.md forbids a touched file', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, '.cadence/phases/01-foundation'), { recursive: true });
    await writeFile(join(active.root, '.cadence/PROJECT.md'), '# proj\n\nDO NOT edit src/widget.ts.\n');
    const path = join(active.root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
    await writeFile(path, DRAFT);
    const r = await run(['draft', 'check', path], active.root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/PROJECT_FORBIDDEN/);
  });
});
