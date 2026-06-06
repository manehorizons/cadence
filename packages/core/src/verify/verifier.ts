/**
 * Abstract interface for the `--deep` independent verifier. Implementations
 * read AC text + relevant code + tests and return a per-AC pass/fail verdict
 * with reasoning. Selection is config-driven (see `selectVerifier`).
 */
import { localChatJSON } from './local-client.js';
import {
  SYSTEM_PROMPT,
  VerifierResponseSchema,
  formatUserMessage,
} from './anthropic-verifier.js';

export interface VerifyAc {
  /** Stable AC id, e.g. "AC-1". */
  id: string;
  /** Human-readable Given clause from the DRAFT. */
  given: string;
  /** Human-readable When clause. */
  when: string;
  /** Human-readable Then clause — the actual outcome to verify. */
  then: string;
}

export interface VerifyTestRef {
  /** Path relative to repoRoot, forward-slashed. */
  file: string;
  /** 1-based line where the AC token appeared. */
  line: number;
  /** Trimmed snippet of the matching test line. */
  snippet: string;
}

export interface VerifyInput {
  /** ACs to verify. */
  acs: VerifyAc[];
  /** Map of AC id → linked test refs (from `scanTestCoverage`). */
  tests: Record<string, VerifyTestRef[]>;
  /** Optional unified diff of code changes for the phase. May be empty. */
  diff: string;
  /** Optional list of touched source files (for context). May be empty. */
  files: string[];
}

export interface AcVerdict {
  pass: boolean;
  /** Short, human-readable reason (≤ 200 chars). */
  reason: string;
}

/**
 * Phase 73: token usage from a real LLM provider, when it reports one. Cost in
 * dollars is intentionally NOT derived here — no price table to rot (v1.15
 * scope guard). The `mock` provider never sets this.
 */
export interface VerifyUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface VerifyResult {
  /** Per-AC verdicts keyed by AC id. */
  verdicts: Record<string, AcVerdict>;
  /** Provider name (e.g. "mock", "anthropic"). Stamped into SUMMARY. */
  provider: string;
  /** Optional model name when the provider is an LLM. */
  model?: string;
  /** Phase 73: token usage when the provider reports it. Omitted otherwise. */
  usage?: VerifyUsage;
}

/**
 * Verifiers must be safe to call without I/O setup beyond what the
 * constructor accepts. Implementations should *not* throw on per-AC verdict
 * failures — failed verdicts go in `result.verdicts[id].pass = false`.
 * Throwing is reserved for transport errors (network, malformed response).
 */
export interface Verifier {
  readonly name: string;
  verify(input: VerifyInput): Promise<VerifyResult>;
}

export interface LocalVerifierOptions {
  baseURL: string;
  model: string;
  transport?: typeof fetch;
  /** Phase 72: extra HTTP headers (e.g. an Authorization bearer). Never logged. */
  headers?: Record<string, string>;
}

export class LocalVerifier implements Verifier {
  readonly name = 'local';
  constructor(private readonly o: LocalVerifierOptions) {}

  async verify(input: VerifyInput): Promise<VerifyResult> {
    if (input.acs.length === 0) {
      return { verdicts: {}, provider: this.name, model: this.o.model };
    }
    let usage: VerifyUsage | undefined;
    const parsed = await localChatJSON({
      baseURL: this.o.baseURL,
      model: this.o.model,
      system: SYSTEM_PROMPT,
      user: formatUserMessage(input),
      schema: VerifierResponseSchema,
      onUsage: (u) => {
        usage = u;
      },
      ...(this.o.transport ? { transport: this.o.transport } : {}),
      ...(this.o.headers ? { headers: this.o.headers } : {}),
    });
    const verdicts: Record<string, AcVerdict> = {};
    for (const v of parsed.verdicts) verdicts[v.id] = { pass: v.pass, reason: v.reason };
    return {
      verdicts,
      provider: this.name,
      model: this.o.model,
      ...(usage ? { usage } : {}),
    };
  }
}
