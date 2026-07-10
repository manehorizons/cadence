import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import type { ZodType } from 'zod/v4';
import { getLogger } from '../logging/logger.js';
import { runWithRepair, type RepairMessage } from './json-repair.js';

/** Which host CLI's headless-mode flags/output shape to use. */
export type HostCliFamily = 'claude' | 'codex';

/**
 * Minimal shape of a spawned child process this module needs — narrowed from
 * `node:child_process`'s `ChildProcess` to just the events/streams we
 * consume, so tests can inject a lightweight fake instead of implementing
 * the full `ChildProcess` interface.
 */
export interface SpawnedProcessLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'error', listener: (err: NodeJS.ErrnoException) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
}

/** Test seam / real implementation signature: spawn `bin args…`, return the process. */
export type SpawnFn = (bin: string, args: string[]) => SpawnedProcessLike;

/**
 * Real spawn implementation. Piped stdio only (`['ignore', 'pipe', 'pipe']`)
 * — never `'inherit'`, which is reserved for the interactive `init`/`start`
 * launcher use case elsewhere in this codebase. Stdin is ignored (not piped)
 * so a host CLI that opportunistically reads stdin when it isn't a TTY sees
 * an immediate EOF instead of hanging.
 */
const realSpawn: SpawnFn = (bin, args) =>
  spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

export type HostCliErrorReason =
  | 'not-found'
  | 'spawn-error'
  | 'nonzero-exit'
  | 'output-error';

/**
 * Distinguishable error type for host-cli spawn/output failures. This is the
 * "clear, typed rejection" T3 (loud fallback to mock when the binary is
 * missing/unauthenticated) is expected to catch and pattern-match on
 * `reason`; T2's job is only to guarantee failures surface this way instead
 * of hanging or being silently swallowed — see CLAUDE.md's "Quiet Fallback"
 * failure mode.
 */
export class HostCliError extends Error {
  readonly reason: HostCliErrorReason;

  constructor(message: string, reason: HostCliErrorReason, options?: { cause?: unknown }) {
    super(message);
    this.name = 'HostCliError';
    this.reason = reason;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export interface HostCliJSONOptions<T> {
  /** Host CLI binary name or path, e.g. `"claude"` or `"/usr/local/bin/codex"`. Defaults to `"claude"`. */
  bin?: string;
  /** Explicit CLI family for flag/output-shape selection; inferred from `bin`'s basename when omitted. */
  family?: HostCliFamily;
  /** Optional model flag; omitted entirely (host CLI uses its own default) when unset. */
  model?: string;
  system: string;
  user: string;
  schema: ZodType<T>;
  /** Test seam; defaults to a real `node:child_process.spawn` wrapper with piped stdio. */
  spawnImpl?: SpawnFn;
}

/** Initial call + this many repair retries before throwing. */
const MAX_REPAIR_RETRIES = 2;

/**
 * Host CLIs' headless/print modes take a single prompt string, not a chat
 * message array the way an HTTP chat-completions endpoint does. Flatten the
 * repair-harness's role-labeled messages (system, user, and any
 * assistant/user repair turns `runWithRepair` appends) into role-labeled
 * sections, in order, joined by blank lines — a simple, legible strategy
 * that preserves the full repair context in a single invocation.
 */
function flattenMessages(messages: RepairMessage[]): string {
  return messages.map((m) => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n');
}

/** Infers the CLI family from the configured binary's basename (case-insensitive). */
function inferFamily(bin: string): HostCliFamily {
  return basename(bin).toLowerCase().includes('codex') ? 'codex' : 'claude';
}

/**
 * Builds the headless/non-interactive spawn invocation for a given family.
 *
 * `claude`: empirically verified against the real binary (2026-07-10) —
 * `claude -p "<prompt>" --output-format json [--model <model>]` prints a
 * single JSON envelope to stdout with a string `result` field holding the
 * model's final text.
 *
 * `codex`: also empirically verified against the real binary (2026-07-10) —
 * `codex exec --json --skip-git-repo-check [-m <model>] "<prompt>"` prints
 * JSONL events to stdout; the model's final text is the `text` field of the
 * last `{"type":"item.completed","item":{"type":"agent_message",...}}`
 * event. `--skip-git-repo-check` avoids a hard failure when the verifier
 * runs outside a git repository; it is a no-op inside one. Both flag choices
 * were spiked directly against installed `claude`/`codex` binaries in this
 * session, not guessed from `--help` alone.
 */
function buildInvocation(
  o: { bin: string; family: HostCliFamily; model: string | undefined },
  prompt: string,
): string[] {
  if (o.family === 'codex') {
    const args = ['exec', '--json', '--skip-git-repo-check'];
    if (o.model) args.push('-m', o.model);
    args.push(prompt);
    return args;
  }
  const args = ['-p', prompt, '--output-format', 'json'];
  if (o.model) args.push('--model', o.model);
  return args;
}

function toHostCliError(bin: string, err: unknown): HostCliError {
  const errno = err as NodeJS.ErrnoException;
  if (errno?.code === 'ENOENT') {
    return new HostCliError(
      `host-cli provider: binary "${bin}" not found on PATH`,
      'not-found',
      { cause: err },
    );
  }
  return new HostCliError(
    `host-cli provider: failed to spawn "${bin}": ${err instanceof Error ? err.message : String(err)}`,
    'spawn-error',
    { cause: err },
  );
}

/** Spawns `bin args…`, captures stdout/stderr, and settles on process exit. */
function spawnCapture(
  spawnImpl: SpawnFn,
  bin: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let child: SpawnedProcessLike;
    try {
      child = spawnImpl(bin, args);
    } catch (err) {
      reject(toHostCliError(bin, err));
      return;
    }

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      reject(toHostCliError(bin, err));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new HostCliError(
            `host-cli provider: "${bin}" exited with code ${code ?? 'null'}${
              stderr.trim() ? `: ${stderr.trim()}` : ''
            }`,
            'nonzero-exit',
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

/** Parses `codex exec --json`'s JSONL stdout, returning the last agent_message's text. */
function extractCodexText(stdout: string, bin: string): string {
  let lastText: string | undefined;
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let evt: unknown;
    try {
      evt = JSON.parse(trimmed);
    } catch {
      continue; // codex may interleave non-JSON diagnostic lines; ignore them
    }
    const e = evt as { type?: string; item?: { type?: string; text?: string } };
    if (e.type === 'item.completed' && e.item?.type === 'agent_message' && typeof e.item.text === 'string') {
      lastText = e.item.text;
    }
  }
  if (lastText === undefined) {
    throw new HostCliError(
      `host-cli provider: "${bin}" produced no agent_message output to parse`,
      'output-error',
    );
  }
  return lastText;
}

/** Parses `claude -p --output-format json`'s single JSON envelope, returning its `result` string. */
function extractClaudeText(stdout: string, bin: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new HostCliError(
      `host-cli provider: "${bin}" stdout was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      'output-error',
    );
  }
  const envelope = parsed as { is_error?: boolean; result?: unknown; subtype?: string };
  if (envelope.is_error) {
    throw new HostCliError(
      `host-cli provider: "${bin}" reported an error (subtype=${envelope.subtype ?? 'unknown'}): ${
        typeof envelope.result === 'string' ? envelope.result : JSON.stringify(envelope.result)
      }`,
      'output-error',
    );
  }
  if (typeof envelope.result !== 'string') {
    throw new HostCliError(
      `host-cli provider: "${bin}" JSON envelope missing a string "result" field`,
      'output-error',
    );
  }
  return envelope.result;
}

async function callOnce(
  o: { bin: string; family: HostCliFamily; model: string | undefined; spawnImpl: SpawnFn },
  messages: RepairMessage[],
): Promise<string> {
  const prompt = flattenMessages(messages);
  const args = buildInvocation(o, prompt);
  const log = getLogger().child({ seam: 'verify', provider: 'host-cli', bin: o.bin, family: o.family });
  log.debug('verify request', { bin: o.bin, family: o.family });

  const { stdout } = await spawnCapture(o.spawnImpl, o.bin, args);

  try {
    const text = o.family === 'codex' ? extractCodexText(stdout, o.bin) : extractClaudeText(stdout, o.bin);
    log.debug('verify response', {});
    return text;
  } catch (err) {
    log.warn('verify error', { bin: o.bin, error: err instanceof Error ? err.name : 'unknown' });
    throw err;
  }
}

/**
 * Runs a headless host-CLI (`claude`/`codex`) subprocess and coerces its
 * output into a schema-valid verdict via the shared, transport-agnostic
 * repair-retry harness (`runWithRepair`, extracted in a prior task). Mirrors
 * `localChatJSON`'s shape exactly — same `system`/`user`/`schema` inputs,
 * same repair-retry budget — the only new transport-specific code is the
 * subprocess spawn/capture in this file, matching `local-client.ts`'s
 * fetch-based `callOnce`.
 *
 * Spawn/output failures (binary not found, non-zero exit, unparseable
 * output) reject with a `HostCliError` rather than being caught here — a
 * later task's loud mock-fallback wiring is expected to catch it.
 */
export async function hostCliJSON<T>(o: HostCliJSONOptions<T>): Promise<T> {
  const bin = o.bin ?? 'claude';
  const family = o.family ?? inferFamily(bin);
  const spawnImpl = o.spawnImpl ?? realSpawn;

  return runWithRepair({
    system: o.system,
    user: o.user,
    schema: o.schema,
    maxRepairRetries: MAX_REPAIR_RETRIES,
    transport: (messages) => callOnce({ bin, family, model: o.model, spawnImpl }, messages),
    buildError: (lastError, retries) =>
      `host-cli provider: model output failed JSON/schema validation after ${retries} repair retries (bin=${bin}, family=${family}): ${lastError}`,
  });
}
