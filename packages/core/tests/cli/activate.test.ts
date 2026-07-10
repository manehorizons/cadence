import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { loadConfig } from '../../src/config/loader.js';
import { runActivate } from '../../src/cli/commands/activate.js';
import { bufferIO } from '../../src/services/io.js';
import type { ProviderPing } from '../../src/activate/ping.js';

const okPing: ProviderPing = async () => ({ ok: true as const });

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('runActivate (AC-1, AC-2, AC-3, AC-4, AC-5)', () => {
  it('AC-1: flips deep-verify to anthropic and writes config (key present, ping ok)', async () => {
    active = await tempRepo({ initialized: true });
    const root = active.root;
    const io = bufferIO();
    const res = await runActivate(root, { provider: 'anthropic', isTty: false }, io, { ping: okPing, env: { ANTHROPIC_API_KEY: 'sk' } });
    expect(res.exitCode).toBe(0);
    expect((await loadConfig(root)).verifier.provider).toBe('anthropic');
    expect(io.stdout()).toMatch(/cadence settle run --deep/);
  });

  it('AC-2: --all flips every seam', async () => {
    active = await tempRepo({ initialized: true });
    const root = active.root;
    const res = await runActivate(root, { provider: 'anthropic', all: true, isTty: false }, bufferIO(), { ping: okPing, env: { ANTHROPIC_API_KEY: 'sk' } });
    expect(res.exitCode).toBe(0);
    const cfg = await loadConfig(root);
    expect(cfg.codeReview.provider).toBe('anthropic');
    expect(cfg.securityAudit.provider).toBe('anthropic');
  });

  it('AC-3: key missing → writes selection, prints export line, exit 0', async () => {
    active = await tempRepo({ initialized: true });
    const root = active.root;
    const io = bufferIO();
    const res = await runActivate(root, { provider: 'anthropic', isTty: false }, io, { ping: okPing, env: {} });
    expect(res.exitCode).toBe(0);
    expect((await loadConfig(root)).verifier.provider).toBe('anthropic');
    expect(io.stdout()).toMatch(/export ANTHROPIC_API_KEY/);
  });

  it('AC-4: live ping failure → exit 1, config still written', async () => {
    active = await tempRepo({ initialized: true });
    const root = active.root;
    const failPing: ProviderPing = async () => ({ ok: false as const, reason: '401' });
    const res = await runActivate(root, { provider: 'anthropic', isTty: false }, bufferIO(), { ping: failPing, env: { ANTHROPIC_API_KEY: 'bad' } });
    expect(res.exitCode).toBe(1);
    expect((await loadConfig(root)).verifier.provider).toBe('anthropic');
  });

  it('AC-5a: --print writes nothing', async () => {
    active = await tempRepo({ initialized: true });
    const root = active.root;
    const res = await runActivate(root, { provider: 'anthropic', print: true, isTty: false }, bufferIO(), { ping: okPing, env: { ANTHROPIC_API_KEY: 'sk' } });
    expect(res.exitCode).toBe(0);
    expect((await loadConfig(root)).verifier.provider).toBe('mock');
  });

  it('AC-5b: non-TTY without --provider exits 1 with guidance', async () => {
    active = await tempRepo({ initialized: true });
    const root = active.root;
    const io = bufferIO();
    const res = await runActivate(root, { isTty: false }, io, { ping: okPing, env: {} });
    expect(res.exitCode).toBe(1);
    expect(io.stderr()).toMatch(/--provider/);
  });

  it('AC-1: a second activate on an already-active config is a no-op that says "Already active"', async () => {
    active = await tempRepo({ initialized: true });
    const root = active.root;
    await runActivate(root, { provider: 'anthropic', isTty: false }, bufferIO(), { ping: okPing, env: { ANTHROPIC_API_KEY: 'sk' } });
    const io = bufferIO();
    const res = await runActivate(root, { provider: 'anthropic', isTty: false }, io, { ping: okPing, env: { ANTHROPIC_API_KEY: 'sk' } });
    expect(res.exitCode).toBe(0);
    expect(io.stdout()).toMatch(/Already active/);
  });

  it('AC-5c: --print with no key still previews the missing-key warning and writes nothing', async () => {
    active = await tempRepo({ initialized: true });
    const root = active.root;
    const io = bufferIO();
    const res = await runActivate(root, { provider: 'anthropic', print: true, isTty: false }, io, { ping: okPing, env: {} });
    expect(res.exitCode).toBe(0);
    expect(io.stdout()).toMatch(/export ANTHROPIC_API_KEY/);
    expect((await loadConfig(root)).verifier.provider).toBe('mock'); // nothing written
  });
});

// Phase: trustworthy-verifier-activation, task T3.
// AC-2: given an operator runs `cadence activate` with a discovered or supplied
// verifier key, activation must make one real verification call to the
// configured provider and report success/failure based on that live call's
// outcome — not merely because a key string was present.
describe('runActivate — non-skippable activation smoke test (AC-2)', () => {
  it('AC-2: a key discovered only via .env (not process env) still triggers the live ping, and its success gates activation', async () => {
    active = await tempRepo({ initialized: true });
    const root = active.root;
    writeFileSync(join(root, '.env'), 'ANTHROPIC_API_KEY=from-dotenv\n');
    let calls = 0;
    let seenCwd: string | undefined;
    const spyPing: ProviderPing = async (_provider, _env, deps) => {
      calls += 1;
      seenCwd = deps?.cwd;
      return { ok: true as const };
    };
    // No ANTHROPIC_API_KEY in env — the key only lives in .env at root.
    const res = await runActivate(root, { provider: 'anthropic', isTty: false }, bufferIO(), {
      ping: spyPing,
      env: {},
    });
    expect(calls).toBe(1);
    expect(seenCwd).toBe(root);
    expect(res.exitCode).toBe(0);
  });

  it('AC-2: a key discovered via .env whose live ping fails still reports activation as a failure (writing config is not success)', async () => {
    active = await tempRepo({ initialized: true });
    const root = active.root;
    writeFileSync(join(root, '.env'), 'ANTHROPIC_API_KEY=from-dotenv\n');
    const failPing: ProviderPing = async () => ({ ok: false as const, reason: '401 unauthorized' });
    const res = await runActivate(root, { provider: 'anthropic', isTty: false }, bufferIO(), {
      ping: failPing,
      env: {},
    });
    // Config write still happens (the provider choice is recorded), but the
    // activation result itself must not be reported as a success.
    expect((await loadConfig(root)).verifier.provider).toBe('anthropic');
    expect(res.exitCode).toBe(1);
  });

  it('AC-2: --no-check is the only opt-out — the ping is never invoked when it is set, even with a key present', async () => {
    active = await tempRepo({ initialized: true });
    const root = active.root;
    let calls = 0;
    const spyPing: ProviderPing = async () => {
      calls += 1;
      return { ok: true as const };
    };
    const res = await runActivate(
      root,
      { provider: 'anthropic', noCheck: true, isTty: false },
      bufferIO(),
      { ping: spyPing, env: { ANTHROPIC_API_KEY: 'sk' } },
    );
    expect(calls).toBe(0);
    expect(res.exitCode).toBe(0);
  });
});
