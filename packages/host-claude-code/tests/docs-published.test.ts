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

describe('dispatched-agent AskUserQuestion side-channel callout', () => {
  it('280-01/AC-6: host-adapters.md Declare capabilities section carries the side-channel callout', () => {
    const guide = read('docs/host-adapters.md');
    const section = guide.slice(
      guide.indexOf('## 2. Declare capabilities'),
      guide.indexOf('## 3. Map events and extract payloads'),
    );
    expect(section).toContain('AskUserQuestion');
    expect(section).toMatch(/orchestrat\w*[a-z ]* never sees/i);
  });

  it('280-01/AC-6: claude-code.md also carries the side-channel callout', () => {
    const guide = read('docs/claude-code.md');
    expect(guide).toContain('AskUserQuestion');
    expect(guide).toMatch(/orchestrat\w*[a-z ]*(?:never sees|no record)/i);
  });

  it('280-01/AC-6: the callouts are not the only AskUserQuestion mention in the repo — packet.ts still forbids it at runtime', () => {
    const packet = read('packages/core/src/dispatch/packet.ts');
    expect(packet).toContain('AskUserQuestion');
  });
});
