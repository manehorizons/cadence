import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// packages/core/tests/docs -> repo root is four levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const CADENCE_BIN = join(REPO_ROOT, 'packages/core/bin/cadence.cjs');
const DRAFT_282_01_PATH = join(
  REPO_ROOT,
  '.cadence/phases/282-coverage-scanner-determinism/282-01-DRAFT.md',
);

interface LedgerDecision {
  id: string;
  title: string;
  rationale: string;
  status: string;
  recommendationId?: string;
}

function listDecisions(): LedgerDecision[] {
  const raw = execFileSync('node', [CADENCE_BIN, 'decision', 'list', '--format', 'json'], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  return JSON.parse(raw) as LedgerDecision[];
}

interface LedgerRecommendation {
  id: string;
  title: string;
  summary: string;
  status: string;
  readiness: string;
  priority: string;
  affectedFiles: string[];
  evidenceIds: string[];
  scoutId?: string;
}

interface LedgerEvidenceNote {
  id: string;
  recommendationId: string;
  kind: string;
  summary: string;
}

interface RecommendationShowResult {
  recommendation: LedgerRecommendation;
  linkedEvidence: LedgerEvidenceNote[];
}

function listRecommendations(): LedgerRecommendation[] {
  const raw = execFileSync('node', [CADENCE_BIN, 'recommendation', 'list', '--format', 'json'], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  return JSON.parse(raw) as LedgerRecommendation[];
}

function showRecommendation(id: string): RecommendationShowResult {
  const raw = execFileSync(
    'node',
    [CADENCE_BIN, 'recommendation', 'show', id, '--format', 'json'],
    { encoding: 'utf8', cwd: REPO_ROOT },
  );
  return JSON.parse(raw) as RecommendationShowResult;
}

describe('284-01 T1: AC-2/AC-4 reconciliation decisions recorded', () => {
  it('284-01/AC-1: cadence decision list --format json contains three decisions -- D-V (AC-2 amend), D-V (AC-4 split verdict), D-W (file-only) -- each citing the artifact that settles it', () => {
    const decisions = listDecisions();

    // D-V for phase 282-01's AC-2: amend, citing the T2 As-built amendment
    // block (deep-verify's required pre-fix non-deep-equal reproduction is
    // proven impossible -- readdir returns a stable-but-non-canonical order
    // within one process, not a run-to-run variant).
    //
    // Deliberately two separate .includes() calls on non-adjacent substrings
    // rather than one combined qualifier+"/"+AC-id string literal: this file
    // is itself under testGlobs, and that exact contiguous token, written
    // anywhere inside an asserting it()/test() block, would register as live
    // coverage evidence for phase 282-01's own AC-2 (see 284-01/AC-2 below
    // and phase282-coverage-drift-report.test.ts's header comment for the
    // same concern). Splitting the qualifier and the AC token across two
    // non-adjacent string literals keeps the check equally precise without
    // ever forming that contiguous string in this file's raw source text.
    const dv2 = decisions.find(
      (d) => d.title.includes('282-01') && d.title.includes('AC-2') && d.title.includes('D-V'),
    );
    expect(dv2, 'D-V decision for phase 282-01 AC-2 present').toBeDefined();
    expect(dv2?.status).toBe('active');
    expect(dv2?.rationale).toContain('T2');
    expect(dv2?.rationale.toLowerCase()).toContain('amend');
    expect(dv2?.rationale.toLowerCase()).toMatch(/readdir|stable-but-non-canonical/);

    // D-V for phase 282-01's AC-4: split verdict. The runs-summary-verify-all
    // clause gets D-V option 3 (strengthen the test, closed in 284-01/T4).
    // The phase-id-enumeration clause is judged already satisfied by the
    // existing drift-report tests, citing the T4 As-built amendment. Same
    // non-adjacent-substring reasoning as dv2 above.
    const dv4 = decisions.find(
      (d) => d.title.includes('282-01') && d.title.includes('AC-4') && d.title.includes('D-V'),
    );
    expect(dv4, 'D-V decision for phase 282-01 AC-4 present').toBeDefined();
    expect(dv4?.status).toBe('active');
    expect(dv4?.rationale).toContain('T4');
    expect(dv4?.rationale.toLowerCase()).toContain('split');
    expect(dv4?.rationale).toContain('phase282-coverage-drift-report.test.ts');
    expect(dv4?.rationale.toLowerCase()).toMatch(/strengthen/);

    // D-W: file-only (option a) -- the amendment-vs-verifier gap is filed as
    // a recommendation (284-01/T3), not a mechanism spec, this arc.
    const dw = decisions.find((d) => d.title.includes('D-W'));
    expect(dw, 'D-W (file-only) decision present').toBeDefined();
    expect(dw?.status).toBe('active');
    expect(dw?.rationale.toLowerCase()).toContain('file-only');
    expect(dw?.rationale.toLowerCase()).toMatch(/recommendation/);
  });

  it("284-01/AC-2: 282-01-DRAFT.md's AC-2 heading is formally superseded at its own definition site, not only in the trailing footnote", () => {
    const draft = readFileSync(DRAFT_282_01_PATH, 'utf8');

    // The heading line itself is untouched -- only the prose beneath it
    // changes. A hand-typed heading edit has silently corrupted AC/task
    // sequencing before (CLAUDE.md); the structural DRAFT parser keys off
    // the literal `### AC-N: <name>` line.
    expect(draft).toContain('### AC-2: Cross-file walk-order determinism');

    // Isolate just the AC-2 section (its heading through the next `###`) so
    // the absence check below can't accidentally pass or fail against
    // unrelated Task-block prose elsewhere in the file that legitimately
    // still narrates the pre-correction framing and is out of this task's
    // scope to touch (only AC-2's heading is in scope, per the DRAFT's own
    // Boundaries).
    const ac2Start = draft.indexOf('### AC-2: Cross-file walk-order determinism');
    const ac3Start = draft.indexOf('### AC-3:', ac2Start);
    expect(ac2Start).toBeGreaterThanOrEqual(0);
    expect(ac3Start).toBeGreaterThan(ac2Start);
    const ac2Section = draft.slice(ac2Start, ac3Start);

    // A supersession notice sits right at the AC's own definition site --
    // not only in the trailing As-built amendment footnote a hurried reader
    // could miss -- and points at that footnote by name.
    expect(ac2Section).toContain('Superseded');
    expect(ac2Section).toContain('As-built amendment (T2');

    // The corrected understanding: the pre-fix scanner's cross-file order is
    // stable but non-canonical within a single process, with no
    // cross-process guarantee -- not the impossible-to-reproduce run-to-run
    // variance the heading originally demanded.
    expect(ac2Section.toLowerCase()).toContain('stable-but-non-canonical');
    expect(ac2Section.toLowerCase()).toContain('readdir');
    expect(ac2Section.toLowerCase()).toContain('within a single process');

    // The disproven reproduction framing is gone from the AC's own Given
    // clause (scoped to just this section, so T2's historical Task-block
    // narration elsewhere in the file -- out of scope to touch -- can't
    // accidentally satisfy or fail this check).
    expect(ac2Section).not.toContain(
      'proven to produce a non-deep-equal map across repeated runs',
    );

    // The When/Then lines are unchanged -- they were never the disproven
    // part, only the Given's reproduction claim was.
    expect(ac2Section).toContain(
      "When `scanTestCoverage` runs 10 consecutive times against that identical fixture after the fix (sorting `listAllFiles`'s output)",
    );
    expect(ac2Section).toContain(
      'Then the returned map is deep-equal, including array order, across all 10 runs.',
    );

    // The existing As-built amendment (T2) footnote block stays intact as
    // the detailed historical record -- this task adds a pointer at the
    // AC's definition site, it does not replace or delete the footnote.
    expect(draft).toContain("corrects AC-2's Given/action wording");
    expect(draft).toContain(
      'all 10 pre-fix runs returned the identical (but reversed-from-canonical)',
    );
  });

  it('284-01/AC-3: the amendment-vs-verifier gap is filed as a recommendation, with expected priority/readiness/evidence linkage', () => {
    // Deliberately matched by title + scoutId rather than by any
    // phase-id-qualified AC token, for the same reason the D-V/D-W lookups
    // above split their .includes() calls: this file is itself under
    // testGlobs, and the qualifier `282-01` immediately followed by a slash
    // and an `AC-N` token, anywhere inside an asserting it()/test() block,
    // would register as live coverage evidence for phase 282-01's own AC-2
    // and AC-4. Nothing below ever concatenates that qualifier directly onto
    // an `AC-N` token.
    const recommendations = listRecommendations();
    const rec = recommendations.find(
      (r) =>
        r.title.includes('Amendment-vs-verifier gap') &&
        r.scoutId === 'scout-20260818-record-reconciliation',
    );
    expect(rec, 'amendment-vs-verifier gap recommendation present in recommendations.json').toBeDefined();
    if (!rec) throw new Error('unreachable -- toBeDefined asserted above');

    // Expected priority/readiness per the DRAFT's T3 packet.
    expect(rec.priority).toBe('high');
    expect(rec.readiness).toBe('needs-decision');
    expect(rec.status).not.toBe('archived');

    // The recommendation names the mechanism's real implementation site
    // (deep-verify.ts produces the pass:false verdicts referenced by
    // gateBypasses) among its affected files.
    expect(rec.affectedFiles).toContain('packages/core/src/gates/deep-verify.ts');
    expect(rec.affectedFiles.some((f) => f.includes('282-01-DRAFT.md'))).toBe(true);
    expect(rec.affectedFiles.some((f) => f.includes('282-01-SUMMARY.json'))).toBe(true);

    // Evidence linkage: at least the two notes filed for this recommendation
    // (the gateBypasses/--force citation and the four-amendment-blocks
    // citation), fetched via `recommendation show` rather than asserted from
    // evidenceIds.length alone so the content itself is checked, not just
    // the count.
    expect(rec.evidenceIds.length).toBeGreaterThanOrEqual(2);
    const shown = showRecommendation(rec.id);
    const evidenceText = shown.linkedEvidence.map((e) => e.summary).join('\n---\n');

    // Cites the gateBypasses entry and the --force override it recorded.
    expect(evidenceText).toContain('gateBypasses');
    expect(evidenceText).toContain('--force');
    expect(evidenceText).toContain('severity');

    // Cites 282's amendment blocks (the "as-built" record independent
    // reviewers already wrote, per phase 282's own DRAFT).
    expect(evidenceText.toLowerCase()).toContain('as-built amendment');
    // Both of the reconciled ACs are named -- as bare AC-N tokens, never
    // prefixed by a phase-id qualifier in this file's own source text.
    expect(evidenceText).toContain('AC-2');
    expect(evidenceText).toContain('AC-4');

    // Cites the resulting --force/grade-cap chain (post-283's D-S rule),
    // not only the four amendment blocks -- AC-3's Given names both halves.
    expect(evidenceText.toLowerCase()).toContain('mixed');
    expect(evidenceText.toLowerCase()).toContain('cap');
    expect(evidenceText).toContain('assurance-record.ts');

    // Ties the recommendation back to the D-W decision that committed to
    // filing it (dec-20260820-003), via evidence text rather than a
    // decisionIds link -- decision-to-rec linking here is for a rec that
    // already exists pointing a *new* decision at it, not this direction.
    expect(evidenceText).toContain('dec-20260820-003');
  });
});
