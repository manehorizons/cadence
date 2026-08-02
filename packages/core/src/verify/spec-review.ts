import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import type { Spec } from '@thomas-powers-jr/cadence-types';
import { hostCliJSON, type SpawnFn } from './host-cli-client.js';
import { localChatJSON } from './local-client.js';

/**
 * Phase 36.1 — spec-review verifier. Reviews the parsed SPEC (objective +
 * ACs + constraints + open questions) at `cadence spec approve` (run through
 * the Phase 35.1 convergence loop). Structural clone of `plan-review.ts`;
 * review-only (cadence is host-agnostic — no generator).
 */

export type SpecReviewSeverity = 'high' | 'medium' | 'low';

export interface SpecReviewFinding {
  severity: SpecReviewSeverity;
  message: string;
  suggestedEdit?: string;
}

export interface SpecReviewInput {
  spec: Spec;
}

export interface SpecReviewResult {
  pass: boolean;
  findings: SpecReviewFinding[];
  provider: string;
  model?: string;
}

export interface SpecReviewVerifier {
  readonly name: string;
  verify(input: SpecReviewInput): Promise<SpecReviewResult>;
}

/**
 * Deterministic mock — passes iff the spec has a non-empty objective, ≥1 AC
 * with non-empty G/W/T, AND ≥1 constraint. Intentionally stricter than
 * MockPlanReviewVerifier (a spec without constraints is under-scoped). Each
 * defect is one HIGH finding.
 */
export class MockSpecReviewVerifier implements SpecReviewVerifier {
  readonly name = 'mock';

  async verify(input: SpecReviewInput): Promise<SpecReviewResult> {
    const findings: SpecReviewFinding[] = [];
    const { objective, acceptanceCriteria: acs, constraints } = input.spec;

    if (objective.trim().length === 0) {
      findings.push({
        severity: 'high',
        message: 'spec has an empty objective',
        suggestedEdit: 'State the objective in one falsifiable sentence.',
      });
    }
    if (acs.length === 0) {
      findings.push({
        severity: 'high',
        message: 'spec has no acceptance criteria',
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
    if (constraints.length === 0) {
      findings.push({
        severity: 'high',
        message: 'spec has no constraints',
        suggestedEdit: 'Add at least one constraint/boundary to bound scope.',
      });
    }

    return { pass: findings.length === 0, findings, provider: this.name };
  }
}

const SpecReviewFindingSchema = z.object({
  severity: z.enum(['high', 'medium', 'low']),
  message: z.string(),
  suggestedEdit: z.string().optional(),
});
const SpecReviewResponseSchema = z.object({
  pass: z.boolean(),
  findings: z.array(SpecReviewFindingSchema),
});

const SYSTEM_PROMPT = `You are an independent spec reviewer for an AI-assisted development tool called CADENCE.

You receive a development SPEC (objective, acceptance criteria, constraints, open questions) BEFORE any task breakdown. Decide whether the spec is the right thing to build and is coherent enough to turn into a plan. Be skeptical:
- objective vague, unfalsifiable, or not matched by the ACs → high
- an AC whose Given/When/Then doesn't pin down an observable outcome → high
- ACs that don't collectively cover the objective → high
- missing constraints that invite scope creep, or open questions that block planning → medium
- wording/ordering nits → low

Set "pass": false if any HIGH finding exists; otherwise "pass": true. Attach a concrete "suggestedEdit" when you can. Keep each message ≤ 200 characters. If the spec is sound, return "pass": true with an empty findings array. Return strict JSON matching the requested schema.`;

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4_000;

export interface AnthropicSpecReviewVerifierOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  client?: Anthropic;
}

export class AnthropicSpecReviewVerifier implements SpecReviewVerifier {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicSpecReviewVerifierOptions = {}) {
    if (opts.client) {
      this.client = opts.client;
    } else {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'AnthropicSpecReviewVerifier requires an API key. Set ANTHROPIC_API_KEY or pass `apiKey` / `client`.',
        );
      }
      this.client = new Anthropic({ apiKey });
    }
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async verify(input: SpecReviewInput): Promise<SpecReviewResult> {
    const userMessage = formatUserMessage(input.spec);
    let response: Awaited<ReturnType<Anthropic['messages']['parse']>>;
    try {
      response = await this.client.messages.parse({
        model: this.model,
        max_tokens: this.maxTokens,
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        output_config: { format: zodOutputFormat(SpecReviewResponseSchema) },
        messages: [{ role: 'user', content: userMessage }],
      });
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new Error(
          `AnthropicSpecReviewVerifier API error (${err.status ?? 'unknown'}): ${err.message}`,
        );
      }
      throw err;
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        'AnthropicSpecReviewVerifier received no parseable output from the model (response.parsed_output was null/undefined).',
      );
    }

    const findings: SpecReviewFinding[] = [];
    for (const f of parsed.findings) {
      findings.push({
        severity: f.severity,
        message: f.message,
        ...(f.suggestedEdit !== undefined ? { suggestedEdit: f.suggestedEdit } : {}),
      });
    }
    return { pass: parsed.pass, findings, provider: this.name, model: this.model };
  }
}

export interface LocalSpecReviewVerifierOptions {
  baseURL: string;
  model: string;
  transport?: typeof fetch;
}

export class LocalSpecReviewVerifier implements SpecReviewVerifier {
  readonly name = 'local';
  constructor(private readonly o: LocalSpecReviewVerifierOptions) {}

  async verify(input: SpecReviewInput): Promise<SpecReviewResult> {
    const parsed = await localChatJSON({
      baseURL: this.o.baseURL,
      model: this.o.model,
      system: SYSTEM_PROMPT,
      user: formatUserMessage(input.spec),
      schema: SpecReviewResponseSchema,
      ...(this.o.transport ? { transport: this.o.transport } : {}),
    });
    const findings: SpecReviewFinding[] = [];
    for (const f of parsed.findings) {
      findings.push({
        severity: f.severity,
        message: f.message,
        ...(f.suggestedEdit !== undefined ? { suggestedEdit: f.suggestedEdit } : {}),
      });
    }
    return { pass: parsed.pass, findings, provider: this.name, model: this.o.model };
  }
}

export interface HostCliSpecReviewVerifierOptions {
  /** Host CLI binary name or path, e.g. `"claude"` or `"codex"`. */
  bin: string;
  model?: string;
  /** Inject a spawn implementation for tests; production callers should omit this. */
  spawnImpl?: SpawnFn;
}

/**
 * Phase 191 — spawns the user's already-installed, already-authenticated
 * host CLI (`claude`/`codex`) in headless mode via `hostCliJSON` instead of
 * calling an HTTP endpoint. Structurally mirrors `LocalSpecReviewVerifier` —
 * same `SYSTEM_PROMPT`/`formatUserMessage`/`SpecReviewResponseSchema`, only
 * the transport differs.
 */
export class HostCliSpecReviewVerifier implements SpecReviewVerifier {
  readonly name = 'host-cli';
  constructor(private readonly o: HostCliSpecReviewVerifierOptions) {}

  async verify(input: SpecReviewInput): Promise<SpecReviewResult> {
    const parsed = await hostCliJSON({
      bin: this.o.bin,
      ...(this.o.model ? { model: this.o.model } : {}),
      system: SYSTEM_PROMPT,
      user: formatUserMessage(input.spec),
      schema: SpecReviewResponseSchema,
      ...(this.o.spawnImpl ? { spawnImpl: this.o.spawnImpl } : {}),
    });
    const findings: SpecReviewFinding[] = [];
    for (const f of parsed.findings) {
      findings.push({
        severity: f.severity,
        message: f.message,
        ...(f.suggestedEdit !== undefined ? { suggestedEdit: f.suggestedEdit } : {}),
      });
    }
    return {
      pass: parsed.pass,
      findings,
      provider: this.name,
      ...(this.o.model ? { model: this.o.model } : {}),
    };
  }
}

function formatUserMessage(spec: Spec): string {
  const acs =
    spec.acceptanceCriteria.length > 0
      ? spec.acceptanceCriteria
          .map((ac) => `### ${ac.id}\nGiven ${ac.given}\nWhen ${ac.when}\nThen ${ac.then}`)
          .join('\n\n')
      : '(none)';
  const constraints =
    spec.constraints.length > 0 ? spec.constraints.map((c) => `- ${c}`).join('\n') : '(none)';
  const openQuestions =
    spec.openQuestions.length > 0
      ? spec.openQuestions.map((q) => `- ${q}`).join('\n')
      : '(none)';
  return `# Spec: ${spec.id}

# Objective

${spec.objective}

# Acceptance Criteria

${acs}

# Constraints

${constraints}

# Open Questions

${openQuestions}

Review this spec and return a verdict using the requested schema.`;
}
