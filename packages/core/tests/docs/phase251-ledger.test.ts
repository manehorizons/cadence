import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// packages/core/tests/docs → repo root is four levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

// Read the live intelligence ledger directly, matching readme-shakedown.test.ts's
// readFileSync + toContain/toMatch pattern (SPEC Context: the in-repo precedent
// for asserting ledger/doc content directly). Per SPEC Context, this ledger is a
// live, continuously-mutating artifact — assertions below match only on id +
// status (+ evidenceIds.length >= N where not asserting an exact count), never
// on exact array ordering or an unrelated count, so future phases' normal
// promote/archive churn doesn't break this test.
interface LedgerRecommendation {
  id: string;
  title: string;
  status: string;
  shippedRef?: string;
  priority?: string;
  readiness?: string;
  evidenceIds?: string[];
}

interface RecommendationsLedger {
  recommendations?: LedgerRecommendation[];
  archived?: LedgerRecommendation[];
}

function readRecommendationsLedger(): RecommendationsLedger {
  const raw = readFileSync(
    join(REPO_ROOT, '.cadence/intelligence/recommendations.json'),
    'utf8',
  );
  return JSON.parse(raw) as RecommendationsLedger;
}

// A rec closed via the single-commit settle convention's normal promote path
// moves from `recommendations[]` into `archived[]` in the same write
// (`autoArchive`, SPEC Context) — search both arrays, never assume either one.
function findRecommendation(
  ledger: RecommendationsLedger,
  id: string,
): LedgerRecommendation | undefined {
  return (
    (ledger.recommendations ?? []).find((r) => r.id === id) ??
    (ledger.archived ?? []).find((r) => r.id === id)
  );
}

function findRecommendationByTitle(
  ledger: RecommendationsLedger,
  titleSubstring: string,
): LedgerRecommendation | undefined {
  const all = [...(ledger.recommendations ?? []), ...(ledger.archived ?? [])];
  return all.find((r) => r.title.includes(titleSubstring));
}

// Decisions ledger (.cadence/intelligence/decisions.json) — a different file
// from recommendations.json, with no `archived` array (decisions only
// transition status in place: active/superseded/rescinded — never soft-
// archived, per decisions.ts's decisionLedgerSpec). Shape confirmed against
// the live file before writing this helper, per SPEC/DRAFT T5 instruction.
interface LedgerDecision {
  id: string;
  recommendationId?: string;
  title: string;
  rationale: string;
  status: string;
}

interface DecisionsLedger {
  decisions?: LedgerDecision[];
}

function readDecisionsLedger(): DecisionsLedger {
  const raw = readFileSync(
    join(REPO_ROOT, '.cadence/intelligence/decisions.json'),
    'utf8',
  );
  return JSON.parse(raw) as DecisionsLedger;
}

// The AC-5 decision's own id is runtime-minted (same reason T1's gap
// recommendation above is matched by title, not id) — but unlike that case,
// its recommendationId link (rec-20260801-012) is known ahead of time and is
// the more stable identifying field here, so match on that.
function findDecisionByRec(
  ledger: DecisionsLedger,
  recId: string,
): LedgerDecision | undefined {
  return (ledger.decisions ?? []).find((d) => d.recommendationId === recId);
}

describe('251-01 finding-durability arc ledger close-out', () => {
  it('251-01/AC-1: rec-20260802-001 is shipped at v1.54.0 with two-plus evidence entries, searched across recommendations[] and archived[]', () => {
    const ledger = readRecommendationsLedger();
    const rec = findRecommendation(ledger, 'rec-20260802-001');

    expect(rec).toBeDefined();
    expect(rec?.status).toBe('shipped');
    expect(rec?.shippedRef ?? '').toContain('v1.54.0');
    expect(rec?.evidenceIds?.length ?? 0).toBeGreaterThanOrEqual(2);

    // autoArchive moves a freshly-shipped rec into archived[] in the same
    // write; assert it landed there specifically, matching this worktree's
    // observed reality (verified via direct promote in T1a).
    const inArchived = (ledger.archived ?? []).some((r) => r.id === 'rec-20260802-001');
    expect(inArchived).toBe(true);

    // T1b: the shippedRef-correction gap recommendation exists, found by
    // title substring (its id is runtime-minted — see SPEC Context).
    const gapRec = findRecommendationByTitle(
      ledger,
      'No CLI path corrects a shippedRef on an already-shipped recommendation',
    );
    expect(gapRec).toBeDefined();
    expect(gapRec?.priority).toBe('low');
    expect(gapRec?.readiness).toBe('needs-decision');

    // T1c: rec-20260802-003 carries the post-migration orphan-count evidence
    // (at least the two pre-existing entries plus this phase's new one) — no
    // orphan-count threshold is asserted anywhere (SPEC Context/Constraints).
    const auditRec = findRecommendation(ledger, 'rec-20260802-003');
    expect(auditRec).toBeDefined();
    expect(auditRec?.evidenceIds?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

describe('251-01 operator procedure doc + rec-20260801-012 promotion (AC-6)', () => {
  it('251-01/AC-6: docs/providers.md documents the two distinct conduction procedures, and rec-20260801-012 is promoted to shipped', () => {
    const providersDoc = readFileSync(join(REPO_ROOT, 'docs/providers.md'), 'utf8');

    // The section exists as its own heading, and is listed in the doc's own
    // table of contents.
    expect(providersDoc).toMatch(
      /## Producing a real-provider code-review or security-audit finding/,
    );
    expect(providersDoc).toContain(
      '[Producing a real-provider code-review or security-audit finding (conduction, Phase 251)]',
    );

    // code-review's procedure: profile override in DRAFT frontmatter (standard
    // x complex, or strict x standard/complex), not a CLI flag.
    expect(providersDoc).toMatch(/### code-review procedure/);
    expect(providersDoc).toContain('profile: standard   # tier: complex only');
    expect(providersDoc).toContain('profile: strict      # tier: standard OR complex');

    // security-audit's procedure is documented SEPARATELY (not one unified
    // checklist) and correctly narrower: strict x complex is its only reachable
    // cell, plus its provider must be reconfigured off mock.
    expect(providersDoc).toMatch(/### security-audit procedure/);
    expect(providersDoc).toMatch(
      /security-audit`'s \*only\* reachable\s+profile×tier cell is `strict`×`complex`/,
    );
    expect(providersDoc).toContain(
      'cadence config set securityAudit.provider host-cli',
    );

    // Both procedures require a real interactive terminal (self-invocation
    // guard never fires) and confirming via SUMMARY.gates[].provider /
    // assurance.verifierRollup[] -- explicitly not the internal `verifierIdentity`
    // GateFlags field.
    expect(providersDoc).toMatch(/cadence settle run/);
    expect(providersDoc).toMatch(/CLAUDECODE.*unset/);
    expect(providersDoc).toContain('assurance.verifierRollup[]');
    expect(providersDoc).toMatch(
      /Do not look for a field called `verifierIdentity`/,
    );

    // rec-20260801-012 reflects this phase's disposition: promoted to shipped,
    // referencing this phase -- search recommendations[] and archived[] since a
    // promotion to a terminal status auto-archives it in the same write (T1's
    // rec-20260802-001 landed in archived[] the same way).
    const ledger = readRecommendationsLedger();
    const rec = findRecommendation(ledger, 'rec-20260801-012');
    expect(rec).toBeDefined();
    expect(rec?.status).toBe('shipped');
    expect(rec?.shippedRef ?? '').toContain('phase 251');

    const inArchived = (ledger.archived ?? []).some((r) => r.id === 'rec-20260801-012');
    expect(inArchived).toBe(true);
  });
});

describe('251-01 conduction disposition decision (AC-5)', () => {
  it('251-01/AC-5: the conduction disposition is recorded as a decision linked to rec-20260801-012, covering all five points', () => {
    const ledger = readDecisionsLedger();
    const dec = findDecisionByRec(ledger, 'rec-20260801-012');

    expect(dec).toBeDefined();
    expect(dec?.status).toBe('active');
    expect(dec?.recommendationId).toBe('rec-20260801-012');

    const rationale = dec?.rationale ?? '';

    // (a) the self-invocation guard is retained as a safety property; farming
    // findings by removing it would trade that property for test data.
    expect(rationale).toContain('self-invocation guard');
    expect(rationale).toMatch(/real safety property/);
    expect(rationale).toMatch(/trade that safety property for test data/);

    // (b) the auto-profile gate set is unchanged; conduction is a deliberate,
    // operator-initiated act, not an incidental side effect.
    expect(rationale).toContain('auto-profile gate set');
    expect(rationale).toMatch(/auto-profile gate set \(gates\/engine\.ts's DELTAS matrix\) is unchanged/);
    expect(rationale).toMatch(/deliberately a human-operator-initiated act/);

    // (c) security-audit's mock-provider default is a separate, ordinary
    // config decision — explicitly not conflated with (a)/(b).
    expect(rationale).toMatch(/NOT the same kind of decision as \(a\) or \(b\)/);
    expect(rationale).toContain('mock-provider default');
    expect(rationale).toMatch(/ordinary, changeable config decision/);
    expect(rationale).toMatch(/must not conflate this ordinary config default with the two retained safety\/cost decisions/);

    // (d) conduction is a documented human-operator procedure; the check
    // exists so a missing finding is legible, not silently indistinguishable
    // from "hasn't happened yet".
    expect(rationale).toMatch(/documented human-operator procedure/);
    expect(rationale).toMatch(/legible and visible to an operator/);
    expect(rationale).toMatch(/silently indistinguishable from 'conduction hasn't happened yet'/);

    // (e) revisit trigger: an empty corpus through the *next* arc (not this
    // one) — reconsider a supervised, depth-limited escape hatch.
    expect(rationale).toMatch(/Revisit trigger/);
    expect(rationale).toMatch(/through the NEXT arc after this one/);
    expect(rationale).toMatch(/supervised, depth-limited escape hatch/);
  });
});
