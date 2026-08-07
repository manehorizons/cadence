import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractOverrideTargets,
  parseLockfilePackages,
} from '../../../../scripts/check-lockfile-overrides.mjs';

// 260-01 (phase 260, vitest 2->4 major upgrade) — real disk-reading proof
// that the upgrade actually landed in the committed state, mirroring
// lockfile-overrides-current-state.test.ts's (phase 253) pattern of asserting
// against real files rather than a fixture.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const WORKSPACE_PACKAGE_JSONS = [
  'package.json',
  'packages/core/package.json',
  'packages/host-claude-code/package.json',
  'packages/host-codex/package.json',
  'packages/host-toolkit/package.json',
  'packages/testkit/package.json',
  'website/package.json',
];

describe('vitest 2->4 upgrade — real, current repo state (260-01)', () => {
  it('declares vitest ^4.1.10 across root + every packages/* workspace + website, with no direct vite devDependency (260-01/AC-1)', () => {
    for (const relPath of WORKSPACE_PACKAGE_JSONS) {
      const pkg = JSON.parse(readFileSync(join(ROOT, relPath), 'utf8'));
      const declared = pkg.devDependencies?.vitest ?? pkg.dependencies?.vitest;
      expect(declared, `${relPath} should declare vitest`).toBe('^4.1.10');
      expect(pkg.devDependencies?.vite ?? pkg.dependencies?.vite, `${relPath} must not add vite as a direct dependency`).toBeUndefined();
    }
  });

  it('resolves a single vitest@4.x and vite@7.x-or-later instance in pnpm-lock.yaml via a proper pnpm.overrides entry (260-01/AC-1)', () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const lockfileText = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8');

    const overrideTargets = extractOverrideTargets(packageJson);
    const viteTarget = overrideTargets.find((t: { package: string }) => t.package === 'vite');
    expect(viteTarget, 'root package.json pnpm.overrides must carry a vite floor entry').toBeDefined();

    const lockfilePackages = parseLockfilePackages(lockfileText);
    const vitestInstances = new Set(
      lockfilePackages.filter((p: { package: string }) => p.package === 'vitest').map((p: { version: string }) => p.version),
    );
    const viteInstances = new Set(
      lockfilePackages.filter((p: { package: string }) => p.package === 'vite').map((p: { version: string }) => p.version),
    );
    expect(vitestInstances.size).toBe(1);
    expect([...vitestInstances][0]).toMatch(/^4\./);
    expect(viteInstances.size).toBe(1);
    const viteMajor = Number([...viteInstances][0]!.split('.')[0]);
    expect(viteMajor).toBeGreaterThanOrEqual(7);
  });

  it("vitest.shared.ts uses Vitest 4's flattened maxWorkers, not the removed poolOptions.forks.{minForks,maxForks} shape (260-01/AC-2)", () => {
    const source = readFileSync(join(ROOT, 'vitest.shared.ts'), 'utf8');
    expect(source).toMatch(/maxWorkers:\s*12/);
    // Assert the removed *code* is gone (the migration comment is allowed to
    // mention the old API name for documentation purposes, so match the
    // actual config-object shape, not any bare mention of the word).
    expect(source).not.toMatch(/poolOptions:\s*\{/);
    expect(source).not.toMatch(/minForks:\s*\d/);
    expect(source).not.toMatch(/maxForks:\s*\d/);
    // testTimeout/hookTimeout/coverage must survive the pool-config edit untouched.
    expect(source).toMatch(/testTimeout:\s*TIMEOUT_MS/);
    expect(source).toMatch(/hookTimeout:\s*TIMEOUT_MS/);
    expect(source).toMatch(/coverage:\s*\{/);
  });

  it('every workspace pins the identical vitest major version, so turbo\'s test task runs a consistent toolchain across all packages (260-01/AC-4)', () => {
    const versions = new Set(
      WORKSPACE_PACKAGE_JSONS.map((relPath) => {
        const pkg = JSON.parse(readFileSync(join(ROOT, relPath), 'utf8'));
        return pkg.devDependencies?.vitest ?? pkg.dependencies?.vitest;
      }),
    );
    expect(versions.size, 'every workspace must declare the exact same vitest range').toBe(1);
    expect([...versions][0]).toBe('^4.1.10');
  });

  it('removes the 3 resolved vitest/vite/postcss audit exceptions and their Deferred section, leaving the unrelated hono row intact (260-01/AC-5)', () => {
    const doc = readFileSync(join(ROOT, 'docs/security/audit-exceptions.md'), 'utf8');
    expect(doc).not.toContain('GHSA-5xrq-8626-4rwp');
    expect(doc).not.toContain('GHSA-fx2h-pf6j-xcff');
    expect(doc).not.toContain('GHSA-r28c-9q8g-f849');
    expect(doc).not.toContain('## Deferred: vitest major-version upgrade');
    // The unrelated hono exception is out of this phase's scope and must survive.
    expect(doc).toContain('GHSA-88fw-hqm2-52qc');
  });
});
