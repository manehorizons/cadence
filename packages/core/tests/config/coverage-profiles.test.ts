/**
 * Load-time validation of `verification.coverageProfiles` (phase 167, T7,
 * AC-7) — genuine `loadConfig` refuse+suggest behavior for a bad regex, a
 * missing required field, a `do-end-keyword` entry missing its `keyword`
 * config, and a built-in extension collision. `loadConfig` is the real
 * `.cadence/config.json` load path (`packages/core/src/config/loader.ts`),
 * not a unit test of `compileCustomProfile`/`mergeCustomProfiles` in
 * isolation — this file proves the wiring, not just the pieces.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { loadConfig } from '../../src/config/loader.js';
import { defaultConfig } from '@manehorizons/cadence-types';
import { ConfigInvalidError } from '../../src/errors.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function writeConfigJson(root: string, verificationOverride: unknown): Promise<void> {
  await writeFile(
    join(root, '.cadence/config.json'),
    JSON.stringify({ ...defaultConfig, verification: verificationOverride }),
  );
}

describe('loadConfig: verification.coverageProfiles load-time validation (phase 167 T7, AC-7)', () => {
  it('AC-7: a valid custom profile loads without throwing', async () => {
    active = await tempRepo({ initialized: true });
    await writeConfigJson(active.root, {
      coverageProfiles: [
        {
          id: 'ruby-rspec',
          extensions: ['.rb-schema-ok'],
          openerPattern: String.raw`\bit\s+'[^']*'\s+do\b`,
          assertionPattern: String.raw`\bexpect\s*\(`,
          strategy: 'do-end-keyword',
          keyword: { blockOpenKeywords: ['do'], endKeyword: 'end' },
          openerMatchesStrings: true,
          syntax: { comments: { line: ['#'] }, strings: [{ open: "'" }, { open: '"' }] },
        },
      ],
    });
    const cfg = await loadConfig(active.root);
    expect(cfg.verification.coverageProfiles).toHaveLength(1);
    expect(cfg.verification.coverageProfiles[0]?.id).toBe('ruby-rspec');
  });

  it('AC-7: an invalid regex string in openerPattern is refused loudly, naming the field and the profile id — not a crash, not silently skipped', async () => {
    active = await tempRepo({ initialized: true });
    await writeConfigJson(active.root, {
      coverageProfiles: [
        {
          id: 'broken-opener',
          extensions: ['.brk1'],
          openerPattern: '(unclosed[',
          assertionPattern: 'x',
          strategy: 'call-expression',
          syntax: {},
        },
      ],
    });
    await expect(loadConfig(active.root)).rejects.toBeInstanceOf(ConfigInvalidError);
    await expect(loadConfig(active.root)).rejects.toThrow(/broken-opener/);
    await expect(loadConfig(active.root)).rejects.toThrow(/openerPattern/);
  });

  it('AC-7: an invalid regex string in assertionPattern is refused loudly, naming the field and the profile id', async () => {
    active = await tempRepo({ initialized: true });
    await writeConfigJson(active.root, {
      coverageProfiles: [
        {
          id: 'broken-assertion',
          extensions: ['.brk2'],
          openerPattern: 'x',
          assertionPattern: '(unclosed[',
          strategy: 'call-expression',
          syntax: {},
        },
      ],
    });
    await expect(loadConfig(active.root)).rejects.toBeInstanceOf(ConfigInvalidError);
    await expect(loadConfig(active.root)).rejects.toThrow(/broken-assertion/);
    await expect(loadConfig(active.root)).rejects.toThrow(/assertionPattern/);
  });

  it('AC-7: a profile missing a required field (no strategy) is refused with a clear message', async () => {
    active = await tempRepo({ initialized: true });
    await writeConfigJson(active.root, {
      coverageProfiles: [
        {
          id: 'no-strategy',
          extensions: ['.nostrat'],
          openerPattern: 'x',
          assertionPattern: 'y',
          syntax: {},
          // strategy omitted entirely — schema-level required-field refusal.
        },
      ],
    });
    await expect(loadConfig(active.root)).rejects.toBeInstanceOf(ConfigInvalidError);
    await expect(loadConfig(active.root)).rejects.toThrow(/strategy/);
  });

  it('AC-7: a do-end-keyword profile missing its required keyword config is refused, naming the profile', async () => {
    active = await tempRepo({ initialized: true });
    await writeConfigJson(active.root, {
      coverageProfiles: [
        {
          id: 'missing-keyword-cfg',
          extensions: ['.mkw'],
          openerPattern: 'x',
          assertionPattern: 'y',
          strategy: 'do-end-keyword',
          syntax: {},
          // keyword omitted — required only because strategy is do-end-keyword.
        },
      ],
    });
    await expect(loadConfig(active.root)).rejects.toBeInstanceOf(ConfigInvalidError);
    await expect(loadConfig(active.root)).rejects.toThrow(/missing-keyword-cfg/);
    await expect(loadConfig(active.root)).rejects.toThrow(/keyword/);
  });

  it('AC-7: claiming an already-built-in extension (.py) is refused, naming the collision and suggesting a fix — the add-only invariant', async () => {
    active = await tempRepo({ initialized: true });
    await writeConfigJson(active.root, {
      coverageProfiles: [
        {
          id: 'fake-python',
          extensions: ['.py'],
          openerPattern: 'x',
          assertionPattern: 'y',
          strategy: 'call-expression',
          syntax: {},
        },
      ],
    });
    await expect(loadConfig(active.root)).rejects.toBeInstanceOf(ConfigInvalidError);
    await expect(loadConfig(active.root)).rejects.toThrow(/fake-python/);
    await expect(loadConfig(active.root)).rejects.toThrow(/\.py/);
    await expect(loadConfig(active.root)).rejects.toThrow(/built-in/);
    // Suggests a fix, doesn't just say "invalid".
    await expect(loadConfig(active.root)).rejects.toThrow(/different extension|remove/i);
  });

  it('AC-7: two custom profiles in the same list claiming the same (non-built-in) extension are refused, not silently overwritten', async () => {
    active = await tempRepo({ initialized: true });
    await writeConfigJson(active.root, {
      coverageProfiles: [
        {
          id: 'first-claim',
          extensions: ['.dup1'],
          openerPattern: 'x',
          assertionPattern: 'y',
          strategy: 'call-expression',
          syntax: {},
        },
        {
          id: 'second-claim',
          extensions: ['.dup1'],
          openerPattern: 'x',
          assertionPattern: 'y',
          strategy: 'call-expression',
          syntax: {},
        },
      ],
    });
    await expect(loadConfig(active.root)).rejects.toBeInstanceOf(ConfigInvalidError);
    await expect(loadConfig(active.root)).rejects.toThrow(/second-claim/);
    await expect(loadConfig(active.root)).rejects.toThrow(/first-claim/);
  });

  it('AC-7: two custom profiles from SEPARATE loadConfig calls (different repos, same process) claiming the same extension are refused, not silently shadowed (T7 review fix)', async () => {
    // A long-lived process (e.g. `cadence mcp serve`, or repeated CLI calls
    // sharing one process) can call loadConfig more than once. Before this
    // fix, only BUILTIN_EXTENSIONS was checked at merge time, so a second,
    // unrelated repo's DIFFERENT custom profile could silently shadow the
    // first repo's registration for the same extension — a real,
    // process-lifetime "works once, breaks on repeat call" bug.
    const first = await tempRepo({ initialized: true });
    try {
      await writeConfigJson(first.root, {
        coverageProfiles: [
          {
            id: 'first-repo-zz',
            extensions: ['.zz-cross-call'],
            openerPattern: 'x',
            assertionPattern: 'y',
            strategy: 'call-expression',
            syntax: {},
          },
        ],
      });
      await loadConfig(first.root);

      const second = await tempRepo({ initialized: true });
      try {
        await writeConfigJson(second.root, {
          coverageProfiles: [
            {
              id: 'second-repo-zz',
              extensions: ['.zz-cross-call'],
              openerPattern: 'x',
              assertionPattern: 'y',
              strategy: 'call-expression',
              syntax: {},
            },
          ],
        });
        await expect(loadConfig(second.root)).rejects.toBeInstanceOf(ConfigInvalidError);
        await expect(loadConfig(second.root)).rejects.toThrow(/first-repo-zz/);
        await expect(loadConfig(second.root)).rejects.toThrow(/second-repo-zz/);
      } finally {
        await second.cleanup();
      }
    } finally {
      await first.cleanup();
    }
  });

  it('AC-7: reloading the SAME custom profile id for the SAME extension (config reload) is idempotent, not a false collision (T7 review fix)', async () => {
    active = await tempRepo({ initialized: true });
    const config = {
      coverageProfiles: [
        {
          id: 'reload-me',
          extensions: ['.reload-ext'],
          openerPattern: 'x',
          assertionPattern: 'y',
          strategy: 'call-expression',
          syntax: {},
        },
      ],
    };
    await writeConfigJson(active.root, config);
    await loadConfig(active.root);
    // Reloading the identical config (same id, same extension) a second
    // time must not be treated as a collision with its own prior
    // registration.
    await expect(loadConfig(active.root)).resolves.toBeDefined();
  });

  it('AC-7: a pre-existing config.json without verification.coverageProfiles at all still parses (backward compatible)', async () => {
    active = await tempRepo({ initialized: true });
    await writeFile(
      join(active.root, '.cadence/config.json'),
      JSON.stringify({
        ...defaultConfig,
        verification: { testGlobs: ['packages/**/*.test.ts'], coverageMode: 'assertion' },
      }),
    );
    const cfg = await loadConfig(active.root);
    expect(cfg.verification.coverageProfiles).toEqual([]);
  });
});
