import { describe, it, expect } from 'vitest';
import { CadenceConfigZ, defaultConfig, presets } from '../src/config.js';

describe('CadenceConfigZ', () => {
  it('accepts default config', () => {
    expect(() => CadenceConfigZ.parse(defaultConfig)).not.toThrow();
  });

  it('rejects invalid loopEnforcement', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, loopEnforcement: 'nope' }),
    ).toThrow();
  });

  it('clamps contextBudgetThreshold to valid range', () => {
    const cfg = { ...defaultConfig, subagentPolicy: { ...defaultConfig.subagentPolicy, contextBudgetThreshold: 1.5 } };
    expect(() => CadenceConfigZ.parse(cfg)).toThrow();
  });

  it('exports three named presets', () => {
    expect(presets.solo.loopEnforcement).toBe('reminder');
    expect(presets.team.loopEnforcement).toBe('soft');
    expect(presets.production.loopEnforcement).toBe('strict');
  });

  it('profile defaults to "auto" when omitted', () => {
    const { profile: _drop, ...withoutProfile } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutProfile);
    expect(parsed.profile).toBe('auto');
  });

  it('accepts profile = strict | standard | auto', () => {
    for (const p of ['strict', 'standard', 'auto'] as const) {
      expect(() => CadenceConfigZ.parse({ ...defaultConfig, profile: p })).not.toThrow();
    }
  });

  it('rejects unknown profile literal', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, profile: 'lenient' as never }),
    ).toThrow();
  });

  it('verification.testGlobs defaults to packages/**/*.test.ts(x) when absent (AC-4)', () => {
    const { verification: _drop, ...withoutVerify } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutVerify);
    expect(parsed.verification.testGlobs).toEqual([
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
    ]);
  });

  it('accepts a custom verification.testGlobs array (AC-4)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verification: { testGlobs: ['apps/**/*.spec.ts'] },
    });
    expect(parsed.verification.testGlobs).toEqual(['apps/**/*.spec.ts']);
  });

  it('accepts an optional verification.testCommand for build-test-must-pass (Phase 39.2)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verification: { testGlobs: ['packages/**/*.test.ts'], testCommand: 'pnpm test' },
    });
    expect(parsed.verification.testCommand).toBe('pnpm test');
  });

  it('leaves verification.testCommand undefined when absent (back-compat, Phase 39.2)', () => {
    const { verification: _drop, ...withoutVerify } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutVerify);
    expect(parsed.verification.testCommand).toBeUndefined();
  });

  it('rejects non-string entries in verification.testGlobs', () => {
    expect(() =>
      CadenceConfigZ.parse({
        ...defaultConfig,
        verification: { testGlobs: [42] as never },
      }),
    ).toThrow();
  });

  it('verifier defaults to provider=mock when absent', () => {
    const { verifier: _drop, ...withoutVerifier } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutVerifier);
    expect(parsed.verifier.provider).toBe('mock');
  });

  it('accepts verifier provider = mock | anthropic', () => {
    for (const p of ['mock', 'anthropic'] as const) {
      expect(() =>
        CadenceConfigZ.parse({ ...defaultConfig, verifier: { provider: p } }),
      ).not.toThrow();
    }
  });

  it('rejects unknown verifier provider', () => {
    expect(() =>
      CadenceConfigZ.parse({
        ...defaultConfig,
        verifier: { provider: 'openai' as never },
      }),
    ).toThrow();
  });

  it('accepts verifier.model override', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verifier: { provider: 'anthropic', model: 'claude-haiku-4-5' },
    });
    expect(parsed.verifier.model).toBe('claude-haiku-4-5');
  });

  it('accepts provider "local" on every LLM gate', () => {
    const cfg = CadenceConfigZ.parse({
      ...defaultConfig,
      verifier: { provider: 'local' },
      perTaskVerifier: { provider: 'local' },
      codeReview: { provider: 'local' },
      planReview: { provider: 'local' },
      securityAudit: { provider: 'local' },
    });
    expect(cfg.verifier.provider).toBe('local');
    expect(cfg.perTaskVerifier.provider).toBe('local');
    expect(cfg.codeReview.provider).toBe('local');
    expect(cfg.planReview.provider).toBe('local');
    expect(cfg.securityAudit.provider).toBe('local');
  });

  // AC-3 (Phase 70) — verifier.diffCapBytes: back-compat default + bounds.
  it('verifier.diffCapBytes defaults to 262144 when absent (AC-3)', () => {
    const { verifier: _drop, ...withoutVerifier } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutVerifier);
    expect(parsed.verifier.diffCapBytes).toBe(262144);
  });

  it('verifier.diffCapBytes round-trips an override (AC-3)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verifier: { provider: 'anthropic', diffCapBytes: 1000 },
    });
    expect(parsed.verifier.diffCapBytes).toBe(1000);
  });

  it('rejects non-positive / non-int verifier.diffCapBytes (AC-3)', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, verifier: { diffCapBytes: 0 } }),
    ).toThrow();
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, verifier: { diffCapBytes: -5 } }),
    ).toThrow();
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, verifier: { diffCapBytes: 1.5 } }),
    ).toThrow();
  });

  // AC-3 (Phase 72) — verifier provider-hardening fields: back-compat + validation.
  it('a v1.14-shaped verifier slice still validates with no new fields (AC-3)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verifier: { provider: 'anthropic', diffCapBytes: 262144 },
    });
    expect(parsed.verifier.timeoutMs).toBeUndefined();
    expect(parsed.verifier.maxRetries).toBeUndefined();
    expect(parsed.verifier.localHeaders).toBeUndefined();
  });

  it('accepts verifier.timeoutMs + verifier.maxRetries + verifier.localHeaders (AC-3)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verifier: {
        provider: 'anthropic',
        timeoutMs: 30_000,
        maxRetries: 4,
        localHeaders: { 'x-tenant': 'acme' },
      },
    });
    expect(parsed.verifier.timeoutMs).toBe(30_000);
    expect(parsed.verifier.maxRetries).toBe(4);
    expect(parsed.verifier.localHeaders).toEqual({ 'x-tenant': 'acme' });
  });

  it('rejects non-positive/non-int timeoutMs and negative/non-int maxRetries (AC-3)', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, verifier: { timeoutMs: 0 } }),
    ).toThrow();
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, verifier: { timeoutMs: 1.5 } }),
    ).toThrow();
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, verifier: { maxRetries: -1 } }),
    ).toThrow();
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, verifier: { maxRetries: 2.5 } }),
    ).toThrow();
  });

  it('accepts maxRetries = 0 (no retries) (AC-3)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verifier: { maxRetries: 0 },
    });
    expect(parsed.verifier.maxRetries).toBe(0);
  });

  it('notify defaults to transport=stderr when absent', () => {
    const { notify: _drop, ...withoutNotify } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutNotify);
    expect(parsed.notify.transport).toBe('stderr');
    expect(parsed.notify.file).toBeUndefined();
  });

  it('accepts notify.transport = stderr | file | none | webhook', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, notify: { transport: 'stderr' } }),
    ).not.toThrow();
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, notify: { transport: 'file' } }),
    ).not.toThrow();
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, notify: { transport: 'none' } }),
    ).not.toThrow();
    expect(() =>
      CadenceConfigZ.parse({
        ...defaultConfig,
        notify: { transport: 'webhook', webhook: { url: 'https://example.com/hook' } },
      }),
    ).not.toThrow();
  });

  it('rejects unknown notify.transport literal', () => {
    expect(() =>
      CadenceConfigZ.parse({
        ...defaultConfig,
        notify: { transport: 'pigeon' as never },
      }),
    ).toThrow();
  });

  it('accepts notify.file override for file transport', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      notify: { transport: 'file', file: 'logs/anomalies.log' },
    });
    expect(parsed.notify.file).toBe('logs/anomalies.log');
  });

  // AC-1 (Phase 19.1) — webhook transport schema.
  it('accepts notify.transport=webhook with a valid webhook block', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      notify: {
        transport: 'webhook',
        webhook: { url: 'https://hooks.example.com/abc', headers: { Authorization: 'Bearer xyz' }, timeoutMs: 3000 },
      },
    });
    expect(parsed.notify.transport).toBe('webhook');
    expect(parsed.notify.webhook?.url).toBe('https://hooks.example.com/abc');
    expect(parsed.notify.webhook?.headers?.Authorization).toBe('Bearer xyz');
    expect(parsed.notify.webhook?.timeoutMs).toBe(3000);
  });

  it('rejects notify.transport=webhook without a webhook block (refinement)', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, notify: { transport: 'webhook' } }),
    ).toThrow(/webhook\.url is required/);
  });

  it('rejects notify.webhook.url that is not a valid URL', () => {
    expect(() =>
      CadenceConfigZ.parse({
        ...defaultConfig,
        notify: { transport: 'webhook', webhook: { url: 'not-a-url' } },
      }),
    ).toThrow();
  });

  it('accepts notify.webhook with only url (headers + timeoutMs optional)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      notify: { transport: 'webhook', webhook: { url: 'https://example.com/hook' } },
    });
    expect(parsed.notify.webhook?.headers).toBeUndefined();
    expect(parsed.notify.webhook?.timeoutMs).toBeUndefined();
  });

  // AC-1 / AC-5 (Phase 34.1) — skillAudit.required: back-compat default + accepts list.
  it('skillAudit.required defaults to [] when skillAudit absent (back-compat) (AC-1)', () => {
    const { skillAudit: _drop, ...withoutSkillAudit } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutSkillAudit);
    expect(parsed.skillAudit.required).toEqual([]);
  });

  it('skillAudit.required round-trips a declared list (AC-1)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      skillAudit: { required: ['brainstorming', 'writing-plans'] },
    });
    expect(parsed.skillAudit.required).toEqual(['brainstorming', 'writing-plans']);
  });

  it('rejects non-string entries in skillAudit.required (AC-5)', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, skillAudit: { required: [42] as never } }),
    ).toThrow();
  });

  // AC-5 (Phase 35.1) — convergence.maxAttempts: back-compat default + bounds.
  it('convergence.maxAttempts defaults to 3 when convergence absent (back-compat) (AC-5)', () => {
    const { convergence: _drop, ...withoutConvergence } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutConvergence);
    expect(parsed.convergence.maxAttempts).toBe(3);
  });

  it('convergence.maxAttempts round-trips an override (AC-5)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      convergence: { maxAttempts: 5 },
    });
    expect(parsed.convergence.maxAttempts).toBe(5);
  });

  it('rejects non-positive / non-int convergence.maxAttempts (AC-5)', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, convergence: { maxAttempts: 0 } }),
    ).toThrow();
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, convergence: { maxAttempts: 1.5 } }),
    ).toThrow();
  });

  // AC-6 (Phase 36.1) — config.specReview: back-compat default + provider enum.
  it('specReview defaults to provider=mock when absent (back-compat) (AC-6)', () => {
    const { specReview: _drop, ...withoutSpecReview } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutSpecReview);
    expect(parsed.specReview.provider).toBe('mock');
  });

  it('specReview round-trips a provider override (AC-6)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      specReview: { provider: 'local', model: 'qwen3-coder:30b' },
    });
    expect(parsed.specReview.provider).toBe('local');
    expect(parsed.specReview.model).toBe('qwen3-coder:30b');
  });

  it('rejects unknown specReview provider (AC-6)', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, specReview: { provider: 'openai' as never } }),
    ).toThrow();
  });

  // AC-7 (Phase 80) — config.logging: optional block, back-compat default.
  it('logging defaults to level=silent when logging absent (back-compat) (AC-7)', () => {
    const { logging: _drop, ...withoutLogging } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutLogging);
    expect(parsed.logging.level).toBe('silent');
    expect(parsed.logging.format).toBeUndefined();
  });

  it('logging round-trips level + format overrides (AC-7)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      logging: { level: 'debug', format: 'json' },
    });
    expect(parsed.logging.level).toBe('debug');
    expect(parsed.logging.format).toBe('json');
  });

  it('logging.level defaults to silent when only format is given (AC-7)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      logging: { format: 'pretty' },
    });
    expect(parsed.logging.level).toBe('silent');
    expect(parsed.logging.format).toBe('pretty');
  });

  it('rejects unknown logging.level and logging.format (AC-7)', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, logging: { level: 'verbose' as never } }),
    ).toThrow();
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, logging: { format: 'xml' as never } }),
    ).toThrow();
  });
});
