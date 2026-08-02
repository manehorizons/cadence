import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CadenceConfigZ, defaultConfig } from '@thomas-powers-jr/cadence-types';
import {
  assessReadiness,
  credsPresent,
  isClaudeCodeSession,
  VERIFIER_SEAMS,
} from '../../src/activate/assess.js';

const cfg = (overrides: Record<string, unknown> = {}) =>
  CadenceConfigZ.parse({ ...defaultConfig, ...overrides });

const dirs: string[] = [];
const makeTmpDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'cadence-assess-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('assessReadiness (AC-6)', () => {
  it('reports all-mock posture on a default config', () => {
    const r = assessReadiness(cfg(), {});
    expect(r.provider).toBe('mock');
    expect(r.ready).toBe(false);
    expect(r.seamsReal).toEqual([]);
    expect(r.seamsMock).toEqual([...VERIFIER_SEAMS]);
    expect(r.reason).toMatch(/mock/i);
  });

  it('is ready when deep-verify is anthropic and the key is present', () => {
    const r = assessReadiness(cfg({ verifier: { provider: 'anthropic' } }), {
      ANTHROPIC_API_KEY: 'sk-test',
    });
    expect(r.provider).toBe('anthropic');
    expect(r.keyPresent).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.seamsReal).toContain('verifier');
  });

  it('is not ready when anthropic is selected but the key is absent', () => {
    const r = assessReadiness(cfg({ verifier: { provider: 'anthropic' } }), {});
    expect(r.keyPresent).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.reason).toMatch(/missing/i);
  });

  // Phase 239 (issue #331) — `seamsReal`/`seamsMock` partition by *configured*
  // provider, which says nothing about whether that provider can actually run.
  // `seamsDowngraded` names the seams whose configured provider WILL fall back
  // to mock at runtime for want of credentials — the set that made
  // `verification-readiness` report a false green.
  it('seamsDowngraded names a non-deep-verify seam whose creds are missing', () => {
    const r = assessReadiness(
      cfg({ verifier: { provider: 'host-cli' }, specReview: { provider: 'anthropic' } }),
      {},
    );
    // deep-verify itself is healthy — this is exactly the false-green shape.
    expect(r.provider).toBe('host-cli');
    expect(r.keyPresent).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.seamsDowngraded).toEqual(['specReview']);
    // The configured-provider partition is unchanged by this addition.
    expect(r.seamsReal).toContain('specReview');
  });

  it('seamsDowngraded is empty when every real seam has its creds', () => {
    const withKey = assessReadiness(
      cfg({ verifier: { provider: 'anthropic' }, specReview: { provider: 'anthropic' } }),
      { ANTHROPIC_API_KEY: 'sk-test' },
    );
    expect(withKey.seamsDowngraded).toEqual([]);
  });

  it('seamsDowngraded never flags host-cli or mock seams', () => {
    // host-cli has no required credential by design (checked lazily at spawn),
    // and a mock seam is not a downgrade — it announces itself.
    const r = assessReadiness(
      cfg({ verifier: { provider: 'host-cli' }, specReview: { provider: 'host-cli' } }),
      {},
    );
    expect(r.seamsDowngraded).toEqual([]);
  });

  it('seamsDowngraded flags a local seam missing its base URL', () => {
    const r = assessReadiness(
      cfg({ verifier: { provider: 'host-cli' }, codeReview: { provider: 'local', model: 'm' } }),
      {},
    );
    expect(r.seamsDowngraded).toEqual(['codeReview']);
  });

  it('seamsDowngraded lists every affected seam, in VERIFIER_SEAMS order', () => {
    const r = assessReadiness(
      cfg({
        verifier: { provider: 'host-cli' },
        specReview: { provider: 'anthropic' },
        codeReview: { provider: 'anthropic' },
        planReview: { provider: 'anthropic' },
      }),
      {},
    );
    expect(r.seamsDowngraded).toEqual(['specReview', 'codeReview', 'planReview']);
  });

  it('local creds need a base URL and a model', () => {
    const c = cfg({ verifier: { provider: 'local', model: 'm' } });
    expect(credsPresent('local', 'verifier', c, {})).toBe(false);
    expect(credsPresent('local', 'verifier', c, { CADENCE_LOCAL_BASE_URL: 'http://x' })).toBe(true);
  });

  it('credsPresent treats a key discoverable only via .env as present (AC-1)', () => {
    const cwd = makeTmpDir();
    writeFileSync(join(cwd, '.env'), 'ANTHROPIC_API_KEY=from-dotenv\n');
    const c = cfg({ verifier: { provider: 'anthropic' } });
    expect(credsPresent('anthropic', 'verifier', c, {}, cwd)).toBe(true);
  });

  it('credsPresent resolves local base URL + model from .env (AC-1)', () => {
    const cwd = makeTmpDir();
    writeFileSync(
      cwd + '/.env',
      'CADENCE_LOCAL_BASE_URL=http://dotenv-host\nCADENCE_LOCAL_MODEL=dotenv-model\n',
    );
    const c = cfg({ verifier: { provider: 'local' } });
    expect(credsPresent('local', 'verifier', c, {}, cwd)).toBe(true);
  });

  it('assessReadiness is ready for a teammate whose key lives only in .env, once anthropic is committed to config (AC-1, AC-3)', () => {
    const cwd = makeTmpDir();
    writeFileSync(join(cwd, '.env'), 'ANTHROPIC_API_KEY=from-dotenv\n');
    // Simulates a teammate who never ran `cadence activate` themselves: the
    // provider choice came from committed config, and their key is only in .env.
    const r = assessReadiness(cfg({ verifier: { provider: 'anthropic' } }), {}, cwd);
    expect(r.provider).toBe('anthropic');
    expect(r.keyPresent).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.reason).toMatch(/credentials present/i);
  });

  it('assessReadiness without a cwd still defaults safely (no .env, no crash)', () => {
    const r = assessReadiness(cfg({ verifier: { provider: 'anthropic' } }), {});
    expect(r.provider).toBe('anthropic');
  });

  it('host-cli creds are present with no env at all — no required credential by design (AC-1)', () => {
    const c = cfg({ verifier: { provider: 'host-cli' } });
    expect(credsPresent('host-cli', 'verifier', c, {})).toBe(true);
  });

  it('host-cli creds are present when CADENCE_HOST_CLI_BIN overrides the default binary (AC-1)', () => {
    const c = cfg({ verifier: { provider: 'host-cli' } });
    expect(
      credsPresent('host-cli', 'verifier', c, { CADENCE_HOST_CLI_BIN: '/usr/local/bin/codex' }),
    ).toBe(true);
  });

  it('host-cli does not fall through to the local provider baseURL/model check (AC-1)', () => {
    // Regression guard: prior to the host-cli branch, an unhandled provider
    // silently fell through to local's `CADENCE_LOCAL_BASE_URL` + model check,
    // which would misreport a bare host-cli setup as "credentials missing".
    const c = cfg({ verifier: { provider: 'host-cli' } });
    expect(credsPresent('host-cli', 'verifier', c, {})).toBe(true);
  });

  it('assessReadiness reports host-cli as ready with no CADENCE_LOCAL_* / CADENCE_HOST_CLI_BIN env set (AC-1)', () => {
    const r = assessReadiness(cfg({ verifier: { provider: 'host-cli' } }), {});
    expect(r.provider).toBe('host-cli');
    expect(r.keyPresent).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.reason).toMatch(/host-cli/i);
  });
});

describe('isClaudeCodeSession (AC-1, phase 211)', () => {
  it('is true only when CLAUDECODE is exactly the string "1"', () => {
    expect(isClaudeCodeSession({ CLAUDECODE: '1' })).toBe(true);
  });

  it('is false when CLAUDECODE is unset', () => {
    expect(isClaudeCodeSession({})).toBe(false);
  });

  it('is false when CLAUDECODE is set to "0"', () => {
    expect(isClaudeCodeSession({ CLAUDECODE: '0' })).toBe(false);
  });

  it('is false when CLAUDECODE is set to "true"', () => {
    expect(isClaudeCodeSession({ CLAUDECODE: 'true' })).toBe(false);
  });
});
