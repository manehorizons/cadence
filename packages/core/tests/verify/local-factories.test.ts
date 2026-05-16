import { describe, it, expect } from 'vitest';
import { selectVerifier } from '../../src/verify/factory.js';
import { selectCodeReviewVerifier } from '../../src/verify/code-review-factory.js';
import { selectPerTaskVerifier } from '../../src/verify/per-task-factory.js';
import { selectPlanReviewVerifier } from '../../src/verify/plan-review-factory.js';
import { selectSecurityAuditVerifier } from '../../src/verify/security-audit-factory.js';

describe('factory local branch', () => {
  // --- selectVerifier ---
  it('AC-6: local + env set → Local verifier', () => {
    const v = selectVerifier({ verifier: { provider: 'local' } } as any, {
      env: { CADENCE_LOCAL_BASE_URL: 'http://x/v1', CADENCE_LOCAL_MODEL: 'm' },
    });
    expect(v.name).toBe('local');
  });

  it('AC-6: local + env unset → mock + warn', () => {
    const warns: string[] = [];
    const v = selectVerifier({ verifier: { provider: 'local' } } as any, {
      env: {}, warn: (m) => warns.push(m),
    });
    expect(v.name).toBe('mock');
    expect(warns.join()).toMatch(/local provider requested/);
  });

  it('AC-6: config.model satisfies model when CADENCE_LOCAL_MODEL is absent → Local verifier', () => {
    const v = selectVerifier(
      { verifier: { provider: 'local', model: 'cfg-model' } } as any,
      { env: { CADENCE_LOCAL_BASE_URL: 'http://x/v1' } },
    );
    expect(v.name).toBe('local');
  });

  // --- selectCodeReviewVerifier ---
  it('AC-6: code-review local + env set → Local verifier', () => {
    const v = selectCodeReviewVerifier({ codeReview: { provider: 'local' } } as any, {
      env: { CADENCE_LOCAL_BASE_URL: 'http://x/v1', CADENCE_LOCAL_MODEL: 'm' },
    });
    expect(v.name).toBe('local');
  });

  it('AC-6: code-review local + env unset → mock + warn', () => {
    const warns: string[] = [];
    const v = selectCodeReviewVerifier({ codeReview: { provider: 'local' } } as any, {
      env: {}, warn: (m) => warns.push(m),
    });
    expect(v.name).toBe('mock');
    expect(warns.join()).toMatch(/local provider requested/);
  });

  // --- selectPerTaskVerifier ---
  it('AC-6: per-task local + env set → Local verifier', () => {
    const v = selectPerTaskVerifier({ perTaskVerifier: { provider: 'local' } } as any, {
      env: { CADENCE_LOCAL_BASE_URL: 'http://x/v1', CADENCE_LOCAL_MODEL: 'm' },
    });
    expect(v.name).toBe('local');
  });

  it('AC-6: per-task local + env unset → mock + warn', () => {
    const warns: string[] = [];
    const v = selectPerTaskVerifier({ perTaskVerifier: { provider: 'local' } } as any, {
      env: {}, warn: (m) => warns.push(m),
    });
    expect(v.name).toBe('mock');
    expect(warns.join()).toMatch(/local provider requested/);
  });

  // --- selectPlanReviewVerifier ---
  it('AC-6: plan-review local + env set → Local verifier', () => {
    const v = selectPlanReviewVerifier({ planReview: { provider: 'local' } } as any, {
      env: { CADENCE_LOCAL_BASE_URL: 'http://x/v1', CADENCE_LOCAL_MODEL: 'm' },
    });
    expect(v.name).toBe('local');
  });

  it('AC-6: plan-review local + env unset → mock + warn', () => {
    const warns: string[] = [];
    const v = selectPlanReviewVerifier({ planReview: { provider: 'local' } } as any, {
      env: {}, warn: (m) => warns.push(m),
    });
    expect(v.name).toBe('mock');
    expect(warns.join()).toMatch(/local provider requested/);
  });

  // --- selectSecurityAuditVerifier ---
  it('AC-6: security-audit local + env set → Local verifier', () => {
    const v = selectSecurityAuditVerifier({ securityAudit: { provider: 'local' } } as any, {
      env: { CADENCE_LOCAL_BASE_URL: 'http://x/v1', CADENCE_LOCAL_MODEL: 'm' },
    });
    expect(v.name).toBe('local');
  });

  it('AC-6: security-audit local + env unset → mock + warn', () => {
    const warns: string[] = [];
    const v = selectSecurityAuditVerifier({ securityAudit: { provider: 'local' } } as any, {
      env: {}, warn: (m) => warns.push(m),
    });
    expect(v.name).toBe('mock');
    expect(warns.join()).toMatch(/local provider requested/);
  });
});
