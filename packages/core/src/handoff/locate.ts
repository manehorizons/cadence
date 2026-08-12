// packages/core/src/handoff/locate.ts
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface LocatedHandoff {
  path: string;
  content: string;
  generatedAt: string | null;
  loopPosition: string | null;
  /** Set only when `lastHandoff` named a file that no longer exists and the
   *  code fell back to the freshest-by-`generated_at` glob. Holds the
   *  missing pointer's filename (not its full path). Absent on every other
   *  path — including when `lastHandoff` is `null` or names a file that
   *  does exist. */
  danglingPointer?: string;
}

function handoffDir(root: string): string {
  return join(root, '.cadence', 'handoff');
}

export function readKey(content: string, key: string): string | null {
  // [ \t]* (not \s*) so an empty value doesn't let the match spill across the
  // newline and capture the following line's content instead of "".
  const m = content.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  const v = m?.[1]?.trim();
  return v ? v : null;
}

async function toLocated(path: string): Promise<LocatedHandoff> {
  const content = await readFile(path, 'utf8');
  return {
    path,
    content,
    generatedAt: readKey(content, 'generated_at'),
    loopPosition: readKey(content, 'loop_position'),
  };
}

/** Resolve the freshest SESSION doc. Prefers `lastHandoff` when its file exists;
 *  otherwise globs `SESSION-*.md` and ranks by generated_at → filename → mtime. */
export async function locateFreshestHandoff(
  root: string,
  lastHandoff: string | null,
): Promise<LocatedHandoff | null> {
  const dir = handoffDir(root);
  let danglingPointer: string | undefined;
  if (lastHandoff) {
    const pointer = join(dir, lastHandoff);
    if (existsSync(pointer)) return toLocated(pointer);
    danglingPointer = lastHandoff;
  }
  if (!existsSync(dir)) return null;

  const names = (await readdir(dir)).filter((n) => /^SESSION-.*\.md$/.test(n));
  if (names.length === 0) return null;

  const ranked = await Promise.all(
    names.map(async (name) => {
      const path = join(dir, name);
      const content = await readFile(path, 'utf8');
      const generatedAt = readKey(content, 'generated_at');
      const fileDate = name.match(/SESSION-(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
      const mtimeMs = (await stat(path)).mtimeMs;
      const key = generatedAt ?? fileDate ?? '';
      return { name, path, content, generatedAt, key, mtimeMs };
    }),
  );

  ranked.sort((a, b) => {
    if (a.key !== b.key) return a.key < b.key ? 1 : -1; // desc
    return b.mtimeMs - a.mtimeMs; // newer mtime first
  });

  const top = ranked[0];
  if (!top) return null;
  return {
    path: top.path,
    content: top.content,
    generatedAt: top.generatedAt,
    loopPosition: readKey(top.content, 'loop_position'),
    ...(danglingPointer !== undefined ? { danglingPointer } : {}),
  };
}
