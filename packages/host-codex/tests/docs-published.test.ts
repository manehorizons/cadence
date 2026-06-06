import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8');

describe('Codex adapter docs (AC-1)', () => {
  it('AC-1: host-adapters.md presents codexAdapter as a second worked example', () => {
    const guide = read('docs/host-adapters.md');
    expect(guide).toContain('codexAdapter');
    // The genuine divergences the spike surfaced must be named.
    expect(guide).toContain('apply_patch');
    expect(guide).toContain('~/.codex/prompts');
  });
});

describe('host-codex package is publish-ready (AC-2)', () => {
  it('AC-2: ships a README and a LICENSE', () => {
    expect(existsSync(path.join(pkgRoot, 'README.md'))).toBe(true);
    expect(existsSync(path.join(pkgRoot, 'LICENSE'))).toBe(true);
  });

  it('AC-2: LICENSE is MIT', () => {
    const license = readFileSync(path.join(pkgRoot, 'LICENSE'), 'utf8');
    expect(license).toMatch(/MIT License/);
  });
});
