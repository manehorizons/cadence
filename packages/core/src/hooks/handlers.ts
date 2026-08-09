import { HostCapabilitiesZ, type HookContext, type CadenceConfig, type CadenceState } from '@thomas-powers-jr/cadence-types';
import type { SimpleStateBackend } from '../state/simple.js';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseDraftMd } from '../parse/draft-parser.js';
import { effectiveGateSet, effectiveBoundaryEnforcement, effectiveRedundantWorkEnforcement } from '../gates/engine.js';
import { selectNotifier } from '../notify/factory.js';
import { runBoundaryCheck } from '../checks/boundary.js';
import { runRedundancyCheck, TERMINAL_TASK_STATUSES } from '../checks/task-redundancy.js';
import type { ProgressFile } from '../status.js';

export interface HookResult {
  ok: boolean;
  blockMessage?: string;
  contextPayload?: string;
}

/**
 * Phase 222 AC-3: a host adapter may embed the `HostCapabilities` it
 * declared into the raw hook payload it sends to `cadence hook`, under a
 * `hostCapabilities` key (`ctx.raw` is host-defined and unvalidated — see
 * {@link HookContext.raw}). Best-effort: missing or malformed data yields
 * `undefined`, never a throw (observation code must not break the hook).
 */
function readHostCapabilities(ctx: HookContext) {
  if (!ctx.raw || typeof ctx.raw !== 'object') return undefined;
  const candidate = (ctx.raw as { hostCapabilities?: unknown }).hostCapabilities;
  if (candidate === undefined) return undefined;
  const parsed = HostCapabilitiesZ.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Phase 222 AC-3: `ctx.agentId`/`ctx.agentType` are absent both for the
 * ordinary main-thread case (no subagent involved — not worth a word) and
 * for a host whose adapter declared it cannot supply agent identity at all
 * (`capabilities.agentIdentification === false`, e.g. host-codex — see its
 * `capabilities.ts`). The two are indistinguishable from `ctx.agentId` alone;
 * this makes the second case loud instead of indistinguishable-from-silent,
 * per the repo's "Quiet Fallback" anti-pattern. Never blocks — subagent
 * task-redundancy monitoring degrades to "not tracked for this session", it
 * does not fail the hook.
 */
function noticeIfAgentIdentificationUnsupported(ctx: HookContext, sourceEvent: string): void {
  if (ctx.agentId) return;
  const capabilities = readHostCapabilities(ctx);
  if (capabilities?.agentIdentification !== false) return;
  process.stderr.write(
    `cadence: host capabilities declare agentIdentification=false (${sourceEvent}) — this host's hook payloads do not carry agentId/agentType, so per-subagent task-redundancy monitoring (baseline snapshot + touched-file tracking) cannot run for this session. Degrading: skipping subagent-scoped checks for this event.\n`,
  );
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
          const now = new Date().toISOString();
          const declaredFiles = draft.tasks.flatMap((t) => t.files);
          const events = runBoundaryCheck({
            declaredFiles,
            touchedFiles: rawFiles,
            stamp: () => now,
            extraContext: { source: 'hook.preToolEdit' },
            root: ctx.cwd,
          });
          if (events.length > 0) {
            // Phase 155 AC-2/AC-4: block mode refuses, but only when there is an
            // actual declared boundary to enforce — an empty `files:` union
            // must fail OPEN (never block 100% of edits as a side effect of a
            // DRAFT that omits `files:`).
            if (
              effectiveBoundaryEnforcement(config, draft) === 'block' &&
              declaredFiles.length > 0
            ) {
              const files = events.map((e) => String(e.context.file));
              return {
                ok: false,
                blockMessage: `boundaryEnforcement=block: file(s) not declared in any task's files: ${files.join(', ')}`,
              };
            }
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

          // Subagent task-redundancy monitoring: same PreToolUse hook, a
          // different axis (task status, not file boundary). Independent of
          // the boundary check above — both can fire on the same edit.
          const redundantMode = effectiveRedundantWorkEnforcement(config, draft);
          if (redundantMode !== 'off') {
            const progressPath = join(
              ctx.cwd,
              '.cadence/phases',
              state.activePhase,
              `${state.activeDraft}-PROGRESS.json`,
            );
            let taskStatuses: Record<string, string> = {};
            if (existsSync(progressPath)) {
              try {
                const progress = JSON.parse(await readFile(progressPath, 'utf8')) as ProgressFile;
                for (const [id, entry] of Object.entries(progress.tasks)) {
                  taskStatuses[id] = entry.status;
                }
              } catch {
                taskStatuses = {};
              }
            }
            const redundancyEvents = runRedundancyCheck({
              tasks: draft.tasks.map((t) => ({ taskId: t.id, files: t.files })),
              taskStatuses,
              touchedFiles: rawFiles,
              stamp: () => now,
              extraContext: { source: 'hook.preToolEdit' },
              root: ctx.cwd,
              severity: redundantMode === 'block' ? 'error' : 'warn',
            });
            if (redundancyEvents.length > 0) {
              if (redundantMode === 'block') {
                const first = redundancyEvents[0]!;
                return {
                  ok: false,
                  blockMessage: `redundantWorkEnforcement=block: ${String(first.context.file)} belongs to ${String(first.context.taskId)}, already ${String(first.context.status)} — mark it back to NEEDS_CONTEXT first (cadence build task ${String(first.context.taskId)} --status=NEEDS_CONTEXT), or confirm with the orchestrator.`,
                };
              }
              const gateSet = effectiveGateSet(state, config, draft);
              if (gateSet.gates.includes('anomaly-notify')) {
                const notifier = selectNotifier(config);
                try {
                  await notifier.notify(redundancyEvents);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  process.stderr.write(
                    `notify: ${notifier.name} transport failed — ${msg} (continuing)\n`,
                  );
                }
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
  if (ctx.agentId && state.session.subagentBaselines[ctx.agentId]) {
    const raw = ctx.raw as { files?: string[] } | undefined;
    if (raw?.files) {
      const baseline = state.session.subagentBaselines[ctx.agentId]!;
      baseline.touchedFiles = Array.from(new Set([...baseline.touchedFiles, ...raw.files]));
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
  ctx: HookContext,
  state: CadenceState,
  config: CadenceConfig,
  backend: SimpleStateBackend,
): Promise<HookResult> {
  const agentId = ctx.agentId;
  const baseline = agentId ? state.session.subagentBaselines[agentId] : undefined;
  if (!agentId || !baseline) {
    noticeIfAgentIdentificationUnsupported(ctx, 'subagent-result');
    // Sole mutation on this path is the spawn-count telemetry increment —
    // route it through the revision-exempt path (issue #234) so a
    // long-running gate elsewhere can never see this as a structural
    // conflict. Bumps on-disk state directly rather than persisting the
    // in-memory `state` snapshot, so the in-memory object is intentionally
    // left untouched here (see `bumpSessionCounter` doc).
    await backend.bumpSessionCounter('subagentSpawns', 1);
    return { ok: true };
  }
  state.session.subagentSpawns += 1;

  // Always prune the baseline after this check — it's a one-shot comparison,
  // ephemeral session state, never persisted into SUMMARY.json.
  delete state.session.subagentBaselines[agentId];

  if (!state.activeDraft || !state.activePhase) {
    await backend.commit(state);
    return { ok: true };
  }
  const draftPath = join(
    ctx.cwd,
    '.cadence/phases',
    state.activePhase,
    `${state.activeDraft}-DRAFT.md`,
  );
  if (!existsSync(draftPath)) {
    await backend.commit(state);
    return { ok: true };
  }

  try {
    const draft = parseDraftMd(await readFile(draftPath, 'utf8'));
    const mode = effectiveRedundantWorkEnforcement(config, draft);
    if (mode === 'off' || baseline.touchedFiles.length === 0) {
      await backend.commit(state);
      return { ok: true };
    }
    const events = runRedundancyCheck({
      tasks: draft.tasks.map((t) => ({ taskId: t.id, files: t.files })),
      taskStatuses: baseline.taskStatuses,
      touchedFiles: baseline.touchedFiles,
      stamp: () => new Date().toISOString(),
      extraContext: { source: 'hook.subagentStop', ...(ctx.agentType ? { agentType: ctx.agentType } : {}) },
      root: ctx.cwd,
      severity: mode === 'block' ? 'error' : 'warn',
    });
    if (events.length === 0) {
      await backend.commit(state);
      return { ok: true };
    }
    if (mode === 'block') {
      await backend.commit(state);
      const first = events[0]!;
      return {
        ok: false,
        blockMessage: `redundantWorkEnforcement=block: ${String(first.context.file)} belongs to ${String(first.context.taskId)}, already ${String(first.context.status)} — mark it back to NEEDS_CONTEXT first (cadence build task ${String(first.context.taskId)} --status=NEEDS_CONTEXT), or confirm with the orchestrator.`,
      };
    }
    const gateSet = effectiveGateSet(state, config, draft);
    if (gateSet.gates.includes('anomaly-notify')) {
      const notifier = selectNotifier(config);
      try {
        await notifier.notify(events);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`notify: ${notifier.name} transport failed — ${msg} (continuing)\n`);
      }
    }
    await backend.commit(state);
    return { ok: true };
  } catch {
    /* malformed draft must not break the hook */
    await backend.commit(state);
    return { ok: true };
  }
}

export async function handleSubagentStart(
  ctx: HookContext,
  state: CadenceState,
  _config: CadenceConfig,
  backend: SimpleStateBackend,
): Promise<HookResult> {
  if (!ctx.agentId) {
    noticeIfAgentIdentificationUnsupported(ctx, 'subagent-start');
    return { ok: true };
  }
  if (!state.activeDraft || !state.activePhase) return { ok: true };
  const draftPath = join(
    ctx.cwd,
    '.cadence/phases',
    state.activePhase,
    `${state.activeDraft}-DRAFT.md`,
  );
  if (!existsSync(draftPath)) return { ok: true };
  try {
    const draft = parseDraftMd(await readFile(draftPath, 'utf8'));
    const progressPath = join(
      ctx.cwd,
      '.cadence/phases',
      state.activePhase,
      `${state.activeDraft}-PROGRESS.json`,
    );
    let progress: ProgressFile | null = null;
    if (existsSync(progressPath)) {
      try {
        progress = JSON.parse(await readFile(progressPath, 'utf8')) as ProgressFile;
      } catch {
        progress = null;
      }
    }
    const taskStatuses: Record<string, string> = {};
    for (const t of draft.tasks) {
      taskStatuses[t.id] = progress?.tasks[t.id]?.status ?? 'PENDING';
    }
    state.session.subagentBaselines[ctx.agentId] = {
      startedAt: new Date().toISOString(),
      taskStatuses,
      touchedFiles: [],
    };
    await backend.commit(state);

    const board = draft.tasks.map((t) => `${t.id} ${taskStatuses[t.id]}`).join(', ');
    const doneIds = draft.tasks
      .filter((t) => TERMINAL_TASK_STATUSES.has(taskStatuses[t.id] ?? 'PENDING'))
      .map((t) => t.id);
    const nudge =
      doneIds.length > 0
        ? `Live task status as of your start: ${board}. Do not redo ${doneIds.join('/')} — already finished.`
        : `Live task status as of your start: ${board}.`;
    return { ok: true, contextPayload: nudge };
  } catch {
    /* malformed draft/progress must not break the hook */
    return { ok: true };
  }
}

const SKILL_AUDIT_CAP = 100;

/**
 * Phase 266 AC-4 — pure push+FIFO-cap logic for `state.skillAudit.invoked`,
 * extracted out of `handleSkillInvoke` so the drop-at-cap behavior can be
 * unit-tested directly (no I/O, no dispatcher round-trip). Appends `skill`
 * then drops from the front while length exceeds `cap`. Does not mutate
 * `invoked` — returns a new array. Takes `cap` as a parameter rather than
 * closing over `SKILL_AUDIT_CAP` so it stays testable independent of the
 * module constant.
 */
export function applySkillInvoke(invoked: readonly string[], skill: string, cap: number): string[] {
  const next = [...invoked, skill];
  while (next.length > cap) {
    next.shift();
  }
  return next;
}

/**
 * Phase 23.4 — skillAudit wiring. Records the skill name from `ctx.raw.skill`
 * into `state.skillAudit.invoked` when `config.telemetry.skillInvocations` is
 * enabled. Dedups (set-like) and caps the array at 100 entries with FIFO
 * eviction (via {@link applySkillInvoke}). Best-effort: missing skill or
 * telemetry disabled → no-op.
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
  state.skillAudit.invoked = applySkillInvoke(state.skillAudit.invoked, skill, SKILL_AUDIT_CAP);
  await backend.commit(state);
  return { ok: true };
}
