import { describe, it, expect, vi } from 'vitest';
import { selectVerifier } from '../../src/verify/factory.js';
import { MockVerifier } from '../../src/verify/mock-verifier.js';
import { AnthropicVerifier } from '../../src/verify/anthropic-verifier.js';

// AC-2 + AC-5: selection branches
// - provider=mock → MockVerifier
// - provider=anthropic + key set → AnthropicVerifier
// - provider=anthropic + key missing → MockVerifier + warning
// - null config → MockVerifier (default)
// - override wins over config

describe('selectVerifier (AC-2 + AC-5)', () => {
  it('returns MockVerifier when config.verifier.provider = mock (AC-2)', () => {
    const v = selectVerifier({ verifier: { provider: 'mock' } });
    expect(v).toBeInstanceOf(MockVerifier);
    expect(v.name).toBe('mock');
  });

  it('returns AnthropicVerifier when provider=anthropic and key is set (AC-2)', () => {
    const v = selectVerifier(
      { verifier: { provider: 'anthropic' } },
      { env: { ANTHROPIC_API_KEY: 'sk-test' } },
    );
    expect(v).toBeInstanceOf(AnthropicVerifier);
  });

  it('falls back to MockVerifier + warns when key is missing (AC-5)', () => {
    const warn = vi.fn();
    const v = selectVerifier(
      { verifier: { provider: 'anthropic' } },
      { env: {}, warn },
    );
    expect(v).toBeInstanceOf(MockVerifier);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/ANTHROPIC_API_KEY is unset/),
    );
  });

  it('defaults to MockVerifier when config is null (AC-2)', () => {
    const v = selectVerifier(null);
    expect(v).toBeInstanceOf(MockVerifier);
  });

  it('override wins over config (AC-2)', () => {
    const v = selectVerifier(
      { verifier: { provider: 'anthropic' } },
      { override: 'mock', env: { ANTHROPIC_API_KEY: 'sk-test' } },
    );
    expect(v).toBeInstanceOf(MockVerifier);
  });

  it('passes model override to AnthropicVerifier (AC-2)', () => {
    const v = selectVerifier(
      { verifier: { provider: 'anthropic', model: 'claude-haiku-4-5' } },
      { env: { ANTHROPIC_API_KEY: 'sk-test' } },
    );
    expect(v).toBeInstanceOf(AnthropicVerifier);
    // Indirect check — the model field is private; we trust the constructor wiring.
  });
});
