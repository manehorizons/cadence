import type { Command } from 'commander';
import { processIO, type CommandIO, type CommandResult } from '../../services/io.js';

/**
 * `cadence explain [concept]` — in-CLI concept help (phase 64).
 *
 * Prints curated, terminal-sized explanations of CADENCE's core concepts so a
 * user can learn the model without leaving the terminal or depending on the
 * `docs/` tree being shipped with the package. Content is **embedded** here
 * (distilled from `docs/concepts.md`), never read from disk at runtime, so it
 * works identically from any install. `explain.test.ts` AC-5 guards that every
 * advertised concept keeps non-empty content — the in-repo analog of the
 * `commands.md` drift guard.
 */

/** A single explainable concept: a one-line list blurb + the full body text. */
export interface Concept {
  /** One-line summary shown in the discovery list. */
  blurb: string;
  /** The full explanation printed for `cadence explain <name>`. */
  body: string;
}

/**
 * The canonical concept registry. Keys are the canonical names advertised in
 * the list; aliases resolve to these via {@link ALIASES}.
 */
export const CONCEPTS: Record<string, Concept> = {
  loop: {
    blurb: 'The DRAFT→BUILD→SETTLE cycle every unit of work moves through.',
    body: [
      'The loop',
      '',
      '  IDLE → [SPEC] → DRAFT → BUILD → SETTLE → IDLE',
      '',
      'Every unit of work moves through three core positions (SPEC is optional):',
      '',
      '  DRAFT   You (or the AI) write a structured plan — the DRAFT — listing what',
      '          changes (files per task), what success looks like (acceptance',
      '          criteria AC-N), and how large the work is (tier). CADENCE',
      '          coherence-checks it, then advances to BUILD on approve.',
      '',
      '  BUILD   The AI executes tasks one by one, each marked DONE / BLOCKED /',
      '          NEEDS_CONTEXT. Progress persists continuously, so the loop',
      '          survives session restarts.',
      '',
      '  SETTLE  `cadence settle run` runs the gate set, emits anomaly events, and',
      '          writes the SUMMARY pair before returning to IDLE.',
      '',
      'SPEC is an opt-in stage before DRAFT for locking down *what* a phase',
      'delivers before planning *how*. Artifacts live under',
      '`.cadence/phases/<phase>/<id>-{DRAFT,PROGRESS,SUMMARY,...}`.',
      '',
      'See also: cadence explain tiers, gates, profiles · docs/concepts.md',
    ].join('\n'),
  },
  gates: {
    blurb: 'The 13 quality checks that fire across the loop, by cost band.',
    body: [
      'Gates',
      '',
      'CADENCE has 13 gates: 3 that always fire and 10 delta gates added per',
      '(profile × tier) cell. Which fire is decided in gates/engine.ts; the full',
      'matrix lives in docs/concepts.md.',
      '',
      'Always-fire (free, every phase):',
      '  coherence-check       DRAFT frontmatter consistency (tier vs counts, AC format)',
      '  structural-verifier   every task in a terminal state before settle',
      '  build-test-must-pass  configured test command must exit 0 at settle',
      '',
      'Delta gates by cost band (added on top of always-fire):',
      '  cheap      draft-read · test-coverage · anomaly-notify',
      '  medium     approve · per-task-verify · code-review',
      '  expensive  deep-verify · interactive-verdict · plan-review · security-audit',
      '',
      'Most gates have a per-invocation bypass flag (e.g. --allow-missing-coverage,',
      '--no-approve, --force) for CI / non-TTY / deliberate overrides.',
      '',
      'See also: cadence explain profiles, tiers · docs/concepts.md (gate matrix)',
    ].join('\n'),
  },
  tiers: {
    blurb: 'The phase-size axis (quick-fix / standard / complex) that scales gate work.',
    body: [
      'Tiers',
      '',
      'A tier is the phase-size axis. The AI proposes one in the DRAFT frontmatter;',
      'the coherence check verifies it against the task count and touched-file count.',
      '',
      '  quick-fix   ≤ 1 task,  ≤ 1 file',
      '  standard    ≤ 5 tasks, ≤ 8 files',
      '  complex     ≥ 6 tasks, any number of files',
      '',
      'Larger tiers pull in more gate work (see cadence explain gates). The tier',
      'combines with the profile (user-involvement axis) to select the effective',
      'gate set for the phase.',
      '',
      'See also: cadence explain profiles, gates · docs/concepts.md (profiles × tiers)',
    ].join('\n'),
  },
  profiles: {
    blurb: 'The user-involvement axis (strict / standard / auto) that sets gating posture.',
    body: [
      'Profiles',
      '',
      'A profile is the user-involvement axis. Set it project-wide in',
      '.cadence/config.json (`profile`) or override per-phase in DRAFT frontmatter.',
      '',
      '  strict     Full control — every step is a checkpoint.',
      '  standard   Major-step gating — approve at DRAFT + verify at settle.',
      '  auto       Hands-off — the AI drives; anomalies surface automatically.',
      '',
      'Profile combines with tier (phase-size axis) to select the gate set. Note',
      'the auto × complex cell is soft-capped: CADENCE refuses to approve/settle',
      'it by default (high blast radius, no supervision) unless you pass',
      '--allow-auto-complex.',
      '',
      'See also: cadence explain tiers, gates · docs/concepts.md (profiles × tiers)',
    ].join('\n'),
  },
};

/** Aliases → canonical concept name. Lookup is also case-insensitive. */
const ALIASES: Record<string, string> = {
  gate: 'gates',
  tier: 'tiers',
  profile: 'profiles',
  loops: 'loop',
};

/** Resolve a user-supplied name (alias + case insensitive) to a canonical key, or null. */
function resolve(input: string): string | null {
  const key = input.trim().toLowerCase();
  if (key in CONCEPTS) return key;
  if (key in ALIASES) return ALIASES[key]!;
  return null;
}

/** Tiny Levenshtein distance for the did-you-mean nudge (no new dependency). */
function distance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const row: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!;
      row[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, row[j]!, row[j - 1]!) + 1;
      prev = tmp;
    }
  }
  return row[n]!;
}

/** Nearest canonical concept to an unknown input, if reasonably close. */
function nearest(input: string): string | null {
  const key = input.trim().toLowerCase();
  let best: string | null = null;
  let bestD = Infinity;
  for (const name of Object.keys(CONCEPTS)) {
    const d = distance(key, name);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  // Only suggest when the edit distance is small relative to the word.
  return best !== null && bestD <= Math.max(2, Math.ceil(best.length / 2)) ? best : null;
}

/** Render the discovery list of concepts with their blurbs. */
function renderList(io: CommandIO): void {
  io.out('Concepts you can explain:\n\n');
  const width = Math.max(...Object.keys(CONCEPTS).map((n) => n.length));
  for (const [name, concept] of Object.entries(CONCEPTS)) {
    io.out(`  ${name.padEnd(width)}  ${concept.blurb}\n`);
  }
  io.out('\nRun `cadence explain <concept>` for the full explanation.\n');
}

/**
 * Run the explain command. Pure over its `io` sink (no process access, no file
 * I/O), so the same path serves the CLI and tests.
 */
export function runExplain(args: { concept?: string }, io: CommandIO): CommandResult {
  const requested = args.concept;
  if (requested === undefined || requested.trim() === '') {
    renderList(io);
    return { exitCode: 0, data: { concepts: Object.keys(CONCEPTS) } };
  }

  const canonical = resolve(requested);
  if (canonical === null) {
    io.err(`No such concept: ${requested}\n`);
    const guess = nearest(requested);
    if (guess !== null) io.err(`Did you mean \`${guess}\`?\n`);
    io.err('\n');
    renderList(io);
    return { exitCode: 1, data: { unknown: requested } };
  }

  io.out(`${CONCEPTS[canonical]!.body}\n`);
  return { exitCode: 0, data: { concept: canonical } };
}

export function registerExplainCommand(program: Command): void {
  program
    .command('explain')
    .argument('[concept]', 'concept to explain (loop | gates | tiers | profiles)')
    .description('Print an in-terminal explanation of a CADENCE concept')
    .action((concept: string | undefined) => {
      const res = runExplain(concept === undefined ? {} : { concept }, processIO());
      process.exitCode = res.exitCode;
    });
}
