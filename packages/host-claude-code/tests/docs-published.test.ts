import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// repo root is three levels up from packages/host-claude-code/tests/
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8');

describe('host-adapter authoring guide is published (AC-5)', () => {
  it('AC-5: the guide is registered as a docs-portal route', () => {
    const routes = read('website/scripts/routes.mjs');
    expect(routes).toContain("src: 'docs/host-adapters.md'");
    expect(routes).toContain("out: 'guides/host-adapters'");
  });

  it('AC-5: the guide documents the contract with host-claude-code as the worked example', () => {
    const guide = read('docs/host-adapters.md');
    expect(guide).toMatch(/^#\s+\S/m); // an H1 the portal can extract as a title
    expect(guide).toContain('HostAdapter');
    expect(guide).toContain('ADAPTER_CONTRACT_VERSION');
    expect(guide).toContain('claudeCodeAdapter'); // the worked example
  });
});
