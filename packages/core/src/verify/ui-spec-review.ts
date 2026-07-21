import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import type { UiSpec } from '@manehorizons/cadence-types';
import { hostCliJSON, type SpawnFn } from './host-cli-client.js';
import { localChatJSON } from './local-client.js';

/**
 * rec-20260711-004 — ui-spec-review verifier. Reviews the parsed UI-SPEC
 * (per-component detail/Layout & Tokens/Precedent References plus
 * whole-slice Responsive & Interaction) at `cadence spec approve`, only when
 * a UI-SPEC is present, run through the same Phase 35.1 convergence loop as
 * spec-review. Structural sibling of `spec-review.ts` — same shape, UI-SPEC
 * schema and prompt instead of SPEC's.
 */

export type UiSpecReviewSeverity = 'high' | 'medium' | 'low';

export interface UiSpecReviewFinding {
  severity: UiSpecReviewSeverity;
  message: string;
  suggestedEdit?: string;
}

export interface UiSpecReviewInput {
  uiSpec: UiSpec;
}

export interface UiSpecReviewResult {
  pass: boolean;
  findings: UiSpecReviewFinding[];
  provider: string;
  model?: string;
}

export interface UiSpecReviewVerifier {
  readonly name: string;
  verify(input: UiSpecReviewInput): Promise<UiSpecReviewResult>;
}

/**
 * Deterministic mock — passes iff every component has non-empty
 * `layoutTokens` AND whole-slice `responsiveInteraction` is non-empty.
 * Intentionally flags a component whose only detail is a Precedent
 * Reference: an empty `layoutTokens` array trips regardless of `precedent`
 * being populated. Each defect is one HIGH finding.
 */
export class MockUiSpecReviewVerifier implements UiSpecReviewVerifier {
  readonly name = 'mock';

  async verify(input: UiSpecReviewInput): Promise<UiSpecReviewResult> {
    const findings: UiSpecReviewFinding[] = [];
    const { components, responsiveInteraction } = input.uiSpec;

    if (components.length === 0) {
      findings.push({
        severity: 'high',
        message: 'ui-spec declares no components',
        suggestedEdit: 'Add at least one ### <Component> entry under ## Components.',
      });
    }
    for (const c of components) {
      if (c.layoutTokens.length === 0) {
        findings.push({
          severity: 'high',
          message: `${c.name} has no layout/token detail`,
          suggestedEdit: `Add concrete spacing/token bullets under #### Layout & Tokens for ${c.name} — a precedent reference alone is not enough.`,
        });
      }
    }
    if (responsiveInteraction.length === 0) {
      findings.push({
        severity: 'high',
        message: 'ui-spec has no responsive/interaction detail',
        suggestedEdit: 'Add breakpoint/state bullets under ## Responsive & Interaction.',
      });
    }

    return { pass: findings.length === 0, findings, provider: this.name };
  }
}

const UiSpecReviewFindingSchema = z.object({
  severity: z.enum(['high', 'medium', 'low']),
  message: z.string(),
  suggestedEdit: z.string().optional(),
});
const UiSpecReviewResponseSchema = z.object({
  pass: z.boolean(),
  findings: z.array(UiSpecReviewFindingSchema),
});

const SYSTEM_PROMPT = `You are an independent UI design reviewer for an AI-assisted development tool called CADENCE.

You receive a UI-SPEC: per-component detail, Layout & Tokens, and Precedent References, plus whole-slice Responsive & Interaction detail, for a phase that touches UI surfaces. Decide whether it is concrete enough to hand to an engineer without them having to invent the layout themselves. Be skeptical:
- zero components declared → high
- a component with a Precedent Reference ("reuse X's visual language") but no concrete Layout & Tokens detail of its own → high
- a component with vague Layout & Tokens bullets that don't name actual spacing/token/field-type treatment → medium
- missing or empty Responsive & Interaction detail (breakpoints, hover/focus/error/loading states) → high
- wording/ordering nits → low

Set "pass": false if any HIGH finding exists; otherwise "pass": true. Attach a concrete "suggestedEdit" when you can, naming the specific component. Keep each message ≤ 200 characters. If the ui-spec is sound, return "pass": true with an empty findings array. Return strict JSON matching the requested schema.`;

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4_000;

export interface AnthropicUiSpecReviewVerifierOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  client?: Anthropic;
}

export class AnthropicUiSpecReviewVerifier implements UiSpecReviewVerifier {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicUiSpecReviewVerifierOptions = {}) {
    if (opts.client) {
      this.client = opts.client;
    } else {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'AnthropicUiSpecReviewVerifier requires an API key. Set ANTHROPIC_API_KEY or pass `apiKey` / `client`.',
        );
      }
      this.client = new Anthropic({ apiKey });
    }
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async verify(input: UiSpecReviewInput): Promise<UiSpecReviewResult> {
    const userMessage = formatUserMessage(input.uiSpec);
    let response: Awaited<ReturnType<Anthropic['messages']['parse']>>;
    try {
      response = await this.client.messages.parse({
        model: this.model,
        max_tokens: this.maxTokens,
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        output_config: { format: zodOutputFormat(UiSpecReviewResponseSchema) },
        messages: [{ role: 'user', content: userMessage }],
      });
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new Error(
          `AnthropicUiSpecReviewVerifier API error (${err.status ?? 'unknown'}): ${err.message}`,
        );
      }
      throw err;
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        'AnthropicUiSpecReviewVerifier received no parseable output from the model (response.parsed_output was null/undefined).',
      );
    }

    const findings: UiSpecReviewFinding[] = [];
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

export interface LocalUiSpecReviewVerifierOptions {
  baseURL: string;
  model: string;
  transport?: typeof fetch;
}

export class LocalUiSpecReviewVerifier implements UiSpecReviewVerifier {
  readonly name = 'local';
  constructor(private readonly o: LocalUiSpecReviewVerifierOptions) {}

  async verify(input: UiSpecReviewInput): Promise<UiSpecReviewResult> {
    const parsed = await localChatJSON({
      baseURL: this.o.baseURL,
      model: this.o.model,
      system: SYSTEM_PROMPT,
      user: formatUserMessage(input.uiSpec),
      schema: UiSpecReviewResponseSchema,
      ...(this.o.transport ? { transport: this.o.transport } : {}),
    });
    const findings: UiSpecReviewFinding[] = [];
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

export interface HostCliUiSpecReviewVerifierOptions {
  /** Host CLI binary name or path, e.g. `"claude"` or `"codex"`. */
  bin: string;
  model?: string;
  /** Inject a spawn implementation for tests; production callers should omit this. */
  spawnImpl?: SpawnFn;
}

/**
 * Phase 191 — spawns the user's already-installed, already-authenticated
 * host CLI (`claude`/`codex`) in headless mode via `hostCliJSON` instead of
 * calling an HTTP endpoint. Structurally mirrors `LocalUiSpecReviewVerifier` —
 * same `SYSTEM_PROMPT`/`formatUserMessage`/`UiSpecReviewResponseSchema`, only
 * the transport differs.
 */
export class HostCliUiSpecReviewVerifier implements UiSpecReviewVerifier {
  readonly name = 'host-cli';
  constructor(private readonly o: HostCliUiSpecReviewVerifierOptions) {}

  async verify(input: UiSpecReviewInput): Promise<UiSpecReviewResult> {
    const parsed = await hostCliJSON({
      bin: this.o.bin,
      ...(this.o.model ? { model: this.o.model } : {}),
      system: SYSTEM_PROMPT,
      user: formatUserMessage(input.uiSpec),
      schema: UiSpecReviewResponseSchema,
      ...(this.o.spawnImpl ? { spawnImpl: this.o.spawnImpl } : {}),
    });
    const findings: UiSpecReviewFinding[] = [];
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

function formatUserMessage(uiSpec: UiSpec): string {
  const components =
    uiSpec.components.length > 0
      ? uiSpec.components
          .map((c) => {
            const detail = c.detail.length > 0 ? c.detail.map((d) => `- ${d}`).join('\n') : '(none)';
            const layout =
              c.layoutTokens.length > 0 ? c.layoutTokens.map((d) => `- ${d}`).join('\n') : '(none)';
            const precedent =
              c.precedent.length > 0 ? c.precedent.map((d) => `- ${d}`).join('\n') : '(none)';
            return `### ${c.name}\n${detail}\n\n#### Layout & Tokens\n${layout}\n\n#### Precedent References\n${precedent}`;
          })
          .join('\n\n')
      : '(none)';
  const responsive =
    uiSpec.responsiveInteraction.length > 0
      ? uiSpec.responsiveInteraction.map((r) => `- ${r}`).join('\n')
      : '(none)';
  return `# UI-Spec: ${uiSpec.id}

# Components

${components}

# Responsive & Interaction

${responsive}

Review this ui-spec and return a verdict using the requested schema.`;
}
