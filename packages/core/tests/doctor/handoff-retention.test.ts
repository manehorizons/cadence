import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defaultConfig } from '@thomas-powers-jr/cadence-types';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { checkHandoffRetention, runDoctor } from '../../src/doctor/run.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

const ENV = { nodeVersion: 'v22.11.0', platform: 'linux' as const };

async function seed(root: string, count: number): Promise<void> {
  const dir = join(root, '.cadence', 'handoff');
  await mkdir(dir, { recursive: true });
  for (let i = 0; i < count; i++) {
    const day = String(10 + i).padStart(2, '0');
    await writeFile(join(dir, `SESSION-2026-06-${day}.md`), '# seeded\n');
  }
}

async function setRetain(root: string, retain: number | undefined): Promise<void> {
  const handoff = retain === undefined ? {} : { retain };
  await writeFile(
    join(root, '.cadence', 'config.json'),
    JSON.stringify({ ...defaultConfig, handoff }, null, 2),
  );
}

describe('checkHandoffRetention', () => {
  it('AC-1: retain set and count within budget → ok', async () => {
    active = await tempRepo({ initialized: true });
    await seed(active.root, 2);
    await setRetain(active.root, 5);
    const check = await checkHandoffRetention(active.root);
    expect(check.name).toBe('handoff-retention');
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/within|budget/i);
  });

  it('AC-2: retain set but over budget → ok with a self-heal note', async () => {
    active = await tempRepo({ initialized: true });
    await seed(active.root, 8);
    await setRetain(active.root, 3);
    const check = await checkHandoffRetention(active.root);
    expect(check.severity).toBe('ok');
    expect(check.detail).toMatch(/prune|next handoff|self/i);
  });

  it('AC-3: retain unset and count >= threshold (10) → warning', async () => {
    active = await tempRepo({ initialized: true });
    await seed(active.root, 12);
    await setRetain(active.root, undefined);
    const check = await checkHandoffRetention(active.root);
    expect(check.severity).toBe('warning');
    expect(check.detail).toMatch(/12/);
    expect(check.remediation).toMatch(/handoff\.retain/);
    expect(check.fixId).toBe('handoff-retention');
  });

  it('AC-4: retain unset and below threshold → ok', async () => {
    active = await tempRepo({ initialized: true });
    await seed(active.root, 4);
    await setRetain(active.root, undefined);
    const check = await checkHandoffRetention(active.root);
    expect(check.severity).toBe('ok');
  });

  it('AC-4: no handoff dir → ok, never throws', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkHandoffRetention(active.root);
    expect(check.severity).toBe('ok');
  });

  it('AC-5: runDoctor includes a handoff-retention check', async () => {
    active = await tempRepo({ initialized: true });
    const report = await runDoctor(active.root, ENV);
    expect(report.checks.some((c) => c.name === 'handoff-retention')).toBe(true);
  });
});
