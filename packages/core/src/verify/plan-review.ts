import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import type { Draft } from '@cadence/types';

/**
 * Phase 25.1 — plan-review verifier. Reviews the parsed DRAFT (objective +
 * ACs + tasks) at `cadence draft approve` when `'plan-review'` is in the
 * effective gate set (strict×complex). `pass=false` refuses approve unless
 * `--allow-plan-review-failure`. Approve-time, not settle-time: there is no
 * diff and no SUMMARY yet — the input is the plan itself.
 */

export type PlanReviewSeverity = 'high' | 'medium' | 'low';

export interface PlanReviewFinding {
  severity: PlanReviewSeverity;
  message: string;
  /** Optional concrete edit the author could apply to resolve the finding. */
  suggestedEdit?: string;
}

export interface PlanReviewInput {
  /** The parsed DRAFT being approved. */
  draft: Draft;
}

export interface PlanReviewResult {
  pass: boolean;
  findings: PlanReviewFinding[];
  provider: string;
  model?: string;
}

export interface PlanReviewVerifier {
  readonly name: string;
  verify(input: PlanReviewInput): Promise<PlanReviewResult>;
}

/**
 * Deterministic mock — passes iff the plan has ≥1 acceptance criterion and
 * every AC has non-empty trimmed given/when/then. Each defect is one HIGH
 * finding. Intentionally narrow: holistic plan judgment lives in the
 * Anthropic provider; the mock is the offline floor.
 */
export class MockPlanReviewVerifier implements PlanReviewVerifier {
  readonly name = 'mock';

  async verify(input: PlanReviewInput): Promise<PlanReviewResult> {
    const findings: PlanReviewFinding[] = [];
    const acs = input.draft.acceptanceCriteria;

    if (acs.length === 0) {
      findings.push({
        severity: 'high',
        message: 'plan has no acceptance criteria',
        suggestedEdit: 'Add at least one AC with Given/When/Then.',
      });
    }

    for (const ac of acs) {
      for (const field of ['given', 'when', 'then'] as const) {
        if (ac[field].trim().length === 0) {
          findings.push({
            severity: 'high',
            message: `${ac.id} has empty ${field}`,
            suggestedEdit: `Fill in the ${field} clause for ${ac.id}.`,
          });
        }
      }
    }

    return {
      pass: findings.length === 0,
      findings,
      provider: this.name,
    };
  }
}

const PlanReviewFindingSchema = z.object({
  severity: z.enum(['high', 'medium', 'low']),
  message: z.string(),
  suggestedEdit: z.string().optional(),
});
const PlanReviewResponseSchema = z.object({
  pass: z.boolean(),
  findings: z.array(PlanReviewFindingSchema),
});

const SYSTEM_PROMPT = `You are an independent plan reviewer for an AI-assisted development tool called CADENCE.

You receive a development phase plan (objective, acceptance criteria, tasks, boundaries) BEFORE any code is written. Decide whether the plan is coherent and ready to build. Be skeptical:
- objective vague, untestable, or not matched by the ACs → high
- an AC that is not falsifiable, or whose Given/When/Then doesn't actually pin down an observable outcome → high
- tasks that don't collectively achieve every AC, or files/actions that don't match the objective → high
- missing boundaries that invite scope creep → medium
- wording/ordering nits that don't change buildability → low

Set "pass": false if any HIGH finding exists; otherwise "pass": true. Attach a concrete "suggestedEdit" to each finding when you can. Keep each message ≤ 200 characters. If the plan is sound, return "pass": true with an empty findings array. Return strict JSON matching the requested schema.`;

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4_000;

export interface AnthropicPlanReviewVerifierOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  /** Inject a client for tests; production callers should omit this. */
  client?: Anthropic;
}

export class AnthropicPlanReviewVerifier implements PlanReviewVerifier {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicPlanReviewVerifierOptions = {}) {
    if (opts.client) {
      this.client = opts.client;
    } else {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'AnthropicPlanReviewVerifier requires an API key. Set ANTHROPIC_API_KEY or pass `apiKey` / `client`.',
        );
      }
      this.client = new Anthropic({ apiKey });
    }
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async verify(input: PlanReviewInput): Promise<PlanReviewResult> {
    const userMessage = formatUserMessage(input.draft);
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
          format: zodOutputFormat(PlanReviewResponseSchema),
        },
        messages: [{ role: 'user', content: userMessage }],
      });
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new Error(
          `AnthropicPlanReviewVerifier API error (${err.status ?? 'unknown'}): ${err.message}`,
        );
      }
      throw err;
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        'AnthropicPlanReviewVerifier received no parseable output from the model (response.parsed_output was null/undefined).',
      );
    }

    const findings: PlanReviewFinding[] = [];
    for (const f of parsed.findings) {
      findings.push({
        severity: f.severity,
        message: f.message,
        ...(f.suggestedEdit !== undefined
          ? { suggestedEdit: f.suggestedEdit }
          : {}),
      });
    }
    return {
      pass: parsed.pass,
      findings,
      provider: this.name,
      model: this.model,
    };
  }
}

function formatUserMessage(draft: Draft): string {
  const acs =
    draft.acceptanceCriteria.length > 0
      ? draft.acceptanceCriteria
          .map(
            (ac) =>
              `### ${ac.id}\nGiven ${ac.given}\nWhen ${ac.when}\nThen ${ac.then}`,
          )
          .join('\n\n')
      : '(none)';
  const tasks =
    draft.tasks.length > 0
      ? draft.tasks
          .map(
            (t) =>
              `### ${t.id}: ${t.name}\n- files: ${t.files.join(', ') || '(none)'}\n- action: ${t.action}\n- verify: ${t.verify}\n- done: ${t.done}`,
          )
          .join('\n\n')
      : '(none)';
  const boundaries =
    draft.boundaries.length > 0
      ? draft.boundaries.map((b) => `- ${b}`).join('\n')
      : '(none)';
  return `# Plan: ${draft.id} — ${draft.title}

Tier: ${draft.tier}

# Objective

${draft.objective}

# Acceptance Criteria

${acs}

# Tasks

${tasks}

# Boundaries

${boundaries}

Review this plan and return a verdict using the requested schema.`;
}
