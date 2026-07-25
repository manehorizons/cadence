import { describe, expect, it, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

const mockSpawnSync = vi.mocked(spawnSync);

// Captured before any test calls vi.useFakeTimers() — used to yield real
// wall-clock ticks (a handful of milliseconds) between fake-timer advances
// so genuine node:fs/promises I/O gets a turn to complete. If this were
// captured after faking, it would resolve to the *faked* setTimeout and
// deadlock (a fake timer nothing else is left to advance).
const realSetTimeout = globalThis.setTimeout.bind(globalThis);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'release.yml');
const RELEASE_DOC = join(ROOT, 'docs', 'release.md');

const script = await import('../../../../scripts/release-integrity.mjs');

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'cadence-release-integrity-'));
  mkdirSync(join(root, 'packages'), { recursive: true });
  return root;
}

function writePackage(root: string, dir: string, pkg: Record<string, unknown>) {
  const packageDir = join(root, 'packages', dir);
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify(pkg, null, 2));
}

function writeCoreChangelog(root: string, version: string) {
  writeFileSync(
    join(root, 'packages', 'core', 'CHANGELOG.md'),
    ['# @manehorizons/cadence-core', '', `## ${version}`, '', '- release-integrity retry budget note', ''].join(
      '\n',
    ),
  );
}

/**
 * npm view <pkg> version handler that fails `failuresBeforeSuccess` times per
 * package before returning the target version, so tests can prove how many
 * retry attempts a given call site tolerates.
 */
function flakyNpmView(version: string, failuresBeforeSuccess: number) {
  const counts = new Map<string, number>();
  return (pkgName: string) => {
    const n = (counts.get(pkgName) ?? 0) + 1;
    counts.set(pkgName, n);
    if (n <= failuresBeforeSuccess) {
      return { status: 1, stdout: '', stderr: 'ETIMEDOUT: registry propagation lag' };
    }
    return { status: 0, stdout: version, stderr: '' };
  };
}

/**
 * Drives vitest's fake timers forward until `promise` settles, without ever
 * sleeping for a real retry-backoff delay. A single big
 * `vi.advanceTimersByTimeAsync` call is not enough here: `verifyNpmPackages`
 * awaits real `node:fs/promises` reads (via `buildReleasePlan`) before its
 * first `setTimeout`-based backoff exists to advance, so advancing must be
 * interleaved with brief REAL macrotask yields (via the real, pre-fake
 * `setTimeout`) so that real I/O actually gets a turn to complete between
 * fake-timer advances.
 */
async function advanceTimersUntilSettled(promise: Promise<unknown>, maxIterations = 500) {
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  for (let i = 0; i < maxIterations && !settled; i += 1) {
    await vi.advanceTimersByTimeAsync(1000);
    await new Promise((resolve) => realSetTimeout(resolve, 5));
  }
}

/** git ls-remote / gh release handlers that always succeed, for tests that need runReleaseIntegrity's non-npm steps to pass through cleanly. */
function gitGhAlwaysSucceed(tag: string) {
  return (command: string, args: readonly string[] = []) => {
    if (command === 'git' && args[0] === 'ls-remote') {
      return { status: 0, stdout: `deadbeef\trefs/tags/${tag}\n`, stderr: '' };
    }
    if (command === 'gh' && args[0] === 'release' && args[1] === 'view' && args.includes('--json')) {
      return {
        status: 0,
        stdout: JSON.stringify({
          tagName: tag,
          name: tag,
          isDraft: false,
          isPrerelease: false,
          url: 'https://github.com/manehorizons/cadence/releases/tag/' + tag,
        }),
        stderr: '',
      };
    }
    if (command === 'gh' && args[0] === 'release' && args[1] === 'view') {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (command === 'gh' && args[0] === 'release' && args[1] === 'edit') {
      return { status: 0, stdout: '', stderr: '' };
    }
    return undefined;
  };
}

describe('release-integrity helper', () => {
  it('extracts the exact core changelog entry for a version (AC-5)', () => {
    const entry = script.extractChangelogEntry(
      [
        '# @manehorizons/cadence-core',
        '',
        '## 1.31.0',
        '',
        '### Minor Changes',
        '',
        '- release-integrity note',
        '',
        '## 1.30.0',
        '',
        '- older',
      ].join('\n'),
      '1.31.0',
    );

    expect(entry).toContain('### Minor Changes');
    expect(entry).toContain('release-integrity note');
    expect(entry).not.toContain('1.30.0');
  });

  it('fails loudly when package versions drift from core (AC-2)', () => {
    expect(() =>
      script.validatePackageVersions(
        [
          { name: '@manehorizons/cadence-core', version: '1.31.0' },
          { name: '@manehorizons/cadence-types', version: '1.30.0' },
        ],
        '1.31.0',
      ),
    ).toThrow('@manehorizons/cadence-types@1.30.0');
  });

  it('discovers every public @manehorizons/cadence-* package and skips private packages (AC-3)', async () => {
    const root = tempRoot();
    try {
      writePackage(root, 'core', {
        name: '@manehorizons/cadence-core',
        version: '1.31.0',
      });
      writePackage(root, 'types', {
        name: '@manehorizons/cadence-types',
        version: '1.31.0',
      });
      writePackage(root, 'testkit', {
        name: '@manehorizons/cadence-testkit',
        version: '1.31.0',
        private: true,
      });
      writePackage(root, 'other', {
        name: '@example/not-cadence',
        version: '1.31.0',
      });

      const packages = await script.discoverPublicPackages(root);

      expect(packages.map((pkg: { name: string }) => pkg.name)).toEqual([
        '@manehorizons/cadence-core',
        '@manehorizons/cadence-types',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('renders release notes from changelog, package list, and workflow run URL (AC-1)', () => {
    const notes = script.buildReleaseNotes({
      version: '1.31.0',
      packages: [
        { name: '@manehorizons/cadence-core' },
        { name: '@manehorizons/cadence-types' },
      ],
      changelogEntry: '### Minor Changes\n\n- Make releases agree.',
      runUrl: 'https://github.com/manehorizons/cadence/actions/runs/123',
    });

    expect(notes).toContain('## Package Changelog');
    expect(notes).toContain('Make releases agree.');
    expect(notes).toContain('`@manehorizons/cadence-core`');
    expect(notes).toContain('https://github.com/manehorizons/cadence/actions/runs/123');
    expect(notes).toContain('GitHub Release metadata are verified');
  });
});

describe('npm verification retry budget (post-publish vs pre-publish)', () => {
  afterEach(() => {
    vi.useRealTimers();
    mockSpawnSync.mockReset();
  });

  it('lets post-publish verification (runReleaseIntegrity) survive more transient npm-view failures than the old ~3-attempt budget before giving up', async () => {
    const version = '9.9.1';
    const tag = `v${version}`;
    const root = tempRoot();
    try {
      writePackage(root, 'core', { name: '@manehorizons/cadence-core', version });
      writeCoreChangelog(root, version);

      // Fails on attempts 1-4, succeeds on attempt 5 — exhausts the OLD
      // 3-attempt budget but should succeed under a materially larger one.
      const npmView = flakyNpmView(version, 4);
      const gitGh = gitGhAlwaysSucceed(tag);
      mockSpawnSync.mockImplementation(((command: string, args: readonly string[] = []) => {
        if (command === 'npm' && args[0] === 'view') {
          return npmView(String(args[1])) as never;
        }
        const handled = gitGh(command, args);
        if (handled) return handled as never;
        throw new Error(`unexpected spawnSync call in test: ${command} ${args.join(' ')}`);
      }) as typeof spawnSync);

      vi.useFakeTimers();
      const resultPromise = script.runReleaseIntegrity({ root, env: {}, dryRun: false });
      await advanceTimersUntilSettled(resultPromise);
      const result = await resultPromise;

      expect(result.version).toBe(version);
      const npmViewCalls = mockSpawnSync.mock.calls.filter(
        ([command, args]) => command === 'npm' && Array.isArray(args) && args[0] === 'view',
      );
      expect(npmViewCalls.length).toBe(5);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps pre-publish verification (verifyNpmPublished) failing fast within roughly the original ~3-attempt budget', async () => {
    const version = '9.9.2';
    const root = tempRoot();
    try {
      writePackage(root, 'core', { name: '@manehorizons/cadence-core', version });
      writeCoreChangelog(root, version);

      // Same flakiness as the post-publish test: fails on attempts 1-4,
      // would succeed on attempt 5 — but the fast pre-publish idempotency
      // check must NOT wait around that long.
      const npmView = flakyNpmView(version, 4);
      mockSpawnSync.mockImplementation(((command: string, args: readonly string[] = []) => {
        if (command === 'npm' && args[0] === 'view') {
          return npmView(String(args[1])) as never;
        }
        throw new Error(`unexpected spawnSync call in test: ${command} ${args.join(' ')}`);
      }) as typeof spawnSync);

      vi.useFakeTimers();
      const resultPromise = script.verifyNpmPublished({ root, env: {} });
      const assertion = expect(resultPromise).rejects.toThrow(/failed after 3 attempts/);
      await advanceTimersUntilSettled(resultPromise);
      await assertion;

      const npmViewCalls = mockSpawnSync.mock.calls.filter(
        ([command, args]) => command === 'npm' && Array.isArray(args) && args[0] === 'view',
      );
      expect(npmViewCalls.length).toBe(3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('Release workflow integrity wiring', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8');
  const releaseDoc = readFileSync(RELEASE_DOC, 'utf8');

  it('runs release-integrity after publishing and tagging real releases (AC-1)', () => {
    const createReleaseStep = workflow.indexOf('run: node scripts/release-integrity.mjs');
    expect(createReleaseStep).toBeGreaterThan(-1);
    expect(workflow.indexOf('Publish to npm (provenance)')).toBeLessThan(
      createReleaseStep,
    );
    expect(workflow.indexOf('Tag the release (v<version>)')).toBeLessThan(
      createReleaseStep,
    );
  });

  it('provides GitHub and npm tokens to the release-integrity step (AC-3)', () => {
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}');
    expect(workflow).toContain('NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}');
  });

  it('lets repair reruns skip npm publish when the registry is already current (AC-2)', () => {
    expect(workflow).toContain('node scripts/release-integrity.mjs --verify-npm');
    expect(workflow.indexOf('node scripts/release-integrity.mjs --verify-npm')).toBeLessThan(
      workflow.indexOf('pnpm -r publish --access public --provenance --no-git-checks'),
    );
  });

  it('documents npm, tag, GitHub Release, and latest marker as the release done bar (AC-4)', () => {
    expect(releaseDoc).toContain('npm shows the new version');
    expect(releaseDoc).toContain('matching `v<version>` git tag');
    expect(releaseDoc).toContain('non-draft Release');
    expect(releaseDoc).toContain('latest release');
  });
});
