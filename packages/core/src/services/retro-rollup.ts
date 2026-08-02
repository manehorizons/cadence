import { readdir, readFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import {
  RetroDigestZ,
  type PhaseRetroEntry,
  type RetroFrequencyBuckets,
  type RetroFrequencyEntry,
  type RetroRollup,
} from '@thomas-powers-jr/cadence-types';
import { isDigestEmpty, nonEmptyFindingCategories } from './retro.js';
import type { CommandIO } from './io.js';

const RETRO_FILE_RE = /-RETRO\.json$/;

function addToBucket(map: Map<string, Set<string>>, key: string, phaseId: string): void {
  const set = map.get(key);
  if (set) {
    set.add(phaseId);
  } else {
    map.set(key, new Set([phaseId]));
  }
}

function toFrequencyBuckets(map: Map<string, Set<string>>): RetroFrequencyBuckets {
  const entries: RetroFrequencyEntry[] = [...map.entries()].map(([key, phaseIdSet]) => ({
    key,
    count: phaseIdSet.size,
    phaseIds: [...phaseIdSet].sort(),
  }));
  const recurring = entries
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const oneOff = entries.filter((e) => e.count === 1).sort((a, b) => a.key.localeCompare(b.key));
  return { recurring, oneOff };
}

/**
 * Phase 186 (rec-20260712-002). Pure aggregation across every scanned
 * phase's retro digest — no I/O. Each of the three frequency dimensions
 * dedupes per phase (a phase contributes at most once per distinct key)
 * before splitting into `recurring` (2+ phases) vs `oneOff` (exactly 1),
 * per AC-2.
 */
export function computeRetroRollup(entries: PhaseRetroEntry[]): RetroRollup {
  const bypassMap = new Map<string, Set<string>>();
  const statusMap = new Map<string, Set<string>>();
  const categoryMap = new Map<string, Set<string>>();
  let phasesWithFriction = 0;

  for (const entry of entries) {
    const { phaseId, digest } = entry;
    if (!isDigestEmpty(digest)) phasesWithFriction += 1;

    for (const bypass of digest.bypasses) {
      addToBucket(bypassMap, bypass.gate, phaseId);
    }

    const distinctStatuses = new Set(digest.roughTasks.map((t) => t.status));
    for (const status of distinctStatuses) {
      addToBucket(statusMap, status, phaseId);
    }

    for (const category of nonEmptyFindingCategories(digest)) {
      addToBucket(categoryMap, category, phaseId);
    }
  }

  return {
    totalPhases: entries.length,
    phasesWithFriction,
    bypasses: toFrequencyBuckets(bypassMap),
    roughTaskStatuses: toFrequencyBuckets(statusMap),
    findingCategories: toFrequencyBuckets(categoryMap),
  };
}

/**
 * Phase 186 (rec-20260712-002). Best-effort walk of each phase directory
 * under `.cadence/phases` for `<draftId>-RETRO.json` artifacts, feeding
 * `computeRetroRollup`. Follows
 * this codebase's "best-effort introspection never throws" convention
 * (`CLAUDE.md`, mirrors `intelligence.ts`'s `audit` command): a missing
 * `.cadence/phases` directory is the normal "nothing to scan yet" case and
 * returns `[]` silently, while a malformed individual artifact is a stderr
 * notice + skip (AC-5) so one bad phase never aborts the whole scan.
 */
export async function scanRetroArtifacts(cwd: string, io: CommandIO): Promise<PhaseRetroEntry[]> {
  const phasesDir = join(cwd, '.cadence/phases');
  let phaseDirs: Dirent[];
  try {
    phaseDirs = await readdir(phasesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: PhaseRetroEntry[] = [];
  for (const dirent of phaseDirs) {
    if (!dirent.isDirectory()) continue;
    const phaseId = dirent.name;
    const phaseDir = join(phasesDir, phaseId);

    let fileNames: string[];
    try {
      fileNames = await readdir(phaseDir);
    } catch {
      continue;
    }

    for (const fileName of fileNames) {
      if (!RETRO_FILE_RE.test(fileName)) continue;
      const filePath = join(phaseDir, fileName);
      const draftId = fileName.replace(RETRO_FILE_RE, '');

      let raw: string;
      try {
        raw = await readFile(filePath, 'utf8');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        io.err(`note: skipping malformed retro artifact ${filePath} — unreadable: ${msg}\n`);
        continue;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        io.err(`note: skipping malformed retro artifact ${filePath} — invalid JSON: ${msg}\n`);
        continue;
      }

      const validated = RetroDigestZ.safeParse(parsedJson);
      if (!validated.success) {
        io.err(
          `note: skipping malformed retro artifact ${filePath} — schema validation failed: ${validated.error.message}\n`,
        );
        continue;
      }

      results.push({ phaseId, draftId, digest: validated.data });
    }
  }

  return results.sort((a, b) => a.phaseId.localeCompare(b.phaseId));
}
