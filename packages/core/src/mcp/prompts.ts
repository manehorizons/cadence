import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { COMMAND_GUIDANCE, SCOUT_DIALOGUE } from '@thomas-powers-jr/cadence-types';

/**
 * MCP **Prompts** (phase 77) — guided workflows exposed to any MCP host, sourced
 * from the shared `@thomas-powers-jr/cadence-types` guidance module (the same text
 * the Claude-Code slash commands render). Prompts orient the conversation; they
 * do not drive the loop — the tools act. The scout prompt is the standout: an
 * inherently conversational dialogue rather than a request/response tool.
 */

const userMessage = (text: string): GetPromptResult => ({
  messages: [{ role: 'user', content: { type: 'text', text } }],
});

/** The prompt names this server advertises (handy for tests). */
export const PROMPT_NAMES: readonly string[] = [
  'cadence_scout',
  'cadence_next',
  'cadence_draft',
  'cadence_settle',
];

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'cadence_scout',
    {
      description: COMMAND_GUIDANCE['cadence-scout'].description,
      argsSchema: { topic: z.string().optional().describe('The problem space to scout') },
    },
    (args) => {
      const topic =
        args.topic && args.topic.length > 0
          ? args.topic
          : '(no topic given — ask the user what space to scout)';
      return userMessage(SCOUT_DIALOGUE.replace('$ARGUMENTS', () => topic));
    },
  );

  server.registerPrompt(
    'cadence_next',
    { description: 'Orient on the CADENCE loop and take the next suggested step.' },
    () =>
      userMessage(
        `Call the cadence_progress tool to get the single recommended next action for the loop, then act on it.\n\n${COMMAND_GUIDANCE['cadence-progress'].trailing}`,
      ),
  );

  server.registerPrompt(
    'cadence_draft',
    {
      description: COMMAND_GUIDANCE['cadence-draft'].description,
      argsSchema: {
        phase: z.string().describe('Phase slug, e.g. "80-foo"'),
        num: z.string().describe('Two-digit unit number, e.g. "01"'),
      },
    },
    (args) =>
      userMessage(
        `Scaffold a DRAFT for phase ${args.phase} unit ${args.num} via the cadence_draft_new tool, then ${COMMAND_GUIDANCE['cadence-draft'].trailing}`,
      ),
  );

  server.registerPrompt(
    'cadence_settle',
    { description: COMMAND_GUIDANCE['cadence-settle'].description },
    () =>
      userMessage(
        `Once every BUILD task is recorded, close the loop with the cadence_settle tool. ${COMMAND_GUIDANCE['cadence-settle'].trailing}`,
      ),
  );
}
