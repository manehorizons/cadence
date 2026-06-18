import type { HookContext, CadenceConfig, CadenceState } from '@manehorizons/cadence-types';
import type { SimpleStateBackend } from '../state/simple.js';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseDraftMd } from '../parse/draft-parser.js';
import { effectiveGateSet } from '../gates/engine.js';
import { selectNotifier } from '../notify/factory.js';
import { runBoundaryCheck } from '../checks/boundary.js';
import { assertSafePhaseSlug } from '../phases/id.js';

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
    await backend.commit(state);
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
    const safePhase = (() => {
      try {
        return assertSafePhaseSlug(state.activePhase!);
      } catch {
        return null;
      }
    })();
    const rawFiles = (ctx.raw as { files?: string[] } | undefined)?.files;
    if (safePhase && rawFiles && rawFiles.length > 0) {
      const draftPath = join(
        ctx.cwd,
        '.cadence/phases',
        safePhase,
        `${state.activeDraft}-DRAFT.md`,
      );
      if (existsSync(draftPath)) {
        try {
          const draft = parseDraftMd(await readFile(draftPath, 'utf8'));
          const now = new Date().toISOString();
          const events = runBoundaryCheck({
            declaredFiles: draft.tasks.flatMap((t) => t.files),
            touchedFiles: rawFiles,
            stamp: () => now,
            extraContext: { source: 'hook.preToolEdit' },
            root: ctx.cwd,
          });
          if (events.length > 0) {
            const gateSet = effectiveGateSet(state, config, draft);
            if (gateSet.gates.includes('anomaly-notify')) {
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
      await backend.commit(state);
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
  await backend.commit(state);
  return { ok: true };
}

const SKILL_AUDIT_CAP = 100;

/**
 * Phase 23.4 — skillAudit wiring. Records the skill name from `ctx.raw.skill`
 * into `state.skillAudit.invoked` when `config.telemetry.skillInvocations` is
 * enabled. Dedups (set-like) and caps the array at 100 entries with FIFO
 * eviction. Best-effort: missing skill or telemetry disabled → no-op.
 */
export async function handleSkillInvoke(
  ctx: HookContext,
  state: CadenceState,
  config: CadenceConfig,
  backend: SimpleStateBackend,
): Promise<HookResult> {
  if (!config.telemetry.skillInvocations) return { ok: true };
  const skill = (ctx.raw as { skill?: unknown } | undefined)?.skill;
  if (typeof skill !== 'string' || skill.length === 0) return { ok: true };
  if (state.skillAudit.invoked.includes(skill)) return { ok: true };
  state.skillAudit.invoked.push(skill);
  while (state.skillAudit.invoked.length > SKILL_AUDIT_CAP) {
    state.skillAudit.invoked.shift();
  }
  await backend.commit(state);
  return { ok: true };
}
