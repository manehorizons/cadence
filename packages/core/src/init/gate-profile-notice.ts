import type { Profile } from '@thomas-powers-jr/cadence-types';

/**
 * The init-time heads-up for the silent gate-profile flip (rec-20260617-009).
 *
 * A young repo (<20 commits) gets `auto` from the git-history *suggestion*, so
 * `draft approve` runs non-interactively — but once the repo passes ~20 commits
 * a later `cadence init` would suggest `standard`, flipping approve to
 * interactive. We warn only when `auto` was *derived* (no explicit
 * `--gate-profile`), not when the user pinned it deliberately, and never for
 * `standard`/`strict` (the flip doesn't apply). Pure: returns the line or null.
 */
export function autoFlipNotice(
  explicitGateProfile: string | undefined,
  resolved: Profile,
): string | null {
  if (explicitGateProfile === undefined && resolved === 'auto') {
    return (
      'Heads-up: this repo got the `auto` gate profile (young repo), so `cadence draft approve` ' +
      'is non-interactive. Once it passes ~20 commits, a fresh init would suggest `standard` — ' +
      'flipping approve to interactive. Pin `--gate-profile auto` to keep it hands-off.'
    );
  }
  return null;
}
