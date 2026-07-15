import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import type { ZodType } from 'zod/v4';
import { discoverKey } from '../activate/key-discovery.js';
import { getLogger } from '../logging/logger.js';
import { runWithRepair, type RepairMessage } from './json-repair.js';

/** Which host CLI's headless-mode flags/output shape to use. */
export type HostCliFamily = 'claude' | 'codex';

/**
 * Minimal shape of a spawned child process this module needs — narrowed from
 * `node:child_process`'s `ChildProcess` to just the events/streams we
 * consume, so tests can inject a lightweight fake instead of implementing
 * the full `ChildProcess` interface.
 *
 * `kill` is deliberately **optional** (Phase 178 T3), not required: this
 * interface is imported by two test files outside this task's file boundary
 * (`packages/core/tests/verify/per-task.test.ts`,
 * `packages/core/tests/verify/json-repair.test.ts`) whose fake process
 * objects predate the timeout guard and do not implement `kill`. Making it
 * required would break those files' typecheck. Real spawned processes
 * (`realSpawn`, below) structurally satisfy the optional method fine via
 * Node's actual `ChildProcess.kill`; the timeout logic calls it defensively
 * (`child.kill?.(...)`) rather than assuming it exists.
 */
export interface SpawnedProcessLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'error', listener: (err: NodeJS.ErrnoException) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
  kill?(signal?: NodeJS.Signals): boolean;
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

/**
 * Phase 178 T1 — one-time-per-process quota-transparency notice. A module-
 * level flag is the simplest correct "once per process" implementation
 * (mirrors a real Node process's lifetime); test files that `vi.resetModules()`
 * naturally get a fresh flag too.
 *
 * This is deliberately an unconditional, direct `process.stderr.write` —
 * mirroring the loud `MOCK_FALLBACK_BANNER` convention in
 * `verifier-factory.ts` — rather than routed through `getLogger()`, whose
 * `warn`/`debug` levels are silent by default (`resolveLogLevel`'s
 * `env > config > 'silent'` fallback) and would make this transparency
 * notice invisible in the common case. `getLogger()` is still used
 * elsewhere in this file for the existing debug/warn structured-logging
 * seam; this notice is a separate, always-visible user-facing disclosure,
 * not a diagnostic.
 */
let quotaNoticeEmitted = false;

const QUOTA_NOTICE = [
  '',
  '  ⚠  HOST-CLI PROVIDER: SUBSCRIPTION QUOTA IN USE',
  '     This verification call runs through your host CLI\'s own',
  '     subscription/usage quota — not a separately metered API key.',
  '',
].join('\n');

/** Emits {@link QUOTA_NOTICE} to stderr exactly once per process, the first
 *  time a real host-cli subprocess is about to be spawned. Config selection
 *  of the `host-cli` provider alone never triggers this — only an actual
 *  spawn attempt does. */
function emitQuotaNoticeOnce(): void {
  if (quotaNoticeEmitted) return;
  quotaNoticeEmitted = true;
  process.stderr.write(QUOTA_NOTICE);
}

export type HostCliErrorReason =
  | 'not-found'
  | 'spawn-error'
  | 'nonzero-exit'
  | 'output-error'
  | 'self-invocation'
  | 'timeout'
  | 'aborted';

/**
 * Phase 178 T2 — per-family session environment variable that reliably
 * indicates "this process is already running inside a headless/non-
 * interactive session of this host CLI family", confirmed against each
 * family's *official* docs before wiring (never guessed):
 *
 * - `claude`: `CLAUDECODE` — documented at
 *   https://code.claude.com/docs/en/env-vars: "Set to `1` in subprocesses
 *   Claude Code spawns (Bash and PowerShell tools, tmux sessions, hook
 *   commands, status line commands, stdio MCP server subprocesses). IDE
 *   extensions also set this in their integrated terminals." This is exactly
 *   the self-invocation shape AC-2 guards against — a `cadence` process
 *   already running as (or under) a Claude Code subprocess would inherit
 *   `CLAUDECODE=1`.
 * - `codex`: deliberately **not** detected. The only candidate found,
 *   `CODEX_SANDBOX` (`=seatbelt`), is undocumented in OpenAI's official
 *   Codex CLI docs (`developers.openai.com/codex/environment-variables`
 *   lists no session-indicator variable at all) and is narrower than a
 *   family-wide session signal even where it does appear — it is only set
 *   when the macOS Seatbelt sandbox backend is in use, not on Linux/other
 *   sandbox modes, and not universally for every `codex exec` invocation.
 *   Guessing it here would risk exactly the false-negative/false-positive
 *   failure modes this task exists to avoid. Left unguarded; see
 *   `docs/providers.md`.
 */
const SELF_INVOCATION_ENV_VAR: Partial<Record<HostCliFamily, string>> = {
  claude: 'CLAUDECODE',
};

/** True when the family's documented session env var is set on the *current*
 *  invoking process — i.e. cadence itself is already running inside a
 *  headless session of the same host-CLI family it is about to spawn. */
function isSelfInvocation(family: HostCliFamily, env: NodeJS.ProcessEnv): boolean {
  const varName = SELF_INVOCATION_ENV_VAR[family];
  if (!varName) return false;
  return env[varName] === '1';
}

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
  /** Test seam for the self-invocation guard; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /**
   * Phase 178 T3 — subprocess spawn timeout override (ms), test-injectable so
   * tests never sleep for the real duration. Falls back to
   * {@link TIMEOUT_ENV_VAR} (env or `.env`, via the existing `discoverKey`
   * seam) then {@link DEFAULT_TIMEOUT_MS} when unset. If the spawned host-CLI
   * subprocess neither closes stdout nor exits before this elapses, it is
   * killed and `spawnCapture` rejects with `HostCliError({ reason: 'timeout' })`.
   */
  timeoutMs?: number;
  /**
   * Phase 184 T1 — optional external cancellation signal, e.g. one a caller
   * builds itself via `AbortSignal.timeout(ms)` (a web/Node-standard API;
   * this module never constructs one on the caller's behalf — see the phase
   * boundary in DESIGN.md/the DRAFT). When it fires before the subprocess
   * settles, the spawned child is killed and `spawnCapture` rejects with
   * `HostCliError({ reason: 'aborted' })` — distinct from the internal
   * {@link timeoutMs} guard's `'timeout'` reason. A signal that is already
   * aborted before the call starts is honored immediately, without spawning
   * a child. Omitting this keeps today's behavior byte-identical.
   */
  signal?: AbortSignal;
  /**
   * Phase 184 T1 — optional per-call trace identifier, threaded into the
   * structured logger's child context (`callOnce`'s
   * `getLogger().child({...})`) so this call's log lines can be correlated
   * with a caller's own tracing. Purely observational: never sent to the
   * spawned subprocess and never affects behavior. Omitted from the logger
   * context entirely when unset, matching this file's existing
   * conditional-field convention.
   */
  traceId?: string;
}

/**
 * Phase 178 T3 — env var name for the spawn-timeout default, discovered the
 * same way `CADENCE_HOST_CLI_BIN` is in `verifier-factory.ts` (env, then a
 * `.env` file at `process.cwd()`).
 */
const TIMEOUT_ENV_VAR = 'CADENCE_HOST_CLI_TIMEOUT_MS';

/**
 * Default subprocess spawn timeout (ms) when neither `timeoutMs` nor
 * `CADENCE_HOST_CLI_TIMEOUT_MS` is set. A real headless host-CLI verification
 * call (spawning the user's own `claude`/`codex` binary, which may itself
 * call out to a model) can legitimately take tens of seconds — 3 minutes
 * gives real slow-but-working calls plenty of room while still bounding the
 * "Known limitation" hang (`docs/providers.md`) to something well short of a
 * stuck CI job.
 */
const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Resolves the effective spawn timeout: an explicit per-call `override` wins;
 * otherwise `CADENCE_HOST_CLI_TIMEOUT_MS` (env/`.env`); otherwise
 * {@link DEFAULT_TIMEOUT_MS}. A non-numeric or non-positive env value is
 * treated as unset rather than producing a zero/NaN timeout.
 */
function resolveTimeoutMs(override: number | undefined, env: NodeJS.ProcessEnv): number {
  if (override !== undefined) return override;
  const raw = discoverKey(TIMEOUT_ENV_VAR, env, process.cwd()).value;
  if (raw === undefined) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
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

/**
 * Spawns `bin args…`, captures stdout/stderr, and settles on process exit —
 * or on the Phase 178 T3 spawn timeout, or the Phase 184 T1 external
 * `signal` firing, whichever comes first.
 *
 * `settled` guards against a double-settle race: the timeout timer, the
 * abort listener, and the child's `error`/`close` listeners can each attempt
 * to resolve/reject this promise, but only the first should win, and the
 * timeout timer + abort listener must both be torn down on *every* other
 * path (resolve, reject-via-timeout, reject-via-abort, reject-via-error) so
 * neither fires spuriously after the promise has already settled and
 * neither leaves a dangling timer/listener alive past this call.
 */
function spawnCapture(
  spawnImpl: SpawnFn,
  bin: string,
  args: string[],
  family: HostCliFamily,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      // Already aborted before this call even started: honor it immediately
      // and never spawn a doomed child.
      reject(
        new HostCliError(
          `host-cli provider: "${bin}" call aborted before the subprocess was spawned`,
          'aborted',
        ),
      );
      return;
    }
    if (isSelfInvocation(family, env)) {
      reject(
        new HostCliError(
          `host-cli provider: refusing to spawn "${bin}" — cadence is already running inside a ` +
            `headless "${family}" session (detected via ${SELF_INVOCATION_ENV_VAR[family]}=1). ` +
            'Spawning another headless call here risks an unbounded nested self-invocation of the ' +
            'same host CLI. Falling back to mock for this call.',
          'self-invocation',
        ),
      );
      return;
    }
    emitQuotaNoticeOnce();
    let child: SpawnedProcessLike;
    try {
      child = spawnImpl(bin, args);
    } catch (err) {
      reject(toHostCliError(bin, err));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      child.kill?.('SIGKILL');
      reject(
        new HostCliError(
          `host-cli provider: "${bin}" call aborted via external AbortSignal — the subprocess was killed.`,
          'aborted',
        ),
      );
    };
    signal?.addEventListener('abort', onAbort);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      child.kill?.('SIGKILL');
      reject(
        new HostCliError(
          `host-cli provider: "${bin}" timed out after ${timeoutMs}ms without closing stdout or exiting ` +
            `(the spawned host-CLI subprocess's documented "never exits" limitation — see docs/providers.md) ` +
            '— the subprocess was killed.',
          'timeout',
        ),
      );
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(toHostCliError(bin, err));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
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
  o: {
    bin: string;
    family: HostCliFamily;
    model: string | undefined;
    spawnImpl: SpawnFn;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    signal?: AbortSignal;
    traceId?: string;
  },
  messages: RepairMessage[],
): Promise<string> {
  const prompt = flattenMessages(messages);
  const args = buildInvocation(o, prompt);
  const log = getLogger().child({
    seam: 'verify',
    provider: 'host-cli',
    bin: o.bin,
    family: o.family,
    ...(o.traceId !== undefined ? { traceId: o.traceId } : {}),
  });
  log.debug('verify request', { bin: o.bin, family: o.family });

  const { stdout } = await spawnCapture(o.spawnImpl, o.bin, args, o.family, o.env, o.timeoutMs, o.signal);

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
  const env = o.env ?? process.env;
  const timeoutMs = resolveTimeoutMs(o.timeoutMs, env);

  return runWithRepair({
    system: o.system,
    user: o.user,
    schema: o.schema,
    maxRepairRetries: MAX_REPAIR_RETRIES,
    transport: (messages) =>
      callOnce(
        {
          bin,
          family,
          model: o.model,
          spawnImpl,
          env,
          timeoutMs,
          ...(o.signal ? { signal: o.signal } : {}),
          ...(o.traceId !== undefined ? { traceId: o.traceId } : {}),
        },
        messages,
      ),
    buildError: (lastError, retries) =>
      `host-cli provider: model output failed JSON/schema validation after ${retries} repair retries (bin=${bin}, family=${family}): ${lastError}`,
  });
}
