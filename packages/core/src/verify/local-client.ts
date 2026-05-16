import type { ZodType } from 'zod/v4';

export interface LocalChatJSONOptions<T> {
  baseURL: string;
  model: string;
  system: string;
  user: string;
  schema: ZodType<T>;
  /** Test seam; defaults to global fetch. */
  transport?: typeof fetch;
  maxTokens?: number;
}

/** Extract a JSON object from model content: drop fences, slice first { … last }. */
function extractJson(content: string): string {
  const noFence = content.replace(/```(?:json)?/gi, '');
  const start = noFence.indexOf('{');
  const end = noFence.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return noFence.trim();
  return noFence.slice(start, end + 1);
}

async function callOnce(
  o: LocalChatJSONOptions<unknown>,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const fetchImpl = o.transport ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(`${o.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: o.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0,
        ...(o.maxTokens ? { max_tokens: o.maxTokens } : {}),
      }),
    });
  } catch (err) {
    throw new Error(
      `local provider: request to ${o.baseURL} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`local provider: ${o.baseURL} returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return body.choices?.[0]?.message?.content ?? '';
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined; // schema.safeParse(undefined) fails → triggers repair/throw
  }
}

export async function localChatJSON<T>(o: LocalChatJSONOptions<T>): Promise<T> {
  const messages = [
    { role: 'system', content: o.system },
    { role: 'user', content: o.user },
  ];
  const raw1 = await callOnce(o as LocalChatJSONOptions<unknown>, messages);
  const first = o.schema.safeParse(safeJson(extractJson(raw1)));
  if (first.success) return first.data;

  // One repair retry: feed back the bad output + the validation error.
  const repairMessages = [
    ...messages,
    { role: 'assistant', content: raw1 },
    {
      role: 'user',
      content:
        'That was not valid. Return ONLY strict JSON matching the required schema, no prose, no code fences. Error: ' +
        first.error.message,
    },
  ];
  const raw2 = await callOnce(o as LocalChatJSONOptions<unknown>, repairMessages);
  const second = o.schema.safeParse(safeJson(extractJson(raw2)));
  if (second.success) return second.data;

  throw new Error(
    `local provider: model output failed JSON/schema validation after one repair retry (${o.baseURL}, model=${o.model}): ${second.error.message}`,
  );
}
