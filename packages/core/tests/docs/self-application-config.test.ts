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
//
// Phase 267 (267-01, T6, 2026-08-09): the baseline-profile question phase
// 252 deferred is now RESOLVED, not still pending — dec-20260804-001's
// revisit trigger ("v1.56 Phase P lands") fired when this phase's T1-T5
// landed, and the operator explicitly approved flipping profile off 'auto'
// (dec-20260810-001). This file's second test used to pin profile === 'auto'
// as the deferred/pending state; a whole-branch review caught that phase
// 267's own T6 flipped the value with no task's `files:` list covering this
// test, leaving it red on the branch. Updated below to assert the CURRENT
// resolved invariant instead of reverting the flip or deleting the test —
// if you are the next phase to deliberately change `profile` again, this is
// the test you need to update too; check `grep -rl "config.profile" tests/`
// before landing a profile change.
describe('CADENCE self-application config (phase 252, updated phase 267 T6)', () => {
  it('gates.evidenceFloor ranks at or above assertion and securityAudit stays mock (252-01/AC-2)', () => {
    const config = readJson('.cadence', 'config.json') as CadenceConfig;

    expect(rankEvidence(config.gates.evidenceFloor as never)).toBeGreaterThanOrEqual(
      rankEvidence('assertion'),
    );
    expect(config.securityAudit.provider).toBe('mock');
  });

  it('267-01/AC-6: profile is standard (post-267 flip) and the decision trail records the flip closing dec-20260804-001, without superseding dec-20260803-001', () => {
    const config = readJson('.cadence', 'config.json') as CadenceConfig;
    expect(config.profile).toBe('standard');

    const ledger = readJson('.cadence', 'intelligence', 'decisions.json') as DecisionsLedger;

    // dec-20260803-001's commitment (conduction stays a deliberate per-phase
    // DRAFT-level profile override, not incidental) must still hold in the
    // ledger, unsuperseded, regardless of the baseline profile choice.
    const nonSupersessionDecision = ledger.decisions.find(
      (d) =>
        d.rationale.includes('dec-20260803-001') && /does not supersede/i.test(d.rationale),
    );
    expect(nonSupersessionDecision).toBeDefined();

    // The flip itself is a recorded decision, not a silent config edit.
    const flipDecision = ledger.decisions.find(
      (d) =>
        d.rationale.includes('dec-20260804-001') &&
        /revisit trigger|closing/i.test(d.rationale) &&
        d.rationale.includes('standard'),
    );
    expect(flipDecision).toBeDefined();
  });
});
