import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const RUN_DEMO_SH = join(REPO_ROOT, 'examples', 'demo-test-gutting', 'run-demo.sh');
const CADENCE_BIN = join(REPO_ROOT, 'packages', 'core', 'bin', 'cadence.cjs');

/**
 * Phase 270 (rec-20260810-001): run-demo.sh's post-init config patch never
 * set verification.coverageScheme, so it inherited Phase 239's fresh-init
 * default ('phase-qualified') while its fixtures use bare AC-N tokens —
 * every AC showed "has no linked test", masking the demo's actual thesis
 * (an assertion-mode gutted test caught by the coverage gate specifically).
 * This spawns the real script end-to-end via execFileSync's default
 * (non-tty) stdio, so run-demo.sh's `[ -t 0 ]` pause guards no-op.
 *
 * Windows-skipped: the script is bash with a POSIX shebang, same convention
 * as packages/core/tests/docs/doc-sync-hook.test.ts's isWindows guard.
 */
describe.skipIf(process.platform === 'win32')('demo-test-gutting/run-demo.sh (phase 270)', () => {
  it('270-01/AC-1 + AC-2: money-shot refusal is AC-2-specific, and the script reaches Settled', () => {
    // `cadence settle run --auto`'s coverage-gate refusals go to stderr
    // (ctx.io.err), not stdout — capture and check both combined, in the
    // order the script emits them. run-demo.sh's own `git init` + `git
    // commit` need a git identity; CI runners have no global one configured
    // (unlike most dev machines), so it's supplied via env, matching the
    // GIT_AUTHOR_*/GIT_COMMITTER_* convention other tests use via `git
    // config` on ephemeral repos.
    const result = spawnSync('bash', [RUN_DEMO_SH, CADENCE_BIN], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Cadence Test',
        GIT_AUTHOR_EMAIL: 'test@cadence.local',
        GIT_COMMITTER_NAME: 'Cadence Test',
        GIT_COMMITTER_EMAIL: 'test@cadence.local',
      },
    });
    const combined = `${result.stdout}${result.stderr}`;

    expect(combined).not.toContain('AC-1 has no linked test');
    expect(combined).not.toContain('AC-3 has no linked test');
    expect(combined).toContain('AC-2 is mentioned but not inside a recognized asserting test block');

    // 270-01/AC-2: the redemption settle reaches "Settled" and the whole
    // script completes with exit 0.
    expect(result.status).toBe(0);
    expect(combined).toContain('Settled. The loop only closes on evidence.');
  }, 20_000);
});
