import type { Command } from 'commander';
import { registerConfigCommand } from './commands/config.js';
import { registerInitCommand } from './commands/init.js';
import { registerDraftCommand } from './commands/draft.js';
import { registerSpecCommand } from './commands/spec.js';
import { registerHookCommand } from './commands/hook.js';
import { registerBuildCommand } from './commands/build.js';
import { registerDoneCommand } from './commands/done.js';
import { registerBlockCommand } from './commands/block.js';
import { registerNeedsContextCommand } from './commands/needs-context.js';
import { registerSettleCommand } from './commands/settle.js';
import { registerProgressCommand } from './commands/progress.js';
import { registerStatusCommand } from './commands/status.js';
import { registerRecommendationCommand } from './commands/recommendation.js';
import { registerInspectCommand } from './commands/inspect.js';
import { registerRecommendCommand } from './commands/recommend.js';

export function registerAllCommands(program: Command): void {
  registerConfigCommand(program);
  registerInitCommand(program);
  registerDraftCommand(program);
  registerSpecCommand(program);
  registerHookCommand(program);
  registerBuildCommand(program);
  registerDoneCommand(program);
  registerBlockCommand(program);
  registerNeedsContextCommand(program);
  registerSettleCommand(program);
  registerProgressCommand(program);
  registerStatusCommand(program);
  registerRecommendationCommand(program);
  registerInspectCommand(program);
  registerRecommendCommand(program);
}
