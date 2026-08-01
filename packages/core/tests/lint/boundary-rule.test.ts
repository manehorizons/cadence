import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

/**
 * Phase 234 (T4) — proves the `no-restricted-imports` boundary zone in the
 * root `eslint.config.js` actually fires on the violation shape it exists to
 * catch (AC-3), and that it does not gut itself into flagging a compliant
 * import (the other half of AC-3, and evidence for AC-1's "only surface
 * through which a verifier is resolved" clause).
 *
 * The fixture at `tests/lint/fixtures/internal-import-violation.ts` lives
 * outside `src/`, so `pnpm lint` (which only ever runs `eslint src`) never
 * lints it directly. This test loads the real root ESLint flat config and
 * lints the fixture's text programmatically under a *virtual* path inside
 * `packages/core/src/gates/` — the zone's `files` glob matches on that
 * virtual path, so the exact rule/config that governs the real tree is what
 * gets exercised here, not a copy of it.
 */

// tests/lint → ../../../.. is the repo root (packages/core/tests/lint).
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const CONFIG_FILE = join(REPO_ROOT, 'eslint.config.js');
const FIXTURE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'internal-import-violation.ts');

// Virtual paths under packages/core/src/ so the zone's `files: ['packages/core/src/**/*.ts']`
// glob matches, regardless of where the real source text lives on disk.
const VIOLATION_VIRTUAL_PATH = join(REPO_ROOT, 'packages', 'core', 'src', 'gates', '__boundary-fixture-violation__.ts');
const COMPLIANT_VIRTUAL_PATH = join(
  REPO_ROOT,
  'packages',
  'core',
  'src',
  'gates',
  '__boundary-fixture-compliant__.ts',
);

/** Same shape as the violation fixture, but importing via the published contract. */
const COMPLIANT_SOURCE = `import type { VerifyResult } from '../contracts/index.js';

export function isFullyPassing(result: VerifyResult): boolean {
  return Object.values(result.verdicts).every((verdict) => verdict.pass);
}
`;

/**
 * Same violation as the fixture, but with the `.js` extension dropped. This
 * repo's `moduleResolution: "Bundler"` accepts an extensionless specifier
 * just as readily as one with `.js`, so this shape must be caught too — an
 * independent reviewer confirmed it was NOT caught before the `group` list
 * grew extensionless entries alongside the `.js` ones.
 */
const EXTENSIONLESS_VIOLATION_SOURCE = `import type { VerifyResult } from '../verify/verifier';

export function isFullyPassing(result: VerifyResult): boolean {
  return Object.values(result.verdicts).every((verdict) => verdict.pass);
}
`;

/**
 * An extensionless import of a *permitted* module — one of the `*-factory.ts`
 * files the zone deliberately never bans. Proves the extensionless fix was
 * added narrowly (per-module, alongside each `.js` entry) rather than by
 * broadening the `group` glob to `**\/verify/*`, which would have started
 * flagging this legitimate import too.
 */
const EXTENSIONLESS_PERMITTED_SOURCE = `import { selectVerifier } from '../verify/factory';

export function useSelector(): typeof selectVerifier {
  return selectVerifier;
}
`;

function makeEslint(): ESLint {
  return new ESLint({ cwd: REPO_ROOT, overrideConfigFile: CONFIG_FILE });
}

describe('boundary-rule (Phase 234 T4)', () => {
  let fixtureSource: string;

  beforeAll(async () => {
    fixtureSource = await readFile(FIXTURE_FILE, 'utf8');
  });

  it('AC-3: reports the deliberate internal-import violation and names the offending path', async () => {
    const eslint = makeEslint();
    const results = await eslint.lintText(fixtureSource, { filePath: VIOLATION_VIRTUAL_PATH });

    expect(results).toHaveLength(1);
    const messages = results[0]!.messages;
    const boundaryMessages = messages.filter((m) => m.ruleId === 'no-restricted-imports');

    // Lint reports at least one error for this file, and it is the boundary rule.
    expect(boundaryMessages.length).toBeGreaterThan(0);
    expect(boundaryMessages.every((m) => m.severity === 2)).toBe(true); // 2 = 'error'

    // The reported message names the offending import path (the fixture's
    // own kernel-internal import, not the compliant contracts/ path).
    const offendingImport = "'../../../src/verify/verifier.js'";
    expect(fixtureSource).toContain(offendingImport);
    expect(boundaryMessages.some((m) => m.message.includes(offendingImport))).toBe(true);

    // The overall ESLint run result is non-zero/error for this file.
    expect(results[0]!.errorCount).toBeGreaterThan(0);
  });

  it('AC-1: does not flag a compliant import routed through the published contract', async () => {
    const eslint = makeEslint();
    const results = await eslint.lintText(COMPLIANT_SOURCE, { filePath: COMPLIANT_VIRTUAL_PATH });

    expect(results).toHaveLength(1);
    const boundaryMessages = results[0]!.messages.filter((m) => m.ruleId === 'no-restricted-imports');

    // A verifier type imported from contracts/index.js (the published
    // kernel/verifier/consumer contract) must never trip this rule — a zone
    // that flags everything would pass AC-3's first half and fail its
    // purpose.
    expect(boundaryMessages).toHaveLength(0);
    expect(results[0]!.errorCount).toBe(0);
  });

  it('AC-3: reports a kernel-internal import even when the .js extension is omitted', async () => {
    const eslint = makeEslint();
    const virtualPath = join(REPO_ROOT, 'packages', 'core', 'src', 'gates', '__boundary-fixture-extensionless__.ts');
    const results = await eslint.lintText(EXTENSIONLESS_VIOLATION_SOURCE, { filePath: virtualPath });

    expect(results).toHaveLength(1);
    const boundaryMessages = results[0]!.messages.filter((m) => m.ruleId === 'no-restricted-imports');

    // This repo's moduleResolution accepts an extensionless specifier, so a
    // contributor who simply forgets '.js' must still trip the rule — the
    // .js-only group list left exactly this gap before the fix.
    expect(boundaryMessages.length).toBeGreaterThan(0);
    expect(boundaryMessages.every((m) => m.severity === 2)).toBe(true);
    const offendingImport = "'../verify/verifier'";
    expect(EXTENSIONLESS_VIOLATION_SOURCE).toContain(offendingImport);
    expect(boundaryMessages.some((m) => m.message.includes(offendingImport))).toBe(true);
    expect(results[0]!.errorCount).toBeGreaterThan(0);
  });

  it('does not flag an extensionless import of a permitted *-factory module', async () => {
    const eslint = makeEslint();
    const virtualPath = join(
      REPO_ROOT,
      'packages',
      'core',
      'src',
      'gates',
      '__boundary-fixture-extensionless-permitted__.ts',
    );
    const results = await eslint.lintText(EXTENSIONLESS_PERMITTED_SOURCE, { filePath: virtualPath });

    expect(results).toHaveLength(1);
    const boundaryMessages = results[0]!.messages.filter((m) => m.ruleId === 'no-restricted-imports');

    // The fix must add extensionless entries per banned module, not broaden
    // the group glob to '**/verify/*' — that would also catch this
    // legitimate factory import, which the zone deliberately permits.
    expect(boundaryMessages).toHaveLength(0);
  });
});
