/**
 * Profile registry (phase 167, T1) — maps a lowercase file extension to the
 * `LanguageProfile` that scans it. An appendable map, not a closed switch:
 * later tasks each add one file (`./python.ts`, `./go.ts`, `./rust.ts`,
 * `./php.ts`) that calls `registerProfile(...)` for its own built-in
 * profile, and the per-file dispatch consumer (T6) and doc-content test
 * (T9) both read from `listProfiles()` / `getProfileForExtension()` — never
 * duplicate the profile set elsewhere.
 *
 * `verification.coverageProfiles` custom-profile merging (T7's addition to
 * this file, not T1's) is `mergeCustomProfiles` below, called from
 * `packages/core/src/config/loader.ts`'s `loadConfig` right after a
 * `.cadence/config.json` passes Zod schema validation — this is what makes
 * AC-7's "the custom profile is validated at config-load time" literally
 * true rather than lazily deferred to whenever a scan happens to touch that
 * extension. Add-only: a custom profile can register any extension no
 * BUILT-IN profile already owns; claiming a built-in's extension (`.ts`,
 * `.py`, `.go`, `.rs`, `.php`, ...) is refused loudly, naming the collision
 * and suggesting a fix (operator decision 2026-07-11 — overriding a
 * built-in is not supported). `BUILTIN_EXTENSIONS` is snapshotted once,
 * right after the five built-in `registerProfile` calls below and before
 * any custom profile can ever be merged, so it only ever reflects genuine
 * built-ins regardless of how many times `mergeCustomProfiles` itself is
 * later called (e.g. once per `loadConfig` invocation in a long-running
 * process) — a custom extension registered by an earlier `mergeCustomProfiles`
 * call is therefore never mistaken for a built-in on a later call, so
 * reloading the same config twice in one process re-registers the same
 * custom profile over itself rather than falsely refusing a "collision"
 * with its own prior registration.
 */

import type { LanguageProfile } from './types.js';
import type { CoverageProfileConfig } from '@manehorizons/cadence-types';
import { jsTsProfile } from './js-ts.js';
import { pythonProfile } from './python.js';
import { goProfile } from './go.js';
import { rustProfile } from './rust.js';
import { phpProfile } from './php.js';
import { compileCustomProfile } from './custom.js';
import { ConfigInvalidError } from '../../errors.js';

const registry = new Map<string, LanguageProfile>();

function normalizeExt(ext: string): string {
  const lower = ext.toLowerCase();
  return lower.startsWith('.') ? lower : `.${lower}`;
}

/** Register a profile for all of its declared extensions. */
export function registerProfile(profile: LanguageProfile): void {
  for (const ext of profile.extensions) {
    registry.set(normalizeExt(ext), profile);
  }
}

/** Look up the profile claiming a given extension (`'.ts'` or `'ts'`). */
export function getProfileForExtension(ext: string): LanguageProfile | undefined {
  return registry.get(normalizeExt(ext));
}

/** All distinct registered profiles (built-in + any custom-merged later). */
export function listProfiles(): LanguageProfile[] {
  return [...new Set(registry.values())];
}

registerProfile(jsTsProfile);
registerProfile(pythonProfile);
registerProfile(goProfile);
registerProfile(rustProfile);
registerProfile(phpProfile);

/**
 * Snapshot of every extension a BUILT-IN profile owns, taken immediately
 * after the five registrations above. See module docstring for why this
 * must be a fixed snapshot rather than "whatever `registry` currently
 * contains" at merge time.
 */
const BUILTIN_EXTENSIONS = new Map<string, string>();
for (const profile of listProfiles()) {
  for (const ext of profile.extensions) {
    BUILTIN_EXTENSIONS.set(normalizeExt(ext), profile.id);
  }
}

/**
 * Compiles and registers every entry of `verification.coverageProfiles`
 * (phase 167, T7, AC-7). Atomic per call: every entry is compiled
 * (`compileCustomProfile`, `./custom.js`) and checked for an extension
 * collision — against a built-in, and against an earlier entry in this same
 * `raws` array — BEFORE any of them are registered, so a bad entry later in
 * the list never leaves an earlier, valid entry from the same call
 * half-registered (refuse + suggest applies to the whole batch, not a
 * silently-partial one). Called from `loadConfig`
 * (`packages/core/src/config/loader.ts`) with the Zod-parsed
 * `verification.coverageProfiles` array — an empty array (the default) is a
 * no-op.
 */
export function mergeCustomProfiles(raws: CoverageProfileConfig[]): void {
  const claimedBy = new Map<string, string>(BUILTIN_EXTENSIONS);
  // Also seed from any CUSTOM extension already live in the registry from an
  // earlier `mergeCustomProfiles` call in this same process (phase 167, T7
  // review: without this, a long-lived process — e.g. `cadence mcp serve`,
  // or repeated `loadConfig` calls sharing one process — silently let a
  // LATER call's custom profile shadow an EARLIER call's different custom
  // profile for the same extension, since only `BUILTIN_EXTENSIONS` was ever
  // checked against). A profile reusing its OWN prior id for the same
  // extension is still treated as an idempotent reload (`owner === raw.id`
  // below), matching this module's documented "reloading the same config
  // twice re-registers over itself" intent — only a DIFFERENT id colliding
  // on the extension is refused.
  for (const [ext, profile] of registry) {
    if (!BUILTIN_EXTENSIONS.has(ext)) claimedBy.set(ext, profile.id);
  }
  const compiled: LanguageProfile[] = [];

  for (const raw of raws) {
    const profile = compileCustomProfile(raw);
    for (const rawExt of profile.extensions) {
      const ext = normalizeExt(rawExt);
      const owner = claimedBy.get(ext);
      if (owner !== undefined && owner !== raw.id) {
        const isBuiltin = BUILTIN_EXTENSIONS.has(ext);
        throw new ConfigInvalidError(
          isBuiltin
            ? `verification.coverageProfiles: custom profile "${raw.id}" claims extension ` +
              `"${ext}", which is already handled by the built-in "${owner}" profile. Custom ` +
              `profiles cannot override built-in extensions — choose a different extension for ` +
              `"${raw.id}" or remove this entry.`
            : `verification.coverageProfiles: custom profile "${raw.id}" claims extension ` +
              `"${ext}", which is already claimed by custom profile "${owner}" — either from ` +
              `earlier in verification.coverageProfiles, or from a previously loaded config in ` +
              `this same session. Choose a different extension, or remove one of the two entries.`,
        );
      }
      claimedBy.set(ext, raw.id);
    }
    compiled.push(profile);
  }

  for (const profile of compiled) registerProfile(profile);
}

export { jsTsProfile, pythonProfile, goProfile, rustProfile, phpProfile };
