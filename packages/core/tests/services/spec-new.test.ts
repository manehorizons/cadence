import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig, emptyState } from '@thomas-powers-jr/cadence-types';
import { specNewService } from '../../src/services/spec-new.js';
import type { CommandIO } from '../../src/services/io.js';

function captureIO(): { io: CommandIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

/** A fresh cadence-initialized repo root (IDLE), never shared across `it`s —
 * `specNewService` mutates `loopPosition` to `SPEC` on success, so a shared
 * root would spuriously fail a later call's IDLE gate. */
async function freshRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cadence-spec-new-')));
  await mkdir(join(root, '.cadence', 'phases'), { recursive: true });
  await writeFile(join(root, '.cadence', 'config.json'), JSON.stringify(defaultConfig, null, 2));
  await writeFile(join(root, '.cadence', 'state.json'), JSON.stringify(emptyState('spec-new-test'), null, 2));
  return root;
}

/** Resets `state.json` back to IDLE in place (bumping revision), so a second
 * `specNewService` call against the same root+id isolates the behavior under
 * test (e.g. the UI-SPEC clobber guard) from the unrelated IDLE gate. */
async function resetToIdle(root: string): Promise<void> {
  const path = join(root, '.cadence', 'state.json');
  const raw = JSON.parse(await readFile(path, 'utf8')) as { revision: number };
  await writeFile(
    path,
    JSON.stringify({ ...emptyState('spec-new-test'), revision: raw.revision }, null, 2),
  );
}

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  }
});

/**
 * T6 (phase 205): `cadence spec new --ui` scaffolds a sibling `<id>-UI-SPEC.md`
 * alongside `<id>-SPEC.md`, with a clobber guard that refuses (without
 * overwriting) if the UI-SPEC already exists on disk (AC-1, AC-8).
 */
describe('specNewService --ui (T6, AC-1, AC-8)', () => {
  it('AC-1: --ui scaffolds both SPEC.md and UI-SPEC.md', async () => {
    const root = await freshRoot();
    roots.push(root);
    const { io } = captureIO();
    // NOTE: the plan's snippet used a leading-digit-less phase slug
    // (`ui-demo`); `assertSafePhaseSlug`/`derivePhaseTaskId` require a
    // leading numeric token (see packages/core/src/phases/id.ts), so this
    // uses `01-ui-demo` instead — same scenario, valid slug.
    const res = await specNewService(root, { phase: '01-ui-demo', num: '1', ui: true }, io);
    expect(res.exitCode).toBe(0);
    const specPath = join(root, '.cadence', 'phases', '01-ui-demo', '01-01-SPEC.md');
    const uiSpecPath = join(root, '.cadence', 'phases', '01-ui-demo', '01-01-UI-SPEC.md');
    expect(existsSync(specPath)).toBe(true);
    expect(existsSync(uiSpecPath)).toBe(true);
    const raw = await readFile(uiSpecPath, 'utf8');
    expect(raw).toContain('## Components');
    expect(raw).toContain('## Responsive & Interaction');
  });

  it('AC-8: refuses without overwriting if UI-SPEC.md already exists', async () => {
    const root = await freshRoot();
    roots.push(root);
    const { io: io1 } = captureIO();
    const first = await specNewService(root, { phase: '02-ui-demo2', num: '1', ui: true }, io1);
    expect(first.exitCode).toBe(0);
    const specPath = join(root, '.cadence', 'phases', '02-ui-demo2', '02-01-SPEC.md');
    const uiSpecPath = join(root, '.cadence', 'phases', '02-ui-demo2', '02-01-UI-SPEC.md');
    const before = await readFile(uiSpecPath, 'utf8');

    // Simulate a re-run after the loop returned to IDLE with an orphaned
    // UI-SPEC.md whose sibling SPEC.md is gone (e.g. moved/discarded) — this
    // isolates the UI-SPEC-specific clobber guard from the pre-existing
    // SPEC.md `existsSync` refusal, which would otherwise fire first and
    // mask it (both guards independently refuse+preserve either file).
    await rm(specPath);
    await resetToIdle(root);
    const { io: io2, err } = captureIO();
    const res = await specNewService(root, { phase: '02-ui-demo2', num: '1', ui: true }, io2);
    expect(res.exitCode).not.toBe(0);
    const after = await readFile(uiSpecPath, 'utf8');
    expect(after).toBe(before);
    expect(err.join('')).toMatch(/UI-SPEC already exists/);
  });

  it('no-flag spec new is unaffected: no UI-SPEC.md is written', async () => {
    const root = await freshRoot();
    roots.push(root);
    const { io } = captureIO();
    const res = await specNewService(root, { phase: '03-no-ui-demo', num: '1' }, io);
    expect(res.exitCode).toBe(0);
    const specPath = join(root, '.cadence', 'phases', '03-no-ui-demo', '03-01-SPEC.md');
    const uiSpecPath = join(root, '.cadence', 'phases', '03-no-ui-demo', '03-01-UI-SPEC.md');
    expect(existsSync(specPath)).toBe(true);
    expect(existsSync(uiSpecPath)).toBe(false);
  });
});
