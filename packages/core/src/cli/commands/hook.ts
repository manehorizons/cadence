import type { Command } from 'commander';
import { AbstractEventZ } from '@manehorizons/cadence-types';
import { HookDispatcher } from '../../hooks/dispatcher.js';

export function registerHookCommand(program: Command): void {
  program
    .command('hook <event>')
    .description('Dispatch an abstract hook event (called by host adapter shims)')
    .action(async (eventRaw: string) => {
      try {
        const parsed = AbstractEventZ.safeParse(eventRaw);
        if (!parsed.success) {
          process.stderr.write(`Unknown hook event: ${eventRaw}\n`);
          process.exitCode = 2;
          return;
        }
        let raw = '';
        if (!process.stdin.isTTY) {
          for await (const chunk of process.stdin) raw += chunk.toString();
        }
        const dispatcher = new HookDispatcher(process.cwd());
        const parsedRaw = raw ? safeJson(raw) : undefined;
        const rawObj = parsedRaw as { agentId?: unknown; agentType?: unknown } | undefined;
        const ctx = {
          event: parsed.data,
          cwd: process.cwd(),
          raw: parsedRaw,
          ...(typeof rawObj?.agentId === 'string' ? { agentId: rawObj.agentId } : {}),
          ...(typeof rawObj?.agentType === 'string' ? { agentType: rawObj.agentType } : {}),
        };
        const result = await dispatcher.dispatch(parsed.data, ctx);
        if (result.contextPayload) console.log(result.contextPayload);
        if (!result.ok) {
          if (result.blockMessage) process.stderr.write(result.blockMessage + '\n');
          // Exit 2 = blocking per Claude Code hook protocol; stderr surfaces to the model.
          process.exitCode = 2;
        }
      } catch (err) {
        process.stderr.write(
          `hook dispatch failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}
