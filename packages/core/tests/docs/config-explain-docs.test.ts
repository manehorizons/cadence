import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo-root docs from this test file's location:
// packages/core/tests/docs → ../../../../<asset>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const CONFIG_MD = join(ROOT, 'docs', 'reference', 'config.md');
const DESIGN_MD = join(ROOT, 'DESIGN.md');

describe('config explain docs (AC-4)', () => {
  // AC-4: config.md documents the command, its flags, and its doctor relationship.
  it('AC-4: config.md has a config explain section covering flags + doctor relationship', () => {
    const md = readFileSync(CONFIG_MD, 'utf8');
    expect(md).toMatch(/##\s+Reading your config/);
    expect(md).toContain('cadence config explain');
    expect(md).toContain('--all');
    expect(md).toContain('--json');
    // positioned relative to the doctor commands, not duplicating them.
    expect(md).toContain('cadence config doctor');
    expect(md).toContain('cadence doctor');
  });

  // AC-4: DESIGN.md records the additive, read-only surface.
  it('AC-4: DESIGN.md notes the additive read-only config-legibility surface', () => {
    const md = readFileSync(DESIGN_MD, 'utf8');
    expect(md).toContain('config explain');
    expect(md.toLowerCase()).toMatch(/read-only|additive/);
  });
});
