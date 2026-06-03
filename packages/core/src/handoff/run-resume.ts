// packages/core/src/handoff/run-resume.ts
import type { ResumeResult } from '@manehorizons/cadence-types';
import { SimpleStateBackend } from '../state/simple.js';
import { runContext } from '../intelligence/context.js';
import { locateFreshestHandoff } from './locate.js';

export async function runResume(root: string, now: Date = new Date()): Promise<ResumeResult> {
  let lastHandoff: string | null = null;
  let liveLoopPosition: string | null = null;
  try {
    const state = await new SimpleStateBackend(root).readState();
    lastHandoff = state.session.lastHandoff;
    liveLoopPosition = state.loopPosition;
  } catch {
    // no/corrupt state — fall back to globbing, no drift comparison
  }

  const located = await locateFreshestHandoff(root, lastHandoff);
  if (!located) return { found: false };

  const context = await runContext(root, 'handoff', now);

  const drift =
    located.loopPosition && liveLoopPosition && located.loopPosition !== liveLoopPosition
      ? { docLoopPosition: located.loopPosition, liveLoopPosition }
      : null;

  return {
    found: true,
    handoffPath: located.path,
    generatedAt: located.generatedAt,
    doc: located.content,
    context,
    drift,
  };
}
