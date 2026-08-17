import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo-root from this test file's location:
// packages/core/tests/docs → ../../../../<repo-root>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** The old npm scope, and the bare GitHub owner/repo string that predates it. */
const SCOPE_PATTERN = /@manehorizons|manehorizons\/cadence/;

interface ScopeHit {
  file: string;
  line: number;
  text: string;
}

/**
 * Pure: scan `files` (repo-relative path -> full text content) for the old
 * npm scope / GitHub-org string. Deliberately carries no allowlist logic —
 * see `isAllowedFile` below for that. Kept separate so the "not vacuous"
 * sanity check further down can run this raw scan against files the
 * allowlist exempts and show it still finds real hits there.
 */
function findScopeReferences(files: ReadonlyMap<string, string>): ScopeHit[] {
  const hits: ScopeHit[] = [];
  for (const [file, content] of files) {
    content.split('\n').forEach((text, idx) => {
      if (SCOPE_PATTERN.test(text)) {
        hits.push({ file, line: idx + 1, text: text.trim() });
      }
    });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Allowlist — phase 250 (npm scope rename @manehorizons -> @thomas-powers-jr).
// Every entry below is a documented, deliberate exception, not a blanket
// suppression. Re-verified against a full repo-wide sweep by T1 (this
// phase's last task, run after T2-T12): do not add an entry here without the
// same rigor — an unjustified addition defeats the point of this test.
// ---------------------------------------------------------------------------

/**
 * All CHANGELOG.md files (root + every packages/*\/CHANGELOG.md): historical
 * release records, never touched by this phase.
 */
function isChangelog(file: string): boolean {
  return file === 'CHANGELOG.md' || /^packages\/[^/]+\/CHANGELOG\.md$/.test(file);
}

/**
 * `.cadence/**`: planning records. This phase's own DRAFT/PROGRESS/SPEC
 * artifacts (and the many older phase DRAFTs) legitimately discuss the old
 * scope throughout — CLAUDE.md's "Freshen Reflex" failure mode forbids
 * rewriting these to look current after the fact.
 */
function isCadencePlanningRecord(file: string): boolean {
  return file === '.cadence' || file.startsWith('.cadence/');
}

/**
 * `.changeset/*.md`: pending release-note prose (excluding `config.json`,
 * which is real config, not prose). A changeset is pre-CHANGELOG.md content —
 * `changeset version` folds it into `CHANGELOG.md`, which `isChangelog`
 * already exempts. A release note for an npm-scope rename that can't name
 * the scope it renamed from would be a worse release note; exempting the
 * folded form but not the pending form would be incoherent.
 */
function isPendingChangeset(file: string): boolean {
  return /^\.changeset\/[^/]+\.md$/.test(file);
}

const ALLOWED_FILES = new Set<string>([
  // Contact-identity mapping. Its entries are email addresses of the form
  // `manehorizons@gmail.com` (the `@` follows the name, so this never
  // actually matches SCOPE_PATTERN today) — allowlisted anyway per the
  // phase's documented exception list, in case the format ever changes.
  '.mailmap',

  // Named GitHub-org-fixture test files that assert on the bare
  // `manehorizons/cadence` owner/repo string (no `@`, unrelated to the npm
  // scope) — left untouched by T6's rename sweep on purpose.
  'packages/core/tests/cli/init-ci.test.ts',
  'packages/core/tests/init/ci-workflow.test.ts',
  'packages/core/tests/services/retro.test.ts',
  // Verified directly: only this file's GitHub-URL fixture lines remain
  // post-T6 (its `@manehorizons/cadence-*` npm-scope lines were already
  // renamed) — zero `@manehorizons` hits left, only the bare-org-string URLs.
  'packages/core/tests/scripts/release-integrity.test.ts',

  // T5's stale-npm-scope detection sentinel: `STALE_NPM_SCOPE =
  // '@manehorizons/'`. This literal IS the feature — host-hooks.ts uses it
  // to detect leftover pre-rename hook installs on a consumer's machine.
  // Renaming the literal would silently break that detection.
  'packages/core/src/doctor/host-hooks.ts',
  // T5's test fixtures exercising the sentinel above.
  'packages/core/tests/doctor/host-hooks.test.ts',

  // T8's migration guide: necessarily names the old scope by name to explain
  // it to consumers moving off it.
  'docs/migration-npm-scope.md',

  // Pre-existing (2026-07-27, PR #319) Phase-0 kernel/assurance design spec,
  // predating this rename. Its `Target repo: manehorizons/cadence` header is
  // a factual snapshot of the repo as it was when the doc was written — the
  // same category as `.cadence/**` planning records (CLAUDE.md's "Freshen
  // Reflex" failure mode: don't rewrite historical planning docs to look
  // current), just filed under docs/handoffs/ instead of .cadence/. Not in
  // the phase DRAFT's original 9-category list; added here after an
  // independent repo-wide sweep found it and judged it a documentation gap
  // rather than a leftover bug — flagged explicitly for operator review in
  // T1's build report.
  'docs/handoffs/cadence-phase0-assurance-kernel-review.md',

  // This file. A sweep test necessarily names the pattern it searches for
  // (in SCOPE_PATTERN itself, in its allowlist-justification comments, and
  // in its own describe/it titles) — currently untracked (`??`), so
  // `git ls-files` doesn't surface it yet, but it must self-exempt before
  // it's staged or the sweep would fail permanently on itself the moment
  // this task's own deliverable is committed.
  'packages/core/tests/docs/npm-scope-sweep.test.ts',

  // v1.55 release-handoff doc (2026-08-04): its release-cut checklist item 2
  // reads "No changeset references the deprecated `@manehorizons` scope" —
  // an instruction to verify the absence of such references, which
  // necessarily names the scope it's checking for. Same category as
  // docs/migration-npm-scope.md above: naming the old scope to describe a
  // check about it, not a leftover reference needing migration.
  'docs/handoffs/HANDOFF-v1.55-integrity-release.md',
]);

// Note on generated docs: `website/src/content/docs/api/**` (typedoc output)
// is gitignored (`website/.gitignore`: `src/content/docs/**`) and therefore
// can never appear in `git ls-files` — the tracked-file sweep below
// structurally excludes it without needing an entry here.

function isAllowedFile(file: string): boolean {
  return (
    isChangelog(file) ||
    isCadencePlanningRecord(file) ||
    isPendingChangeset(file) ||
    ALLOWED_FILES.has(file)
  );
}

/**
 * Every git-tracked file in the repo, read as UTF-8 text (repo-relative path
 * -> content). Uses `git ls-files` via a fixed arg array (never a shell
 * string), matching the house pattern in
 * `packages/core/src/doctor/run.ts#listTrackedCadenceOwnedPaths`. The repo
 * currently tracks no binary file extensions (verified: no png/jpg/gif/ico/
 * woff/ttf/pdf/zip), so no binary guard is needed here; an unreadable path
 * (e.g. a submodule gitlink) is simply skipped.
 */
function readAllTrackedFiles(): Map<string, string> {
  const listing = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  const paths = listing
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const files = new Map<string, string>();
  for (const path of paths) {
    try {
      const content = readFileSync(join(ROOT, path), 'utf8');
      files.set(path, content);
    } catch {
      // Unreadable (e.g. a submodule gitlink, or a path git reports but the
      // filesystem doesn't have) — not this sweep's concern.
      continue;
    }
  }
  return files;
}

describe('phase 250 (AC-1): npm scope rename — final stray-@manehorizons sweep', () => {
  const allFiles = readAllTrackedFiles();
  const allHits = findScopeReferences(allFiles);

  it('250-01/AC-1 sanity: the scan is not vacuous — it finds real @manehorizons hits inside files this test allowlists', () => {
    // Proves findScopeReferences + SCOPE_PATTERN actually match real content
    // (not a typo'd pattern matching nothing) and that the allowlist below is
    // doing real work — filtering real hits, not an empty set. (Historical
    // corroboration, checked manually rather than asserted here: at the
    // commit immediately preceding this phase's work, the same pattern
    // matched 701 tracked files repo-wide — this sweep is not vacuous
    // against pre-rename state either.)
    const hitsInAllowedFiles = allHits.filter((hit) => isAllowedFile(hit.file));
    expect(hitsInAllowedFiles.length).toBeGreaterThan(0);
  });

  it('250-01/AC-1 + 250-01/AC-3: a repo-wide grep for @manehorizons / manehorizons/cadence finds matches only in the documented allowlist', () => {
    const unexpected = allHits.filter((hit) => !isAllowedFile(hit.file));
    const summary = unexpected.map((hit) => `${hit.file}:${hit.line}: ${hit.text}`).join('\n');
    expect(unexpected, `Found ${unexpected.length} un-allowlisted stray reference(s):\n${summary}`).toEqual([]);
  });
});

describe('phase 250 (AC-2): package identity renamed', () => {
  // The 6 published/private workspace packages (source of truth:
  // pnpm-workspace.yaml + each package's own package.json) mapped to their
  // exact expected `name` field — a direct, cheap guard against an
  // accidental revert of any single package's identity back to the old
  // scope (or a copy-paste onto the wrong package's name).
  const EXPECTED_PACKAGE_NAMES: ReadonlyArray<readonly [path: string, name: string]> = [
    ['packages/core/package.json', '@thomas-powers-jr/cadence-core'],
    ['packages/types/package.json', '@thomas-powers-jr/cadence-types'],
    ['packages/host-claude-code/package.json', '@thomas-powers-jr/cadence-host-claude-code'],
    ['packages/host-codex/package.json', '@thomas-powers-jr/cadence-host-codex'],
    ['packages/host-toolkit/package.json', '@thomas-powers-jr/cadence-host-toolkit'],
    ['packages/testkit/package.json', '@thomas-powers-jr/cadence-testkit'],
  ];

  it('250-01/AC-2: all 6 package.json name fields reference @thomas-powers-jr/cadence-*', () => {
    for (const [path, expectedName] of EXPECTED_PACKAGE_NAMES) {
      const pkg = JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as { name?: string };
      expect(pkg.name, `${path} name field`).toBe(expectedName);
    }
  });
});
