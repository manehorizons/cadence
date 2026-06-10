import { describe, it, expect, afterEach } from 'vitest';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { checkVerificationReadiness } from '../../src/doctor/run.js';
import { loadConfig, writeConfig } from '../../src/config/loader.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('checkVerificationReadiness (AC-1, AC-2)', () => {
  it('AC-1: warns on a default (all-mock) config and points at activate', async () => {
    active = await tempRepo({ initialized: true });
    const c = await checkVerificationReadiness(active.root, {});
    expect(c.name).toBe('verification-readiness');
    expect(c.severity).toBe('warning');
    expect(c.remediation).toMatch(/cadence activate/);
  });

  it('AC-2: warns when a real provider is selected but the key is missing', async () => {
    active = await tempRepo({ initialized: true });
    const cfg = await loadConfig(active.root);
    await writeConfig(active.root, { ...cfg, verifier: { ...cfg.verifier, provider: 'anthropic' } });
    const c = await checkVerificationReadiness(active.root, {});
    expect(c.name).toBe('verification-readiness');
    expect(c.severity).toBe('warning');
    expect(c.remediation).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('AC-2: passes when a real provider has its key present', async () => {
    active = await tempRepo({ initialized: true });
    const cfg = await loadConfig(active.root);
    await writeConfig(active.root, { ...cfg, verifier: { ...cfg.verifier, provider: 'anthropic' } });
    const c = await checkVerificationReadiness(active.root, { ANTHROPIC_API_KEY: 'sk' });
    expect(c.name).toBe('verification-readiness');
    expect(c.severity).toBe('ok');
  });
});
