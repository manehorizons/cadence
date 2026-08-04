import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankEvidence } from '../../src/gates/ac-evidence.js';

// Resolve repo-root assets from this test file's location:
// packages/core/tests/docs → ../../../../<asset>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function readJson(...parts: string[]): unknown {
  return JSON.parse(readFileSync(join(ROOT, ...parts), 'utf8'));
}

interface CadenceConfig {
  profile: string;
  gates: { evidenceFloor: string };
  securityAudit: { provider: string };
}

interface DecisionsLedger {
  decisions: Array<{ id: string; title: string; rationale: string }>;
}

// Phase 252: the repo's own self-application config sat below the solo
// preset's evidence floor, and the (long-deferred) baseline-profile question
// needed a recorded decision rather than silence. These two ACs are load-
// bearing on CADENCE's own settle for this very phase, since T2 raises
// gates.evidenceFloor to "assertion" before this phase settles.
describe('CADENCE self-application config (phase 252)', () => {
  it('gates.evidenceFloor ranks at or above assertion and securityAudit stays mock (252-01/AC-2)', () => {
    const config = readJson('.cadence', 'config.json') as CadenceConfig;

    expect(rankEvidence(config.gates.evidenceFloor as never)).toBeGreaterThanOrEqual(
      rankEvidence('assertion'),
    );
    expect(config.securityAudit.provider).toBe('mock');
  });

  it('profile stays auto and a decision records the deferral without superseding dec-20260803-001 (252-01/AC-1)', () => {
    const config = readJson('.cadence', 'config.json') as CadenceConfig;
    expect(config.profile).toBe('auto');

    const ledger = readJson('.cadence', 'intelligence', 'decisions.json') as DecisionsLedger;
    const deferralDecision = ledger.decisions.find(
      (d) =>
        d.rationale.includes('dec-20260803-001') && /does not supersede/i.test(d.rationale),
    );
    expect(deferralDecision).toBeDefined();
  });
});
