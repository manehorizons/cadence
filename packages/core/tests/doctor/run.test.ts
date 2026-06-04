import { describe, it, expect, afterEach } from 'vitest';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { runDoctor } from '../../src/doctor/run.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

const HEALTHY_ENV = { nodeVersion: 'v20.11.0', platform: 'linux' as const };

describe('runDoctor', () => {
  it('AC-1: healthy initialized project → every check ok, report.ok true', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc' });
    const report = await runDoctor(active.root, HEALTHY_ENV);
    expect(report.ok).toBe(true);
    expect(report.checks.every((c) => c.severity === 'ok')).toBe(true);
    expect(report.checks.map((c) => c.name)).toEqual(
      expect.arrayContaining(['node', 'initialized', 'state']),
    );
  });

  it('AC-2: uninitialized project → initialized is error, report.ok false', async () => {
    active = await tempRepo({ initialized: false });
    const report = await runDoctor(active.root, HEALTHY_ENV);
    const init = report.checks.find((c) => c.name === 'initialized');
    expect(init?.severity).toBe('error');
    expect(init?.detail).toMatch(/\.cadence\//);
    expect(init?.remediation).toMatch(/cadence init/);
    expect(report.ok).toBe(false);
  });

  it('AC-2/AC-5: sub-floor node → node is error, report.ok false', async () => {
    active = await tempRepo({ initialized: true });
    const report = await runDoctor(active.root, {
      nodeVersion: 'v18.20.0',
      platform: 'linux',
    });
    const node = report.checks.find((c) => c.name === 'node');
    expect(node?.severity).toBe('error');
    expect(report.ok).toBe(false);
  });
});
