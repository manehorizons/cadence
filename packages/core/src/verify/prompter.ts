import { createInterface, type Interface } from 'node:readline/promises';

/**
 * Abstract one-line prompt. `ask(question)` writes the question to the output
 * stream and resolves with the user's reply (without trailing newline).
 *
 * Production: `StdinPrompter` over `readline/promises`. Tests: `ScriptedPrompter`.
 */
export interface Prompter {
  ask(question: string): Promise<string>;
  close?(): Promise<void> | void;
}

export interface StdinPrompterOptions {
  input?: NodeJS.ReadableStream & { isTTY?: boolean };
  output?: NodeJS.WritableStream;
}

/**
 * Real prompter backed by stdin/stdout. Refuses to construct when the input
 * stream is not a TTY (CI, piped invocations) — the caller must bypass via
 * `--no-interactive` or fall through to other gates.
 */
export class StdinPrompter implements Prompter {
  private readonly rl: Interface;

  constructor(opts: StdinPrompterOptions = {}) {
    const input = opts.input ?? (process.stdin as NodeJS.ReadableStream & { isTTY?: boolean });
    const output = opts.output ?? process.stdout;
    if (input === process.stdin && !process.stdin.isTTY) {
      throw new Error(
        'StdinPrompter: stdin is not a TTY. Use --no-interactive to bypass or pipe answers via a scripted prompter.',
      );
    }
    this.rl = createInterface({ input, output });
  }

  async ask(question: string): Promise<string> {
    const answer = await this.rl.question(question);
    return answer;
  }

  close(): void {
    this.rl.close();
  }
}

/**
 * Deterministic prompter for tests. Returns pre-seeded answers in order;
 * throws on exhaustion so tests fail fast when the prompt count drifts.
 */
export class ScriptedPrompter implements Prompter {
  private cursor = 0;
  constructor(private readonly answers: string[]) {}

  async ask(_question: string): Promise<string> {
    if (this.cursor >= this.answers.length) {
      throw new Error(
        `ScriptedPrompter exhausted after ${this.answers.length} answer(s). Last question: ${_question}`,
      );
    }
    const answer = this.answers[this.cursor]!;
    this.cursor += 1;
    return answer;
  }

  /** Indexed for assertions. */
  get used(): number {
    return this.cursor;
  }
}

/**
 * Shared prompter factory: `CADENCE_PROMPTER_SCRIPT` (newline-separated
 * answers) selects a deterministic `ScriptedPrompter` for tests/automation;
 * otherwise a real `StdinPrompter` (which itself throws off a non-TTY).
 * Phase 174: extracted from two previously-independent, near-identical
 * copies — an inline closure in `settle.ts`'s `prompter.create` and
 * `handoff/run-resume.ts`'s private `buildPrompter()` (which was already
 * commented "mirrors settle.ts's seam exactly") — into the one place that
 * already owns `Prompter`/`ScriptedPrompter`/`StdinPrompter`, so a third
 * caller (the retro issue offer) doesn't need a fourth copy.
 *
 * Known limitation (Phase 174 whole-branch review): each call builds a
 * brand-new `ScriptedPrompter` starting at answer-list position 0. A single
 * `cadence settle` run can now call this twice — once for the
 * interactive-verdict gate (`gates/interactive.ts`, when the active gate set
 * includes it, e.g. `strict` profile), once for the post-commit retro issue
 * offer (`services/retro.ts`'s `runRetroOffer`) — and under
 * `CADENCE_PROMPTER_SCRIPT`, the second call does NOT continue from where
 * the first left off; it re-reads from the start. Real `StdinPrompter` usage
 * (an actual human at an actual terminal) is unaffected — this only bites
 * the scripted/test-automation seam. The failure mode is fail-safe: a
 * mismatched scripted answer just exhausts `askRetroIssueVerdict`'s retries
 * and defaults to a quiet decline, never a crash or a wrongly-filed issue.
 * A real fix (one memoized `Prompter` shared across a whole settle run)
 * needs matching close()-lifecycle changes in every existing caller
 * (`gates/approve.ts`, `gates/interactive.ts` already call `.close()` after
 * their own use) and was judged out of this phase's scope — a scripted test
 * or CI script driving both an interactive-verdict gate AND a friction-
 * having retro offer in the same run must currently script the SAME
 * expected answer twice (once for each independent call), not two
 * sequential distinct answers.
 */
// deja:new consolidating settle.ts's inline prompter.create closure and run-resume.ts's private buildPrompter into this one shared factory (phase 174 T6) — this IS the fix for that pre-existing duplication, not a new instance of it
export function createDefaultPrompter(): Prompter {
  const scripted = process.env.CADENCE_PROMPTER_SCRIPT;
  if (scripted !== undefined) {
    const answers = scripted.split('\n').filter((s) => s.length > 0 || s === '');
    return new ScriptedPrompter(answers);
  }
  return new StdinPrompter();
}
