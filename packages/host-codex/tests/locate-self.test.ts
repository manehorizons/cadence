import { describe, it, expect } from 'vitest';
import { isAbsolute } from 'node:path';
import { resolveLocalPaths } from '../src/locate-self.js';

describe('resolveLocalPaths (AC-4)', () => {
  it('AC-4: returns absolute paths to the adapter CLI and the core CLI', () => {
    const p = resolveLocalPaths();
    expect(isAbsolute(p.shimCli)).toBe(true);
    expect(isAbsolute(p.coreCli)).toBe(true);
    expect(p.shimCli).toMatch(/host-codex[/\\]dist[/\\]cli\.js$/);
    expect(p.coreCli).toMatch(/core[/\\]dist[/\\]cli[/\\]index\.js$/);
  });
});
