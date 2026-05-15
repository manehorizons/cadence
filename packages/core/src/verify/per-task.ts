import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';

/**
 * Phase 24.2 — per-task verifier. Sibling to the Phase 15 `Verifier` for
 * `--deep` AC review; this one runs at `cadence build task <id> --status=DONE`
 * against a single task's files+diff and returns a 3-way verdict.
 */

export type PerTaskVerdict = 'pass' | 'concerns' | 'refuse';

export interface PerTaskInput {
  /** Task id from the DRAFT, e.g. "T1". */
  taskId: string;
  /** Files declared on the task in the DRAFT. */
  files: string[];
  /** `git diff HEAD -- <files>` output, or empty when nothing changed. */
  diff: string;
}

export interface PerTaskResult {
  verdict: PerTaskVerdict;
  /** Short, human-readable reason (≤ 200 chars). */
  reason: string;
  /** Provider name (e.g. "mock", "anthropic"). */
  provider: string;
  /** Optional model name when the provider is an LLM. */
  model?: string;
}

export interface PerTaskVerifier {
  readonly name: string;
  verify(input: PerTaskInput): Promise<PerTaskResult>;
}

/**
 * Deterministic mock provider. Rule:
 *   files empty → 'refuse' ("no files touched")
 *   diff empty  → 'concerns' ("no diff since last task")
 *   otherwise   → 'pass'
 *
 * Mirrors the Phase 15 MockVerifier philosophy — a deterministic floor that
 * lets CI exercise the wiring without an API key. Real per-task verifiers
 * read the diff and apply behavioral judgment.
 */
export class MockPerTaskVerifier implements PerTaskVerifier {
  readonly name = 'mock';

  async verify(input: PerTaskInput): Promise<PerTaskResult> {
    if (input.files.length === 0) {
      return {
        verdict: 'refuse',
        reason: 'mock: no files touched',
        provider: this.name,
      };
    }
    if (input.diff.trim().length === 0) {
      return {
        verdict: 'concerns',
        reason: 'mock: no diff since last task',
        provider: this.name,
      };
    }
    return {
      verdict: 'pass',
      reason: `mock: ${input.files.length} file(s), ${input.diff.length} diff bytes`,
      provider: this.name,
    };
  }
}

const PerTaskResponseSchema = z.object({
  verdict: z.enum(['pass', 'concerns', 'refuse']),
  reason: z.string(),
});

const SYSTEM_PROMPT = `You are an independent per-task verifier for an AI-assisted development tool called CADENCE.

You receive the touched files and unified diff for one task within a larger phase. Decide whether the task's diff is a coherent, self-contained step toward the phase goal. Be skeptical: large unrelated edits, churn, or a diff that doesn't match the task's stated files are reasons for concern.

Choose exactly one verdict:
- "pass" — diff is coherent, scoped to this task, and ready to record as DONE
- "concerns" — diff is workable but has issues a reviewer should know about (record DONE anyway, attach the reason)
- "refuse" — diff is broken, off-scope, or unsafe enough that DONE should be blocked

Keep reason ≤ 200 characters. Return strict JSON matching the requested schema.`;

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4_000;

export interface AnthropicPerTaskVerifierOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  /** Inject a client for tests; production callers should omit this. */
  client?: Anthropic;
}

export class AnthropicPerTaskVerifier implements PerTaskVerifier {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicPerTaskVerifierOptions = {}) {
    if (opts.client) {
      this.client = opts.client;
    } else {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'AnthropicPerTaskVerifier requires an API key. Set ANTHROPIC_API_KEY or pass `apiKey` / `client`.',
        );
      }
      this.client = new Anthropic({ apiKey });
    }
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async verify(input: PerTaskInput): Promise<PerTaskResult> {
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
          format: zodOutputFormat(PerTaskResponseSchema),
        },
        messages: [{ role: 'user', content: userMessage }],
      });
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new Error(
          `AnthropicPerTaskVerifier API error (${err.status ?? 'unknown'}): ${err.message}`,
        );
      }
      throw err;
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        'AnthropicPerTaskVerifier received no parseable output from the model (response.parsed_output was null/undefined).',
      );
    }

    return {
      verdict: parsed.verdict,
      reason: parsed.reason,
      provider: this.name,
      model: this.model,
    };
  }
}

function formatUserMessage(input: PerTaskInput): string {
  const fileList =
    input.files.length > 0
      ? input.files.map((f) => `- ${f}`).join('\n')
      : '(none)';
  const diffSection = input.diff || '(no diff supplied)';
  return `# Task

Task id: ${input.taskId}

# Files declared

${fileList}

# Diff (\`git diff HEAD\`)

${diffSection}

Return one verdict for this task using the requested schema.`;
}
