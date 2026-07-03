// packages/core/src/handoff/candidates.ts
import { readKey } from './locate.js';

export interface HandoffMeta {
  generatedAt: string | null;
  label: string | null;
  loopPosition: string | null;
  activePhase: string | null;
  gitBranch: string | null;
  tier: string | null;
}

export function parseHandoffMeta(content: string): HandoffMeta {
  return {
    generatedAt: readKey(content, 'generated_at'),
    label: readKey(content, 'label'),
    loopPosition: readKey(content, 'loop_position'),
    activePhase: readKey(content, 'active_phase'),
    gitBranch: readKey(content, 'git_branch'),
    tier: readKey(content, 'tier'),
  };
}
