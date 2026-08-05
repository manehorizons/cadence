import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseExceptionsTable,
  isExpired,
  decideAdvisories,
  extractHighSeverityAdvisories,
  AuditUnavailableError,
} from '../../../../scripts/check-audit-exceptions.mjs';

// Resolve the repo-root CodeQL workflow from this test file's location:
// packages/core/tests/docs → ../../../../.github/workflows/codeql.yml
const CODEQL_YML = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'codeql.yml',
);

// Resolve the repo-root consolidated security workflow from this test file's
// location: packages/core/tests/docs → ../../../../.github/workflows/security.yml
const SECURITY_YML = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'security.yml',
);

// Resolve the repo-root audit exceptions doc from this test file's location:
// packages/core/tests/docs → ../../../../docs/security/audit-exceptions.md
const AUDIT_EXCEPTIONS_MD = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'docs',
  'security',
  'audit-exceptions.md',
);

// AC-1 (phase 182) — CodeQL static analysis must run on push, pull_request,
// and a weekly schedule, independent of push/PR activity, so static analysis
// coverage doesn't silently lapse if nobody pushes for a while.
describe('CodeQL workflow', () => {
  const yml = readFileSync(CODEQL_YML, 'utf8');

  it('analyzes the javascript-typescript language (AC-1)', () => {
    expect(yml).toMatch(/language[s]?:\s*\n?\s*[[-]?\s*['"]?javascript-typescript['"]?/);
  });

  it('triggers on push to main (AC-1)', () => {
    // Anchored to the line immediately after `push:` so a future edit that
    // widens push to all branches (removing this branches clause, or moving
    // it elsewhere) fails this test instead of matching some unrelated
    // `branches: [main]` later in the file.
    expect(yml).toMatch(/push:\n\s*branches:\s*\[main\]/);
  });

  it('triggers on pull_request (AC-1)', () => {
    expect(yml).toMatch(/pull_request:\n\s*branches:\s*\[main\]/);
  });

  it('triggers on a weekly schedule cron (AC-1)', () => {
    expect(yml).toMatch(/schedule:\s*\n\s*-\s*cron:\s*['"][^'"]+['"]/);
  });

  it('grants the permissions CodeQL analysis requires (AC-1)', () => {
    expect(yml).toContain('actions: read');
    expect(yml).toContain('contents: read');
    expect(yml).toContain('security-events: write');
  });
});

// AC-2 (phase 182) — a secret-scanning job must run on every push and pull
// request so leaked credentials are caught before/at merge time.
// AC-5 (phase 182) — the consolidated security workflow (secret-scan, audit,
// SBOM) must also run on a weekly schedule, independent of push/PR activity,
// so coverage doesn't silently lapse if the repo goes quiet.
describe('security workflow', () => {
  const yml = readFileSync(SECURITY_YML, 'utf8');

  it('runs a gitleaks-based secret-scan job (AC-2)', () => {
    expect(yml).toMatch(/secret-scan:/);
    expect(yml).toMatch(/gitleaks\/gitleaks-action@v\d+/);
  });

  it('triggers on push to main (AC-2)', () => {
    // Anchored to the line immediately after `push:` — see the CodeQL test
    // above for why a loose regex is rejected here.
    expect(yml).toMatch(/push:\n\s*branches:\s*\[main\]/);
  });

  it('triggers on pull_request to main (AC-2)', () => {
    expect(yml).toMatch(/pull_request:\n\s*branches:\s*\[main\]/);
  });

  it('triggers on a weekly schedule cron, independent of push/PR (AC-5)', () => {
    expect(yml).toMatch(/schedule:\s*\n\s*-\s*cron:\s*['"][^'"]+['"]/);
  });

  it('grants pull-requests read so the pull_request scan path does not 403 (AC-2)', () => {
    // gitleaks-action's pull_request path fetches the PR's commit list via
    // an unguarded GitHub API call before scanning; without this scope that
    // call 403s and the job errors instead of actually scanning PRs.
    const secretScanJob = yml.slice(yml.indexOf('secret-scan:'));
    expect(secretScanJob).toMatch(/permissions:[\s\S]*?pull-requests:\s*read/);
  });
});

// AC-3 (phase 182) — an audit job must run pnpm audit and cross-check any
// high/critical advisory against the documented exceptions allowlist,
// failing on anything undocumented or expired. Triggers are already covered
// by the workflow-level `on:` block asserted above (T2) — no need to re-test
// them here.
describe('security workflow — audit job', () => {
  const yml = readFileSync(SECURITY_YML, 'utf8');

  it('defines an audit job (AC-3)', () => {
    expect(yml).toMatch(/^\s*audit:\s*$/m);
  });

  it("documents that the job performs a pnpm audit (AC-3)", () => {
    // The actual pnpm-audit invocation lives inside check-audit-exceptions.mjs
    // (asserted directly below and unit-tested separately) — this just checks
    // the job is documented as being about a pnpm audit, not that the
    // workflow itself calls `pnpm audit` inline.
    expect(yml).toMatch(/pnpm audit/);
  });

  it('invokes the audit-exceptions check script (AC-3)', () => {
    expect(yml).toMatch(/node scripts\/check-audit-exceptions\.mjs/);
  });
});

// 253-01, AC-4 (phase 253) — the audit job must also invoke the
// pnpm.overrides lockfile-coverage detector, on the same install path as
// check-audit-exceptions.mjs, so a regressed override target fails CI
// before reaching main. Mirrors release-integrity.test.ts's "Release
// workflow integrity wiring" describe block: reads the real workflow file
// off disk and asserts step ordering/content, no subprocess or mocking.
describe('security workflow — audit job invokes the lockfile-overrides detector', () => {
  const yml = readFileSync(SECURITY_YML, 'utf8');
  const auditJobStart = yml.indexOf('\n  audit:');
  const auditJobEnd = yml.indexOf('\n  sbom:', auditJobStart);
  const auditJob = yml.slice(auditJobStart, auditJobEnd);

  it('invokes the lockfile-overrides check script (253-01/AC-4)', () => {
    expect(auditJob).toMatch(/node scripts\/check-lockfile-overrides\.mjs/);
  });

  it('runs the lockfile-overrides check on the same install path as check-audit-exceptions.mjs, after pnpm install --frozen-lockfile (253-01/AC-4)', () => {
    const installIdx = auditJob.indexOf('pnpm install --frozen-lockfile');
    const auditExceptionsIdx = auditJob.indexOf('node scripts/check-audit-exceptions.mjs');
    const lockfileOverridesIdx = auditJob.indexOf('node scripts/check-lockfile-overrides.mjs');

    expect(installIdx).toBeGreaterThan(-1);
    expect(auditExceptionsIdx).toBeGreaterThan(installIdx);
    expect(lockfileOverridesIdx).toBeGreaterThan(installIdx);
  });

  it('does not introduce a second install step or a new job (253-01/AC-4)', () => {
    // Only one `pnpm install --frozen-lockfile` in the audit job — the new
    // detector reuses the existing install, it does not add its own. And the
    // detector invocation itself lives inside the audit job block (auditJob
    // is already sliced to end at the next top-level job, `sbom:`) rather
    // than under a new job name.
    expect(auditJobEnd).toBeGreaterThan(-1);
    const installOccurrences = auditJob.match(/pnpm install --frozen-lockfile/g) ?? [];
    expect(installOccurrences).toHaveLength(1);
    expect(auditJob).toMatch(/node scripts\/check-lockfile-overrides\.mjs/);
  });
});

// AC-3 (phase 182) — the documented exceptions allowlist must exist with the
// columns the audit job's script relies on to cross-check advisories.
describe('audit exceptions doc', () => {
  const md = readFileSync(AUDIT_EXCEPTIONS_MD, 'utf8');

  it('documents the advisory id column (AC-3)', () => {
    expect(md).toMatch(/Advisory ID/i);
  });

  it('documents the package column (AC-3)', () => {
    expect(md).toMatch(/\|\s*Package\s*\|/i);
  });

  it('documents the justification column (AC-3)', () => {
    expect(md).toMatch(/Justification/i);
  });

  it('documents the expiry column (AC-3)', () => {
    expect(md).toMatch(/Expiry/i);
  });

  it('documents at least one real, non-expired exception with every column populated (AC-3)', () => {
    // phase 182's own audit run found genuine high/critical advisories in this
    // repo's current dependency tree (vitest/vite/hono, all dev-only or
    // unreachable-transport transitive deps — see the file for the real
    // justifications); the table intentionally documents them rather than
    // starting empty, so this asserts the documented rows are well-formed
    // and currently valid, not that the table is empty.
    const rows = parseExceptionsTable(md);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.id).toBeTruthy();
      expect(row.package).toBeTruthy();
      expect(row.justification).toBeTruthy();
      expect(isExpired(row.expiry)).toBe(false);
    }
  });
});

// 253-01 / AC-5 (phase 253) — the pre-253 doc asserted, as a flat factual
// claim, that pnpm's `pnpm.overrides` mechanism is non-functional under
// this repo's pinned pnpm 9.12.0 ("Overrides are therefore non-functional
// in this pnpm version regardless of where they're declared"). Phase 253's
// empirical investigation (253-01-T3-EVIDENCE.md) found that diagnosis
// itself wrong: the mechanism works; the misleading warning came from a
// globally-installed newer pnpm launcher self-switching before delegating
// to the pinned binary, and the real defect was a stale override target.
// This asserts the false claim is gone and the corrected mechanism is
// documented in its place.
//
// NOTE on the deliberate space between the qualifier and the AC id above
// and in the describe() title below (the qualifier and id sit hard against
// each other, no space, inside each it() title instead): the coverage
// gate's assertion-mode scanner (packages/core/src/verify/coverage.ts,
// scanTestCoverage) records at most ONE ref per token per file — the
// FIRST qualified occurrence in file order, full stop; every later
// occurrence of the same qualified token in the same file is silently
// dropped by its per-file dedup, not merely deduped-but-still-counted. A
// qualified occurrence sitting in a header comment or a describe() title,
// positioned before the real asserting it() blocks, would therefore
// become the ONE recorded ref for this AC — and since describe()/comment
// text is never inside an asserting span, that ref would be
// non-qualifying, making the whole AC read as "mentioned but never
// qualifying" even though real asserting tests exist right below.
// Verified empirically against this exact file via a direct
// scanTestCoverage() call, run with assertion mode and this phase's
// qualifier, before landing this fix. Keeping the qualifier and the AC id
// apart here (and in the describe() title) keeps this prose
// human-traceable without satisfying the scanner's exact adjacency check —
// only the hard-against-each-other form inside each it() title below
// counts as evidence.
describe('audit exceptions doc — overrides mechanism narrative corrected (253-01 / AC-5)', () => {
  const md = readFileSync(AUDIT_EXCEPTIONS_MD, 'utf8');

  it('no longer asserts pnpm.overrides is non-functional/broken/dead/ignored as a flat claim (253-01/AC-5)', () => {
    // Matches the shape of the pre-253 assertion ("Overrides are therefore
    // non-functional...", "was found to be silently dead") without also
    // matching the corrected prose's own references to the past
    // misdiagnosis (which describe it as corrected, not assert it as fact).
    //
    // Plain `.toContain()` on a lowercased haystack throughout this block,
    // not `.toMatch(/regex/)` — this repo's `js-ts` coverage-scanning
    // profile (packages/core/src/verify/coverage-profiles/js-ts.ts) masks
    // `'`/`"`/backtick as *string* delimiters when computing the code mask
    // it uses for `it()`-block boundary tracking, but has no concept of a
    // `/regex/` literal as its own lexical category — a bare `'` or
    // backtick inside a regex literal is read as a real string-open
    // character, corrupting boundary tracking for the rest of the file
    // (see phase251-ledger.test.ts's precedent note on the same trap; hit
    // for real building that file). A `.toContain()` string literal is
    // exempt — the scanner's masker is specifically designed to recognize
    // and skip over a properly quote-delimited string's own contents.
    const lower = md.toLowerCase();
    expect(lower).not.toContain('overrides are therefore non-functional');
    expect(lower).not.toContain('overrides are non-functional');
    expect(lower).not.toContain('found to be silently dead');
    expect(lower).not.toContain("regardless of where they're declared");
  });

  it('states the corrected mechanism: a global pnpm launcher self-switches before delegating to the pinned 9.12.0 (253-01/AC-5)', () => {
    const row = md.slice(md.indexOf('GHSA-mh99-v99m-4gvg'));
    expect(row).toContain('globally-installed newer pnpm launcher');
    expect(row).toContain('packageManager');
    expect(row).toContain('`pnpm@9.12.0`');
    expect(row).toContain('applies `pnpm.overrides`');
  });

  it('names the real defect as a stale override target, not a broken mechanism (253-01/AC-5)', () => {
    const row = md.slice(md.indexOf('GHSA-mh99-v99m-4gvg'));
    expect(row).toContain('stale override target');
    expect(row).toContain('scripts/check-lockfile-overrides.mjs');
    expect(row).toContain('253-01-T3-EVIDENCE.md');
  });
});

// AC-3 (phase 182) — unit tests for the pure decision logic behind the audit
// job's script: parsing the exceptions table, expiry evaluation, and the
// allow/fail decision for a given set of high/critical advisories.
describe('check-audit-exceptions pure logic', () => {
  it('parses a documented exception row out of a markdown table (AC-3)', () => {
    const md = [
      '| Advisory ID | Package | Justification | Expiry |',
      '| --- | --- | --- | --- |',
      '| GHSA-aaaa-bbbb-cccc | left-pad | Not reachable in our usage. | 2099-01-01 |',
      '',
    ].join('\n');

    expect(parseExceptionsTable(md)).toEqual([
      {
        id: 'GHSA-aaaa-bbbb-cccc',
        package: 'left-pad',
        justification: 'Not reachable in our usage.',
        expiry: '2099-01-01',
      },
    ]);
  });

  it('ignores an example row placed inside an HTML comment (AC-3)', () => {
    const md = [
      '| Advisory ID | Package | Justification | Expiry |',
      '| --- | --- | --- | --- |',
      '<!--',
      '| GHSA-example-only | some-pkg | illustrative only | 2026-12-31 |',
      '-->',
      '',
    ].join('\n');

    expect(parseExceptionsTable(md)).toEqual([]);
  });

  it('treats a future expiry date as not expired (AC-3)', () => {
    expect(isExpired('2099-01-01', new Date('2026-07-14T00:00:00Z'))).toBe(false);
  });

  it('treats a past expiry date as expired (AC-3)', () => {
    expect(isExpired('2020-01-01', new Date('2026-07-14T00:00:00Z'))).toBe(true);
  });

  it('fails an advisory that is not in the exceptions list (AC-3)', () => {
    const decision = decideAdvisories(
      [{ id: 'GHSA-undocumented', package: 'some-pkg', severity: 'high' }],
      [],
      new Date('2026-07-14T00:00:00Z'),
    );

    expect(decision.ok).toBe(false);
    expect(decision.failures).toHaveLength(1);
    expect(decision.failures[0]?.reason).toMatch(/not listed/);
  });

  it('passes an advisory listed with a future expiry (AC-3)', () => {
    const decision = decideAdvisories(
      [{ id: 'GHSA-covered', package: 'some-pkg', severity: 'critical' }],
      [{ id: 'GHSA-covered', package: 'some-pkg', justification: 'Justified.', expiry: '2099-01-01' }],
      new Date('2026-07-14T00:00:00Z'),
    );

    expect(decision.ok).toBe(true);
    expect(decision.failures).toHaveLength(0);
    expect(decision.allowed).toHaveLength(1);
  });

  it('fails an advisory whose listed exception has expired (AC-3)', () => {
    const decision = decideAdvisories(
      [{ id: 'GHSA-lapsed', package: 'some-pkg', severity: 'high' }],
      [{ id: 'GHSA-lapsed', package: 'some-pkg', justification: 'Was justified.', expiry: '2020-01-01' }],
      new Date('2026-07-14T00:00:00Z'),
    );

    expect(decision.ok).toBe(false);
    expect(decision.failures).toHaveLength(1);
    expect(decision.failures[0]?.reason).toMatch(/expired/);
  });

  it('extracts high/critical advisories and skips low/moderate ones (AC-3)', () => {
    const auditJson = {
      advisories: {
        1: { id: 1, github_advisory_id: 'GHSA-high-one', module_name: 'pkg-a', severity: 'high' },
        2: { id: 2, github_advisory_id: 'GHSA-low-one', module_name: 'pkg-b', severity: 'low' },
      },
    };

    const advisories = extractHighSeverityAdvisories(auditJson);
    expect(advisories).toEqual([{ id: 'GHSA-high-one', package: 'pkg-a', severity: 'high' }]);
  });

  it('throws AuditUnavailableError when pnpm audit itself reports an error (AC-3)', () => {
    expect(() => extractHighSeverityAdvisories({ error: { message: 'endpoint retired' } })).toThrow(
      AuditUnavailableError,
    );
  });
});

// AC-4 (phase 182) — an SBOM job must generate a CycloneDX SBOM and a
// license inventory and upload both as workflow artifacts. Triggers are
// already covered by the workflow-level `on:` block asserted above (T2/AC-5)
// — no need to re-test them here.
describe('security workflow — sbom job', () => {
  const yml = readFileSync(SECURITY_YML, 'utf8');

  it('defines an sbom job (AC-4)', () => {
    expect(yml).toMatch(/^\s*sbom:\s*$/m);
  });

  it('invokes a CycloneDX SBOM generator (AC-4)', () => {
    expect(yml).toMatch(/@cyclonedx\/cyclonedx-npm/);
  });

  it('invokes a license-listing step (AC-4)', () => {
    expect(yml).toMatch(/pnpm licenses list/);
  });

  it('uploads the SBOM and license inventory as workflow artifacts (AC-4)', () => {
    expect(yml).toMatch(/actions\/upload-artifact@v\d+/);
    expect(yml).toContain('sbom.cdx.json');
    expect(yml).toContain('licenses.json');
  });
});
