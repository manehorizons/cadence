import type { ActivationPlan } from './plan.js';
import type { PingResult } from './ping.js';

export interface ActivationResult {
  plan: ActivationPlan;
  /** True iff config was written (false for --print or a no-op). */
  wrote: boolean;
  /** Provider chosen but its credentials are absent. */
  keyMissing: boolean;
  /** Present iff a live ping ran. */
  ping?: PingResult;
}

export function renderText(r: ActivationResult): string {
  const { plan } = r;
  const lines: string[] = [];
  lines.push('');
  if (plan.changes.length === 0) {
    lines.push(`  Already active — ${plan.provider} was already selected.`);
  } else if (r.wrote) {
    const seams = plan.changes.map((c) => c.seam).join(', ');
    lines.push(`  ✓ real verification on: ${plan.provider}  (${seams})`);
  } else {
    lines.push(`  Plan (nothing written): set ${plan.changes.length} seam(s) to ${plan.provider}.`);
  }

  if (r.keyMissing && plan.envVar) {
    lines.push('');
    lines.push(`  ⚠ ${plan.envVar} is not set — verification will fall back to mock until you set it:`);
    lines.push(`      export ${plan.envVar}=…`);
  } else if (r.ping) {
    lines.push('');
    if ('skipped' in r.ping) {
      lines.push(`  · live check skipped — ${r.ping.reason}.`);
    } else if (r.ping.ok) {
      lines.push('  ✓ provider credentials verified (live check passed).');
    } else {
      lines.push(`  ✗ live check failed — ${r.ping.reason}.`);
    }
  }

  lines.push('');
  lines.push(`  Next: ${plan.nextStep}   ← watch deep-verify judge your work`);
  lines.push('');
  return lines.join('\n');
}

export function renderJson(r: ActivationResult): Record<string, unknown> {
  return {
    provider: r.plan.provider,
    scope: r.plan.scope,
    changed: r.plan.changes.map((c) => c.seam),
    wrote: r.wrote,
    keyMissing: r.keyMissing,
    nextStep: r.plan.nextStep,
    ...(r.ping ? { ping: r.ping } : {}),
  };
}
