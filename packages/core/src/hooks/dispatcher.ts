import type { AbstractEvent, HookContext } from '@manehorizons/cadence-types';
import { SimpleStateBackend } from '../state/simple.js';
import { loadConfig } from '../config/loader.js';
import {
  handleSessionStart,
  handleUserPrompt,
  handlePreToolEdit,
  handlePostToolEdit,
  handleSessionStop,
  handleSubagentResult,
  handleSkillInvoke,
  type HookResult,
} from './handlers.js';

export class HookDispatcher {
  constructor(private readonly repoRoot: string) {}

  async dispatch(event: AbstractEvent, ctx: HookContext): Promise<HookResult> {
    const backend = new SimpleStateBackend(this.repoRoot);
    const state = await backend.readState();
    const config = await loadConfig(this.repoRoot);
    switch (event) {
      case 'session-start':
        return handleSessionStart(ctx, state);
      case 'user-prompt':
        return handleUserPrompt(ctx, state, config, backend);
      case 'pre-tool-edit':
        return handlePreToolEdit(ctx, state, config);
      case 'post-tool-edit':
        return handlePostToolEdit(ctx, state, config, backend);
      case 'session-stop':
        return handleSessionStop(ctx, state, config);
      case 'subagent-result':
        return handleSubagentResult(ctx, state, config, backend);
      case 'skill-invoke':
        return handleSkillInvoke(ctx, state, config, backend);
    }
  }
}
