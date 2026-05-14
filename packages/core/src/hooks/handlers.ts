import type { HookContext, CadenceConfig, CadenceState, AnomalyEvent } from '@cadence/types';
import type { SimpleStateBackend } from '../state/simple.js';
import { atomicWriteText } from '../state/atomic-write.js';
import { renderStateMd } from '../render/state-md.js';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseDraftMd } from '../parse/draft-parser.js';
import { effectiveGateSet } from '../gates/engine.js';
import { selectNotifier } from '../notify/factory.js';

export interface HookResult {
  ok: boolean;
  blockMessage?: string;
  contextPayload?: string;
}

export async function handleSessionStart(_ctx: HookContext, state: CadenceState): Promise<HookResult> {
  const lines = [
    'CADENCE session resumed.',
    `Project: ${state.project.name}`,
    `Loop position: ${state.loopPosition}`,
    `Active phase: ${state.activePhase ?? '(none)'}`,
    `Active draft: ${state.activeDraft ?? '(none)'}`,
  ];
  if (state.openDrafts.length > 0)
    lines.push(`Open drafts: ${state.openDrafts.map((d) => d.id).join(', ')}`);
  return { ok: true, contextPayload: lines.join('\n') };
}

export async function handleUserPrompt(
  _ctx: HookContext,
  state: CadenceState,
  config: CadenceConfig,
  backend: SimpleStateBackend,
): Promise<HookResult> {
  if (config.telemetry.tokenUtilization) {
    state.session.tokenUtilization = Math.min(1, state.session.tokenUtilization + 0.01);
    await backend.writeState(state);
    await atomicWriteText(
      join(await backend.resolveStateDir(), 'STATE.md'),
      renderStateMd(state),
    );
  }
  return { ok: true };
}

export async function handlePreToolEdit(
  ctx: HookContext,
  state: CadenceState,
  config: CadenceConfig,
): Promise<HookResult> {
  // Phase 17.2: hook-side files-outside-boundary detection. Fires only when an
  // active draft exists, the host passed file paths in ctx.raw, and the gate
  // set includes anomaly-notify. Detection-only — never refuses the edit.
  if (state.activeDraft && state.activePhase) {
    const rawFiles = (ctx.raw as { files?: string[] } | undefined)?.files;
    if (rawFiles && rawFiles.length > 0) {
      const draftPath = join(
        ctx.cwd,
        '.cadence/phases',
        state.activePhase,
        `${state.activeDraft}-DRAFT.md`,
      );
      if (existsSync(draftPath)) {
        try {
          const draft = parseDraftMd(await readFile(draftPath, 'utf8'));
          const allowed = new Set(draft.tasks.flatMap((t) => t.files));
          const outsiders = rawFiles.filter((p) => !allowed.has(p));
          if (outsiders.length > 0) {
            const gateSet = effectiveGateSet(state, config, draft);
            if (gateSet.gates.includes('anomaly-notify')) {
              const now = new Date().toISOString();
              const events: AnomalyEvent[] = outsiders.map((file) => ({
                type: 'files-outside-boundary' as const,
                severity: 'warn' as const,
                message: `${file} touched but not declared in any task's files:`,
                context: { file, source: 'hook.preToolEdit' },
                ts: now,
              }));
              const notifier = selectNotifier(config);
              try {
                await notifier.notify(events);
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                process.stderr.write(
                  `notify: ${notifier.name} transport failed — ${msg} (continuing)\n`,
                );
              }
            }
          }
        } catch {
          /* malformed draft must not break the hook */
        }
      }
    }
  }
  if (config.hooks.preToolUseBuildGate && state.loopPosition !== 'BUILD') {
    return {
      ok: false,
      blockMessage: `preToolUseBuildGate is enabled and loopPosition=${state.loopPosition}. Run 'cadence draft approve' to enter BUILD phase before editing.`,
    };
  }
  return { ok: true };
}

export async function handlePostToolEdit(
  ctx: HookContext,
  state: CadenceState,
  _config: CadenceConfig,
  backend: SimpleStateBackend,
): Promise<HookResult> {
  if (state.activeTask) {
    const raw = ctx.raw as { files?: string[] } | undefined;
    if (raw?.files) {
      state.activeTask.touchedFiles = Array.from(
        new Set([...state.activeTask.touchedFiles, ...raw.files]),
      );
      await backend.writeState(state);
    }
  }
  return { ok: true };
}

export async function handleSessionStop(
  _ctx: HookContext,
  state: CadenceState,
  config: CadenceConfig,
): Promise<HookResult> {
  if (config.loopEnforcement !== 'strict') return { ok: true };
  if (state.openDrafts.length > 0) {
    return {
      ok: false,
      blockMessage: `loopEnforcement=strict and ${state.openDrafts.length} unclosed draft(s). Run 'cadence settle' before ending session.`,
    };
  }
  return { ok: true };
}

export async function handleSubagentResult(
  _ctx: HookContext,
  state: CadenceState,
  _config: CadenceConfig,
  backend: SimpleStateBackend,
): Promise<HookResult> {
  state.session.subagentSpawns += 1;
  await backend.writeState(state);
  return { ok: true };
}
