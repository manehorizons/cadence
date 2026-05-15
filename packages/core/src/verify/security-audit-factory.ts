import type { CadenceConfig } from '@cadence/types';
import {
  AnthropicSecurityAuditVerifier,
  MockSecurityAuditVerifier,
  type SecurityAuditVerifier,
} from './security-audit.js';

export interface SelectSecurityAuditVerifierOptions {
  /** Override `config.securityAudit.provider`. */
  override?: 'mock' | 'anthropic';
  /** Test seam: stand in for `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Test seam: emit warnings somewhere other than `process.stderr`. */
  warn?: (message: string) => void;
}

/**
 * Picks the security-audit verifier given config + env. Falls back to mock
 * when the Anthropic provider is requested but `ANTHROPIC_API_KEY` is
 * missing — with a stderr warning so the caller knows the downgrade
 * happened. Mirrors `selectCodeReviewVerifier` (Phase 24.3) /
 * `selectPlanReviewVerifier` (Phase 25.1).
 */
export function selectSecurityAuditVerifier(
  config: Pick<CadenceConfig, 'securityAudit'> | null,
  opts: SelectSecurityAuditVerifierOptions = {},
): SecurityAuditVerifier {
  const provider =
    opts.override ?? config?.securityAudit?.provider ?? 'mock';
  const env = opts.env ?? process.env;
  const warn = opts.warn ?? ((m: string) => process.stderr.write(m + '\n'));

  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      warn(
        'security-audit: anthropic provider requested but ANTHROPIC_API_KEY is unset — falling back to mock provider.',
      );
      return new MockSecurityAuditVerifier();
    }
    const model = config?.securityAudit?.model;
    return new AnthropicSecurityAuditVerifier({
      apiKey: env.ANTHROPIC_API_KEY,
      ...(model ? { model } : {}),
    });
  }

  return new MockSecurityAuditVerifier();
}
