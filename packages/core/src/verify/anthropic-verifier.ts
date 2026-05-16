import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import type {
  AcVerdict,
  Verifier,
  VerifyInput,
  VerifyResult,
} from './verifier.js';

export const VerifierResponseSchema = z.object({
  verdicts: z.array(
    z.object({
      id: z.string(),
      pass: z.boolean(),
      reason: z.string(),
    }),
  ),
});

export const SYSTEM_PROMPT = `You are an independent acceptance-criterion verifier for an AI-assisted development tool called CADENCE.

For each acceptance criterion (AC) you receive, decide whether the supplied diff + test references actually deliver what the AC promises in plain English. Be skeptical: "tests exist" is necessary but not sufficient; the diff must actually implement the behavior the AC describes.

Return one verdict per AC. Use:
- pass=true when the diff implements the AC AND a referenced test exercises it
- pass=false when the implementation is missing, partial, or untested
- Keep each reason ≤ 200 characters, citing the specific gap or proof

Return strict JSON matching the requested schema. Do not include narrative outside the schema.`;

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 16_000;

export interface AnthropicVerifierOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  /** Inject a client for tests; production callers should omit this. */
  client?: Anthropic;
}

export class AnthropicVerifier implements Verifier {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicVerifierOptions = {}) {
    if (opts.client) {
      this.client = opts.client;
    } else {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'AnthropicVerifier requires an API key. Set ANTHROPIC_API_KEY or pass `apiKey` / `client`.',
        );
      }
      this.client = new Anthropic({ apiKey });
    }
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async verify(input: VerifyInput): Promise<VerifyResult> {
    if (input.acs.length === 0) {
      return { verdicts: {}, provider: this.name, model: this.model };
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
          format: zodOutputFormat(VerifierResponseSchema),
        },
        messages: [{ role: 'user', content: userMessage }],
      });
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new Error(
          `AnthropicVerifier API error (${err.status ?? 'unknown'}): ${err.message}`,
        );
      }
      throw err;
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        'AnthropicVerifier received no parseable output from the model (response.parsed_output was null/undefined).',
      );
    }

    const verdicts: Record<string, AcVerdict> = {};
    for (const v of parsed.verdicts) {
      verdicts[v.id] = { pass: v.pass, reason: v.reason };
    }

    return { verdicts, provider: this.name, model: this.model };
  }
}

export function formatUserMessage(input: VerifyInput): string {
  const acList = input.acs
    .map(
      (ac) =>
        `### ${ac.id}\nGiven: ${ac.given}\nWhen: ${ac.when}\nThen: ${ac.then}`,
    )
    .join('\n\n');

  const testList = Object.entries(input.tests)
    .map(([acId, refs]) => {
      const lines = refs
        .map((r) => `- ${r.file}:${r.line} — ${r.snippet}`)
        .join('\n');
      return `## ${acId} linked tests\n${lines || '(none)'}`;
    })
    .join('\n\n');

  const fileList =
    input.files.length > 0
      ? input.files.map((f) => `- ${f}`).join('\n')
      : '(none)';

  const diffSection = input.diff || '(no diff supplied)';

  const ids = input.acs.map((ac) => ac.id);
  const idList = ids.join(', ');
  const example = JSON.stringify({
    verdicts: ids.map((id) => ({
      id,
      pass: true,
      reason: 'why this AC is (or is not) delivered',
    })),
  });

  return `# Acceptance Criteria\n\n${acList}\n\n# Linked tests\n\n${testList || '(none)'}\n\n# Touched files\n\n${fileList}\n\n# Diff\n\n${diffSection}\n\nReturn exactly one verdict object per acceptance criterion: ${idList}. Each verdict's "id" MUST be the exact AC id string shown above (e.g. "${ids[0] ?? 'AC-1'}") — do not renumber, omit, or invent ids. Respond with strict JSON in exactly this shape (same keys, one entry per AC):\n\n${example}`;
}
