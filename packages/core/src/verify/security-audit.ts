import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import type { Finding } from '@manehorizons/cadence-types';
import { hostCliJSON, type SpawnFn } from './host-cli-client.js';
import { localChatJSON } from './local-client.js';

/**
 * Phase 25.2 — security-audit verifier. The final, most expensive gate:
 * fires at `cadence settle run` after code-review and before SUMMARY write
 * when `'security-audit'` is in the effective gate set (strict×complex
 * only — the rarest cell). CRITICAL findings refuse settle unless
 * `--force` / `--allow-security-audit-failure`. All findings (any
 * severity) land on `SUMMARY.securityAudit`.
 */

export interface SecurityAuditInput {
  /** Touched files (union across draft tasks). Scopes the diff + prompt. */
  files: string[];
  /** Unified diff (`git diff HEAD -- <files>`). May be empty. */
  diff: string;
}

export interface SecurityAuditResult {
  /** Flat finding list (not per-file — security issues span files). */
  findings: Finding[];
  provider: string;
  model?: string;
}

export interface SecurityAuditVerifier {
  readonly name: string;
  /**
   * Phase 184: `opts` mirrors `Verifier.verify`'s shape
   * (`packages/core/src/verify/verifier.ts`) — an optional external
   * `AbortSignal` plus a `traceId` for logging. Every implementation must
   * accept it and keep behaving identically when it is omitted.
   */
  verify(
    input: SecurityAuditInput,
    opts?: { signal?: AbortSignal; traceId?: string },
  ): Promise<SecurityAuditResult>;
}

/** `Authorization:` header carrying a literal credential value. */
const AUTH_HEADER_RE =
  /authorization['"\s:=]+\s*(?:bearer|basic|token)\s+\S+/i;
/** A JWT-shaped string: three dot-separated base64url segments after `eyJ`. */
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

/**
 * Deterministic mock — walks the unified diff and flags every added line
 * carrying a hardcoded `Authorization:` header value or a JWT-shaped string
 * as CRITICAL. Empty diff (or no matches) returns no findings. The rule is
 * intentionally narrow: real OWASP review lives in the Anthropic provider.
 */
export class MockSecurityAuditVerifier implements SecurityAuditVerifier {
  readonly name = 'mock';

  async verify(
    input: SecurityAuditInput,
    // Pure, no I/O to cancel and nothing to trace — accepted for interface
    // parity with `SecurityAuditVerifier` and ignored, same as `MockVerifier`.
    _opts?: { signal?: AbortSignal; traceId?: string },
  ): Promise<SecurityAuditResult> {
    const findings: Finding[] = [];
    if (input.diff.trim().length === 0) {
      return { findings, provider: this.name };
    }

    let inFile = false;
    let postLine = 0;
    for (const raw of input.diff.split('\n')) {
      if (raw.startsWith('+++ ')) {
        const m = /^\+\+\+\s+(?:b\/)?(.+?)\s*$/.exec(raw);
        inFile = !!(m && m[1] && m[1] !== '/dev/null');
        continue;
      }
      if (raw.startsWith('--- ')) continue;
      if (raw.startsWith('@@')) {
        const m = /\+(\d+)(?:,\d+)?/.exec(raw);
        postLine = m ? Number.parseInt(m[1]!, 10) : 0;
        continue;
      }
      if (!inFile || raw.startsWith('++')) continue;
      if (raw.startsWith('+')) {
        const body = raw.slice(1);
        if (AUTH_HEADER_RE.test(body)) {
          findings.push({
            severity: 'critical',
            message: 'hardcoded Authorization header',
            line: postLine,
          });
        }
        if (JWT_RE.test(body)) {
          findings.push({
            severity: 'critical',
            message: 'hardcoded JWT-shaped credential',
            line: postLine,
          });
        }
        postLine += 1;
      } else if (raw.startsWith('-')) {
        // pre-image line — does not advance the post-image counter
      } else {
        postLine += 1;
      }
    }

    return { findings, provider: this.name };
  }
}

const FindingResponseSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  message: z.string(),
  line: z.number().int().positive().optional(),
});
const SecurityAuditResponseSchema = z.object({
  findings: z.array(FindingResponseSchema),
});

const SYSTEM_PROMPT = `You are an independent application security auditor for an AI-assisted development tool called CADENCE.

You receive the touched files and unified diff for a development phase. Perform an OWASP-aware security pass. Prioritize:
- hardcoded secrets / credentials / tokens / private keys in source → critical
- injection (SQL, command, path traversal, SSRF, template) reachable from untrusted input → critical
- broken authn/authz, missing access checks on sensitive operations → critical
- unsafe deserialization, prototype pollution, insecure crypto / weak randomness for security use → high
- sensitive data in logs, missing input validation that is exploitable → high
- defense-in-depth gaps that are not directly exploitable → medium
- hardening nits → low

Use severities exactly: "critical" | "high" | "medium" | "low". Only report issues you can tie to the diff. If there are none, return an empty findings array. Keep each message ≤ 200 characters. Return strict JSON matching the requested schema.`;

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 8_000;

export interface AnthropicSecurityAuditVerifierOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  /** Inject a client for tests; production callers should omit this. */
  client?: Anthropic;
}

export class AnthropicSecurityAuditVerifier
  implements SecurityAuditVerifier
{
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicSecurityAuditVerifierOptions = {}) {
    if (opts.client) {
      this.client = opts.client;
    } else {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'AnthropicSecurityAuditVerifier requires an API key. Set ANTHROPIC_API_KEY or pass `apiKey` / `client`.',
        );
      }
      this.client = new Anthropic({ apiKey });
    }
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async verify(
    input: SecurityAuditInput,
    opts?: { signal?: AbortSignal; traceId?: string },
  ): Promise<SecurityAuditResult> {
    if (input.files.length === 0 && input.diff.trim().length === 0) {
      return { findings: [], provider: this.name, model: this.model };
    }

    const userMessage = formatUserMessage(input);
    let response: Awaited<ReturnType<Anthropic['messages']['parse']>>;
    try {
      response = await this.client.messages.parse(
        {
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
            format: zodOutputFormat(SecurityAuditResponseSchema),
          },
          messages: [{ role: 'user', content: userMessage }],
        },
        // The Anthropic SDK's request options (`RequestOptions`, see
        // `@anthropic-ai/sdk/internal/request-options`) accept a real
        // `signal?: AbortSignal` forwarded straight to the underlying fetch;
        // there is no `traceId`-shaped field on `RequestOptions`, so — as in
        // this file today — there is no logger call here to carry it into.
        opts?.signal ? { signal: opts.signal } : undefined,
      );
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new Error(
          `AnthropicSecurityAuditVerifier API error (${err.status ?? 'unknown'}): ${err.message}`,
        );
      }
      throw err;
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        'AnthropicSecurityAuditVerifier received no parseable output from the model (response.parsed_output was null/undefined).',
      );
    }

    const findings: Finding[] = [];
    for (const f of parsed.findings) {
      findings.push({
        severity: f.severity,
        message: f.message,
        ...(f.line !== undefined ? { line: f.line } : {}),
      });
    }
    return { findings, provider: this.name, model: this.model };
  }
}

export interface LocalSecurityAuditVerifierOptions {
  baseURL: string;
  model: string;
  transport?: typeof fetch;
}

export class LocalSecurityAuditVerifier implements SecurityAuditVerifier {
  readonly name = 'local';
  constructor(private readonly o: LocalSecurityAuditVerifierOptions) {}

  async verify(
    input: SecurityAuditInput,
    opts?: { signal?: AbortSignal; traceId?: string },
  ): Promise<SecurityAuditResult> {
    if (input.files.length === 0 && input.diff.trim().length === 0) {
      return { findings: [], provider: this.name, model: this.o.model };
    }
    const parsed = await localChatJSON({
      baseURL: this.o.baseURL,
      model: this.o.model,
      system: SYSTEM_PROMPT,
      user: formatUserMessage(input),
      schema: SecurityAuditResponseSchema,
      ...(this.o.transport ? { transport: this.o.transport } : {}),
      ...(opts?.signal ? { signal: opts.signal } : {}),
      ...(opts?.traceId ? { traceId: opts.traceId } : {}),
    });
    const findings: Finding[] = [];
    for (const f of parsed.findings) {
      findings.push({
        severity: f.severity,
        message: f.message,
        ...(f.line !== undefined ? { line: f.line } : {}),
      });
    }
    return { findings, provider: this.name, model: this.o.model };
  }
}

export interface HostCliSecurityAuditVerifierOptions {
  /** Host CLI binary name or path, e.g. `"claude"` or `"codex"`. */
  bin: string;
  model?: string;
  /** Inject a spawn implementation for tests; production callers should omit this. */
  spawnImpl?: SpawnFn;
}

/**
 * Phase 191 — spawns the user's already-installed, already-authenticated
 * host CLI (`claude`/`codex`) in headless mode via `hostCliJSON` instead of
 * calling an HTTP endpoint. Structurally mirrors `LocalSecurityAuditVerifier`
 * — same early-return, `{signal, traceId}` opts threading,
 * `SYSTEM_PROMPT`/`formatUserMessage`/`SecurityAuditResponseSchema`, only the
 * transport differs.
 */
export class HostCliSecurityAuditVerifier implements SecurityAuditVerifier {
  readonly name = 'host-cli';
  constructor(private readonly o: HostCliSecurityAuditVerifierOptions) {}

  async verify(
    input: SecurityAuditInput,
    opts?: { signal?: AbortSignal; traceId?: string },
  ): Promise<SecurityAuditResult> {
    if (input.files.length === 0 && input.diff.trim().length === 0) {
      return { findings: [], provider: this.name, ...(this.o.model ? { model: this.o.model } : {}) };
    }
    const parsed = await hostCliJSON({
      bin: this.o.bin,
      ...(this.o.model ? { model: this.o.model } : {}),
      system: SYSTEM_PROMPT,
      user: formatUserMessage(input),
      schema: SecurityAuditResponseSchema,
      ...(this.o.spawnImpl ? { spawnImpl: this.o.spawnImpl } : {}),
      ...(opts?.signal ? { signal: opts.signal } : {}),
      ...(opts?.traceId ? { traceId: opts.traceId } : {}),
    });
    const findings: Finding[] = [];
    for (const f of parsed.findings) {
      findings.push({
        severity: f.severity,
        message: f.message,
        ...(f.line !== undefined ? { line: f.line } : {}),
      });
    }
    return { findings, provider: this.name, ...(this.o.model ? { model: this.o.model } : {}) };
  }
}

function formatUserMessage(input: SecurityAuditInput): string {
  const fileList =
    input.files.length > 0
      ? input.files.map((f) => `- ${f}`).join('\n')
      : '(none)';
  const diffSection = input.diff || '(no diff supplied)';
  return `# Touched files

${fileList}

# Diff (\`git diff HEAD\`)

${diffSection}

Return security findings (possibly empty) using the requested schema.`;
}
