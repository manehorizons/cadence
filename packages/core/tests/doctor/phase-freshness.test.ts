import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { emptyState } from '@manehorizons/cadence-types';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { checkPhaseFreshness, runDoctor, PHASE_FRESHNESS_WARN_THRESHOLD_MS } from '../../src/doctor/run.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

const ENV = { nodeVersion: 'v22.11.0', platform: 'linux' as const };
const NOW = new Date('2026-07-22T12:00:00.000Z');

async function setActive(
  root: string,
  activePhase: string | null,
  activeDraft: string | null,
): Promise<void> {
  const state = emptyState('test');
  state.activePhase = activePhase;
  state.activeDraft = activeDraft;
  await writeFile(join(root, '.cadence', 'state.json'), JSON.stringify(state, null, 2));
}

async function writeProgress(
  root: string,
  phase: string,
  draftId: string,
  tasks: Record<string, { updatedAt: string }>,
): Promise<void> {
  const dir = join(root, '.cadence', 'phases', phase);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${draftId}-PROGRESS.json`),
    JSON.stringify({ draftId, tasks }, null, 2),
  );
}

describe('checkPhaseFreshness', () => {
  it('AC-1: a task updated within the threshold → warning naming the task and its age', async () => {
    active = await tempRepo({ initialized: true });
    await setActive(active.root, '208-doctor-check', '208-01');
    // 2 minutes ago — well within the 10-minute threshold.
    const recent = new Date(NOW.getTime() - 2 * 60_000).toISOString();
    await writeProgress(active.root, '208-doctor-check', '208-01', {
      T1: { updatedAt: recent },
    });

    const check = await checkPhaseFreshness(active.root, NOW);
    expect(check.name).toBe('phase-freshness');
    expect(check.severity).toBe('warning');
    expect(check.detail).toMatch(/T1/);
    expect(check.detail).toMatch(/minute/i);
    expect(check.remediation).toMatch(/no other session/i);
    expect(check.remediation).toMatch(/dead/i);
  });

  it('AC-2: a task updated well outside the threshold → ok', async () => {
    active = await tempRepo({ initialized: true });
    await setActive(active.root, '208-doctor-check', '208-01');
    // 1 hour ago — outside the 10-minute threshold.
    const stale = new Date(NOW.getTime() - 60 * 60_000).toISOString();
    await writeProgress(active.root, '208-doctor-check', '208-01', {
      T1: { updatedAt: stale },
    });

    const check = await checkPhaseFreshness(active.root, NOW);
    expect(check.severity).toBe('ok');
  });

  it('AC-2: no active phase/draft → ok', async () => {
    active = await tempRepo({ initialized: true });
    // emptyState() already has activePhase/activeDraft null.
    const check = await checkPhaseFreshness(active.root, NOW);
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/no active phase\/draft/i);
  });

  it('AC-2: active phase/draft but no PROGRESS.json yet → ok', async () => {
    active = await tempRepo({ initialized: true });
    await setActive(active.root, '208-doctor-check', '208-01');
    const check = await checkPhaseFreshness(active.root, NOW);
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/no progress\.json/i);
  });

  it('exports a documented 10-minute threshold constant', () => {
    expect(PHASE_FRESHNESS_WARN_THRESHOLD_MS).toBe(600_000);
  });

  it('AC-1/AC-2: wired into runDoctor (best-effort, never fails the report)', async () => {
    active = await tempRepo({ initialized: true });
    const report = await runDoctor(active.root, ENV);
    const check = report.checks.find((c) => c.name === 'phase-freshness');
    expect(check).toBeDefined();
    expect(check?.severity).not.toBe('error');
  });
});
