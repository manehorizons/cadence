import { describe, it, expect, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MOCK_VERIFIER_NOTICE, MOCK_VERIFIER_CAPABILITY } from '@thomas-powers-jr/cadence-types';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
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

  it('phase-104 AC-3: the all-mock warning detail is sourced from MOCK_VERIFIER_NOTICE', async () => {
    active = await tempRepo({ initialized: true });
    const c = await checkVerificationReadiness(active.root, {});
    expect(c.severity).toBe('warning');
    expect(c.detail).toContain(MOCK_VERIFIER_NOTICE.message);
  });

  it('264-01/AC-3: the all-mock warning detail also carries MOCK_VERIFIER_CAPABILITY', async () => {
    active = await tempRepo({ initialized: true });
    const c = await checkVerificationReadiness(active.root, {});
    expect(c.severity).toBe('warning');
    expect(c.detail).toContain(MOCK_VERIFIER_CAPABILITY.message);
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

  // AC-1 (phase 211) — inside a live Claude Code session (CLAUDECODE=1),
  // a missing ANTHROPIC_API_KEY is a common confusion: the operator is
  // logged into Claude Code, but that login does not satisfy the
  // separate anthropic-provider credential deep-verify needs. The detail/
  // remediation must name that confusion directly and proactively suggest
  // `host-cli` instead of the generic "export it" text.
  it('AC-1: names the Claude-Code-login confusion and suggests host-cli when CLAUDECODE=1 and the anthropic key is missing', async () => {
    active = await tempRepo({ initialized: true });
    const cfg = await loadConfig(active.root);
    await writeConfig(active.root, { ...cfg, verifier: { ...cfg.verifier, provider: 'anthropic' } });
    const c = await checkVerificationReadiness(active.root, { CLAUDECODE: '1' });
    expect(c.name).toBe('verification-readiness');
    expect(c.severity).toBe('warning');
    const combined = `${c.detail} ${c.remediation}`;
    expect(combined).toMatch(/host-cli/);
    expect(combined).toMatch(/Claude Code/);
  });

  // Phase 239 (issue #331) — the check inspected ONLY the deep-verify seam
  // despite its seven-seam name, so a seam configured to a real provider whose
  // credentials are absent was reported as healthy while being guaranteed to
  // fall back to mock. Reproduced against the real shape that surfaced it:
  // deep-verify on host-cli (credential-free by design) with specReview on
  // anthropic and no ANTHROPIC_API_KEY.
  it('AC-1: warns when a non-deep-verify seam will downgrade, even though deep-verify is healthy', async () => {
    active = await tempRepo({ initialized: true });
    const cfg = await loadConfig(active.root);
    await writeConfig(active.root, {
      ...cfg,
      verifier: { ...cfg.verifier, provider: 'host-cli' },
      specReview: { ...cfg.specReview, provider: 'anthropic' },
    });
    const c = await checkVerificationReadiness(active.root, {});
    expect(c.name).toBe('verification-readiness');
    expect(c.severity).toBe('warning');
    // Must name the offending seam — a generic "deep-verify is set to ..."
    // message would send the operator to the wrong config block.
    expect(`${c.detail} ${c.remediation}`).toMatch(/specReview/);
  });

  it('AC-2: names every downgrading seam, not just the first', async () => {
    active = await tempRepo({ initialized: true });
    const cfg = await loadConfig(active.root);
    await writeConfig(active.root, {
      ...cfg,
      verifier: { ...cfg.verifier, provider: 'host-cli' },
      specReview: { ...cfg.specReview, provider: 'anthropic' },
      codeReview: { ...cfg.codeReview, provider: 'anthropic' },
    });
    const c = await checkVerificationReadiness(active.root, {});
    expect(c.severity).toBe('warning');
    const combined = `${c.detail} ${c.remediation}`;
    expect(combined).toMatch(/specReview/);
    expect(combined).toMatch(/codeReview/);
  });

  // 264-01/AC-3: the "silently downgraded" half of AC-3 — a verifier seam
  // configured to a real provider whose credentials are missing falls back
  // to mock without the operator deliberately choosing it. All three
  // sub-branches below must carry MOCK_VERIFIER_CAPABILITY the same way the
  // deliberately-configured `provider === 'mock'` branch already does.
  it('264-01/AC-3: the Claude-Code-session missing-key warning also carries MOCK_VERIFIER_CAPABILITY', async () => {
    active = await tempRepo({ initialized: true });
    const cfg = await loadConfig(active.root);
    await writeConfig(active.root, { ...cfg, verifier: { ...cfg.verifier, provider: 'anthropic' } });
    const c = await checkVerificationReadiness(active.root, { CLAUDECODE: '1' });
    expect(c.severity).toBe('warning');
    expect(c.detail).toContain(MOCK_VERIFIER_CAPABILITY.message);
  });

  it('264-01/AC-3: the generic missing-key warning also carries MOCK_VERIFIER_CAPABILITY', async () => {
    active = await tempRepo({ initialized: true });
    const cfg = await loadConfig(active.root);
    await writeConfig(active.root, { ...cfg, verifier: { ...cfg.verifier, provider: 'anthropic' } });
    const c = await checkVerificationReadiness(active.root, {});
    expect(c.severity).toBe('warning');
    expect(c.detail).toContain(MOCK_VERIFIER_CAPABILITY.message);
  });

  it('264-01/AC-3: the seamsDowngraded warning also carries MOCK_VERIFIER_CAPABILITY', async () => {
    active = await tempRepo({ initialized: true });
    const cfg = await loadConfig(active.root);
    await writeConfig(active.root, {
      ...cfg,
      verifier: { ...cfg.verifier, provider: 'host-cli' },
      specReview: { ...cfg.specReview, provider: 'anthropic' },
    });
    const c = await checkVerificationReadiness(active.root, {});
    expect(c.severity).toBe('warning');
    expect(c.detail).toContain(MOCK_VERIFIER_CAPABILITY.message);
  });

  it('AC-3: still passes when every seam is real and credentialed', async () => {
    active = await tempRepo({ initialized: true });
    const cfg = await loadConfig(active.root);
    await writeConfig(active.root, {
      ...cfg,
      verifier: { ...cfg.verifier, provider: 'host-cli' },
      specReview: { ...cfg.specReview, provider: 'host-cli' },
    });
    const c = await checkVerificationReadiness(active.root, {});
    expect(c.severity).toBe('ok');
  });

  it('AC-3: a seam left on mock is not treated as a downgrade', async () => {
    // The repo's own committed config keeps most seams on mock deliberately.
    // Only deep-verify being mock should drive the all-mock warning; a mock
    // sibling seam must not invent a second one.
    active = await tempRepo({ initialized: true });
    const cfg = await loadConfig(active.root);
    await writeConfig(active.root, {
      ...cfg,
      verifier: { ...cfg.verifier, provider: 'host-cli' },
    });
    const c = await checkVerificationReadiness(active.root, {});
    expect(c.severity).toBe('ok');
  });

  // T5 (phase 164 amendment) — `checkVerificationReadiness` must forward its
  // own `root` param to `assessReadiness` as `cwd`, not rely on the default
  // `process.cwd()`. Proven with a key that lives ONLY in a `.env` file at
  // `root` (a tempRepo under os.tmpdir(), always distinct from this test
  // process's own cwd) and is never exported into the env passed in.
  it('AC-1: discovers a key via .env at repoRoot even when process.cwd() differs (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    const cfg = await loadConfig(active.root);
    await writeConfig(active.root, { ...cfg, verifier: { ...cfg.verifier, provider: 'anthropic' } });
    await writeFile(
      join(active.root, '.env'),
      'ANTHROPIC_API_KEY=from-dotenv-verification-readiness-test\n',
    );
    // Empty env: no ANTHROPIC_API_KEY exported — must resolve via .env at
    // root, not process.env and not the real (unrelated) process.cwd().
    const c = await checkVerificationReadiness(active.root, {});
    expect(c.name).toBe('verification-readiness');
    expect(c.severity).toBe('ok');
  });
});
