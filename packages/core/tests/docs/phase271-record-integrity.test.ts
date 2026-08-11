import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// packages/core/tests/docs → repo root is four levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

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

function readRecommendationsLedger(): RecommendationsLedger {
  const raw = readFileSync(
    join(REPO_ROOT, '.cadence/intelligence/recommendations.json'),
    'utf8',
  );
  return JSON.parse(raw) as RecommendationsLedger;
}

function findRecommendation(
  ledger: RecommendationsLedger,
  id: string,
): LedgerRecommendation | undefined {
  return (
    (ledger.recommendations ?? []).find((r) => r.id === id) ??
    (ledger.archived ?? []).find((r) => r.id === id)
  );
}

// Same drift computation as the handoff's CMD-1, inlined so this test doesn't
// need to spawn the CLI (matches phase 259's own roadmap-currency check logic).
function computeRoadmapDrift(): { disk: number; roadmap: number; milestones: number; drift: number } {
  const rx = (t: string, r: RegExp) => [...t.matchAll(r)].map((m) => Number(m[1]));
  const disk = Math.max(
    ...readdirSync(join(REPO_ROOT, '.cadence/phases'))
      .map((d) => parseInt(d, 10))
      .filter(Number.isFinite),
  );
  const roadmap = Math.max(
    ...rx(readFileSync(join(REPO_ROOT, '.cadence/ROADMAP.md'), 'utf8'), /^### Phase (\d+)/gm),
  );
  const milestones = Math.max(
    ...rx(
      readFileSync(join(REPO_ROOT, '.cadence/MILESTONES.md'), 'utf8'),
      /^[ \t]*-[ \t]+\*\*Phase (\d+)/gm,
    ),
  );
  return { disk, roadmap, milestones, drift: disk - Math.min(roadmap, milestones) };
}

describe('271-01 pre-release record integrity (roadmap/milestone currency)', () => {
  it('271-01/AC-1: ROADMAP.md and MILESTONES.md are backfilled through phase 270, closing the roadmap-currency drift to well within the 10-phase threshold', () => {
    const roadmap = readFileSync(join(REPO_ROOT, '.cadence/ROADMAP.md'), 'utf8');
    const milestones = readFileSync(join(REPO_ROOT, '.cadence/MILESTONES.md'), 'utf8');

    // Spot-check the tail of the backfilled range in each file.
    expect(roadmap).toContain('### Phase 257 — Render code-review/security-audit findings in Markdown summaries (#379)');
    expect(roadmap).toContain('### Phase 270 — Fix demo-test-gutting coverage-scheme regression (rec-20260810-001) (#396)');
    expect(milestones).toContain('**Phase 257**');
    expect(milestones).toContain('**Phase 270**');

    const { roadmap: roadmapMax, milestones: milestonesMax, drift } = computeRoadmapDrift();
    expect(roadmapMax).toBeGreaterThanOrEqual(270);
    expect(milestonesMax).toBeGreaterThanOrEqual(270);
    // Threshold is 10; this phase's own directory pushes disk past 270, so
    // drift is small-but-nonzero by construction, never exactly 0.
    expect(drift).toBeLessThanOrEqual(10);
  });

  it('271-01/AC-2: the milestone/recommendation desync has no CLI reconciliation path and is recorded as a recommendation naming rec-20260803-001, not hand-edited', () => {
    const ledger = readRecommendationsLedger();
    const gapRec = findRecommendation(ledger, 'rec-20260811-004');

    expect(gapRec).toBeDefined();
    expect(gapRec?.title ?? '').toContain('milestone close/status has no CLI path');
    expect(gapRec?.summary ?? '').toContain('rec-20260803-001');

    // The underlying ledger file itself is untouched by hand-edit: its
    // `mil-rec-rec-20260808-003` milestone entry still reads `proposed`,
    // not silently rewritten to a terminal status.
    const milestones = JSON.parse(
      readFileSync(join(REPO_ROOT, '.cadence/intelligence/milestones.json'), 'utf8'),
    ) as { milestones?: Array<{ id: string; status: string }> };
    const desynced = (milestones.milestones ?? []).find(
      (m) => m.id === 'mil-rec-rec-20260808-003',
    );
    expect(desynced?.status).toBe('proposed');
  });

  it('271-01/AC-3: CHANGELOG.md [Unreleased] stays empty and the changeset staging surface is untouched by this phase', () => {
    const changelog = readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
    const unreleasedStart = changelog.indexOf('## [Unreleased]');
    const nextHeading = changelog.indexOf('## [', unreleasedStart + 1);
    const unreleasedBody = changelog.slice(unreleasedStart + '## [Unreleased]'.length, nextHeading).trim();

    expect(unreleasedStart).toBeGreaterThan(-1);
    expect(unreleasedBody).toBe('');

    // Not a hardcoded count: later phases legitimately add their own
    // changesets before a release consumes them all, so pinning an exact
    // number here breaks on every such phase (271-01/AC-3 broke this way
    // when phase 272 added a 9th). Assert the staging surface is healthy
    // instead — non-empty, and every entry is a real changeset, not that
    // phase 271 froze the count.
    const changesetFiles = readdirSync(join(REPO_ROOT, '.changeset')).filter(
      (f) => f.endsWith('.md') && f !== 'README.md',
    );
    expect(changesetFiles.length).toBeGreaterThan(0);
    for (const file of changesetFiles) {
      const body = readFileSync(join(REPO_ROOT, '.changeset', file), 'utf8');
      const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(body);
      expect(frontmatter, `${file} is missing changeset frontmatter`).not.toBeNull();
      expect(frontmatter?.[1] ?? '', `${file} has empty frontmatter`).toMatch(
        /^"[^"]+":\s*(major|minor|patch)/m,
      );
    }
  });
});
