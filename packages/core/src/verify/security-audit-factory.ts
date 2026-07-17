import type { CadenceConfig } from '@manehorizons/cadence-types';
import {
  AnthropicSecurityAuditVerifier,
  HostCliSecurityAuditVerifier,
  LocalSecurityAuditVerifier,
  MockSecurityAuditVerifier,
  type SecurityAuditVerifier,
} from './security-audit.js';
import {
  createVerifierFactory,
  type VerifierSelectOptions,
} from './verifier-factory.js';

/** @deprecated alias of `VerifierSelectOptions` (kept for API stability). */
export type SelectSecurityAuditVerifierOptions = VerifierSelectOptions;

/** Picks the security-audit verifier given config + env (Phase 25.2). */
export const selectSecurityAuditVerifier = createVerifierFactory<
  Pick<CadenceConfig, 'securityAudit'>,
  SecurityAuditVerifier
>({
  label: 'security-audit',
  read: (c) => c?.securityAudit,
  mock: () => new MockSecurityAuditVerifier(),
  anthropic: (o) => new AnthropicSecurityAuditVerifier(o),
  local: (o) => new LocalSecurityAuditVerifier(o),
  hostCli: (o) => new HostCliSecurityAuditVerifier(o),
});
