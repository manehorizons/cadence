import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo-root docs/src from this test file's location:
// packages/core/tests/docs → ../../../../<asset>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function read(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

/**
 * Derive the real set of gate ids that consult `isGateSealed` by scanning
 * `packages/core/src/gates/*.ts` directly — code-true, not a hardcoded list.
 * Mirrors the house pattern in mock-placeholder-doc.test.ts / doc-sync-hook.test.ts:
 * read source + docs directly, no mocking.
 */
function sealedGateIdsFromSource(): string[] {
  const gatesDir = join(ROOT, 'packages', 'core', 'src', 'gates');
  const files = readdirSync(gatesDir).filter((f) => f.endsWith('.ts'));
  const ids: string[] = [];

  for (const file of files) {
    const text = readFileSync(join(gatesDir, file), 'utf8');
    if (!/import\s*\{[^}]*\bisGateSealed\b[^}]*\}\s*from\s*['"]\.\/types\.js['"]/.test(text)) {
      continue;
    }
    // Find every real call site: isGateSealed(ctx, 'gate-id') — the import-only
    // regex above matches, but the doc comment in coverage.ts also mentions
    // `isGateSealed` in prose, so only a real call with a quoted gate id counts.
    const callMatches = [...text.matchAll(/isGateSealed\(\s*\w+\s*,\s*['"]([\w-]+)['"]\s*\)/g)];
    for (const m of callMatches) {
      const gateId = m[1];
      if (gateId !== undefined && !ids.includes(gateId)) {
        ids.push(gateId);
      }
    }
  }

  return ids;
}

describe('phase 226: gates.sealed doc sync (regression guard for the boundary-scan drift)', () => {
  const sealedGateIds = sealedGateIdsFromSource();

  it('sanity: the source scan actually finds the three known isGateSealed call sites', () => {
    // Locks the derivation itself, so a future 4th caller (or a removed one)
    // is caught here first rather than silently changing the loop below.
    expect(sealedGateIds.sort()).toEqual(['boundary-scan', 'build-test-must-pass', 'test-coverage'].sort());
  });

  it('docs/reference/config.md names every isGateSealed-consulting gate id in its gates.sealed section', () => {
    const config = read('docs', 'reference', 'config.md');
    // Scope to the `## gates` section so a match elsewhere in the doc doesn't
    // paper over a missing mention in the actually-relevant section.
    const gatesSectionStart = config.indexOf('\n## gates\n');
    expect(gatesSectionStart).toBeGreaterThan(-1);
    const nextSectionStart = config.indexOf('\n## ', gatesSectionStart + 1);
    const gatesSection =
      nextSectionStart > -1 ? config.slice(gatesSectionStart, nextSectionStart) : config.slice(gatesSectionStart);

    for (const gateId of sealedGateIds) {
      expect(gatesSection).toContain(gateId);
    }
  });

  it('docs/concepts.md names every isGateSealed-consulting gate id in its gates.sealed callout', () => {
    const concepts = read('docs', 'concepts.md');
    // The callout is the paragraph right after the "Gate bypass reference
    // summary" table that explains gates.sealed's interaction with the
    // bypass flags above. Anchor on the `gates.sealed` config-doc link that
    // opens the callout, and scope the assertion to that paragraph so a
    // stray mention elsewhere in the doc can't paper over a real drift.
    const summaryIdx = concepts.indexOf('### Gate bypass reference summary');
    expect(summaryIdx).toBeGreaterThan(-1);
    const calloutIdx = concepts.indexOf('gates.sealed', summaryIdx);
    expect(calloutIdx).toBeGreaterThan(-1);
    const calloutEnd = concepts.indexOf('\n\n', calloutIdx);
    const callout = concepts.slice(summaryIdx, calloutEnd > -1 ? calloutEnd : undefined);

    for (const gateId of sealedGateIds) {
      expect(callout).toContain(gateId);
    }
  });

  it('docs/concepts.md "Gate bypass reference summary" table has a row for every isGateSealed-consulting gate id', () => {
    const concepts = read('docs', 'concepts.md');
    const tableStart = concepts.indexOf('### Gate bypass reference summary');
    expect(tableStart).toBeGreaterThan(-1);
    const tableEnd = concepts.indexOf('\n\n', concepts.indexOf('| Flag | Command | Gate bypassed |', tableStart));
    const table = concepts.slice(tableStart, tableEnd > -1 ? tableEnd : undefined);

    // Every gate id that consults isGateSealed must appear as a literal
    // "Gate bypassed" table entry (in backticks, matching the table's own style).
    for (const gateId of sealedGateIds) {
      expect(table).toContain(`\`${gateId}\``);
    }
  });

  it('docs/concepts.md "Gate bypass reference summary" table has rows for --allow-failing-build and --allow-boundary-scan-failure', () => {
    const concepts = read('docs', 'concepts.md');
    const tableStart = concepts.indexOf('### Gate bypass reference summary');
    expect(tableStart).toBeGreaterThan(-1);
    const tableEnd = concepts.indexOf('\n\n', concepts.indexOf('| Flag | Command | Gate bypassed |', tableStart));
    const table = concepts.slice(tableStart, tableEnd > -1 ? tableEnd : undefined);

    expect(table).toMatch(/\|\s*`--allow-failing-build`\s*\|/);
    expect(table).toMatch(/\|\s*`--allow-boundary-scan-failure`\s*\|/);
  });
});
