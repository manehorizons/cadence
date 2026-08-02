import { describe, it, expect } from 'vitest';
import { defaultConfig, MOCK_VERIFIER_NOTICE } from '@thomas-powers-jr/cadence-types';
import { buildExplanation } from '../../src/config-explain/build.js';
import type { ExplainContext, WarningCode } from '../../src/config-explain/types.js';

const cleanCtx: ExplainContext = {
  activeTier: null,
  anthropicKeyPresent: true,
  localKeyPresent: true,
  hostHooksInstalled: true,
};

const codes = (config: Parameters<typeof buildExplanation>[0], ctx: ExplainContext): WarningCode[] =>
  buildExplanation(config, ctx).warnings.map((w) => w.code);

describe('buildExplanation — config-semantic warnings (AC-2)', () => {
  // AC-2: anthropic provider + missing key → provider-no-key; present key → none.
  it('AC-2: provider-no-key fires for anthropic without ANTHROPIC_API_KEY', () => {
    const config = { ...defaultConfig, verifier: { provider: 'anthropic' as const } };
    expect(codes(config, { ...cleanCtx, anthropicKeyPresent: false })).toContain('provider-no-key');
    expect(codes(config, cleanCtx)).not.toContain('provider-no-key');
  });

  // AC-2: the provider-no-key message for anthropic distinguishes a Claude Code
  // login from the ANTHROPIC_API_KEY the provider actually requires.
  it('AC-2: provider-no-key message for anthropic states a Claude Code login does not satisfy it', () => {
    const config = { ...defaultConfig, verifier: { provider: 'anthropic' as const } };
    const warnings = buildExplanation(config, { ...cleanCtx, anthropicKeyPresent: false }).warnings;
    const warning = warnings.find((w) => w.code === 'provider-no-key');
    expect(warning).toBeDefined();
    expect(warning!.message).toContain(
      "ANTHROPIC_API_KEY is unset — it will silently fall back to 'mock'",
    );
    expect(warning!.message).toContain(
      'a Claude Code/IDE login does not satisfy this — anthropic calls the Anthropic SDK directly and needs a separately API-billed key',
    );
  });

  // AC-2: local provider keys off CADENCE_LOCAL_API_KEY, not the anthropic key.
  it('AC-2: provider-no-key fires for local without CADENCE_LOCAL_API_KEY', () => {
    const config = { ...defaultConfig, codeReview: { provider: 'local' as const } };
    expect(codes(config, { ...cleanCtx, localKeyPresent: false })).toContain('provider-no-key');
    expect(codes(config, { ...cleanCtx, anthropicKeyPresent: false })).not.toContain(
      'provider-no-key',
    );
  });

  // AC-2: an all-mock config never raises provider-no-key, even with no keys.
  it('AC-2: mock providers never raise provider-no-key', () => {
    expect(
      codes(defaultConfig, { ...cleanCtx, anthropicKeyPresent: false, localKeyPresent: false }),
    ).not.toContain('provider-no-key');
  });

  // AC-2: a hooks.* flag on with the adapter uninstalled → hooks-not-installed.
  it('AC-2: hooks-not-installed fires when a hook is enabled but the adapter is absent', () => {
    // defaultConfig has sessionStart/stopReminder/userPromptSubmit = true.
    expect(codes(defaultConfig, { ...cleanCtx, hostHooksInstalled: false })).toContain(
      'hooks-not-installed',
    );
    expect(codes(defaultConfig, cleanCtx)).not.toContain('hooks-not-installed');
  });

  // AC-2: no hooks enabled → no warning even when the adapter is absent.
  it('AC-2: hooks-not-installed does not fire when every hook is off', () => {
    const config = {
      ...defaultConfig,
      hooks: { sessionStart: false, stopReminder: false, preToolUseBuildGate: false, userPromptSubmit: false },
    };
    expect(codes(config, { ...cleanCtx, hostHooksInstalled: false })).not.toContain(
      'hooks-not-installed',
    );
  });

  // AC-2: auto profile soft-caps complex → auto-complex-softcap; standard/strict do not.
  it('AC-2: auto-complex-softcap fires only under the auto profile', () => {
    expect(codes({ ...defaultConfig, profile: 'auto' as const }, cleanCtx)).toContain(
      'auto-complex-softcap',
    );
    expect(codes({ ...defaultConfig, profile: 'standard' as const }, cleanCtx)).not.toContain(
      'auto-complex-softcap',
    );
    expect(codes({ ...defaultConfig, profile: 'strict' as const }, cleanCtx)).not.toContain(
      'auto-complex-softcap',
    );
  });

  // AC-2: every warning message (except all-mock, which points at cadence activate)
  // points the reader at `cadence doctor`.
  it('AC-2: warning messages point to cadence doctor (except all-mock)', () => {
    const config = { ...defaultConfig, profile: 'auto' as const, verifier: { provider: 'anthropic' as const } };
    const warnings = buildExplanation(config, {
      ...cleanCtx,
      anthropicKeyPresent: false,
      hostHooksInstalled: false,
    }).warnings;
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      if (w.code !== 'all-mock') expect(w.message).toMatch(/cadence doctor/);
    }
  });

  // AC-4: the all-mock warning fires on the default newcomer state and points at activate.
  it('AC-4 (wiring): all-mock fires when every provider is mock', () => {
    const warnings = buildExplanation(defaultConfig, {
      ...cleanCtx,
      anthropicKeyPresent: false,
      localKeyPresent: false,
    }).warnings;
    const allMock = warnings.find((w) => w.code === 'all-mock');
    expect(allMock).toBeDefined();
    expect(allMock!.message).toMatch(/cadence activate/);
  });

  // phase-104 AC-1/Q3: the all-mock warning is sourced from MOCK_VERIFIER_NOTICE.
  it('phase-104: all-mock message embeds the single source-of-truth notice', () => {
    const warnings = buildExplanation(defaultConfig, {
      ...cleanCtx,
      anthropicKeyPresent: false,
      localKeyPresent: false,
    }).warnings;
    const allMock = warnings.find((w) => w.code === 'all-mock');
    expect(allMock!.message).toContain(MOCK_VERIFIER_NOTICE.message);
  });
});
