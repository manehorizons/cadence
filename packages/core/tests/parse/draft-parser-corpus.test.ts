import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parseDraftMd } from '../../src/parse/draft-parser.js';
import { CadenceError } from '../../src/errors.js';

// Resolve repo-root assets from this test file's location:
// packages/core/tests/parse → ../../../../<asset> (same pattern as
// packages/core/tests/gates/assurance-record-corpus.test.ts and
// packages/core/tests/docs/audit-ledger-diff.test.ts).
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const PHASES_DIR = join(REPO_ROOT, '.cadence', 'phases');

/**
 * Recursively collect every `*-DRAFT.md` file under `dir` (no glob
 * dependency — plain readdirSync walk, mirroring the pattern used by
 * `packages/core/tests/gates/assurance-record-corpus.test.ts` and
 * `packages/core/tests/docs/exit-codes.test.ts`). Read-only: never writes,
 * modifies, or deletes anything.
 */
function walkDraftFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkDraftFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('-DRAFT.md')) {
      out.push(full);
    }
  }
  return out.sort();
}

interface CorpusScanResult {
  /**
   * Failures caused specifically by phase 288's new rule: `parseDraftMd`
   * throwing a `CadenceError` with code `COHERENCE_FAILED` because the
   * `## Acceptance Criteria` section contained a malformed (non-numeric)
   * `### AC-` heading. Grepping `packages/core/src/parse/draft-parser.ts`
   * confirms `COHERENCE_FAILED` has exactly one throw site in that file —
   * the new malformed-AC-heading check added by T1 — so this code is a
   * reliable, unique fingerprint for "the new rule specifically rejected
   * this file", independent of any other reason `parseDraftMd` might also
   * reject a document (e.g. schema drift).
   */
  newlyFailing: string[];
  /**
   * Every other throw — parse/validation failures `parseDraftMd` already
   * had before phase 288, unrelated to the new rule (e.g. a `DraftZ` zod
   * rejection for legacy frontmatter). Out of T4's scope by definition
   * (T4 proves the *new* rule doesn't newly break history, not that every
   * historical DRAFT round-trips cleanly through today's full schema), but
   * tracked and reported here rather than silently discarded — this repo's
   * "no quiet fallback" convention (CLAUDE.md, "The Quiet Fallback").
   */
  preExisting: { path: string; reason: string }[];
}

/**
 * Shared collection-and-classify logic (phase 288, T4): given a list of
 * `{ path, content }` entries, parse each with `parseDraftMd` and bucket any
 * that throw into `newlyFailing` (phase 288's new AC-heading rule) or
 * `preExisting` (any other, pre-existing parse/validation failure). Factored
 * out into one small helper so both the real historical-corpus scan below
 * and the synthetic failure-path self-test go through byte-identical logic
 * — the synthetic test is what would have caught a bug in this classifier
 * itself (e.g. the walk silently matching zero files, letting an empty
 * `newlyFailing` pass vacuously without ever really scanning anything; or
 * the classifier lumping unrelated zod errors into `newlyFailing`).
 */
function scanCorpus(entries: readonly { path: string; content: string }[]): CorpusScanResult {
  const newlyFailing: string[] = [];
  const preExisting: CorpusScanResult['preExisting'] = [];
  for (const { path, content } of entries) {
    try {
      parseDraftMd(content);
    } catch (err) {
      if (err instanceof CadenceError && err.code === 'COHERENCE_FAILED') {
        newlyFailing.push(path);
      } else {
        preExisting.push({ path, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return { newlyFailing, preExisting };
}

describe('288 (T4) historical corpus scan: every committed *-DRAFT.md still parses under the fail-loud AC rule', () => {
  it('288-01/AC-5: the new malformed-AC-heading rule newly rejects none of the real, historical *-DRAFT.md files', () => {
    const files = walkDraftFiles(PHASES_DIR);

    // Sanity floor so this test cannot pass vacuously if the walk silently
    // matched zero files. A manual scan earlier this session found 299
    // historical DRAFTs; this phase's own new 288-01-DRAFT.md brings the
    // live corpus to 300 as of this test running — asserted as a floor,
    // not an exact count, since the corpus only grows over time. (The
    // synthetic self-test below is the real proof the classifier fires at
    // all — zero real files are expected to trip `newlyFailing`, so this
    // scan alone can never demonstrate the mechanism works, only that it
    // found nothing to flag.)
    expect(files.length).toBeGreaterThanOrEqual(299);

    const entries = files.map((path) => ({ path, content: readFileSync(path, 'utf8') }));
    const { newlyFailing, preExisting } = scanCorpus(entries);

    expect(
      newlyFailing,
      `AC-5: these historical DRAFTs would newly fail under phase 288's malformed-AC-heading rule: ${newlyFailing.join(', ')}`,
    ).toEqual([]);

    // Out-of-scope-but-tracked (not asserted as a count): as of this scan,
    // 12 historical DRAFTs (all `39-*`/`40-*`/`41-*`/`42-*`/`43-*`/`44-*`,
    // all carrying a legacy `status: DONE` frontmatter value predating the
    // current `DraftZ` status enum — PENDING/APPROVED/IN_PROGRESS/SETTLED)
    // already fail to parse today for a reason wholly unrelated to phase
    // 288's new rule; they would fail identically against the pre-288
    // parser too. Deliberately not asserting a count/floor here — that
    // number can legitimately shrink (someone normalizes a legacy draft's
    // status) or grow (a future unrelated schema tightening), and neither
    // should make *this* test red, since T4 is scoped to the new AC rule
    // only. What's actually asserted is the shape: every `preExisting`
    // failure's reason must NOT be the new rule's own message — i.e. the
    // classifier never miscategorizes a `newlyFailing` case as
    // `preExisting`, which combined with the `COHERENCE_FAILED`-code check
    // above (the inverse direction) proves the bucketing is sound both ways.
    for (const p of preExisting) {
      expect(p.reason).not.toContain('malformed AC block');
    }
  });
});

describe('288 (T4) synthetic self-test: the corpus-scan classifier itself works', () => {
  it('288-01/AC-5: a deliberately malformed synthetic DRAFT is classified as newlyFailing, a legacy-status one as preExisting, and valid ones as neither', () => {
    const validDraftOne = `---
phase: 999-synthetic
id: 99-01
tier: standard
status: PENDING
---

# 99-01 — Synthetic valid draft one

## Objective

A synthetic, well-formed draft used only to prove the corpus scan's own
classifier logic actually works.

## Acceptance Criteria

### AC-1: Something
Given a thing
When another thing
Then a result

## Tasks

### T1: Do a thing
- files: \`a.ts\`
- action: do it
- verify: check it
- done: AC-1

## Boundaries

- Do NOT touch anything else
`;

    const malformedAcDraft = `---
phase: 999-synthetic
id: 99-02
tier: standard
status: PENDING
---

# 99-02 — Synthetic malformed-AC draft

## Objective

A synthetic draft with a deliberately non-numeric AC heading — this must be
classified as \`newlyFailing\` by the same logic the real corpus scan above
uses.

## Acceptance Criteria

### AC-K1: Non-numeric heading
Given a thing
When another thing
Then a result

## Tasks

### T1: Do a thing
- files: \`a.ts\`
- action: do it
- verify: check it
- done: AC-1

## Boundaries

- Do NOT touch anything else
`;

    const legacyStatusDraft = `---
phase: 999-synthetic
id: 99-03
tier: standard
status: DONE
---

# 99-03 — Synthetic legacy-status draft

## Objective

A synthetic draft with a well-formed AC section but a legacy \`status: DONE\`
value outside the current \`DraftZ\` enum — mirrors the 12 real historical
DRAFTs found above. This must be classified as \`preExisting\`, never
\`newlyFailing\` — proving the classifier actually discriminates by cause
rather than lumping every throw into one bucket.

## Acceptance Criteria

### AC-1: Something
Given a thing
When another thing
Then a result

## Tasks

### T1: Do a thing
- files: \`a.ts\`
- action: do it
- verify: check it
- done: AC-1

## Boundaries

- Do NOT touch anything else
`;

    const validDraftTwo = `---
phase: 999-synthetic
id: 99-04
tier: standard
status: PENDING
---

# 99-04 — Synthetic valid draft two

## Objective

A second well-formed synthetic draft, to prove the scan doesn't wrongly
flag good entries alongside the deliberately bad ones.

## Acceptance Criteria

### AC-1: Something else
Given a thing
When another thing
Then a result

## Tasks

### T1: Do a thing
- files: \`a.ts\`
- action: do it
- verify: check it
- done: AC-1

## Boundaries

- Do NOT touch anything else
`;

    const entries = [
      { path: 'synthetic/valid-1.md', content: validDraftOne },
      { path: 'synthetic/malformed-ac.md', content: malformedAcDraft },
      { path: 'synthetic/legacy-status.md', content: legacyStatusDraft },
      { path: 'synthetic/valid-2.md', content: validDraftTwo },
    ];

    const { newlyFailing, preExisting } = scanCorpus(entries);

    // This is the assertion that would have stayed vacuously green (both
    // buckets empty, or the malformed entry silently landing in the wrong
    // bucket) if the classifier itself were broken — e.g. if `scanCorpus`
    // never actually invoked `parseDraftMd`, a glob/walk matched nothing,
    // or the `COHERENCE_FAILED` check wrongly matched (or failed to match)
    // the real error. Here the malformed-AC entry must land in
    // `newlyFailing` by path, the legacy-status entry must land in
    // `preExisting` (never `newlyFailing`), and neither valid entry may be
    // flagged in either bucket.
    expect(
      newlyFailing,
      `AC-5: synthetic self-test expected only the malformed-AC entry in newlyFailing, got: ${newlyFailing.join(', ')}`,
    ).toEqual(['synthetic/malformed-ac.md']);

    expect(preExisting.map((p) => p.path)).toEqual(['synthetic/legacy-status.md']);
  });
});
