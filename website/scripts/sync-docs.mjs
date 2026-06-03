import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile, writeFile, rm, mkdir, readdir } from 'node:fs/promises';
import { ROUTES } from './routes.mjs';
import { extractTitle, rewriteLinks, toFrontmatter } from './lib/transform.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const outRoot = path.resolve(here, '..', 'src', 'content', 'docs');
const BASE = '/cadence';

/** Remove every generated file/dir under src/content/docs except index.mdx. */
async function clean() {
  let entries = [];
  try {
    entries = await readdir(outRoot, { withFileTypes: true });
  } catch {
    return; // nothing yet
  }
  await Promise.all(
    entries
      .filter((e) => e.name !== 'index.mdx')
      .map((e) => rm(path.join(outRoot, e.name), { recursive: true, force: true })),
  );
}

async function syncOne(route) {
  const raw = await readFile(path.join(repoRoot, route.src), 'utf8');
  const { title, body } = extractTitle(raw, route.src);
  const rewritten = rewriteLinks(body, { sourcePath: route.src, base: BASE });
  const dest = path.join(outRoot, `${route.out}.md`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, toFrontmatter(title) + rewritten, 'utf8');
  return dest;
}

async function main() {
  await clean();
  await mkdir(outRoot, { recursive: true });
  const written = [];
  for (const route of ROUTES) written.push(await syncOne(route));
  console.log(`sync-docs: wrote ${written.length} pages into src/content/docs/`);
}

main().catch((err) => {
  console.error(`sync-docs failed: ${err.message}`);
  process.exit(1);
});
