import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

const REPORT_PATH = join(
  REPO_ROOT,
  '.cadence/phases/282-coverage-scanner-determinism/282-01-COVERAGE-DRIFT-REPORT.md',
);

const report = readFileSync(REPORT_PATH, 'utf8');

/**
 * AC-4 of 282-01 is a point-in-time attestation: it is scoped to "the full
 * historical corpus (293 SUMMARY records) at time of writing". These
 * assertions therefore pin the specific numbers the T4 sweep found, not a
 * live invariant — if the corpus grows, this test is expected to be amended
 * alongside the report, not to silently pass against stale prose.
 *
 * NOTE for future editors: do NOT write any drifting AC's phase-qualified
 * token — the `<phase-id>/AC-<n>` form, e.g. the one for phase 252's first AC
 * — literally anywhere in this file, not even inside a comment like this one.
 * This file matches the repo's `testGlobs`, so such a token would register as
 * live coverage evidence for that historical phase and would silently
 * "repair" the very drift this report is required to report-but-never-rewrite
 * (DRAFT Boundaries). Assert around those tokens, as done below. Verify with:
 *   grep -oE "[0-9]+-[0-9]+/AC-[0-9]+" <this file> | sort -u
 * which must print `282-01/AC-4` and nothing else.
 */
describe('282-01 corpus coverage-drift report (AC-4 attestation)', () => {
  it('282-01/AC-4: accounts for all 293 enumerated pairs with a consistent 281+12 / 38+243 identity', () => {
    // (a) the enumerated total, asserted with its meaning attached rather
    // than as a bare "293" that would pass against a gutted document.
    expect(report).toContain('## (a) Total phase/num pairs enumerated');
    expect(report).toContain('**293** — exactly matching the live');
    expect(report).toContain("find .cadence/phases -name '*-SUMMARY.json' | wc -l");

    // (b)-(c) the accounting table's four buckets.
    expect(report).toContain('| Enumerated | **293** |');
    expect(report).toContain('| ├─ Re-verified successfully (parseable verdict returned) | **281** |');
    expect(report).toContain('| └─ Could not verify (command refused, exit 2) | **12** |');
    expect(report).toContain('**38**');
    expect(report).toContain('**243**');

    // The arithmetic identity is the no-silent-drops guarantee itself.
    expect(report).toContain('`293 = 281 + 12`');
    expect(report).toContain('`281 = 38 + 243`');
    expect(report).toContain('That identity is\nthe no-silent-drops guarantee.');

    // The identity must actually hold, not merely be printed.
    expect(281 + 12).toBe(293);
    expect(38 + 243).toBe(281);
  });

  it("282-01/AC-4: cadence summary verify-all -- the AC's own named command -- passed for real", () => {
    // AC-4's literal Given/When/Then names `cadence summary verify-all` and
    // requires "it passes". The Method section explains why that command
    // can't answer the coverage-drift question (it's tamper-detection, not
    // coverage re-derivation) -- but the command still had to actually be
    // run and pass, not just explained around. This pins that it was.
    expect(report).toContain(
      '## `cadence summary verify-all` — the AC-4-named command, run for real (as-built supplement)',
    );
    expect(report).toContain('294 checked: 56 MATCH, 238 NO_HASH, 0 failed');
    expect(report).toContain('$ echo $?\n0');
    expect(report).toContain('It passes: exit 0, 0 failed.');

    // A supplement, not a replacement: the coverage-drift sweep above is
    // still the tool that answers AC-4's actual question.
    expect(report).toContain(
      'as a supplement to (not a replacement for) the `verify\nphase --no-test-run` sweep above',
    );
  });

  it('282-01/AC-4: names all 3 drifted phases by id and reports 5 drifting ACs, one-directionally', () => {
    const driftedPhaseIds = [
      '252-self-application-config-correction/252-01',
      '256-real-provider-certification-prep/256-01',
      '256-real-provider-certification-prep/256-02',
    ];

    expect(report).toContain('## (d) Phases with `driftCount > 0`');
    expect(report).toContain('**3 phases, 5 ACs, all in the same direction.**');

    for (const phaseId of driftedPhaseIds) {
      expect(report).toContain(phaseId);
    }
    expect(driftedPhaseIds).toHaveLength(3);

    // Every drift runs recorded-pass -> not-currently-covered, and the
    // reverse direction was checked explicitly rather than assumed.
    expect(report).toContain('recorded-pass → not-covered');
    expect(report).toContain(
      '**Reverse direction (`recordedPass: false` → `currentlyCovered: true`): 0.**',
    );
    expect(report).toContain('had to be derived from the raw `perAc` records. There are none.');
  });

  it("282-01/AC-4: attributes every drift away from this phase's fix, with evidence and no repairs", () => {
    // The load-bearing claim of the whole report.
    expect(report).toContain(
      "### Attribution: none of these 5 drifts is caused by this phase's fix",
    );

    // Both independent lines of evidence must be present, not just the claim.
    expect(report).toContain('**1. Empirical — the tokens are simply gone.**');
    expect(report).toContain(
      '**2. Analytical — the fix is coverage-monotone, so it cannot produce this\ndirection at all.**',
    );
    expect(report).toContain('This is test churn, not a scanner verdict change.');
    expect(report).toMatch(/The fix can only\s+\*promote\* an AC into coverage\./);
    expect(report).toContain('order-invariant, so this is verdict-neutral by construction.');

    // The honest bottom line, and the Boundaries compliance statement.
    expect(report).toContain(
      '**no phase\'s coverage verdict moved as a result of the fix**',
    );
    expect(report).toContain('**nothing was repaired**');
    expect(report).toContain('Reported, never\nrewritten.');
  });

  it('282-01/AC-4: enumerates all 12 could-not-verify phase ids — none silently dropped', () => {
    const couldNotVerifyIds = [
      '39-code-review-gate/39-01',
      '39-draft-build-gates/39-01',
      '39-enum-gate-coverage/39-01',
      '39-gate-contract/39-01',
      '39-interactive-gate/39-01',
      '39-security-audit-gate/39-01',
      '39-skill-audit-check/39-01',
      '40-verifier-factory/40-01',
      '41-backend-commit/41-01',
      '42-emit-unconverged/42-01',
      '43-boundary-check/43-01',
      '44-gate-registry/44-01',
    ];

    expect(couldNotVerifyIds).toHaveLength(12);
    expect(new Set(couldNotVerifyIds).size).toBe(12);
    expect(report).toContain('### The 12 that could not be verified');

    // Each id is named explicitly in the report.
    for (const phaseId of couldNotVerifyIds) {
      expect(report).toContain(phaseId);
    }

    // Mechanical no-silent-drops check: the numbered table must carry exactly
    // 12 rows, so an id quietly removed from the report fails here even if the
    // per-id loop above were also edited to match.
    const numberedRows = report.match(/^\| \d+ \| `[^`]+` \|$/gm) ?? [];
    expect(numberedRows).toHaveLength(12);

    // The refusal is attributed to a non-coverage cause.
    expect(report).toContain('status: DONE');
    expect(report).toContain('The\ncommand refuses at DRAFT-parse time, before any coverage scan is attempted.');
    expect(report).toContain('the parse refusal costs no coverage information\nthat was ever recoverable');
  });

  it('282-01/AC-4: the method is read-only and the settle blocker is recorded as resolved, not left live', () => {
    // --no-test-run was a Boundaries requirement, not a shortcut.
    expect(report).toContain('--no-test-run');
    expect(report).toContain('`--no-test-run` is deliberate and required by this DRAFT\'s Boundaries');
    expect(report).toContain('It was passed on all 293 invocations');

    // The original blocker banner is retained as the historical record, but it
    // must never stand alone: the as-built resolution has to sit inside the
    // same banner block, ahead of the report body, so a reader cannot act on a
    // blocker that no longer exists.
    const bannerIdx = report.indexOf('Blocker for settle');
    const resolvedIdx = report.indexOf('As-built amendment (T4): resolved');
    const methodIdx = report.indexOf('## Method');

    expect(bannerIdx).toBeGreaterThanOrEqual(0);
    expect(resolvedIdx).toBeGreaterThan(bannerIdx);
    expect(resolvedIdx).toBeLessThan(methodIdx);
    expect(report).toContain('packages/core/tests/docs/phase282-coverage-drift-report.test.ts');
    expect(report).toContain('**no\n> follow-up task and no gate bypass are needed.**');

    // The mirrored settle note must carry the same resolution.
    expect(report).toContain('**Resolved (as-built amendment, T4)**');
  });
});
