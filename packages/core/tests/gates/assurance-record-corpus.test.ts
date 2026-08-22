import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { DeepVerdict, GateBypass, GateProvenance } from '@thomas-powers-jr/cadence-types';
import { deriveAssuranceRecord, type AssuranceAcResult } from '../../src/gates/assurance-record.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PHASES_DIR = join(REPO_ROOT, '.cadence', 'phases');

/**
 * Mirrors `walkSummaryFiles` in `packages/core/src/cli/commands/summary.ts`
 * (the `cadence summary verify-all` implementation) — same recursive walk,
 * same `-SUMMARY.json` suffix filter, sorted for determinism. This copy adds
 * one extra guard: any filename containing `snapshot` is skipped explicitly,
 * even though the suffix filter alone already excludes every real
 * `*-SUMMARY-snapshot.json` refused-settle sibling (its filename ends in
 * `-snapshot.json`, not `-SUMMARY.json`). The extra `includes('snapshot')`
 * check is belt-and-suspenders per this task's own instructions — refused-
 * settle snapshots are a distinct artifact class, not a normal settle
 * record, and must never be silently swept into this corpus.
 */
function walkSummaryFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSummaryFiles(full));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('-SUMMARY.json') &&
      !entry.name.toLowerCase().includes('snapshot')
    ) {
      out.push(full);
    }
  }
  return out.sort();
}

/** `<phaseDir>/<id>` derived the same way `summary verify-all` derives it. */
function idFor(path: string): { phaseDir: string; id: string } {
  const phaseDir = relative(PHASES_DIR, dirname(path)).split(sep)[0] ?? dirname(path);
  const id = path.slice(path.lastIndexOf(sep) + 1).replace(/-SUMMARY\.json$/, '');
  return { phaseDir, id };
}

interface DriftEntry {
  phaseDir: string;
  id: string;
  oldGrade: string;
  newGrade: string;
}

interface CorpusResult {
  total: number;
  malformed: { phaseDir: string; id: string; reason: string }[];
  noStoredAssurance: number;
  withStoredAssurance: number;
  bypassedCount: number;
  bypassedRecords: { phaseDir: string; id: string; storedOverall: string | undefined }[];
  bypassedPreviouslyStrong: { phaseDir: string; id: string }[];
  contradictionRecords: { phaseDir: string; id: string; acId: string }[];
  drift: DriftEntry[];
}

/**
 * Read-only corpus scan (283-01/AC-5): every `*-SUMMARY.json` under
 * `.cadence/phases/**`, re-graded under the phase-283 bypass-aware rule.
 * "Old" grade is the record's own STORED `assurance.overall` (the actual
 * historical grade it was given at settle time), never a recomputation —
 * records with no `assurance` field at all are counted separately
 * (`noStoredAssurance`) rather than assigned a fabricated baseline. Most
 * (not all — see the committed report's breakdown) of those predate phase
 * 233, which introduced the field; a handful postdate it and are explained
 * there by a distinct, documented cause instead. "New" grade calls the real,
 * current (T2-updated)
 * `deriveAssuranceRecord` with the record's own `gateBypasses`/`deepVerify`
 * (defaulting to `[]`/`{}` when absent, a no-op per AC-3). Nothing on disk
 * is read for any purpose other than deriving these two labels — no file is
 * ever written by this function.
 */
function computeCorpus(): CorpusResult {
  const files = walkSummaryFiles(PHASES_DIR);
  const malformed: CorpusResult['malformed'] = [];
  const drift: DriftEntry[] = [];
  const bypassedRecords: CorpusResult['bypassedRecords'] = [];
  const bypassedPreviouslyStrong: CorpusResult['bypassedPreviouslyStrong'] = [];
  const contradictionRecords: CorpusResult['contradictionRecords'] = [];
  let noStoredAssurance = 0;
  let withStoredAssurance = 0;

  for (const path of files) {
    const { phaseDir, id } = idFor(path);

    let json: unknown;
    try {
      json = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      malformed.push({
        phaseDir,
        id,
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (typeof json !== 'object' || json === null) {
      malformed.push({ phaseDir, id, reason: 'not a JSON object' });
      continue;
    }
    const rec = json as {
      gates?: unknown;
      acResults?: unknown;
      gateBypasses?: unknown;
      deepVerify?: unknown;
      assurance?: { overall?: unknown };
    };

    const gates: readonly GateProvenance[] = Array.isArray(rec.gates)
      ? (rec.gates as GateProvenance[])
      : [];
    const acResults: readonly AssuranceAcResult[] = Array.isArray(rec.acResults)
      ? (rec.acResults as AssuranceAcResult[])
      : [];
    const gateBypasses: readonly GateBypass[] = Array.isArray(rec.gateBypasses)
      ? (rec.gateBypasses as GateBypass[])
      : [];
    const deepVerify: Record<string, DeepVerdict> =
      rec.deepVerify !== null && typeof rec.deepVerify === 'object'
        ? (rec.deepVerify as Record<string, DeepVerdict>)
        : {};

    const storedOverall =
      typeof rec.assurance?.overall === 'string' ? rec.assurance.overall : undefined;

    if (storedOverall === undefined) {
      noStoredAssurance += 1;
    } else {
      withStoredAssurance += 1;
    }

    if (gateBypasses.length > 0) {
      bypassedRecords.push({ phaseDir, id, storedOverall });
      if (storedOverall === 'strong') {
        bypassedPreviouslyStrong.push({ phaseDir, id });
      }
    }

    for (const acr of acResults) {
      const verdict = deepVerify[acr.id];
      if (verdict !== undefined && verdict.pass === false && verdict.provider !== 'mock' && acr.pass === true) {
        contradictionRecords.push({ phaseDir, id, acId: acr.id });
      }
    }

    // NEW grade: the real, current deriveAssuranceRecord — read-only, this
    // never mutates `rec` or the file it came from.
    const newOverall = deriveAssuranceRecord(gates, acResults, { gateBypasses, deepVerify }).overall;

    if (storedOverall !== undefined && storedOverall !== newOverall) {
      drift.push({ phaseDir, id, oldGrade: storedOverall, newGrade: newOverall });
    }
  }

  return {
    total: files.length,
    malformed,
    noStoredAssurance,
    withStoredAssurance,
    bypassedCount: bypassedRecords.length,
    bypassedRecords,
    bypassedPreviouslyStrong,
    contradictionRecords,
    drift,
  };
}

describe('283-01 corpus drift scan (AC-5): historical *-SUMMARY.json read-only re-grading', () => {
  it('283-01/AC-5: enumerates the full corpus read-only and finds no malformed records', () => {
    const result = computeCorpus();

    // No-silent-drops accounting: every file is either malformed or landed
    // in exactly one of the stored/no-stored-assurance buckets.
    expect(result.total).toBeGreaterThan(0);
    expect(result.malformed).toEqual([]);
    expect(result.noStoredAssurance + result.withStoredAssurance).toBe(result.total);
  });

  it('283-01/AC-5: at least the two known previously-strong bypassed records are present and now grade lower', () => {
    const result = computeCorpus();

    // rec-20260816-002's ad-hoc scan (2026-08-16, 294-record corpus) found
    // 13 gateBypasses records, 2 of which graded 'strong'. This scan's own
    // corpus size can only grow (this phase's own eventual settle adds one
    // more record, and the corpus grows release to release), and a historical
    // record's gateBypasses/assurance fields never change after settle — so
    // 13/2 are safe floors, not upper bounds, and asserted as such rather
    // than exact equality.
    expect(result.bypassedCount).toBeGreaterThanOrEqual(13);
    expect(result.bypassedPreviouslyStrong.length).toBeGreaterThanOrEqual(2);

    // Every previously-'strong' bypassed record must now grade something
    // other than 'strong' under the new rule (D-S caps at 'mixed') — i.e.
    // every one of them must appear in the drift table.
    const driftKeys = new Set(result.drift.map((d) => `${d.phaseDir}/${d.id}`));
    for (const rec of result.bypassedPreviouslyStrong) {
      expect(driftKeys.has(`${rec.phaseDir}/${rec.id}`)).toBe(true);
    }
  });

  it('283-01/AC-5: finds the known deepVerify-vs-acResults contradictions spanning 272 and 282', () => {
    const result = computeCorpus();

    // rec-20260816-002 named 4 contradictions across
    // 272-assurance-record-correctness (AC-1, AC-4) and
    // 282-coverage-scanner-determinism (AC-2, AC-4).
    expect(result.contradictionRecords.length).toBeGreaterThanOrEqual(4);

    const phaseDirs = new Set(result.contradictionRecords.map((c) => c.phaseDir));
    expect(phaseDirs.has('272-assurance-record-correctness')).toBe(true);
    expect(phaseDirs.has('282-coverage-scanner-determinism')).toBe(true);
  });

  it('283-01/AC-5: every drift entry is a real, non-vacuous grade change (old !== new)', () => {
    const result = computeCorpus();

    expect(result.drift.length).toBeGreaterThan(0);
    for (const d of result.drift) {
      expect(d.oldGrade).not.toBe(d.newGrade);
      expect(['strong', 'mixed', 'weak', 'unverified']).toContain(d.oldGrade);
      expect(['strong', 'mixed', 'weak', 'unverified']).toContain(d.newGrade);
    }
  });

  it("283-01/AC-5: the committed report's own accounting numbers are internally consistent", () => {
    const reportPath = join(
      REPO_ROOT,
      '.cadence/phases/283-bypass-aware-assurance/283-01-ASSURANCE-DRIFT-REPORT.md',
    );
    const report = readFileSync(reportPath, 'utf8');

    // Point-in-time attestation (like 282-01-COVERAGE-DRIFT-REPORT.md's own
    // 293/294 shift): these are the frozen numbers this report's own prose
    // claims, checked for internal arithmetic consistency here — not
    // re-derived from a live corpus scan, which will legitimately grow past
    // 294 once this phase settles its own SUMMARY.json.
    expect(report).toContain('| Enumerated (`*-SUMMARY.json`, snapshots excluded) | **294** |');
    expect(report).toContain('| ├─ Malformed (unparseable JSON / not an object) | **0** |');
    expect(report).toContain('| ├─ No stored `assurance` field | **251** |');
    expect(report).toContain('| └─ Has stored `assurance` field | **43** |');
    expect(report).toContain('`294 = 0 + 251 + 43`');
    expect(0 + 251 + 43).toBe(294);

    expect(report).toContain(
      "| `completedAt` ≤ 233-01's own completion (2026-07-28T02:32:11.600Z) | **247** |",
    );
    expect(report).toContain("| `completedAt` > 233-01's own completion | **4** |");
    expect(report).toContain('`247 + 4 = 251`');
    expect(247 + 4).toBe(251);

    expect(report).toContain('## Records with a non-empty `gateBypasses` array — 13');
    expect(report).toContain('exactly **2** carried a stored `strong` grade');
    expect(report).toContain('## `deepVerify` vs `acResults` contradictions — 4');
    expect(report).toContain('## Grade changes (the AC-5 enumeration) — 2');
  });

  it('283-01/AC-5: the committed drift report exists and enumerates the same drift the live scan finds', () => {
    const result = computeCorpus();
    const reportPath = join(
      REPO_ROOT,
      '.cadence/phases/283-bypass-aware-assurance/283-01-ASSURANCE-DRIFT-REPORT.md',
    );
    const report = readFileSync(reportPath, 'utf8');

    expect(report).toContain('283-01');
    expect(report).toContain('AC-5');

    // Every record this live scan found drifting must be named in the
    // committed report by its phaseDir/id.
    for (const d of result.drift) {
      expect(report).toContain(`${d.phaseDir}/${d.id}`);
    }

    // The two known previously-strong bypassed ids in particular, since
    // they are this report's headline finding.
    for (const rec of result.bypassedPreviouslyStrong) {
      expect(report).toContain(`${rec.phaseDir}/${rec.id}`);
    }
  });

  /**
   * Phase 287 (287-01, AC-5): `hasRealVerifier` (the D-Z fix) can only ever
   * diverge from its pre-287 form on a record carrying at least one gate
   * entry tagged `providerSelection:'empty-diff'` -- the new predicate is a
   * strict subset of the old one, differing only on that one condition. So
   * `computeCorpus()`'s live re-derivation (which already runs the current,
   * 287-fixed `deriveAssuranceRecord` against every historical record and is
   * asserted above to introduce 0 drift beyond the committed 283 whitelist)
   * combined with a direct 0-count check on `providerSelection:'empty-diff'`
   * across the same corpus is the complete AC-5 proof: zero records could
   * possibly be affected by this phase's change, and the drift test above
   * already confirms none newly are. Reuses this file's own
   * `walkSummaryFiles` rather than a third duplicate corpus walker.
   */
  it('287-01/AC-5: 0 records in the corpus carry providerSelection:\'empty-diff\' on any gate entry -- the D-Z fix structurally cannot change any historical grade', () => {
    const files = walkSummaryFiles(PHASES_DIR);
    expect(files.length).toBeGreaterThan(0);

    const emptyDiffRecords: string[] = [];
    for (const path of files) {
      let json: unknown;
      try {
        json = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        continue;
      }
      const rec = json as { gates?: Array<{ providerSelection?: string }> };
      if ((rec.gates ?? []).some((g) => g.providerSelection === 'empty-diff')) {
        emptyDiffRecords.push(path);
      }
    }

    expect(emptyDiffRecords, `records carrying empty-diff: ${emptyDiffRecords.join(', ')}`).toEqual([]);
  });
});
