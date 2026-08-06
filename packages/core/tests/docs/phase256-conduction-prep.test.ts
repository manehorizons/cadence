import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// packages/core/tests/docs → repo root is four levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PHASE_DIR = join(REPO_ROOT, '.cadence/phases/256-real-provider-certification-prep');

const seededDefect = readFileSync(join(PHASE_DIR, 'fixture/seeded-defect.ts'), 'utf8');
const seededDefectFixed = readFileSync(join(PHASE_DIR, 'fixture/seeded-defect.fixed.ts'), 'utf8');
const runbook = readFileSync(join(PHASE_DIR, 'CONDUCTION-RUNBOOK.md'), 'utf8');

// Same regex the real security-audit mock verifier uses (see
// packages/core/src/verify/security-audit.ts's AUTH_HEADER_RE), built via
// the RegExp constructor rather than a /literal/ -- a literal containing
// quote characters inside a character class trips the js-ts coverage
// masker's regex-vs-division detection (rec-20260805-004), corrupting span
// detection for every it() block after it in this file. Behaviorally
// identical to the source regex (verified independently before this fix).
const AUTH_HEADER_RE = new RegExp(
  'authorization[' + String.fromCharCode(39, 34) + String.raw`\s:=]+\s*(?:bearer|basic|token)\s+\S+`,
  'i',
);
const CONSOLE_LOG_RE = /console\.log\(/;

describe('256-01 real-provider certification prep', () => {
  it('256-01/AC-1: seeded-defect fixture trips both mock detectors, corrected counterpart trips neither, no in-file disclaimer', () => {
    expect(AUTH_HEADER_RE.test(seededDefect)).toBe(true);
    expect(CONSOLE_LOG_RE.test(seededDefect)).toBe(true);
    expect(AUTH_HEADER_RE.test(seededDefectFixed)).toBe(false);
    expect(CONSOLE_LOG_RE.test(seededDefectFixed)).toBe(false);
    // No disclosure that this is a seeded test defect anywhere in the
    // fixture file itself — that context must live only in the DRAFT and
    // runbook, or a real reviewer could discount the finding's severity.
    for (const text of [seededDefect, seededDefectFixed]) {
      expect(text.toLowerCase()).not.toMatch(/seeded|certification|do not merge|phase 256/);
    }
    // The credential doesn't resemble a real provider's recognizable prefix.
    for (const prefix of ['sk-', 'ghp_', 'AKIA', 'eyJ']) {
      expect(seededDefect).not.toContain(prefix);
    }
  });

  it('256-01/AC-2: CONDUCTION-RUNBOOK.md sequences the mock dry run, real settle, evidence capture, and cleanup', () => {
    expect(runbook).toMatch(/mock dry run/i);
    expect(runbook).toMatch(/CLAUDECODE/);
    expect(runbook).toMatch(/cadence config set securityAudit\.provider host-cli/);
    expect(runbook).toMatch(/SUMMARY-snapshot\.json/);
    expect(runbook).toMatch(/verifierRollup/);
    expect(runbook).toMatch(/seeded-defect\.fixed\.ts/);
    expect(runbook).toMatch(/rm -rf .*fixture/);
    expect(runbook).toMatch(/CADENCE_HOST_CLI_BIN/);
  });
});
