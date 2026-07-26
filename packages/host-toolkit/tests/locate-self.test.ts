import { describe, it, expect } from 'vitest';
import { isAbsolute, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveAdapterLocalPaths } from '../src/locate-self.js';

// AC-2: the locate-self path-resolution logic (formerly duplicated verbatim
// in host-claude-code/src/locate-self.ts and host-codex/src/locate-self.ts)
// lives in one shared implementation, parameterized by the calling module's
// own `import.meta.url` so it can still resolve each adapter's own dist path.

describe('resolveAdapterLocalPaths (AC-2)', () => {
  it('resolves from a src/ module (vitest/dev mode): dist is a sibling of src', () => {
    const fakeSrcFile = resolve('/workspace/packages/host-claude-code/src/locate-self.ts');
    const url = pathToFileURL(fakeSrcFile).href;

    const paths = resolveAdapterLocalPaths(url);

    expect(paths.shimCli).toBe(resolve('/workspace/packages/host-claude-code/dist/cli.js'));
    expect(paths.coreCli).toBe(resolve('/workspace/packages/core/dist/cli/index.js'));
  });

  it('resolves from a compiled dist/ module (runtime mode): stays in dist', () => {
    const fakeDistFile = resolve('/workspace/packages/host-codex/dist/locate-self.js');
    const url = pathToFileURL(fakeDistFile).href;

    const paths = resolveAdapterLocalPaths(url);

    expect(paths.shimCli).toBe(resolve('/workspace/packages/host-codex/dist/cli.js'));
    expect(paths.coreCli).toBe(resolve('/workspace/packages/core/dist/cli/index.js'));
  });

  it('serves multiple adapters identically, each anchored to its own package root', () => {
    const claudeUrl = pathToFileURL(
      resolve('/workspace/packages/host-claude-code/src/locate-self.ts'),
    ).href;
    const codexUrl = pathToFileURL(resolve('/workspace/packages/host-codex/src/locate-self.ts'))
      .href;

    const claude = resolveAdapterLocalPaths(claudeUrl);
    const codex = resolveAdapterLocalPaths(codexUrl);

    expect(claude.shimCli).toBe(resolve('/workspace/packages/host-claude-code/dist/cli.js'));
    expect(codex.shimCli).toBe(resolve('/workspace/packages/host-codex/dist/cli.js'));
    // Both adapters live at the same depth under packages/, so they resolve
    // to the identical core CLI location.
    expect(claude.coreCli).toBe(codex.coreCli);
    expect(claude.coreCli).toBe(resolve('/workspace/packages/core/dist/cli/index.js'));
  });

  it('returns absolute paths', () => {
    const url = pathToFileURL(resolve('/workspace/packages/host-codex/src/locate-self.ts')).href;
    const paths = resolveAdapterLocalPaths(url);
    expect(isAbsolute(paths.shimCli)).toBe(true);
    expect(isAbsolute(paths.coreCli)).toBe(true);
  });

  it('a src-named directory elsewhere in the path does not confuse the src/dist swap', () => {
    // Only the *immediate* parent directory of the module (`basename(here)`)
    // triggers the src → dist swap; an unrelated `src` earlier in the path
    // must not.
    const fakeDistFile = resolve('/workspace/src/packages/host-codex/dist/locate-self.js');
    const url = pathToFileURL(fakeDistFile).href;

    const paths = resolveAdapterLocalPaths(url);

    expect(paths.shimCli).toBe(resolve('/workspace/src/packages/host-codex/dist/cli.js'));
  });

  it('uses this platform\'s path separator', () => {
    const url = pathToFileURL(resolve('/workspace/packages/host-codex/src/locate-self.ts')).href;
    const paths = resolveAdapterLocalPaths(url);
    expect(paths.shimCli).toContain(sep);
  });
});
