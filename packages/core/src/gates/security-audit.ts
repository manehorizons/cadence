import { randomUUID } from 'node:crypto';
import { redactSecrets } from '../security/redact.js';
import type { GateImpl, GateResult } from './types.js';

/**
 * Security-audit verifier gate (Phase 25.2). Extracted from settle.ts verbatim
 * (Phase 39.5). The final, most expensive gate — fires on membership
 * ('security-audit', strict×complex only). Runs an OWASP-aware pass over the
 * touched-file diff; CRITICAL findings refuse settle unless --force /
 * --allow-security-audit-failure. All findings land on SUMMARY.securityAudit.
 * Reaches git + the auditor only through ctx ports.
 */
export const runSecurityAuditGate: GateImpl = async (ctx): Promise<GateResult> => {
  const touched = [...ctx.touchedFiles];
  const diff = ctx.diff();
  try {
    // Phase 184: a per-run trace id, generated fresh on every gate run, is
    // passed to the verifier's optional `opts` parameter so a `traceId` can
    // be correlated across the call — proving the plumbing is genuinely
    // connected end-to-end rather than plumbed-and-unused.
    const traceId = randomUUID();
    const result = await ctx.verifiers.securityAudit.verify(
      { files: touched, diff },
      { traceId },
    );
    const securityAuditFindings = result.findings.map((f) => ({
      ...f,
      message: redactSecrets(f.message),
    }));
    const criticals = securityAuditFindings.filter((f) => f.severity === 'critical');
    const bypassed =
      ctx.opts.force === true || ctx.opts.allowSecurityAuditFailure === true;
    if (criticals.length > 0) {
      for (const c of criticals) {
        ctx.io.err(
          `security-audit: ${c.line !== undefined ? `${c.line} ` : ''}critical — ${c.message}\n`,
        );
      }
      if (!bypassed) {
        const reason =
          `settle run refused: security-audit reported ${criticals.length} CRITICAL finding(s). ` +
          'Pass --allow-security-audit-failure to record them and settle anyway, or --force to bypass.';
        ctx.io.err(`${reason}\n`);
        return {
          outcome: 'refuse',
          summaryPatch: { securityAudit: securityAuditFindings },
          reason,
          flags: {
            verifierIdentity: {
              family: result.provider,
              ...(result.model ? { model: result.model } : {}),
            },
          },
        };
      }
      const flag =
        ctx.opts.force === true ? '--force' : '--allow-security-audit-failure';
      ctx.io.err(
        `security-audit: ${flag} set; proceeding past ${criticals.length} CRITICAL finding(s).\n`,
      );
    }
    return {
      outcome: 'pass',
      summaryPatch: { securityAudit: securityAuditFindings },
      flags: {
        verifierIdentity: {
          family: result.provider,
          ...(result.model ? { model: result.model } : {}),
        },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reason = `security-audit: verifier failed — ${message}. Pass --allow-security-audit-failure to continue.`;
    ctx.io.err(`${reason}\n`);
    if (ctx.opts.allowSecurityAuditFailure !== true && ctx.opts.force !== true) {
      return { outcome: 'refuse', reason };
    }
    return { outcome: 'pass' };
  }
};
