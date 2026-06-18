/**
 * Phase 116 — non-TTY auto-bypass for the two loop gates (rec-20260617-005).
 *
 * Pure decision seam consulted by the manual approve gate and the settle
 * interactive-verdict gate. Removes the `StdinPrompter: stdin is not a TTY`
 * error class for AI agents and CI: a non-TTY invocation auto-bypasses the
 * interactive prompt (loudly, with provenance) instead of hard-failing.
 *
 *   - `interactive`  — a real TTY (or no override): prompt the human.
 *   - `bypass`       — non-TTY (or forced): skip the prompt, auto-pass loudly.
 *   - `require-tty`  — strict opt-out: behave as before (the prompter throws,
 *                      the gate refuses).
 *
 * Env precedence (a stray empty/other value never triggers — only `'1'`):
 *   CADENCE_PROMPTER_SCRIPT   set (any value) → `interactive` — explicit
 *                             human-authored answers are supplied, so honor them
 *                             (never bypass a scripted run, even in a non-TTY)
 *   CADENCE_REQUIRE_TTY=1     restores the pre-116 hard-fail → `require-tty`
 *   CADENCE_NONINTERACTIVE=1  forces `bypass` even when a TTY is present
 *                             (pty-allocated agents)
 *   otherwise                 follow `isTTY` (true → interactive, false → bypass)
 */
export type Interactivity = 'interactive' | 'bypass' | 'require-tty';

/** Env var that restores the pre-116 hard-fail/refuse even in a non-TTY. */
export const REQUIRE_TTY_ENV = 'CADENCE_REQUIRE_TTY';
/** Env var that forces bypass even when stdin is a TTY (pty-allocated agents). */
export const NONINTERACTIVE_ENV = 'CADENCE_NONINTERACTIVE';
/** Existing test/automation seam: newline-separated scripted prompter answers. */
export const PROMPTER_SCRIPT_ENV = 'CADENCE_PROMPTER_SCRIPT';

export function resolveInteractivity(
  env: Record<string, string | undefined>,
  isTTY: boolean,
): Interactivity {
  if (env[PROMPTER_SCRIPT_ENV] !== undefined) return 'interactive';
  if (env[REQUIRE_TTY_ENV] === '1') return 'require-tty';
  if (env[NONINTERACTIVE_ENV] === '1') return 'bypass';
  return isTTY ? 'interactive' : 'bypass';
}

/** Loud, honest stderr notice when the approve gate auto-passes in a non-TTY. */
export const APPROVE_BYPASS_NOTICE =
  `note: non-TTY; approve gate auto-passed (set ${REQUIRE_TTY_ENV}=1 to restore the prompt)`;

/** Loud, honest stderr notice when the settle interactive-verdict walker is skipped. */
export const SETTLE_BYPASS_NOTICE =
  `note: non-TTY; interactive-verdict walker skipped (set ${REQUIRE_TTY_ENV}=1 to restore the prompt)`;
