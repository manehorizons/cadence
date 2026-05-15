import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';

/**
 * Phase 24.3 — code-review verifier. Per-file findings against the phase
 * diff. Fires at `cadence settle run` when `'code-review'` is in the
 * effective gate set (strict×standard, strict×complex, standard×complex).
 * HIGH findings refuse settle unless `--force` / `--allow-code-review-failure`.
 */

export type FindingSeverity = 'high' | 'medium' | 'low';

export interface Finding {
  severity: FindingSeverity;
  message: string;
  line?: number;
}

export interface CodeReviewInput {
  /** Touched files (from draft tasks). Used to scope diff parsing + Anthropic prompt. */
  files: string[];
  /** Unified diff (`git diff HEAD -- <files>`). May be empty. */
  diff: string;
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
 * Deterministic mock — flags every `console.log(...)` added in the diff as
 * a HIGH finding. Empty diff (or no matches) returns no findings. The rule
 * is intentionally narrow: real reviews live in the Anthropic provider.
 */
export class MockCodeReviewVerifier implements CodeReviewVerifier {
  readonly name = 'mock';

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
