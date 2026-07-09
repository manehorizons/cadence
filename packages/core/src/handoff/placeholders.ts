// packages/core/src/handoff/placeholders.ts
/**
 * Detect SESSION-doc sections whose scaffolded `<!-- … FILL IN … -->` marker
 * was never replaced with narrative (render-session.ts emits the markers).
 * Section title = nearest preceding `## ` heading, with any `   ·  …` display
 * suffix stripped.
 */
export function findUnfilledSections(doc: string): string[] {
  const out: string[] = [];
  let current = '(preamble)';
  for (const line of doc.split('\n')) {
    const h = line.match(/^## (.+)$/);
    if (h) {
      current = (h[1] ?? '').split('·')[0]?.trim() ?? '';
      continue;
    }
    if (line.includes('<!--') && line.includes('FILL IN') && !out.includes(current)) {
      out.push(current);
    }
  }
  return out;
}
