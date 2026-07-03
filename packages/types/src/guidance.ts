/**
 * Canonical CADENCE command guidance — shared data (phase 77).
 *
 * Pure data, no logic / no I/O / no MCP SDK. The single source of truth for the
 * prose that drives both surfaces:
 *  - `cadence-host-claude-code` renders it into `.claude/commands/cadence-*.md`
 *  - the core MCP server exposes it as Prompts (`prompts/get`)
 *
 * Lives in `cadence-types` (not core) because host-claude-code already depends
 * on this package's value exports and none of core's — keeping the shared text
 * at the lowest common dependency without a host→core engine coupling.
 */

export interface CommandGuidance {
  /** One-line command description (slash-command frontmatter `description`). */
  description: string;
  /** Trailing next-step guidance rendered after the command body; '' = none. */
  trailing: string;
}

export const COMMAND_GUIDANCE = {
  'cadence-progress': {
    description: "Show CADENCE's next suggested action",
    trailing: 'Read the output above and take the suggested next step.',
  },
  'cadence-draft': {
    description: 'Scaffold a new DRAFT.md for a phase task',
    trailing: 'Open the new DRAFT.md and fill in summary, ACs, and tasks.',
  },
  'cadence-approve': {
    description: 'Approve a draft and enter BUILD',
    trailing: 'Loop is now in BUILD. Use /cadence-build to record task outcomes.',
  },
  'cadence-check': {
    description: 'Run structural coherence check on a draft',
    trailing: 'Address any issues reported before approving the draft.',
  },
  'cadence-build': {
    description: 'Record outcome of a build task',
    trailing: 'Continue with the next task or run /cadence-settle when done.',
  },
  'cadence-settle': {
    description: 'Close the loop and write SUMMARY',
    trailing: 'Review SUMMARY.md; loop is back to IDLE.',
  },
  'cadence-done': {
    description: 'Mark a task DONE (shortcut for build task --status=DONE)',
    trailing: 'Continue with the next task or run /cadence-settle when done.',
  },
  'cadence-block': {
    description: 'Mark a task BLOCKED (shortcut for build task --status=BLOCKED)',
    trailing: 'Record the blocker, then unblock or escalate before settling.',
  },
  'cadence-needs-context': {
    description: 'Mark a task NEEDS_CONTEXT (shortcut for build task --status=NEEDS_CONTEXT)',
    trailing: 'Supply the missing context, then re-run the task.',
  },
  'cadence-handoff': {
    description: 'Scaffold a SESSION handoff doc with machine facts pre-filled',
    trailing:
      'Open the new SESSION doc and fill the narrative sections (TL;DR, what landed, gotchas, next action).',
  },
  'cadence-resume': {
    description:
      'Replay the freshest session handoff (brief by default; --full adds live context, read-only)',
    trailing:
      'Read the replayed handoff and continue from the documented next action. Output is brief by default and auto-promotes to full on drift; run `cadence resume --full` for the whole doc + live context. If it notes other worktrees have resumable handoffs, ask which one to resume or pass `--pick <n>` directly.',
  },
  'cadence-scout': {
    description:
      'Divergent→convergent ideation dialogue that lands survivors as Praxis recommendations',
    trailing: '',
  },
} as const satisfies Record<string, CommandGuidance>;

/**
 * Canonical "mock is not real verification" notice (phase 104).
 *
 * Single source of truth for every surface that tells the operator the default
 * `mock` verifier is a placeholder, not real verification — the settle banner,
 * `cadence doctor`, `cadence init`, and `config explain` / `quickstart` all
 * render from this so the wording can't drift. Pure data, no logic.
 */
export const MOCK_VERIFIER_NOTICE = {
  /** Short inline label for headers / one-line warnings. */
  label: 'mock = not real verification',
  /** One-sentence canonical message naming mock a placeholder + the on-ramp. */
  message:
    'The `mock` verifier is a deterministic, offline placeholder that only checks each AC links to a test — it is NOT real verification. Run `cadence activate` to turn on a real AI verifier.',
  /** The command that turns on real verification. */
  activateHint: 'cadence activate',
} as const;

/**
 * Canonical "no test command configured" notice (phase 139,
 * rec-20260701-001). Single source of truth for the `build-test-must-pass`
 * gate's stderr notice — mirrors `MOCK_VERIFIER_NOTICE`'s pattern: loud but
 * non-blocking. A missing `testCommand` still lets the gate pass (it cannot
 * enforce what it can't run) but this makes that gap visible instead of
 * silent.
 */
export const NO_TEST_COMMAND_NOTICE = {
  /** Short inline label for headers / one-line warnings. */
  label: 'no test command configured',
  /** One-sentence canonical message naming the gap + the fix. */
  message:
    'no test command configured — build-test-must-pass cannot verify your tests ran; this settle will NOT confirm the suite passes. Set verification.testCommand in .cadence/config.json to enable real enforcement.',
} as const;

/**
 * The `cadence-scout` dialogue body. `$ARGUMENTS` is the topic placeholder —
 * the Claude-Code slash command leaves it literal (the host substitutes it);
 * the MCP prompt substitutes the caller's `topic` argument.
 */
export const SCOUT_DIALOGUE = [
  'You are running **CADENCE scout** — a divergent→convergent ideation',
  'dialogue that turns a fuzzy problem into ranked Praxis recommendations.',
  'Scout never drives the loop: it generates candidate directions and lands',
  'them in the recommendation ledger. It allocates no loop id, runs no gate,',
  'and never changes loop state.',
  '',
  '**Topic:** $ARGUMENTS — if empty, ask the user what space to scout.',
  '',
  'The ranked recommendations above (`!cadence recommend`) are your',
  "orientation: don't re-propose work already captured or in flight.",
  '',
  'Before landing anything, mint **one** scout-session id for this run in the',
  'form `scout-YYYYMMDD-HHMM` (use the current date + time). Pass it as',
  '`--scout-id` on every rec you land so the whole session is queryable as a',
  'cluster later via `cadence recommend --scout-id <id>`.',
  '',
  '1. **Diverge.** Generate many candidate directions for the topic —',
  '   breadth first, no commitment, no filtering yet. Aim wide.',
  '2. **Converge.** Triage *with the user* down to the few worth keeping;',
  '   drop duplicates of existing recs and merge near-duplicates.',
  '3. **Land.** For each survivor run:',
  '   `cadence recommendation add --title "<title>" --readiness raw-idea',
  '   --scout-id <scout-YYYYMMDD-HHMM>',
  '   --evidence "Generated in /cadence-scout session on <topic>, <date>;',
  '   siblings: <other rec ids>"` — use `--readiness needs-evidence` when the',
  '   candidate is already well-formed.',
  '4. **Hand back.** Point the user at `cadence recommend` to re-rank, then',
  '   the existing rec → milestone → SPEC export path. Scout stops here.',
].join('\n');
