#!/usr/bin/env node
// Fails when a `pnpm.overrides` target in package.json no longer covers every
// resolved instance of that package in pnpm-lock.yaml. pnpm's override-key
// matching is declared-range intersection against a *dependent's* declared
// specifier, not natural-resolution matching (see
// .cadence/phases/253-dependency-override-remediation/253-01-T3-EVIDENCE.md,
// Finding 2) — a stale or non-intersecting override key is silently ignored
// with no error, so this detector re-derives coverage directly from the
// committed lockfile instead of trusting that the override "must still be
// doing something" because it's present in package.json.
//
// Pure decision logic (extractOverrideTargets / parseLockfilePackages /
// checkOverrideCoverage) is exported and unit-tested in
// packages/core/tests/docs/check-lockfile-overrides.test.ts; main() is the
// thin, impure shell that reads the two real files and prints/exits —
// mirroring scripts/check-audit-exceptions.mjs's pure/impure split. This is
// pure file-parsing (package.json + pnpm-lock.yaml already on disk after
// `pnpm install`), so no subprocess is needed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Reads a *parsed* package.json object's `pnpm.overrides` map (keys of the
 * form `pkg@sourceVersion` -> a semver range) into
 * `{ package, sourceVersion, range }[]`. Package names may themselves
 * contain `@` (scoped packages, e.g. `@scope/pkg@1.0.0`) — the source
 * version is split off at the *last* `@`, since scoped names always start
 * with their own leading `@` and versions never contain one.
 */
export function extractOverrideTargets(packageJson) {
  const overrides = packageJson?.pnpm?.overrides;
  if (!overrides || typeof overrides !== 'object') return [];

  const targets = [];
  for (const [key, range] of Object.entries(overrides)) {
    const atIndex = key.lastIndexOf('@');
    if (atIndex <= 0) continue; // no `@version` suffix to split on — not a valid override key
    targets.push({
      package: key.slice(0, atIndex),
      sourceVersion: key.slice(atIndex + 1),
      range,
    });
  }
  return targets;
}

/**
 * Returns the raw `pnpm.overrides` keys that `extractOverrideTargets` drops
 * because they have no parseable `@sourceVersion` suffix (a bare package
 * name key, or a key starting with `@` and nothing after it). Kept as a
 * separate pure function — rather than having `extractOverrideTargets` do
 * I/O itself — so the impure shell (`main()`) can decide how loudly to warn,
 * per this repo's "no fallback without telling anyone" convention. Today's
 * real committed overrides are all versioned, so this returns `[]` against
 * the current config; it exists to catch a future override entry added
 * without its source-version suffix, which would otherwise be silently
 * ignored by the detector with zero diagnostic.
 */
export function findUnversionedOverrideKeys(packageJson) {
  const overrides = packageJson?.pnpm?.overrides;
  if (!overrides || typeof overrides !== 'object') return [];
  return Object.keys(overrides).filter((key) => key.lastIndexOf('@') <= 0);
}

// Matches a top-level `packages:` block entry line: exactly two leading
// spaces (guarding against nested fields like `    resolution: {...}` or
// `    peerDependenciesMeta:`, which sit at 4+ spaces), then a bare `key:`
// with nothing trailing but whitespace (the value is a nested block on
// subsequent lines, never inline on this line).
const PACKAGE_ENTRY_LINE = /^ {2}(\S.*?):\s*$/;

function unquote(key) {
  if (
    (key.startsWith("'") && key.endsWith("'")) ||
    (key.startsWith('"') && key.endsWith('"'))
  ) {
    return key.slice(1, -1);
  }
  return key;
}

/**
 * Parses pnpm-lock.yaml's raw text, reading only the top-level `packages:`
 * block into `{ package, version }[]` — one entry per resolved instance,
 * including every line of a package that resolves to more than one version
 * (e.g. brace-expansion's 2.x and 5.x lines both resolving). Deliberately
 * stops at `snapshots:` so its nested `dependencies:` lines (which reuse the
 * same package names at deeper indentation) are never read as top-level
 * package entries.
 */
export function parseLockfilePackages(lockfileText) {
  const lines = String(lockfileText).split(/\r?\n/);

  const packagesIdx = lines.findIndex((line) => /^packages:\s*$/.test(line));
  if (packagesIdx === -1) return [];

  const snapshotsIdx = lines.findIndex((line, i) => i > packagesIdx && /^snapshots:\s*$/.test(line));
  const endIdx = snapshotsIdx === -1 ? lines.length : snapshotsIdx;

  const packages = [];
  for (let i = packagesIdx + 1; i < endIdx; i += 1) {
    const match = PACKAGE_ENTRY_LINE.exec(lines[i]);
    if (!match) continue;

    const key = unquote(match[1]);
    const atIndex = key.lastIndexOf('@');
    if (atIndex <= 0) continue; // no `@version` suffix — not a resolvable package@version entry

    packages.push({ package: key.slice(0, atIndex), version: key.slice(atIndex + 1) });
  }
  return packages;
}

/** Parses the first 3 dot-separated numeric components of a version string. */
function versionParts(version) {
  return String(version)
    .split('.')
    .slice(0, 3)
    .map((part) => parseInt(part, 10) || 0);
}

function majorOf(version) {
  return versionParts(version)[0];
}

function compareVersions(a, b) {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * Extracts the floor version out of the two range forms this repo's real
 * overrides use (`^x.y.z` and `>=x.y.z`) — no general-purpose semver range
 * parser is needed, per this repo's actual override targets.
 */
function rangeFloor(range) {
  const trimmed = String(range).trim();
  if (trimmed.startsWith('>=')) return trimmed.slice(2).trim();
  if (trimmed.startsWith('^')) return trimmed.slice(1).trim();
  throw new Error(`Unsupported override range form: "${range}" (only ^x.y.z and >=x.y.z are supported)`);
}

function satisfiesRange(version, range) {
  const trimmed = String(range).trim();
  const floor = rangeFloor(trimmed);
  if (compareVersions(version, floor) < 0) return false;
  if (trimmed.startsWith('>=')) return true;

  // Caret (`^`) semantics: locked to the floor's leftmost non-zero
  // component. This repo's real override floors are all major >=1, so the
  // common case (same major) covers everything actually in use; the 0.x
  // fallbacks are kept for correctness rather than because they're exercised.
  const v = versionParts(version);
  const f = versionParts(floor);
  if (f[0] > 0) return v[0] === f[0];
  if (f[1] > 0) return v[0] === f[0] && v[1] === f[1];
  return v[0] === f[0] && v[1] === f[1] && v[2] === f[2];
}

/**
 * Checks every resolved lockfile instance of an overridden package against
 * its override target(s). Matching is keyed off the *target range's floor
 * major version*, not the override key's source-version major — an override
 * like `read-yaml-file@1.1.0: ^2.1.0` moves the resolved major from 1 to 2,
 * so source-major matching would find nothing to check.
 *
 * A resolved instance whose package name has no override target at all is
 * out of this detector's scope (not every lockfile package is overridden).
 * A resolved instance whose package name HAS at least one override target,
 * but whose own major-version line matches none of them, is an
 * 'unguarded-line' failure (today's real committed state: brace-expansion's
 * 5.x line is covered, its 2.x line isn't). A resolved instance that matches
 * a target's major but doesn't satisfy that target's range is an
 * 'unsatisfied' failure.
 *
 * Returns `{ ok, failures }` where each failure is
 * `{ package, range, resolvedVersion, instance, reason }`.
 */
export function checkOverrideCoverage(overrideTargets, lockfilePackages) {
  const failures = [];

  for (const instance of lockfilePackages) {
    const targetsForPackage = overrideTargets.filter((target) => target.package === instance.package);
    if (targetsForPackage.length === 0) continue; // not governed by any override — out of scope

    const instanceMajor = majorOf(instance.version);
    const matchingTarget = targetsForPackage.find((target) => majorOf(rangeFloor(target.range)) === instanceMajor);
    const instanceLabel = `${instance.package}@${instance.version}`;

    if (!matchingTarget) {
      failures.push({
        package: instance.package,
        range: null,
        resolvedVersion: instance.version,
        instance: instanceLabel,
        reason: 'unguarded-line',
      });
      continue;
    }

    if (!satisfiesRange(instance.version, matchingTarget.range)) {
      failures.push({
        package: instance.package,
        range: matchingTarget.range,
        resolvedVersion: instance.version,
        instance: instanceLabel,
        reason: 'unsatisfied',
      });
    }
  }

  return { ok: failures.length === 0, failures };
}

function describeFailure(failure) {
  if (failure.reason === 'unguarded-line') {
    return (
      `${failure.instance} resolves in pnpm-lock.yaml but no pnpm.overrides target covers its major-version line ` +
      `(package.json has an override for ${failure.package}, but not for this resolved major)`
    );
  }
  return (
    `${failure.instance} does not satisfy its override target range ${failure.range} ` +
    `(package.json's pnpm.overrides expects ${failure.range}, but pnpm-lock.yaml resolves ${failure.resolvedVersion})`
  );
}

async function main(root = DEFAULT_ROOT) {
  const packageJsonPath = join(root, 'package.json');
  const lockfilePath = join(root, 'pnpm-lock.yaml');

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const lockfileText = readFileSync(lockfilePath, 'utf8');

  const unversionedKeys = findUnversionedOverrideKeys(packageJson);
  for (const key of unversionedKeys) {
    process.stderr.write(
      `check-lockfile-overrides: WARNING override key "${key}" has no parseable @sourceVersion suffix and is ` +
        'silently ignored by this detector — rename it to "pkg@sourceVersion" or remove it\n',
    );
  }

  const overrideTargets = extractOverrideTargets(packageJson);
  if (overrideTargets.length === 0) {
    process.stdout.write('check-lockfile-overrides: no pnpm.overrides entries declared — nothing to check\n');
    return;
  }

  const lockfilePackages = parseLockfilePackages(lockfileText);
  const result = checkOverrideCoverage(overrideTargets, lockfilePackages);

  if (!result.ok) {
    for (const failure of result.failures) {
      process.stderr.write(`check-lockfile-overrides: FAIL ${describeFailure(failure)}\n`);
    }
    process.stderr.write(
      `check-lockfile-overrides: ${result.failures.length} override target(s) unsatisfied or unguarded; ` +
        'refresh package.json\'s pnpm.overrides and re-run `pnpm install` to regenerate pnpm-lock.yaml\n',
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `check-lockfile-overrides: ${overrideTargets.length} override target(s), all resolved instances satisfied\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`check-lockfile-overrides: ${err.message}\n`);
    process.exitCode = 1;
  });
}
