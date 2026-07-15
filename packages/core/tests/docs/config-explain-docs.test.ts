import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CadenceConfigZ } from '@manehorizons/cadence-types';

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

describe('config.md drift guard (AC-2)', () => {
  // AC-2: config.md documents every top-level config schema field — read the
  // live CadenceConfigZ shape (not a hardcoded copy) so this test catches
  // real schema drift, not just drift against a stale list baked into the test.
  const topLevelKeys = Object.keys(CadenceConfigZ.shape);

  it('AC-2: every top-level CadenceConfigZ key is documented in config.md', () => {
    const md = readFileSync(CONFIG_MD, 'utf8');
    expect(topLevelKeys.length).toBeGreaterThan(0);
    for (const key of topLevelKeys) {
      // Anchored to a backtick-wrapped occurrence (bare `key` or a dotted
      // path like `key.subfield`, config.md's actual documentation style —
      // see e.g. `resume.remoteCheck`, `tier.quickFix.maxTasks`), not a bare
      // substring check. A handful of these keys (`notify`, `gates`,
      // `resume`, `handoff`, `tier`, `logging`) are common enough words/CLI
      // command names that a plain `toContain` would still pass even if
      // their own dedicated doc section were deleted, because the bare word
      // coincidentally appears elsewhere in unrelated prose.
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const fieldRef = new RegExp(`\`${escaped}(\\.[A-Za-z0-9_]+)*\``);
      expect(fieldRef.test(md), `config.md has no backtick-anchored reference to config key "${key}"`).toBe(
        true,
      );
    }
  });
});
