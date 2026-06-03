import path from 'node:path';
import { routeIndex } from '../routes.mjs';

/** Pull the first ATX H1 as the title; strip that line. Throw if absent. */
export function extractTitle(markdown, sourcePath) {
  const lines = markdown.split('\n');
  const i = lines.findIndex((l) => /^#\s+\S/.test(l));
  if (i === -1) throw new Error(`No H1 heading found in ${sourcePath}; cannot derive a title.`);
  const title = lines[i].replace(/^#\s+/, '').trim();
  lines.splice(i, 1);
  return { title, body: lines.join('\n') };
}

/** YAML frontmatter block. Always quote the title to survive ':' etc. */
export function toFrontmatter(title) {
  const escaped = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `---\ntitle: "${escaped}"\n---\n`;
}

// [text](target) or [text](target "title") — excludes image links via (?<!!)
const MD_LINK = /(?<!!)\[([^\]]*)\]\(([^)\s"]+)(\s+"[^"]*")?\)/g;

const DEFAULT_INDEX = routeIndex();

/**
 * Rewrite relative `.md` links to base-aware site routes.
 * - Only targets ending in `.md` (optionally `#anchor`) are touched.
 * - External (scheme://), root-absolute, and pure-anchor links pass through.
 * - Targets inside fenced code blocks are left alone.
 * - Image links `![alt](...)` are left untouched.
 * - Inline title attributes (e.g. `"Title"`) are preserved on rewrite.
 * - A `.md` target that resolves to an unpublished/missing route throws.
 */
export function rewriteLinks(markdown, { sourcePath, base, routes } = {}) {
  const index = routes ? routeIndex(routes) : DEFAULT_INDEX;
  const srcDir = path.posix.dirname(sourcePath);
  const lines = markdown.split('\n');
  let inFence = false;

  const rewritten = lines.map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;

    return line.replace(MD_LINK, (whole, text, target, title) => {
      if (/^[a-z]+:\/\//i.test(target) || target.startsWith('#') || target.startsWith('/')) {
        return whole; // external / absolute / anchor — leave as-is
      }
      const [pathPart, anchor] = target.split('#');
      if (!pathPart.endsWith('.md')) return whole; // not a doc link — leave as-is

      const resolved = path.posix.normalize(path.posix.join(srcDir, pathPart));
      const route = index.get(resolved);
      if (!route) {
        throw new Error(
          `Dead/internal doc link in ${sourcePath}: "${target}" -> ${resolved} is not a published route.`,
        );
      }
      const suffix = anchor ? `#${anchor}` : '';
      return `[${text}](${base}/${route.out}/${suffix}${title ?? ''})`;
    });
  });

  return rewritten.join('\n');
}
