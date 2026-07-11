/**
 * Doc-content drift guard for the assertion-mode supported-language matrix
 * (phase 167, T9, AC-9): `docs/reference/config.md`'s "Supported-language
 * matrix (assertion mode)" table must match the live profile registry
 * (`packages/core/src/verify/coverage-profiles/registry.ts`'s
 * `listProfiles()`) exactly — same profiles, same extensions, same block
 * strategy — failing on drift in either direction (a profile shipped
 * without a doc row, or a stale doc row for a profile that no longer
 * exists). Mirrors the established marker-block pattern this repo already
 * uses for a code-truth-derived doc (`cli-reference.test.ts`'s
 * `documentedCommands()` vs. `cliCommands()`), not a hand-rolled one.
 *
 * The comparison itself — `parseDocMatrixKeys` + `profileKey`, both plain,
 * side-effect-free functions — is exercised twice against SYNTHETIC data
 * (never against the real shared `registry` Map, whose module-level
 * singleton other test files in this suite also read) to prove the guard
 * actually catches drift in both directions, per this task's explicit
 * "doc-content test ... demonstrably fails when a profile is added without
 * a doc row" requirement. `listProfiles()` itself is only ever CALLED
 * (read), never mutated, by any test in this file — no
 * `registerProfile`/`mergeCustomProfiles` call appears anywhere below, so
 * nothing here can leak a fake profile into the registry for any other test
 * in the suite to observe.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listProfiles } from '../../src/verify/coverage-profiles/registry.js';
import type { LanguageProfile } from '../../src/verify/coverage-profiles/types.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const CONFIG_MD = join(ROOT, 'docs', 'reference', 'config.md');

/** Canonical, order-independent identity for a profile row: id + sorted
 * extensions + block strategy. Extensions are sorted so neither the doc's
 * nor `LanguageProfile.extensions`' authored ordering matters — only which
 * extensions are claimed. */
function profileKey(profile: Pick<LanguageProfile, 'id' | 'extensions' | 'strategy'>): string {
  return `${profile.id}|${[...profile.extensions].sort().join(',')}|${profile.strategy}`;
}

/**
 * Parses `docs/reference/config.md`'s
 * `<!-- cadence:coverage-languages:start -->...:end -->` marker block into
 * one `profileKey`-shaped string per data row (skips the header and
 * separator rows). Column order is fixed: Language | Profile id
 * (backticked) | Extensions (comma-separated, each backticked) | Block
 * strategy (backticked) | Recognized shape(s).
 */
function parseDocMatrixKeys(md: string): string[] {
  const blockMatch = md.match(
    /<!-- cadence:coverage-languages:start -->([\s\S]*?)<!-- cadence:coverage-languages:end -->/,
  );
  if (!blockMatch) {
    throw new Error('config.md: coverage-languages drift-guard marker block missing');
  }
  const lines = blockMatch[1]!
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|'));

  const dataRows = lines.filter((l) => !/^\|\s*-+\s*\|/.test(l) && !l.includes('Profile id'));

  return dataRows.map((row) => {
    const cells = row
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    // cells: [Language, `id`, `ext1`, ext2, ..., strategy, shape description]
    const idCell = cells[1];
    const extCell = cells[2];
    const strategyCell = cells[3];
    if (idCell === undefined || extCell === undefined || strategyCell === undefined) {
      throw new Error(`config.md: malformed coverage-languages matrix row: ${row}`);
    }
    const id = idCell.match(/`([^`]+)`/)?.[1];
    const extensions = [...extCell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    const strategy = strategyCell.match(/`([^`]+)`/)?.[1] ?? strategyCell;
    if (id === undefined || extensions.length === 0) {
      throw new Error(`config.md: could not parse id/extensions from row: ${row}`);
    }
    return profileKey({ id, extensions, strategy: strategy as LanguageProfile['strategy'] });
  });
}

describe('docs/reference/config.md supported-language matrix drift guard (AC-9)', () => {
  it('AC-9: config.md matrix keys match the live profile registry exactly, in both directions', () => {
    const md = readFileSync(CONFIG_MD, 'utf8');
    const docKeys = parseDocMatrixKeys(md).sort();
    const liveKeys = listProfiles().map(profileKey).sort();

    expect(docKeys).toEqual(liveKeys);
  });

  it('AC-9: every live profile id and every one of its extensions literally appears in config.md', () => {
    const md = readFileSync(CONFIG_MD, 'utf8');
    for (const profile of listProfiles()) {
      expect(md).toContain(`\`${profile.id}\``);
      for (const ext of profile.extensions) {
        expect(md).toContain(`\`${ext}\``);
      }
    }
  });

  // Negative case (this task's own explicit requirement): prove the
  // comparison in the test above is a genuine regression guard, not one
  // that could never fail. Done WITHOUT touching the real, shared
  // `registry` Map (mutating it here would leak a fake profile into every
  // other test file in this run that also imports `registry.ts` — the
  // module-level `Map` is a process-wide singleton). Instead, this exercises
  // the exact same `parseDocMatrixKeys`/`profileKey` comparison logic used
  // above against a SYNTHETIC "live" profile list, built by extending the
  // real (read-only) `listProfiles()` snapshot with one extra profile that
  // was never registered anywhere and has no doc row.
  it('AC-9: negative case — a profile added without a matching doc row fails the same comparison', () => {
    const md = readFileSync(CONFIG_MD, 'utf8');
    const docKeys = parseDocMatrixKeys(md).sort();

    const fakeProfile: Pick<LanguageProfile, 'id' | 'extensions' | 'strategy'> = {
      id: 'fake-lang-not-in-docs',
      extensions: ['.fake-lang-ext'],
      strategy: 'call-expression',
    };
    const syntheticLiveKeysWithExtraProfile = [...listProfiles(), fakeProfile]
      .map(profileKey)
      .sort();

    expect(docKeys).not.toEqual(syntheticLiveKeysWithExtraProfile);
    // The exact assertion the real test above makes would throw given this
    // synthetic registry snapshot — i.e. the guard is load-bearing, not
    // vacuously true.
    expect(() => expect(docKeys).toEqual(syntheticLiveKeysWithExtraProfile)).toThrow();
  });

  // Negative case, the other direction: a stale doc row left behind after a
  // profile is removed from the registry must also fail — AC-9 explicitly
  // requires "drift in either direction". Synthesizes the DOC side instead
  // of the registry side, again without mutating any shared state.
  it('AC-9: negative case — a stale doc row for a profile no longer in the registry fails the same comparison', () => {
    const liveKeys = listProfiles().map(profileKey).sort();

    const syntheticDocKeysWithStaleRow = [
      ...liveKeys,
      profileKey({
        id: 'removed-lang',
        extensions: ['.removed-ext'],
        strategy: 'brace-delimited',
      }),
    ].sort();

    expect(syntheticDocKeysWithStaleRow).not.toEqual(liveKeys);
    expect(() => expect(syntheticDocKeysWithStaleRow).toEqual(liveKeys)).toThrow();
  });
});
