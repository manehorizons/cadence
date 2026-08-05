import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// packages/core/tests/docs → repo root is four levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

const HANDOFF_MD = join(REPO_ROOT, 'docs/handoffs/HANDOFF-v1.55-integrity-release.md');

function readHandoff(): string {
  return readFileSync(HANDOFF_MD, 'utf8');
}

function section(doc: string, startHeading: string, endHeading: string): string {
  const start = doc.indexOf(startHeading);
  expect(start).toBeGreaterThan(-1);
  const end = doc.indexOf(endHeading, start + startHeading.length);
  expect(end).toBeGreaterThan(start);
  return doc.slice(start, end);
}

// 253-01 / AC-6 (phase 253) — before phase 253, the tracked v1.55 handoff's
// §4 ("Resolved conflict"), §7 Phase A ("Repair the dependency-control
// mechanism"), and §14 ("Begin here") all asserted or implied that
// pnpm 9.12.0's `pnpm.overrides` mechanism is broken/ignored/inert under
// this repo's pinned packageManager. Phase 253's empirical re-investigation
// (253-01-T3-EVIDENCE.md, run by an implementer and an independent
// reviewer in disposable scratch clones) found that diagnosis itself
// wrong: the mechanism works; a globally-installed newer pnpm launcher
// self-switching was the source of the misleading warning; the real
// defect was stale override targets, a missing ip-address override, and
// no drift detector. These assertions read each named section directly
// off disk and check the false claim is gone and the corrected narrative
// is present in its place — sections are corrected in place, not deleted.
//
// Plain `.toContain()` on exact substrings throughout this file, never
// `.toMatch(/regex/)` — this repo's `js-ts` coverage-scanning profile
// (packages/core/src/verify/coverage-profiles/js-ts.ts +
// coverage-profiles/mask.ts) masks `'`/`"`/backtick as *string* delimiters
// when computing the code mask it uses for `it()`-block boundary tracking,
// but has no concept of a `/regex/` literal as its own lexical category —
// a bare `'` or backtick inside a regex literal is read as a real
// string-open character, corrupting boundary tracking for the rest of the
// file (see phase251-ledger.test.ts's precedent note on the same trap; hit
// for real building that file). A `.toContain()` string literal is exempt
// — the scanner's masker is specifically designed to recognize and skip
// over a properly quote-delimited string's contents, apostrophes and
// backticks included.
//
// Separately: note the deliberate space between the qualifier and the AC
// id above (vs. hard-against-each-other inside each it() title below).
// The coverage gate's assertion-mode scanner (packages/core/src/verify/
// coverage.ts, scanTestCoverage) records at most ONE ref per token per
// file — the FIRST qualified occurrence in file order; every later
// occurrence of the same qualified token in the same file is silently
// dropped by its per-file dedup, not merely deduped-but-still-counted. A
// qualified occurrence sitting in a header comment or a describe() title,
// positioned before the real asserting it() blocks, would become the ONE
// recorded ref for this AC — and since describe()/comment text is never
// inside an asserting span, that ref would read as non-qualifying, making
// the whole AC look uncovered even though three real asserting tests
// exist right below. Verified empirically via a direct scanTestCoverage()
// call (assertion mode, this phase's qualifier) before landing this file.
describe('v1.55 handoff — dependency-override narrative corrected in place (253-01 / AC-6)', () => {
  const doc = readHandoff();

  it('§4 "Resolved conflict" no longer asserts the mechanism is broken, and states the real defect was stale targets (253-01/AC-6)', () => {
    const sec4 = section(doc, '## 4. Resolved conflict', '## 5. The clock');

    // The pre-253 false claim's exact shape — flat "unremediated" verdict,
    // "are inert", "it warns, then ignores" — must be gone as a current
    // assertion (each checked as its own literal substring).
    expect(sec4).not.toContain('**Resolved: they did not.**');
    expect(sec4).not.toContain('are inert');
    expect(sec4).not.toContain('it warns, then ignores');

    // Corrected narrative: the mechanism works; the warning's real source
    // is a global launcher self-switching; the real defect was staleness.
    expect(sec4).toContain('works correctly under');
    expect(sec4).toContain("this repo's pinned");
    expect(sec4).toContain('globally-installed newer pnpm launcher');
    expect(sec4).toContain('253-01-T3-EVIDENCE.md');
    expect(sec4).toContain('were stale');
    expect(sec4).toContain('ip-address');
    expect(sec4).toContain('Nothing detected the drift.');
  });

  it('§7 Phase A no longer instructs reproducing inertness, and describes the real fix actually delivered (253-01/AC-6)', () => {
    const sec7a = section(
      doc,
      '### Phase A — Repair the dependency-control mechanism',
      '### Phase B',
    );

    expect(sec7a).not.toContain('pnpm 9.12.0 ignores');
    expect(sec7a).not.toContain('reproduce the inertness');
    expect(sec7a).not.toContain('Remove every dead override');

    expect(sec7a).toContain('works correctly under');
    expect(sec7a).toContain('fast-uri >=3.1.5');
    expect(sec7a).toContain('ip-address as a new override >=10.3.1');
    expect(sec7a).toContain('No pnpm major-version upgrade');
  });

  it('§14 "Begin here" no longer tells the reader to reproduce inertness, and states the mechanism already works (253-01/AC-6)', () => {
    const sec14 = section(doc, '## 14. Begin here', '## 15. Framing');

    expect(sec14).not.toContain('Reproduce the override inertness');
    expect(sec14).not.toContain('deprecation warning verbatim');
    expect(sec14).not.toContain('evaluate the pnpm-upgrade path');

    expect(sec14).toContain('already works');
    expect(sec14).toContain('§4');
    expect(sec14).toContain('no pnpm-upgrade path was needed or taken');
  });
});
