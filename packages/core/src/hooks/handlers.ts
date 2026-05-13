import type { HookContext, KeelConfig, KeelState } from '@keel/types';
import { SimpleStateBackend } from '../state/simple.js';
import { atomicWriteText } from '../state/atomic-write.js';
import { renderStateMd } from '../render/state-md.js';
import { join } from 'node:path';

export interface HookResult {
  ok: boolean;
  blockMessage?: string;
  contextPayload?: string;
}

export async function handleSessionStart(_ctx: HookContext, state: KeelState): Promise<HookResult> {
  const lines = [
    'KEEL session resumed.',
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
  state: KeelState,
  config: KeelConfig,
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
  _ctx: HookContext,
  state: KeelState,
  config: KeelConfig,
): Promise<HookResult> {
  if (config.hooks.preToolUseBuildGate && state.loopPosition !== 'BUILD') {
    return {
      ok: false,
      blockMessage: `preToolUseBuildGate is enabled and loopPosition=${state.loopPosition}. Run 'keel draft approve' to enter BUILD phase before editing.`,
    };
  }
  return { ok: true };
}

export async function handlePostToolEdit(
  ctx: HookContext,
  state: KeelState,
  _config: KeelConfig,
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
  state: KeelState,
  config: KeelConfig,
): Promise<HookResult> {
  if (config.loopEnforcement !== 'strict') return { ok: true };
  if (state.openDrafts.length > 0) {
    return {
      ok: false,
      blockMessage: `loopEnforcement=strict and ${state.openDrafts.length} unclosed draft(s). Run 'keel settle' before ending session.`,
    };
  }
  return { ok: true };
}

export async function handleSubagentResult(
  _ctx: HookContext,
  state: KeelState,
  _config: KeelConfig,
  backend: SimpleStateBackend,
): Promise<HookResult> {
  state.session.subagentSpawns += 1;
  await backend.writeState(state);
  return { ok: true };
}
