import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// packages/core/tests/docs → repo root is four levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const ASSURANCE_RECORD_TS = join(REPO_ROOT, 'packages/core/src/gates/assurance-record.ts');
const CADENCE_BIN = join(REPO_ROOT, 'packages/core/bin/cadence.cjs');

interface LedgerRecommendation {
  id: string;
  title: string;
  summary?: string;
  status: string;
  priority?: string;
  readiness?: string;
}

interface RecommendationsLedger {
  recommendations?: LedgerRecommendation[];
  archived?: LedgerRecommendation[];
}

function findRecommendation(id: string): LedgerRecommendation | undefined {
  const ledger = JSON.parse(
    readFileSync(join(REPO_ROOT, '.cadence/intelligence/recommendations.json'), 'utf8'),
  ) as RecommendationsLedger;
  return (
    (ledger.recommendations ?? []).find((r) => r.id === id) ??
    (ledger.archived ?? []).find((r) => r.id === id)
  );
}

describe('272-01 assurance-record.ts correctness pass', () => {
  it('272-01/AC-2: the NUL byte is fixed via an escaped Unicode NUL, not a raw byte', () => {
    const bytes = readFileSync(ASSURANCE_RECORD_TS);
    expect(bytes.indexOf(0)).toBe(-1);

    // Same delimiter value at runtime -- an encoding change, not a behavior
    // change: the provider/model interpolations must still be joined by
    // exactly one NUL character (now expressed as a source-level escape
    // rather than a raw byte).
    const source = bytes.toString('utf8');
    const keyLine = source.split('\n').find((line) => line.includes('const key ='));
    expect(keyLine).toBeDefined();
    // Reading the source as TEXT (not executing it): the delimiter appears
    // as the 6-character source-level escape sequence, not a decoded NUL.
    const escapeSequence = [92, 117, 48, 48, 48, 48].map((c) => String.fromCharCode(c)).join('');
    const providerIdx = keyLine!.indexOf('g.provider}');
    const modelIdx = keyLine!.indexOf('g.model');
    expect(providerIdx).toBeGreaterThan(-1);
    expect(modelIdx).toBeGreaterThan(providerIdx);
    const between = keyLine!.slice(providerIdx + 'g.provider}'.length, modelIdx - '${'.length);
    expect(between).toBe(escapeSequence);
  });

  it('272-01/AC-3: the file has real line content and no NUL byte (cross-platform proxy for grep-invisibility)', () => {
    const source = readFileSync(ASSURANCE_RECORD_TS, 'utf8');
    expect(source.indexOf('\0')).toBe(-1);
    expect(source.split('\n').length).toBeGreaterThan(0);
  });

  // grep is not guaranteed on PATH on win32 CI runners (code-review, phase
  // 272 real host-cli conduction) -- same convention as
  // tests/integration/demo-gutting-coverage-scheme.test.ts's win32 skip.
  it.skipIf(process.platform === 'win32')(
    '272-01/AC-3: grep -c "" returns a line count rather than "binary file matches"',
    () => {
      const output = execFileSync('grep', ['-c', '', ASSURANCE_RECORD_TS], { encoding: 'utf8' });
      const lineCount = Number.parseInt(output.trim(), 10);
      expect(Number.isFinite(lineCount)).toBe(true);
      expect(lineCount).toBeGreaterThan(0);
    },
  );

  it('272-01/AC-4: cadence summary verify-all exits 0 corpus-wide, no historical SUMMARY.json affected', () => {
    const result = execFileSync('node', [CADENCE_BIN, 'summary', 'verify-all'], {
      encoding: 'utf8',
      cwd: REPO_ROOT,
    });
    expect(result).toMatch(/\d+ checked: \d+ MATCH, \d+ NO_HASH, 0 failed/);
  });

  it('272-01/AC-6: rec-20260808-007 has a recorded decision and a reflected status', () => {
    const rec = findRecommendation('rec-20260808-007');
    expect(rec).toBeDefined();
    expect(rec?.status).not.toBe('candidate');

    const decisions = JSON.parse(
      readFileSync(join(REPO_ROOT, '.cadence/intelligence/decisions.json'), 'utf8'),
    ) as { decisions?: Array<{ id: string; recommendationId?: string; status: string }> };
    const tied = (decisions.decisions ?? []).find(
      (d) => d.recommendationId === 'rec-20260808-007' && d.status === 'active',
    );
    expect(tied).toBeDefined();
  });
});
