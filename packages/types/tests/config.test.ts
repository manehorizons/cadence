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

  // AC-1 (Phase 165) — host-cli provider accepted by the schema.
  it('accepts provider "host-cli" on the verifier (deep-verify) seam (AC-1)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verifier: { provider: 'host-cli' },
    });
    expect(parsed.verifier.provider).toBe('host-cli');
  });

  it('accepts provider "host-cli" on every LLM gate (AC-1)', () => {
    const cfg = CadenceConfigZ.parse({
      ...defaultConfig,
      verifier: { provider: 'host-cli' },
      perTaskVerifier: { provider: 'host-cli' },
      codeReview: { provider: 'host-cli' },
      planReview: { provider: 'host-cli' },
      securityAudit: { provider: 'host-cli' },
      specReview: { provider: 'host-cli' },
    });
    expect(cfg.verifier.provider).toBe('host-cli');
    expect(cfg.perTaskVerifier.provider).toBe('host-cli');
    expect(cfg.codeReview.provider).toBe('host-cli');
    expect(cfg.planReview.provider).toBe('host-cli');
    expect(cfg.securityAudit.provider).toBe('host-cli');
    expect(cfg.specReview.provider).toBe('host-cli');
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

describe('phaseGuard config (AC-7)', () => {
  it('AC-7: applies defaults { enabled: true, integrationRef: "main" } when omitted', () => {
    const { phaseGuard: _drop, ...withoutGuard } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutGuard);
    expect(parsed.phaseGuard).toEqual({ enabled: true, integrationRef: 'main' });
  });

  it('AC-7: round-trips enabled:false and a custom integrationRef', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      phaseGuard: { enabled: false, integrationRef: 'develop' },
    });
    expect(parsed.phaseGuard).toEqual({ enabled: false, integrationRef: 'develop' });
  });

  it('AC-7: defaultConfig includes the phaseGuard block', () => {
    expect(defaultConfig.phaseGuard).toEqual({ enabled: true, integrationRef: 'main' });
  });

  it('AC-7: rejects a non-boolean enabled', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, phaseGuard: { enabled: 'yes' as never } }),
    ).toThrow();
  });
});

describe('handoff retention config (AC-1)', () => {
  it('AC-1: applies an empty handoff block (retention disabled) when omitted', () => {
    const { handoff: _drop, ...withoutHandoff } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutHandoff);
    expect(parsed.handoff).toEqual({});
    expect(parsed.handoff.retain).toBeUndefined();
  });

  it('AC-1: defaultConfig includes an empty handoff block', () => {
    expect(defaultConfig.handoff).toEqual({});
  });

  it('AC-1: round-trips a positive integer retain', () => {
    const parsed = CadenceConfigZ.parse({ ...defaultConfig, handoff: { retain: 10 } });
    expect(parsed.handoff.retain).toBe(10);
  });

  it('AC-1: rejects retain below 1', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, handoff: { retain: 0 } }),
    ).toThrow();
  });

  it('AC-1: rejects a non-integer retain', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, handoff: { retain: 1.5 } }),
    ).toThrow();
  });
});

describe('recommendations auto-archive config (Phase 102 / AC-1)', () => {
  it('AC-1: applies autoArchive=true when the block is omitted (pre-v1.24)', () => {
    const { recommendations: _drop, ...without } = defaultConfig;
    const parsed = CadenceConfigZ.parse(without);
    expect(parsed.recommendations.autoArchive).toBe(true);
  });

  it('AC-1: applies autoArchive=true when recommendations is an empty object', () => {
    const parsed = CadenceConfigZ.parse({ ...defaultConfig, recommendations: {} });
    expect(parsed.recommendations.autoArchive).toBe(true);
  });

  it('AC-1: defaultConfig carries recommendations.autoArchive=true', () => {
    expect(defaultConfig.recommendations.autoArchive).toBe(true);
  });

  it('AC-1: round-trips an explicit autoArchive=false', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      recommendations: { autoArchive: false },
    });
    expect(parsed.recommendations.autoArchive).toBe(false);
  });

  it('AC-1: rejects a non-boolean autoArchive', () => {
    expect(() =>
      CadenceConfigZ.parse({
        ...defaultConfig,
        recommendations: { autoArchive: 'yes' as never },
      }),
    ).toThrow();
  });
});

describe('verification.coverageMode (phase 108)', () => {
  it('defaults to "mention" when omitted (AC-1)', () => {
    const { verification: _drop, ...withoutVerification } = defaultConfig;
    const cfg = CadenceConfigZ.parse(withoutVerification);
    expect(cfg.verification.coverageMode).toBe('mention');
  });

  it('accepts "assertion" (AC-1)', () => {
    const cfg = CadenceConfigZ.parse({ ...defaultConfig, verification: { coverageMode: 'assertion' } });
    expect(cfg.verification.coverageMode).toBe('assertion');
  });

  it('rejects an unknown mode (AC-1)', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, verification: { coverageMode: 'fuzzy' as never } }),
    ).toThrow();
  });
});

describe('verification.coverageProfiles schema (phase 167 T7, AC-7)', () => {
  it('AC-7: defaults to [] when verification is entirely omitted', () => {
    const { verification: _drop, ...withoutVerification } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutVerification);
    expect(parsed.verification.coverageProfiles).toEqual([]);
  });

  it('AC-7: defaults to [] when verification is present but coverageProfiles is omitted', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verification: { testGlobs: ['packages/**/*.test.ts'] },
    });
    expect(parsed.verification.coverageProfiles).toEqual([]);
  });

  it('AC-7: defaultConfig itself carries an empty coverageProfiles list', () => {
    expect(defaultConfig.verification.coverageProfiles).toEqual([]);
  });

  it('AC-7: accepts a well-formed custom profile entry (Ruby-style do-end-keyword shape)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verification: {
        coverageProfiles: [
          {
            id: 'ruby-rspec',
            extensions: ['.rb'],
            openerPattern: String.raw`\bit\s+'[^']*'\s+do\b`,
            assertionPattern: String.raw`\bexpect\s*\(`,
            strategy: 'do-end-keyword',
            keyword: { blockOpenKeywords: ['do'], endKeyword: 'end' },
            openerMatchesStrings: true,
            syntax: {
              comments: { line: ['#'] },
              strings: [{ open: "'" }, { open: '"' }],
            },
          },
        ],
      },
    });
    expect(parsed.verification.coverageProfiles).toHaveLength(1);
    expect(parsed.verification.coverageProfiles[0]?.id).toBe('ruby-rspec');
    expect(parsed.verification.coverageProfiles[0]?.keyword).toEqual({
      blockOpenKeywords: ['do'],
      endKeyword: 'end',
    });
  });

  it('AC-7: syntax.comments/strings default to empty arrays when omitted', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verification: {
        coverageProfiles: [
          {
            id: 'bare',
            extensions: ['.bare'],
            openerPattern: 'x',
            assertionPattern: 'y',
            strategy: 'call-expression',
            syntax: {},
          },
        ],
      },
    });
    expect(parsed.verification.coverageProfiles[0]?.syntax).toEqual({
      comments: { line: [], block: [] },
      strings: [],
    });
  });

  it('AC-7: rejects a coverageProfiles entry missing required fields (e.g. no strategy)', () => {
    expect(() =>
      CadenceConfigZ.parse({
        ...defaultConfig,
        verification: {
          coverageProfiles: [
            {
              id: 'bad',
              extensions: ['.bad'],
              openerPattern: 'x',
              assertionPattern: 'y',
              syntax: {},
            } as never,
          ],
        },
      }),
    ).toThrow();
  });

  it('AC-7: rejects a coverageProfiles entry missing required "syntax"', () => {
    expect(() =>
      CadenceConfigZ.parse({
        ...defaultConfig,
        verification: {
          coverageProfiles: [
            {
              id: 'bad',
              extensions: ['.bad'],
              openerPattern: 'x',
              assertionPattern: 'y',
              strategy: 'call-expression',
            } as never,
          ],
        },
      }),
    ).toThrow();
  });

  it('AC-7: rejects an empty extensions array', () => {
    expect(() =>
      CadenceConfigZ.parse({
        ...defaultConfig,
        verification: {
          coverageProfiles: [
            {
              id: 'bad',
              extensions: [],
              openerPattern: 'x',
              assertionPattern: 'y',
              strategy: 'call-expression',
              syntax: {},
            },
          ],
        },
      }),
    ).toThrow();
  });

  it('AC-7: rejects an unknown strategy literal', () => {
    expect(() =>
      CadenceConfigZ.parse({
        ...defaultConfig,
        verification: {
          coverageProfiles: [
            {
              id: 'bad',
              extensions: ['.bad'],
              openerPattern: 'x',
              assertionPattern: 'y',
              strategy: 'regex-magic' as never,
              syntax: {},
            },
          ],
        },
      }),
    ).toThrow();
  });

  it('AC-7: accepts a do-end-keyword entry with no keyword config at the SCHEMA level (the conditional requirement is enforced at config-load time, not by this schema — see packages/core/src/verify/coverage-profiles/custom.ts)', () => {
    // Deliberate: the schema alone cannot express "keyword required iff
    // strategy === 'do-end-keyword'" with a message naming the field and a
    // suggested fix as clearly as plain TypeScript can — see
    // CoverageProfileConfigZ's `keyword` field docstring. This shape is
    // schema-valid but refused by core's compileCustomProfile at load time.
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verification: {
        coverageProfiles: [
          {
            id: 'incomplete-keyword-profile',
            extensions: ['.kw'],
            openerPattern: 'x',
            assertionPattern: 'y',
            strategy: 'do-end-keyword',
            syntax: {},
          },
        ],
      },
    });
    expect(parsed.verification.coverageProfiles[0]?.keyword).toBeUndefined();
  });
});

describe('verification.coverageMode default flip (phase 139 / AC-1)', () => {
  it('defaultConfig.verification.coverageMode is "assertion"', () => {
    expect(defaultConfig.verification.coverageMode).toBe('assertion');
  });

  it('all three presets inherit "assertion" — solo, team, production alike', () => {
    expect(presets.solo.verification.coverageMode).toBe('assertion');
    expect(presets.team.verification.coverageMode).toBe('assertion');
    expect(presets.production.verification.coverageMode).toBe('assertion');
  });
});

describe('gates.sealed config (Phase 141 / AC-1)', () => {
  it('AC-1: applies gates: { sealed: [] } when gates is omitted (back-compat)', () => {
    const { gates: _drop, ...withoutGates } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutGates);
    expect(parsed.gates).toEqual({ sealed: [] });
  });

  it('AC-1: defaultConfig carries gates.sealed as an empty array', () => {
    expect(defaultConfig.gates.sealed).toEqual([]);
  });

  it('AC-1: accepts gates: { sealed: ["test-coverage"] }', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      gates: { sealed: ['test-coverage'] },
    });
    expect(parsed.gates.sealed).toEqual(['test-coverage']);
  });

  it('AC-1: accepts gates: { sealed: ["test-coverage", "deep-verify"] }', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      gates: { sealed: ['test-coverage', 'deep-verify'] },
    });
    expect(parsed.gates.sealed).toEqual(['test-coverage', 'deep-verify']);
  });

  it('AC-1: rejects non-string entries in gates.sealed', () => {
    expect(() =>
      CadenceConfigZ.parse({
        ...defaultConfig,
        gates: { sealed: [42] as never },
      }),
    ).toThrow();
  });

  it('AC-2: production preset seals test-coverage and build-test-must-pass', () => {
    expect(presets.production.gates.sealed).toEqual(['test-coverage', 'build-test-must-pass']);
    expect(presets.solo.gates.sealed).toEqual([]);
    expect(presets.team.gates.sealed).toEqual([]);
  });
});

describe('resume cross-worktree config (AC-8)', () => {
  it('AC-8: applies defaults { crossWorktree: true, autoList: false } when omitted', () => {
    const { resume: _drop, ...withoutResume } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutResume);
    expect(parsed.resume).toEqual({ crossWorktree: true, autoList: false, remoteCheck: true });
  });

  it('AC-8: defaultConfig includes the resume block', () => {
    expect(defaultConfig.resume).toEqual({ crossWorktree: true, autoList: false, remoteCheck: true });
  });

  it('AC-8: round-trips crossWorktree:false and autoList:true', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      resume: { crossWorktree: false, autoList: true },
    });
    expect(parsed.resume).toEqual({ crossWorktree: false, autoList: true, remoteCheck: true });
  });

  it('AC-8: defaults individual sub-fields when only partial object provided', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      resume: { crossWorktree: false },
    });
    expect(parsed.resume).toEqual({ crossWorktree: false, autoList: false, remoteCheck: true });
  });

  it('AC-8: defaults individual sub-fields when only autoList provided', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      resume: { autoList: true },
    });
    expect(parsed.resume).toEqual({ crossWorktree: true, autoList: true, remoteCheck: true });
  });

  it('AC-8: rejects a non-boolean crossWorktree', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, resume: { crossWorktree: 'yes' as never } }),
    ).toThrow();
  });

  it('AC-8: rejects a non-boolean autoList', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, resume: { autoList: 1 as never } }),
    ).toThrow();
  });
});

describe('boundaryEnforcement config (Phase 155 / AC-1)', () => {
  it('AC-1: applies boundaryEnforcement: "warn" when omitted (back-compat)', () => {
    const { boundaryEnforcement: _drop, ...withoutIt } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutIt);
    expect(parsed.boundaryEnforcement).toBe('warn');
  });

  it('AC-1: defaultConfig carries boundaryEnforcement: "warn"', () => {
    expect(defaultConfig.boundaryEnforcement).toBe('warn');
  });

  it('AC-1: accepts boundaryEnforcement: "block"', () => {
    const parsed = CadenceConfigZ.parse({ ...defaultConfig, boundaryEnforcement: 'block' });
    expect(parsed.boundaryEnforcement).toBe('block');
  });

  it('AC-1: rejects an unknown boundaryEnforcement value', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, boundaryEnforcement: 'refuse' as never }),
    ).toThrow();
  });

  it('AC-1: is top-level, not nested under hooks', () => {
    expect(defaultConfig.hooks).not.toHaveProperty('boundaryEnforcement');
  });
});

describe('redundantWorkEnforcement config', () => {
  it('applies redundantWorkEnforcement: "warn" when omitted (back-compat)', () => {
    const { redundantWorkEnforcement: _drop, ...withoutIt } = defaultConfig;
    const parsed = CadenceConfigZ.parse(withoutIt);
    expect(parsed.redundantWorkEnforcement).toBe('warn');
  });

  it('defaultConfig carries redundantWorkEnforcement: "warn"', () => {
    expect(defaultConfig.redundantWorkEnforcement).toBe('warn');
  });

  it('accepts "off" and "block"', () => {
    expect(
      CadenceConfigZ.parse({ ...defaultConfig, redundantWorkEnforcement: 'off' })
        .redundantWorkEnforcement,
    ).toBe('off');
    expect(
      CadenceConfigZ.parse({ ...defaultConfig, redundantWorkEnforcement: 'block' })
        .redundantWorkEnforcement,
    ).toBe('block');
  });

  it('rejects an unknown redundantWorkEnforcement value', () => {
    expect(() =>
      CadenceConfigZ.parse({ ...defaultConfig, redundantWorkEnforcement: 'refuse' as never }),
    ).toThrow();
  });

  it('is top-level, not nested under hooks', () => {
    expect(defaultConfig.hooks).not.toHaveProperty('redundantWorkEnforcement');
  });
});
