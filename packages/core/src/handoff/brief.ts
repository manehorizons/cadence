// packages/core/src/handoff/brief.ts

/** H2-header prefixes kept in a brief resume. Matched by PREFIX because some
 *  rendered headers carry decorative suffixes (e.g.
 *  "## State on handoff   ·  pre-filled — verify, don't retype"). */
export const BRIEF_SECTION_PREFIXES = [
  '## TL;DR',
  '## State on handoff',
  '## Carry-forward gotchas',
  '## Next action',
  '## Quick resume commands',
] as const;

/**
 * Return only the H2 sections whose header starts with one of `prefixes`,
 * preserving document order. If none match (e.g. a pre-1.5 / hand-authored
 * doc with none of the known anchors), return the full content unchanged —
 * we degrade toward MORE information, never an empty resume.
 */
export function extractBriefSections(
  content: string,
  prefixes: readonly string[] = BRIEF_SECTION_PREFIXES,
): string {
  const lines = content.split('\n');
  const sections: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (prefixes.some((p) => line.startsWith(p))) {
        current = [line];
        sections.push(current);
      } else {
        current = null; // a non-brief H2 closes the previous kept section
      }
      continue;
    }
    if (current) current.push(line);
  }

  if (sections.length === 0) return content;
  return sections.map((s) => s.join('\n').trimEnd()).join('\n\n') + '\n';
}
