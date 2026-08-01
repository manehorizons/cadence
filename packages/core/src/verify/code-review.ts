import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import type { AcceptanceCriterion, Finding, Task } from '@manehorizons/cadence-types';
import { hostCliJSON, type SpawnFn } from './host-cli-client.js';
import { localChatJSON } from './local-client.js';

/**
 * Phase 24.3 — code-review verifier. Per-file findings against the phase
 * diff. Fires at `cadence settle run` when `'code-review'` is in the
 * effective gate set (strict×standard, strict×complex, standard×complex).
 * HIGH findings refuse settle unless `--force` / `--allow-code-review-failure`.
 *
 * Phase 236 (T5, D9) — `Finding` is the shared, persisted SUMMARY-schema type
 * from `@manehorizons/cadence-types` (severity `critical|high|medium|low`,
 * plus the optional `id`/`target`/`disposition`/`waiver`/`anchor` fields).
 * This module used to declare its own local `Finding`/`FindingSeverity`
 * (severity `high|medium|low` only) — that divergence is now converged; see
 * `contracts/index.ts`'s `CodeReviewFinding` re-export for the compat name.
 */

/**
 * Phase 235 (T3) — a task->AC ref as seen by the review verifier: what a task
 * touches, how it is verified, and which AC it claims to satisfy. A `Pick`
 * over the DRAFT's own `Task` shape (`@manehorizons/cadence-types`) rather
 * than a restated structural type, so it cannot drift from the schema.
 */
export type CodeReviewTaskRef = Pick<Task, 'id' | 'files' | 'verify' | 'done' | 'status'>;

export interface CodeReviewInput {
  /** Touched files (from draft tasks). Used to scope diff parsing + Anthropic prompt. */
  files: string[];
  /** Unified diff (`git diff HEAD -- <files>`). May be empty. */
  diff: string;
  /**
   * Phase 235 (T3) — the DRAFT's acceptance criteria (`id`, `name`, `given`,
   * `when`, `then`), so the reviewer can see what the phase committed to
   * rather than grading against general good practice alone. Additive and
   * optional: existing callers and all four providers keep compiling
   * unchanged when it is omitted.
   */
  acceptanceCriteria?: AcceptanceCriterion[];
  /**
   * Phase 235 (T3) — the DRAFT's `## Boundaries` list ("Do NOT touch/add"
   * prose). Additive and optional, same as `acceptanceCriteria`.
   */
  boundaries?: string[];
  /**
   * Phase 235 (T3) — task->AC refs (`Task.id`, `files`, `verify`, `done`,
   * `status`) from the DRAFT's tasks. Additive and optional, same as
   * `acceptanceCriteria`.
   */
  taskRefs?: CodeReviewTaskRef[];
}

export interface CodeReviewResult {
  /** Per-file findings. File paths use forward slashes. */
  findings: Record<string, Finding[]>;
  provider: string;
  model?: string;
}

export interface CodeReviewVerifier {
  readonly name: string;
  verify(input: CodeReviewInput): Promise<CodeReviewResult>;
}

/**
 * Phase 235 (T5) — one opt-in extra diff marker beyond the built-in
 * `console.log(` HIGH rule: a regex tested against each added line's body
 * (the same slice(1) the console.log rule uses), and the severity/message to
 * emit on a match. Exists so the §6 Slice 3 adversarial corpus (findings at
 * severities other than HIGH, tied to specific synthetic defects) can be
 * exercised offline through the mock's existing deterministic line-walk,
 * without adding a second parsing pass or touching the console.log rule.
 */
export interface MockCodeReviewMarker {
  pattern: RegExp;
  severity: Finding['severity'];
  message: string;
}

export interface MockCodeReviewVerifierOptions {
  /**
   * Phase 235 (T5) — additional recognized markers, checked in the same
   * per-added-line loop as `console.log(`, after it, using the identical
   * `postLine` bookkeeping so line numbers stay accurate. Additive and
   * opt-in: omitted or empty (the default) means `new
   * MockCodeReviewVerifier()` produces byte-for-byte the same output as
   * before this option existed — the console.log→HIGH rule, its line-number
   * arithmetic, and the empty-diff early return are all untouched.
   */
  extraMarkers?: readonly MockCodeReviewMarker[];
}

/**
 * Deterministic mock — flags every `console.log(...)` added in the diff as
 * a HIGH finding. Empty diff (or no matches) returns no findings. The rule
 * is intentionally narrow: real reviews live in the Anthropic provider.
 * Phase 235 (T5): optionally takes `extraMarkers` to recognize additional
 * diff patterns for offline corpus testing — see `MockCodeReviewVerifierOptions`.
 */
export class MockCodeReviewVerifier implements CodeReviewVerifier {
  readonly name = 'mock';
  private readonly extraMarkers: readonly MockCodeReviewMarker[];

  constructor(options: MockCodeReviewVerifierOptions = {}) {
    this.extraMarkers = options.extraMarkers ?? [];
  }

  async verify(input: CodeReviewInput): Promise<CodeReviewResult> {
    const findings: Record<string, Finding[]> = {};
    if (input.diff.trim().length === 0) {
      return { findings, provider: this.name };
    }

    // Walk the unified diff. Track the current file via `+++ b/<path>`
    // headers; track the post-image line via the `@@ -a,b +c,d @@` hunk
    // headers; emit a HIGH finding per `+console.log(` line (skip `++` /
    // file-header rows).
    let currentFile: string | null = null;
    let postLine = 0;
    for (const raw of input.diff.split('\n')) {
      if (raw.startsWith('+++ ')) {
        // `+++ b/path` or `+++ /dev/null`
        const m = /^\+\+\+\s+(?:b\/)?(.+?)\s*$/.exec(raw);
        currentFile = m && m[1] && m[1] !== '/dev/null' ? m[1] : null;
        continue;
      }
      if (raw.startsWith('--- ')) continue;
      if (raw.startsWith('@@')) {
        const m = /\+(\d+)(?:,\d+)?/.exec(raw);
        postLine = m ? Number.parseInt(m[1]!, 10) : 0;
        continue;
      }
      if (currentFile === null || raw.startsWith('++')) continue;
      if (raw.startsWith('+')) {
        const body = raw.slice(1);
        if (/console\.log\(/.test(body)) {
          (findings[currentFile] ??= []).push({
            severity: 'high',
            message: 'console.log left in source',
            line: postLine,
          });
        }
        // Phase 235 (T5) — opt-in extra markers; no-op loop over `[]` when
        // `extraMarkers` is omitted, so zero-config output is unchanged.
        for (const marker of this.extraMarkers) {
          // A `RegExp` carrying the `g` (or `y`) flag is STATEFUL: `.test()`
          // advances `lastIndex`, so the same pattern applied to successive
          // diff lines would match intermittently rather than independently
          // per line. Reset before each test so a marker written the
          // idiomatic-but-wrong way (`/pattern/g`) still behaves per-line.
          // Same defense `verify/coverage.ts` already applies to AC_TOKEN_RE.
          marker.pattern.lastIndex = 0;
          if (marker.pattern.test(body)) {
            (findings[currentFile] ??= []).push({
              severity: marker.severity,
              message: marker.message,
              line: postLine,
            });
          }
        }
        postLine += 1;
      } else if (raw.startsWith('-')) {
        // pre-image lines don't advance post-line counter
      } else {
        // context line advances post-line counter
        postLine += 1;
      }
    }

    return { findings, provider: this.name };
  }
}

const FindingResponseSchema = z.object({
  file: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  message: z.string(),
  line: z.number().int().positive().optional(),
});
const CodeReviewResponseSchema = z.object({
  findings: z.array(FindingResponseSchema),
});

const SYSTEM_PROMPT = `You are an independent code reviewer for an AI-assisted development tool called CADENCE.

You receive the touched files and unified diff for a development phase. Surface concrete findings tied to specific files (and lines when you can identify them from the diff). Prioritize:
- security vulnerabilities (injection, secrets in code, unsafe deserialization) → high
- correctness bugs that will break under realistic inputs → high
- left-behind debug statements (console.log, debugger, printf debugging) → high
- structural / readability issues that don't break correctness → medium
- nits and style → low

Use severities exactly: "high" | "medium" | "low". If you have no findings, return an empty findings array. Keep each message ≤ 200 characters. Return strict JSON matching the requested schema.`;

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 8_000;

export interface AnthropicCodeReviewVerifierOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  /** Inject a client for tests; production callers should omit this. */
  client?: Anthropic;
}

export class AnthropicCodeReviewVerifier implements CodeReviewVerifier {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicCodeReviewVerifierOptions = {}) {
    if (opts.client) {
      this.client = opts.client;
    } else {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'AnthropicCodeReviewVerifier requires an API key. Set ANTHROPIC_API_KEY or pass `apiKey` / `client`.',
        );
      }
      this.client = new Anthropic({ apiKey });
    }
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async verify(input: CodeReviewInput): Promise<CodeReviewResult> {
    if (input.files.length === 0 && input.diff.trim().length === 0) {
      return { findings: {}, provider: this.name, model: this.model };
    }

    const userMessage = formatUserMessage(input);
    let response: Awaited<ReturnType<Anthropic['messages']['parse']>>;
    try {
      response = await this.client.messages.parse({
        model: this.model,
        max_tokens: this.maxTokens,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        output_config: {
          format: zodOutputFormat(CodeReviewResponseSchema),
        },
        messages: [{ role: 'user', content: userMessage }],
      });
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new Error(
          `AnthropicCodeReviewVerifier API error (${err.status ?? 'unknown'}): ${err.message}`,
        );
      }
      throw err;
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        'AnthropicCodeReviewVerifier received no parseable output from the model (response.parsed_output was null/undefined).',
      );
    }

    const findings: Record<string, Finding[]> = {};
    for (const f of parsed.findings) {
      (findings[f.file] ??= []).push({
        severity: f.severity,
        message: f.message,
        ...(f.line !== undefined ? { line: f.line } : {}),
      });
    }
    return { findings, provider: this.name, model: this.model };
  }
}

export interface LocalCodeReviewVerifierOptions {
  baseURL: string;
  model: string;
  transport?: typeof fetch;
}

export class LocalCodeReviewVerifier implements CodeReviewVerifier {
  readonly name = 'local';
  constructor(private readonly o: LocalCodeReviewVerifierOptions) {}

  async verify(input: CodeReviewInput): Promise<CodeReviewResult> {
    if (input.files.length === 0 && input.diff.trim().length === 0) {
      return { findings: {}, provider: this.name, model: this.o.model };
    }
    const parsed = await localChatJSON({
      baseURL: this.o.baseURL,
      model: this.o.model,
      system: SYSTEM_PROMPT,
      user: formatUserMessage(input),
      schema: CodeReviewResponseSchema,
      ...(this.o.transport ? { transport: this.o.transport } : {}),
    });
    const findings: Record<string, Finding[]> = {};
    for (const f of parsed.findings) {
      (findings[f.file] ??= []).push({
        severity: f.severity,
        message: f.message,
        ...(f.line !== undefined ? { line: f.line } : {}),
      });
    }
    return { findings, provider: this.name, model: this.o.model };
  }
}

export interface HostCliCodeReviewVerifierOptions {
  /** Host CLI binary name or path, e.g. `"claude"` or `"codex"`. */
  bin: string;
  model?: string;
  /** Inject a spawn implementation for tests; production callers should omit this. */
  spawnImpl?: SpawnFn;
}

/**
 * Phase 191 — spawns the user's already-installed, already-authenticated
 * host CLI (`claude`/`codex`) in headless mode via `hostCliJSON` instead of
 * calling an HTTP endpoint. Structurally mirrors `LocalCodeReviewVerifier` —
 * same early-return, `SYSTEM_PROMPT`/`formatUserMessage`/
 * `CodeReviewResponseSchema`, only the transport differs.
 */
export class HostCliCodeReviewVerifier implements CodeReviewVerifier {
  readonly name = 'host-cli';
  constructor(private readonly o: HostCliCodeReviewVerifierOptions) {}

  async verify(input: CodeReviewInput): Promise<CodeReviewResult> {
    if (input.files.length === 0 && input.diff.trim().length === 0) {
      return { findings: {}, provider: this.name, ...(this.o.model ? { model: this.o.model } : {}) };
    }
    const parsed = await hostCliJSON({
      bin: this.o.bin,
      ...(this.o.model ? { model: this.o.model } : {}),
      system: SYSTEM_PROMPT,
      user: formatUserMessage(input),
      schema: CodeReviewResponseSchema,
      ...(this.o.spawnImpl ? { spawnImpl: this.o.spawnImpl } : {}),
    });
    const findings: Record<string, Finding[]> = {};
    for (const f of parsed.findings) {
      (findings[f.file] ??= []).push({
        severity: f.severity,
        message: f.message,
        ...(f.line !== undefined ? { line: f.line } : {}),
      });
    }
    return { findings, provider: this.name, ...(this.o.model ? { model: this.o.model } : {}) };
  }
}

function formatUserMessage(input: CodeReviewInput): string {
  const fileList =
    input.files.length > 0
      ? input.files.map((f) => `- ${f}`).join('\n')
      : '(none)';
  const diffSection = input.diff || '(no diff supplied)';
  return `# Touched files

${fileList}

# Diff (\`git diff HEAD\`)

${diffSection}

Return findings (possibly empty) using the requested schema.`;
}
