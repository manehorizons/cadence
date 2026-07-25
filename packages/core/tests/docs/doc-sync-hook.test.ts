import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo-root assets from this test file's location:
// packages/core/tests/docs → ../../../../<asset>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const CHECKER = join(ROOT, '.githooks', 'check-doc-sync.sh');
const CLAUDE_MD = join(ROOT, 'CLAUDE.md');
const CHANGELOG_MD = join(ROOT, 'CHANGELOG.md');
const CORE_PKG = join(ROOT, 'packages', 'core', 'package.json');

const isWindows = process.platform === 'win32';

/** Run the pure checker via bash with `text` on stdin; capture exit code + stderr. */
function runChecker(
  version: string,
  text: string,
  label?: string,
): { code: number; stderr: string } {
  const args = label ? [CHECKER, version, label] : [CHECKER, version];
  try {
    execFileSync('bash', args, { input: text, encoding: 'utf8' });
    return { code: 0, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stderr?: Buffer | string };
    return { code: e.status ?? -1, stderr: e.stderr?.toString() ?? '' };
  }
}

// The checker is bash; only exercise its execution on POSIX. The live-guard
// test below readFileSyncs and runs on every OS (incl. Windows CI).
describe.skipIf(isWindows)('check-doc-sync.sh (pure version-freshness checker)', () => {
  it('exits 0 when the doc text mentions the expected version', () => {
    const { code } = runChecker('1.10.0', 'latest published version is `1.10.0` today');
    expect(code).toBe(0);
  });

  it('exits non-zero when the doc text omits the expected version', () => {
    const { code } = runChecker('1.10.0', 'latest published version is `1.6.0` (stale)');
    expect(code).not.toBe(0);
  });

  it('names the missing version and CLAUDE.md in its error message', () => {
    const { stderr } = runChecker('1.10.0', 'no version here');
    expect(stderr).toContain('1.10.0');
    expect(stderr).toContain('CLAUDE.md');
  });

  it('honors a custom doc label in the error message', () => {
    const { stderr } = runChecker('1.10.0', 'no version here', 'README.md');
    expect(stderr).toContain('README.md');
  });

  it('does not false-match a different version as a substring (1.10.0 vs 1.1.0)', () => {
    const { code } = runChecker('1.10.0', 'we are on `1.1.0` and `11.10.0x`');
    expect(code).not.toBe(0);
  });

  // Regression: a `printf '%s' "$doc" | grep -Eq ...` pipe here previously
  // caused a real false failure on any doc large enough (~97KB, CHANGELOG.md
  // after its 2026-07-24 backfill) that the match sits near the top — grep -q
  // exits the instant it finds a match, SIGPIPEing printf mid-write, and
  // under `set -o pipefail` that surfaced as exit 141, which the checker
  // reported as "version not found" even though it plainly was. Confirmed
  // via `bash -x`: `escaped`/`doc` were both correct, only the grep pipeline's
  // own exit code was wrong. Fixed by feeding grep via a here-string instead
  // of a live pipe (bash writes the full buffer before grep starts reading,
  // so there's no producer/consumer race to lose).
  it('finds an early match in a document much larger than a typical pipe buffer (SIGPIPE/pipefail regression)', () => {
    const big = `latest published version is \`1.10.0\` today\n${'x'.repeat(200_000)}`;
    const { code } = runChecker('1.10.0', big);
    expect(code).toBe(0);
  });
});

// Cross-platform staleness canary: whatever the engine's canonical version is,
// the CLAUDE.md release narrative must mention it. This is the same invariant
// the pre-commit/pre-push hooks enforce locally — re-asserted here so CI fails
// loudly if a version bump ever lands without the doc update.
describe('CLAUDE.md tracks the canonical package version', () => {
  it('mentions the current packages/core version', () => {
    const version = JSON.parse(readFileSync(CORE_PKG, 'utf8')).version as string;
    const claudeMd = readFileSync(CLAUDE_MD, 'utf8');
    expect(claudeMd, `CLAUDE.md does not mention core version ${version}`).toContain(version);
  });
});

// CHANGELOG.md's invariant is stricter than CLAUDE.md's: it's not enough for
// the current version to appear *somewhere* in the file (a stale mid-file
// mention from an old, already-superseded release would false-pass that
// check) — the newest (topmost) `## [x.y.z]` release heading must equal the
// current packages/core version exactly.
describe('CHANGELOG.md tracks the canonical package version', () => {
  it("the newest `## [x.y.z]` heading equals the current packages/core version", () => {
    const version = JSON.parse(readFileSync(CORE_PKG, 'utf8')).version as string;
    const changelog = readFileSync(CHANGELOG_MD, 'utf8');
    const match = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m);
    expect(match, 'CHANGELOG.md has no `## [x.y.z]` release heading').not.toBeNull();
    const newestHeadingVersion = match?.[1];
    expect(
      newestHeadingVersion,
      `CHANGELOG.md's newest heading is ${newestHeadingVersion}, expected core version ${version}`,
    ).toBe(version);
  });
});
