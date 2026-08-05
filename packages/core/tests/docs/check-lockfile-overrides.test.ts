import { describe, it, expect } from 'vitest';

// Red-first (phase 253, task T1). `scripts/check-lockfile-overrides.mjs` does
// not exist yet — its real detector logic is task T2's job, dispatched
// separately after this test is reviewed. This test defines the detector's
// core invariant and the pure/impure split it must follow (mirroring
// scripts/check-audit-exceptions.mjs): for every override target declared in
// package.json's `pnpm.overrides`, every resolved instance of that package in
// pnpm-lock.yaml must satisfy the target's range. `main()` (the thin, impure
// shell that reads the two real files and prints/exits) is intentionally not
// exercised here — only the pure decision functions are.
//
// Anticipated pure exports (see the AC-3 tests below):
//   - extractOverrideTargets(packageJson): reads a *parsed* package.json
//     object's `pnpm.overrides` map (keys of the form `pkg@sourceVersion` ->
//     a semver range) into `{ package, sourceVersion, range }[]`.
//   - parseLockfilePackages(lockfileText): parses the raw pnpm-lock.yaml
//     text's top-level `packages:` block into `{ package, version }[]` — one
//     entry per resolved instance, including every line of a package that
//     resolves to more than one version (brace-expansion resolves to two).
//   - checkOverrideCoverage(overrideTargets, lockfilePackages): the pure
//     decision function. For a given override target, only resolved
//     instances whose version shares the target range's floor major version
//     are "in scope" for that target (matching MUST key off the target
//     range's major, not the override key's source-version major — an
//     override like `read-yaml-file@1.1.0: ^2.1.0` moves the resolved major
//     from 1 to 2, so source-version-major matching would find nothing to
//     check). Returns `{ ok, failures }` where each failure names the
//     package, the target range, the resolved version, and the specific
//     lockfile instance (`pkg@version`), with a `reason` of either:
//       - 'unsatisfied': an in-scope resolved instance does not satisfy its
//         target range (e.g. the resolved version regressed, or the target
//         was tightened without a lockfile refresh).
//       - 'unguarded-line': a resolved instance of an already-overridden
//         package sits in a major-version line that no override target
//         covers (today's real committed state: brace-expansion has an
//         override for its 5.x line only, but a 2.x line — 2.1.2 — also
//         resolves in the lockfile with nothing guarding it).
//
// Only `^x.y.z` and `>=x.y.z` range forms are in scope (the only two forms
// used by this repo's real overrides, before and after correction) — no
// general-purpose semver range parser is required.

const script = await import('../../../../scripts/check-lockfile-overrides.mjs').catch((err: unknown) => {
  // Expected at this stage: the module does not exist yet (see file header).
  // Re-throw so every test below fails for the same, single, correct reason
  // instead of each producing its own "cannot read property of undefined".
  throw err;
});

describe('check-lockfile-overrides pure logic (253-01, AC-3)', () => {
  describe('extractOverrideTargets', () => {
    it("extracts today's real committed override entries from a parsed package.json (253-01/AC-3)", () => {
      // Verbatim shape of this repo's actual package.json `pnpm.overrides`
      // block as committed today (pre-remediation) — see package.json.
      const packageJson = {
        pnpm: {
          overrides: {
            'brace-expansion@5.0.6': '^5.0.7',
            'read-yaml-file@1.1.0': '^2.1.0',
            'js-yaml@4.2.0': '^4.3.0',
            'fast-uri@3.1.2': '^3.1.4',
          },
        },
      };

      const targets = script.extractOverrideTargets(packageJson);

      expect(targets).toEqual(
        expect.arrayContaining([
          { package: 'brace-expansion', sourceVersion: '5.0.6', range: '^5.0.7' },
          { package: 'read-yaml-file', sourceVersion: '1.1.0', range: '^2.1.0' },
          { package: 'js-yaml', sourceVersion: '4.2.0', range: '^4.3.0' },
          { package: 'fast-uri', sourceVersion: '3.1.2', range: '^3.1.4' },
        ]),
      );
      expect(targets).toHaveLength(4);
    });

    it('returns an empty array when pnpm.overrides is absent (253-01/AC-3)', () => {
      expect(script.extractOverrideTargets({})).toEqual([]);
      expect(script.extractOverrideTargets({ pnpm: {} })).toEqual([]);
    });
  });

  describe('findUnversionedOverrideKeys', () => {
    it("returns no keys against today's real committed overrides, which are all versioned (253-01/AC-3)", () => {
      const packageJson = {
        pnpm: {
          overrides: {
            'brace-expansion@5.0.6': '^5.0.7',
            'read-yaml-file@1.1.0': '^2.1.0',
            'js-yaml@4.2.0': '^4.3.0',
            'fast-uri@3.1.2': '^3.1.4',
          },
        },
      };

      expect(script.findUnversionedOverrideKeys(packageJson)).toEqual([]);
    });

    it('surfaces a bare package-name key with no @sourceVersion suffix (253-01/AC-3)', () => {
      const packageJson = { pnpm: { overrides: { 'fast-uri': '^3.1.5' } } };
      expect(script.findUnversionedOverrideKeys(packageJson)).toEqual(['fast-uri']);
    });

    it('surfaces a scoped package key with no version suffix, distinct from a valid scoped+versioned key (253-01/AC-3)', () => {
      const packageJson = {
        pnpm: {
          overrides: {
            '@scope/pkg': '^1.0.0',
            '@scope/other@2.0.0': '^2.0.1',
          },
        },
      };
      expect(script.findUnversionedOverrideKeys(packageJson)).toEqual(['@scope/pkg']);
    });

    it('returns an empty array when pnpm.overrides is absent (253-01/AC-3)', () => {
      expect(script.findUnversionedOverrideKeys({})).toEqual([]);
      expect(script.findUnversionedOverrideKeys({ pnpm: {} })).toEqual([]);
    });
  });

  describe('parseLockfilePackages', () => {
    // Minimal fixture mirroring the real pnpm-lock.yaml's shape: a top-level
    // `overrides:` block (ignored by this parser — extractOverrideTargets
    // reads package.json, not the lockfile's mirrored copy), a `packages:`
    // block listing every resolved instance (including brace-expansion's two
    // live lines), and a `snapshots:` block that must NOT be parsed as
    // top-level package entries (its nested `dependencies:` lines share the
    // same package names and would double-count or misparse if the parser
    // failed to stop at `snapshots:`).
    const FIXTURE_LOCKFILE = [
      "lockfileVersion: '9.0'",
      '',
      'overrides:',
      '  brace-expansion@5.0.6: ^5.0.7',
      '  read-yaml-file@1.1.0: ^2.1.0',
      '  js-yaml@4.2.0: ^4.3.0',
      '  fast-uri@3.1.2: ^3.1.4',
      '',
      'importers:',
      '',
      '  .:',
      '    devDependencies:',
      "      '@example/pkg':",
      '        specifier: ^1.0.0',
      '        version: 1.0.0',
      '',
      'packages:',
      '',
      '  brace-expansion@2.1.2:',
      '    resolution: {integrity: sha512-fixture-brace-2==}',
      '',
      '  brace-expansion@5.0.7:',
      '    resolution: {integrity: sha512-fixture-brace-5==}',
      '    engines: {node: 18 || 20 || >=22}',
      '',
      '  fast-uri@3.1.4:',
      '    resolution: {integrity: sha512-fixture-fast-uri==}',
      '',
      '  js-yaml@4.3.0:',
      '    resolution: {integrity: sha512-fixture-js-yaml==}',
      '    hasBin: true',
      '',
      '  read-yaml-file@2.1.0:',
      '    resolution: {integrity: sha512-fixture-read-yaml==}',
      '    engines: {node: \'>=10.13\'}',
      '',
      'snapshots:',
      '',
      '  brace-expansion@2.1.2:',
      '    dependencies:',
      '      balanced-match: 1.0.2',
      '',
      '  brace-expansion@5.0.7:',
      '    dependencies:',
      '      balanced-match: 4.0.4',
      '',
      '  fast-uri@3.1.4: {}',
      '',
    ].join('\n');

    it('parses every top-level resolved instance, including both brace-expansion lines (253-01/AC-3)', () => {
      const packages = script.parseLockfilePackages(FIXTURE_LOCKFILE);

      expect(packages).toEqual(
        expect.arrayContaining([
          { package: 'brace-expansion', version: '2.1.2' },
          { package: 'brace-expansion', version: '5.0.7' },
          { package: 'fast-uri', version: '3.1.4' },
          { package: 'js-yaml', version: '4.3.0' },
          { package: 'read-yaml-file', version: '2.1.0' },
        ]),
      );
      expect(packages).toHaveLength(5);
    });

    it('does not read entries from the snapshots: block as top-level packages (253-01/AC-3)', () => {
      const packages = script.parseLockfilePackages(FIXTURE_LOCKFILE);
      // balanced-match only appears nested under snapshots: dependencies —
      // it must not appear as its own top-level resolved instance.
      expect(packages.some((p: { package: string }) => p.package === 'balanced-match')).toBe(false);
    });
  });

  describe('checkOverrideCoverage', () => {
    it('fails when an in-scope resolved instance does not satisfy its override target range (253-01/AC-3)', () => {
      // Models a target refreshed to 253-01/AC-1's corrected floor (>=5.0.9) before
      // the lockfile has been refreshed to match — the lockfile still shows
      // today's real committed resolution (5.0.7), which does not satisfy
      // the new floor.
      const overrideTargets = [{ package: 'brace-expansion', sourceVersion: '5.0.7', range: '>=5.0.9' }];
      const lockfilePackages = [{ package: 'brace-expansion', version: '5.0.7' }];

      const result = script.checkOverrideCoverage(overrideTargets, lockfilePackages);

      expect(result.ok).toBe(false);
      expect(result.failures).toContainEqual(
        expect.objectContaining({
          package: 'brace-expansion',
          range: '>=5.0.9',
          resolvedVersion: '5.0.7',
          instance: 'brace-expansion@5.0.7',
          reason: 'unsatisfied',
        }),
      );
    });

    it("reproduces today's committed state: brace-expansion's 2.x line has no override of its own (253-01/AC-3)", () => {
      // Verbatim shape of the real current override targets (only the 5.x
      // line is covered) against the real current lockfile resolution (both
      // the 2.x and 5.x lines resolve). The 5.x line is satisfied; the 2.x
      // line sits in a major-version line no override target covers.
      const overrideTargets = [
        { package: 'brace-expansion', sourceVersion: '5.0.6', range: '^5.0.7' },
        { package: 'read-yaml-file', sourceVersion: '1.1.0', range: '^2.1.0' },
        { package: 'js-yaml', sourceVersion: '4.2.0', range: '^4.3.0' },
        { package: 'fast-uri', sourceVersion: '3.1.2', range: '^3.1.4' },
      ];
      const lockfilePackages = [
        { package: 'brace-expansion', version: '2.1.2' },
        { package: 'brace-expansion', version: '5.0.7' },
        { package: 'fast-uri', version: '3.1.4' },
        { package: 'js-yaml', version: '4.3.0' },
        { package: 'read-yaml-file', version: '2.1.0' },
      ];

      const result = script.checkOverrideCoverage(overrideTargets, lockfilePackages);

      expect(result.ok).toBe(false);
      // Exactly one finding: the unguarded 2.x line. The satisfied 5.x line
      // (and every other satisfied package) must not appear — the pass on
      // brace-expansion@5.0.7 must not suppress, nor be confused with, the
      // failure on brace-expansion@2.1.2 (253-01/AC-2's "not just the first
      // instance found" requirement, since brace-expansion resolves to two
      // live instances).
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toEqual(
        expect.objectContaining({
          package: 'brace-expansion',
          resolvedVersion: '2.1.2',
          instance: 'brace-expansion@2.1.2',
          reason: 'unguarded-line',
        }),
      );
    });

    it('passes once every resolved instance is covered by a satisfied target (253-01/AC-3)', () => {
      // A corrected shape in the spirit of T4's fix: brace-expansion's 2.x
      // line gets its own override, and both lines' resolved versions
      // satisfy their respective targets. This is a synthetic fixture using
      // the >=x.y.z range form (also supported by the detector) — it is not
      // asserting the literal range operators T4 actually shipped (T4 used
      // ^x.y.z selectors; see lockfile-overrides-current-state.test.ts for
      // the real disk-reading proof of the real committed state).
      const overrideTargets = [
        { package: 'brace-expansion', sourceVersion: '5.0.9', range: '>=5.0.9' },
        { package: 'brace-expansion', sourceVersion: '2.1.4', range: '>=2.1.4' },
        { package: 'fast-uri', sourceVersion: '3.1.5', range: '>=3.1.5' },
        { package: 'ip-address', sourceVersion: '10.3.1', range: '>=10.3.1' },
      ];
      const lockfilePackages = [
        { package: 'brace-expansion', version: '5.0.9' },
        { package: 'brace-expansion', version: '2.1.4' },
        { package: 'fast-uri', version: '3.1.5' },
        { package: 'ip-address', version: '10.3.1' },
      ];

      const result = script.checkOverrideCoverage(overrideTargets, lockfilePackages);

      expect(result.ok).toBe(true);
      expect(result.failures).toEqual([]);
    });
  });
});
