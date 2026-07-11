import type { ZodType } from 'zod/v4';
import { getLogger } from '../logging/logger.js';
import { runWithRepair } from './json-repair.js';

export interface LocalChatJSONOptions<T> {
  baseURL: string;
  model: string;
  system: string;
  user: string;
  schema: ZodType<T>;
  /** Test seam; defaults to global fetch. */
  transport?: typeof fetch;
  maxTokens?: number;
  /**
   * Phase 72: extra HTTP headers merged over the base `content-type` — e.g. an
   * `Authorization` bearer for a token-gated OpenAI-compatible proxy. Values are
   * never logged.
   */
  headers?: Record<string, string>;
  /**
   * Phase 73: invoked with mapped token usage whenever the endpoint returns a
   * usage block (OpenAI-compatible `prompt_tokens`/`completion_tokens`). Not
   * called when the endpoint omits usage. Last call wins across repair retries.
   */
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
}

async function callOnce(
  o: LocalChatJSONOptions<unknown>,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const fetchImpl = o.transport ?? fetch;
  // Header values (auth bearer etc.) are never logged — only the endpoint + model.
  const log = getLogger().child({ seam: 'verify', provider: 'local' });
  let res: Response;
  log.debug('verify request', { baseURL: o.baseURL, model: o.model });
  try {
    res = await fetchImpl(`${o.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(o.headers ?? {}) },
      body: JSON.stringify({
        model: o.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0,
        ...(o.maxTokens ? { max_tokens: o.maxTokens } : {}),
      }),
    });
  } catch (err) {
    log.warn('verify error', { baseURL: o.baseURL, error: err instanceof Error ? err.name : 'unknown' });
    throw new Error(
      `local provider: request to ${o.baseURL} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    log.warn('verify error', { baseURL: o.baseURL, status: res.status });
    throw new Error(`local provider: ${o.baseURL} returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const u = body.usage;
  if (
    typeof u?.prompt_tokens === 'number' &&
    typeof u.completion_tokens === 'number'
  ) {
    log.debug('verify response', { inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens });
    if (o.onUsage) {
      o.onUsage({ inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens });
    }
  } else {
    log.debug('verify response', {});
  }
  return body.choices?.[0]?.message?.content ?? '';
}

/** Initial call + this many repair retries before throwing. */
const MAX_REPAIR_RETRIES = 2;

export async function localChatJSON<T>(o: LocalChatJSONOptions<T>): Promise<T> {
  return runWithRepair({
    system: o.system,
    user: o.user,
    schema: o.schema,
    maxRepairRetries: MAX_REPAIR_RETRIES,
    transport: (messages) => callOnce(o as LocalChatJSONOptions<unknown>, messages),
    buildError: (lastError, retries) =>
      `local provider: model output failed JSON/schema validation after ${retries} repair retries (${o.baseURL}, model=${o.model}): ${lastError}`,
  });
}
