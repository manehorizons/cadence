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
