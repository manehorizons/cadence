/**
 * Config → `LanguageProfile` compilation for `verification.coverageProfiles`
 * (phase 167, T7).
 *
 * `CoverageProfileConfig` (`@thomas-powers-jr/cadence-types`, `packages/types/
 * src/config.ts`) is the JSON-serializable, string-pattern shape an operator
 * writes in `.cadence/config.json` — `openerPattern`/`assertionPattern` are
 * regex SOURCE STRINGS there, because a native `RegExp` cannot round-trip
 * through JSON. `compileCustomProfile` is the one place that turns that raw
 * config shape into a real, engine-ready `LanguageProfile` (`./types.ts`),
 * and is the single source of the refuse+suggest error text for every way a
 * single profile entry can be invalid: an unparsable regex string, or a
 * `strategy: 'do-end-keyword'` entry missing its required `keyword` config.
 * Cross-entry concerns (extension collisions, both against built-ins and
 * against another entry in the same list) are `./registry.ts`'s
 * `mergeCustomProfiles`, which calls this function per-entry first.
 *
 * Every refusal throws `ConfigInvalidError` (`../../errors.js`) — the same
 * error type `packages/core/src/config/loader.ts` already throws for a bad
 * `config.json`, so a custom-profile mistake surfaces through the exact
 * same refuse+suggest CLI path as any other config validation failure
 * (CLAUDE.md: "the engine refuses loudly, names the conflict, and suggests
 * the fix"). This module is intentionally NOT a Zod `.superRefine` on
 * `CoverageProfileConfigZ` itself: a schema-level refinement can flag that
 * something is wrong, but producing a message that names the exact profile
 * `id`, the exact field, and a concrete suggested fix (not just "invalid")
 * reads far more naturally as plain TypeScript here than through Zod's
 * issue-formatting machinery — and it keeps `packages/types` free of any
 * "is this regex string parsable" logic, which is really a core concern
 * (the regex is only ever compiled and used by core's scanning engine).
 *
 * ## Which `LanguageProfile` fields config exposes, and why
 *
 * `id` / `extensions` / `openerPattern` / `assertionPattern` / `strategy` /
 * `syntax` are required — a custom profile is not "functional" without all
 * six (mirrors the required-field set every built-in profile fills in,
 * `./go.ts` / `./python.ts` / `./rust.ts` / `./php.ts` / `./js-ts.ts`).
 * `keyword` is required only when `strategy === 'do-end-keyword'` — checked
 * here, not by the Zod schema, for the same "one clear message" reason
 * above. `openerMatchesStrings` is optional and passed straight through —
 * see `LanguageProfile.openerMatchesStrings`'s own docstring (`./types.ts`)
 * for the do-end-keyword `it 'title' do` case this task's own Ruby fixture
 * exercises. `openerRequiredLiteral` and `LanguageSyntax.fencedStrings` /
 * `heredocs` are deliberately NOT part of `CoverageProfileConfig` at all
 * (`packages/types/src/config.ts`'s module docstring on
 * `CoverageProfileConfigZ` has the full rationale) — there is nothing to
 * compile for them here because config can't express them this task.
 */

import type { CoverageProfileConfig } from '@thomas-powers-jr/cadence-types';
import type { BlockStrategy, LanguageProfile, LanguageSyntax } from './types.js';
import { ConfigInvalidError } from '../../errors.js';

/**
 * Compiles a regex SOURCE STRING into a real `RegExp`, refusing loudly
 * (naming the profile id and field) instead of letting `new RegExp(...)`'s
 * `SyntaxError` propagate uncaught. `sticky: true` adds the `y` flag the
 * engine requires for opener patterns (`findSpansForProfile`,
 * `./engine.ts`, adds it automatically if missing — this mirrors that same
 * tolerance rather than depending on it, so the compiled pattern is valid
 * on its own).
 */
function compilePattern(
  source: string,
  profileId: string,
  field: 'openerPattern' | 'assertionPattern',
  sticky: boolean,
): RegExp {
  try {
    return new RegExp(source, sticky ? 'y' : undefined);
  } catch (err) {
    throw new ConfigInvalidError(
      `verification.coverageProfiles: custom profile "${profileId}" has an invalid "${field}" ` +
        `regex ("${source}"): ${(err as Error).message}. Fix the pattern (it must be a valid ` +
        `JavaScript regular expression source string) or remove this entry.`,
    );
  }
}

function compileSyntax(raw: CoverageProfileConfig['syntax']): LanguageSyntax {
  const syntax: LanguageSyntax = {
    comments: {
      ...(raw.comments.line.length > 0 ? { line: raw.comments.line } : {}),
      ...(raw.comments.block.length > 0 ? { block: raw.comments.block } : {}),
    },
    strings: raw.strings.map((s) => ({
      open: s.open,
      ...(s.close !== undefined ? { close: s.close } : {}),
      ...(s.escape !== undefined ? { escape: s.escape } : {}),
    })),
  };
  return syntax;
}

/**
 * Compiles one `CoverageProfileConfig` entry into a real `LanguageProfile`,
 * validating everything a single entry (in isolation) can invalidate: an
 * unparsable `openerPattern`/`assertionPattern` regex string, or a
 * `do-end-keyword` strategy missing its required `keyword` config. Never
 * partially compiles and never guesses a default for a missing conditional
 * field — a refusal is thrown instead (false-positive-averse invariant,
 * applied to config validation itself: an unusable custom profile must
 * never be silently accepted as if it were usable).
 *
 * Does NOT check extension collisions (against built-ins or against other
 * entries in the same `coverageProfiles` list) — that is cross-entry state
 * only `./registry.ts`'s `mergeCustomProfiles` has visibility into.
 */
export function compileCustomProfile(raw: CoverageProfileConfig): LanguageProfile {
  const openerPattern = compilePattern(raw.openerPattern, raw.id, 'openerPattern', true);
  const assertionPattern = compilePattern(raw.assertionPattern, raw.id, 'assertionPattern', false);

  if (raw.strategy === 'do-end-keyword' && !raw.keyword) {
    throw new ConfigInvalidError(
      `verification.coverageProfiles: custom profile "${raw.id}" uses strategy ` +
        `"do-end-keyword" but is missing its required "keyword" config. Add ` +
        `"keyword": { "blockOpenKeywords": [...], "endKeyword": "..." } to this entry, ` +
        `or choose a different "strategy" that doesn't need it.`,
    );
  }

  const profile: LanguageProfile = {
    id: raw.id,
    extensions: raw.extensions,
    openerPattern,
    assertionPattern,
    syntax: compileSyntax(raw.syntax),
    strategy: raw.strategy as BlockStrategy,
    ...(raw.keyword ? { keyword: raw.keyword } : {}),
    ...(raw.openerMatchesStrings !== undefined
      ? { openerMatchesStrings: raw.openerMatchesStrings }
      : {}),
  };
  return profile;
}
