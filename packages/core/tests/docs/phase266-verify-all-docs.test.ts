import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 266-01 (phase 266, CI test-timeout remediation) — real disk-reading proof
// that docs/reference/commands.md documents the new `cadence summary
// verify-all` subcommand T1 shipped, mirroring phase260-vitest-v4-upgrade
// .test.ts's pattern of asserting against the real committed doc rather
// than a fixture.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const COMMANDS_DOC = join(ROOT, 'docs', 'reference', 'commands.md');

describe('cadence summary verify-all is documented (266-01)', () => {
  it('lists verify-all in the summary Subcommands table (266-01/AC-3)', () => {
    const doc = readFileSync(COMMANDS_DOC, 'utf8');
    expect(doc).toMatch(/\|\s*`verify-all`\s*\|/);
  });

  it('describes verify-all as an in-process sweep with MISMATCH/load-failure vs. NO_HASH classification and its exit codes (266-01/AC-3)', () => {
    const doc = readFileSync(COMMANDS_DOC, 'utf8');
    const idx = doc.indexOf('`summary verify-all`');
    expect(idx, 'a `summary verify-all` prose paragraph must exist').toBeGreaterThan(-1);
    const section = doc.slice(idx, idx + 2000);

    // In-process, no per-file subprocess spawn.
    expect(section).toMatch(/single process/);
    expect(section).not.toMatch(/spawns? one CLI subprocess per/);

    // Same three-verdict classification as `verify <phase> <num>`.
    expect(section).toMatch(/MISMATCH/);
    expect(section).toMatch(/NO_HASH/);
    expect(section).toMatch(/informational/);

    // Exit-code semantics, including the two edge cases.
    const exitCodesIdx = doc.indexOf('**Exit codes** (`verify-all`)');
    expect(exitCodesIdx, 'a `verify-all` exit-codes paragraph must exist').toBeGreaterThan(-1);
    const exitCodesSection = doc.slice(exitCodesIdx, exitCodesIdx + 400);
    expect(exitCodesSection).toMatch(/exits `0`/);
    expect(exitCodesSection).toMatch(/at least one file failed/);
  });
});
