import { describe, it, expect } from 'vitest';
import { access } from 'node:fs/promises';
import { resolveLocalPaths } from '../src/locate-self.js';

describe('resolveLocalPaths (host-codex)', () => {
  it('shimCli resolves to host-codex dist/cli.js', () => {
    const paths = resolveLocalPaths();
    expect(paths.shimCli).toMatch(/host-codex[\\/]dist[\\/]cli\.js$/);
  });

  it('coreCli resolves to core dist/cli/index.js', () => {
    const paths = resolveLocalPaths();
    expect(paths.coreCli).toMatch(/core[\\/]dist[\\/]cli[\\/]index\.js$/);
  });

  it('both files exist on disk (package must be built)', async () => {
    const paths = resolveLocalPaths();
    await expect(access(paths.shimCli)).resolves.toBeUndefined();
    await expect(access(paths.coreCli)).resolves.toBeUndefined();
  });

  it('paths are absolute', () => {
    const paths = resolveLocalPaths();
    expect(paths.shimCli).toMatch(/^([A-Za-z]:[\\/]|\/)/);
    expect(paths.coreCli).toMatch(/^([A-Za-z]:[\\/]|\/)/);
  });
});
