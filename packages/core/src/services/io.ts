/**
 * Command-service I/O seam (phase 58).
 *
 * The curated CLI commands exposed over MCP (`progress`, `status`, `recommend`,
 * `draft new/check/approve`, `build task`, `settle`, `spec new/approve`) have
 * their logic factored into pure `*Service(repoRoot, args, io)` functions. The
 * CLI action wires `io` to the real process streams and exit code; the MCP tool
 * handler wires `io` to in-memory buffers and serializes the structured result.
 *
 * This keeps a single implementation behind both surfaces — the CLI remains the
 * rendering layer (byte-identical output), and MCP gets structured `data` plus
 * the captured human text. No service imports the MCP SDK, so the CLI hot path
 * never loads it (AC-7).
 */

/** A sink for a command's human-facing output, abstracted off `process`. */
export interface CommandIO {
  /** stdout-equivalent write (caller includes any trailing newline). */
  out(s: string): void;
  /** stderr-equivalent write (caller includes any trailing newline). */
  err(s: string): void;
}

/**
 * Structured result of a command service.
 * - `exitCode` mirrors the CLI exit code (0 ok, 1 refusal/error, 2 structural).
 * - `data` is the machine-readable payload surfaced as MCP `structuredContent`.
 */
export interface CommandResult {
  exitCode: number;
  data?: unknown;
}

/** `CommandIO` bound to the real process streams — used by the CLI actions. */
export function processIO(): CommandIO {
  return {
    out: (s) => void process.stdout.write(s),
    err: (s) => void process.stderr.write(s),
  };
}

/** A `CommandIO` that captures into strings — used by the MCP tool handlers. */
export interface BufferIO extends CommandIO {
  stdout(): string;
  stderr(): string;
}

export function bufferIO(): BufferIO {
  let out = '';
  let err = '';
  return {
    out: (s) => {
      out += s;
    },
    err: (s) => {
      err += s;
    },
    stdout: () => out,
    stderr: () => err,
  };
}
