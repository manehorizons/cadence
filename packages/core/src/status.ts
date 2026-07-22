import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  CadenceConfig,
  CadenceState,
  Draft,
  LoopPosition,
  Profile,
  TaskStatus,
  Tier,
} from '@manehorizons/cadence-types';
import { nextAction } from './progress.js';
import { parseAcRefs } from './parse/ac-refs.js';
import { parseDraftMd } from './parse/draft-parser.js';
import { SimpleStateBackend } from './state/simple.js';
import { loadConfig } from './config/loader.js';
import { effectiveProfile } from './gates/engine.js';

export interface ProgressFile {
  draftId: string;
  tasks: Record<
    string,
    { status: string; notes: string; touchedFiles: string[]; updatedAt: string }
  >;
}

export interface TaskStatusEntry {
  id: string;
  name: string;
  status: TaskStatus;
  acs: string[];
}

export interface AcStatus {
  id: string;
  state: 'pending' | 'pass' | 'blocked' | 'needs-context';
}

export interface StatusReport {
  /** Schema version for the --json output. Bump on breaking changes. */
  schemaVersion: 1;
  project: string;
  loopPosition: LoopPosition;
  activePhase: string | null;
  activeDraft: string | null;
  tier: Tier | null;
  /** Effective profile: DRAFT frontmatter override (if any) wins over project config. */
  profile: Profile;
  draftTitle: string | null;
  tasks: TaskStatusEntry[];
  acs: AcStatus[];
  /**
   * Deliberately narrowed to `{command, reason}` (phase 206), not the full
   * `NextAction` return: `nextAction()` now also carries a ranked
   * `legalMoves[]` (phase 206 T1), which is `cadence next`'s surface, not
   * `status`'s — mirrors `services/progress.ts`/`quickstart/build.ts`'s
   * identical narrowing, so `cadence status --json`'s public contract
   * doesn't silently grow a field.
   */
  next: { command: string; reason: string };
}

const PASS_STATUSES: TaskStatus[] = ['DONE', 'DONE_WITH_CONCERNS'];

function taskStatusFromProgress(
  taskId: string,
  progress: ProgressFile | null,
): TaskStatus {
  const raw = progress?.tasks[taskId]?.status;
  if (raw === undefined) return 'PENDING';
  switch (raw) {
    case 'PENDING':
    case 'IN_PROGRESS':
    case 'DONE':
    case 'DONE_WITH_CONCERNS':
    case 'NEEDS_CONTEXT':
    case 'BLOCKED':
      return raw;
    default:
      return 'PENDING';
  }
}

export function gatherStatus(
  state: CadenceState,
  draft: Draft | null,
  progress: ProgressFile | null,
  config: Pick<CadenceConfig, 'profile'> | null = null,
): StatusReport {
  const { command, reason } = nextAction(state);
  const base: StatusReport = {
    schemaVersion: 1,
    project: state.project.name,
    loopPosition: state.loopPosition,
    activePhase: state.activePhase ?? null,
    activeDraft: state.activeDraft ?? null,
    tier: state.tier ?? null,
    profile: effectiveProfile(config, draft),
    draftTitle: null,
    tasks: [],
    acs: [],
    next: { command, reason },
  };
  if (!draft) return base;

  base.draftTitle = draft.title;

  const tasks: TaskStatusEntry[] = draft.tasks.map((t) => ({
    id: t.id,
    name: t.name,
    status: taskStatusFromProgress(t.id, progress),
    acs: parseAcRefs(t.done),
  }));
  base.tasks = tasks;

  base.acs = draft.acceptanceCriteria.map((ac) => {
    const linked = tasks.filter((t) => t.acs.includes(ac.id));
    if (linked.length === 0) return { id: ac.id, state: 'pending' };
    if (linked.some((t) => t.status === 'BLOCKED')) {
      return { id: ac.id, state: 'blocked' };
    }
    if (linked.some((t) => t.status === 'NEEDS_CONTEXT')) {
      return { id: ac.id, state: 'needs-context' };
    }
    if (linked.every((t) => PASS_STATUSES.includes(t.status))) {
      return { id: ac.id, state: 'pass' };
    }
    return { id: ac.id, state: 'pending' };
  });

  return base;
}

export interface DerivedAcResult {
  id: string;
  verdict: 'pass' | 'blocked' | 'needs-context' | 'pending';
  /** Task ids that prevent a pass (BLOCKED/NEEDS_CONTEXT, or not-yet-DONE). */
  blockers: string[];
}

export function deriveAcResults(
  draft: Draft,
  progress: ProgressFile | null,
): DerivedAcResult[] {
  return draft.acceptanceCriteria.map((ac) => {
    const linked = draft.tasks.filter((t) => parseAcRefs(t.done).includes(ac.id));
    if (linked.length === 0) {
      return { id: ac.id, verdict: 'pending', blockers: [] };
    }
    const hardBlocked: string[] = [];
    const needsContext: string[] = [];
    const stillOpen: string[] = [];
    for (const t of linked) {
      const status = taskStatusFromProgress(t.id, progress);
      if (status === 'BLOCKED') hardBlocked.push(t.id);
      else if (status === 'NEEDS_CONTEXT') needsContext.push(t.id);
      else if (!PASS_STATUSES.includes(status)) stillOpen.push(t.id);
    }
    if (hardBlocked.length > 0) {
      // BLOCKED has priority; surface NEEDS_CONTEXT tasks alongside as blockers.
      return {
        id: ac.id,
        verdict: 'blocked',
        blockers: [...hardBlocked, ...needsContext],
      };
    }
    if (needsContext.length > 0) {
      return { id: ac.id, verdict: 'needs-context', blockers: needsContext };
    }
    if (stillOpen.length > 0) {
      return { id: ac.id, verdict: 'pending', blockers: stillOpen };
    }
    return { id: ac.id, verdict: 'pass', blockers: [] };
  });
}

function pad(text: string, width: number): string {
  if (text.length >= width) return text;
  return text + ' '.repeat(width - text.length);
}

function renderTaskTable(tasks: TaskStatusEntry[]): string[] {
  if (tasks.length === 0) return [];
  const idW = Math.max(2, ...tasks.map((t) => t.id.length));
  const statusW = Math.max(6, ...tasks.map((t) => t.status.length));
  const nameW = Math.max(4, ...tasks.map((t) => t.name.length));
  const lines = ['  TASKS', '  ' + '─'.repeat(idW + statusW + nameW + 6)];
  for (const t of tasks) {
    const acRef = t.acs.length > 0 ? `→ ${t.acs.join(', ')}` : '';
    lines.push(`  ${pad(t.id, idW)}  ${pad(t.status, statusW)}  ${pad(t.name, nameW)}  ${acRef}`.trimEnd());
  }
  return lines;
}

function renderAcTable(acs: AcStatus[]): string[] {
  if (acs.length === 0) return [];
  const lines = ['', '  ACS', '  ' + '─'.repeat(20)];
  for (const ac of acs) {
    const glyph =
      ac.state === 'pass'
        ? '[x]'
        : ac.state === 'blocked'
          ? '[!]'
          : ac.state === 'needs-context'
            ? '[?]'
            : '[ ]';
    lines.push(`  ${glyph} ${ac.id}  ${ac.state}`);
  }
  return lines;
}

export function renderStatus(r: StatusReport): string {
  const out: string[] = [];
  out.push(`CADENCE — ${r.project}`);
  out.push(`  loop:  ${r.loopPosition}`);
  if (r.activePhase) out.push(`  phase: ${r.activePhase}`);
  if (r.activeDraft) {
    const title = r.draftTitle ? ` — ${r.draftTitle}` : '';
    out.push(`  draft: ${r.activeDraft}${title}`);
  }
  if (r.tier) out.push(`  tier:  ${r.tier}`);
  out.push(`  profile: ${r.profile}`);
  if (r.tasks.length > 0) {
    out.push('');
    out.push(...renderTaskTable(r.tasks));
  }
  if (r.acs.length > 0) out.push(...renderAcTable(r.acs));
  out.push('');
  out.push(`NEXT: ${r.next.command}`);
  out.push(`  ${r.next.reason}`);
  return out.join('\n') + '\n';
}

async function readJsonIfExists<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function readTextIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

export async function loadStatus(root: string): Promise<StatusReport> {
  const backend = new SimpleStateBackend(root);
  const state = await backend.readState();
  let draft: Draft | null = null;
  let progress: ProgressFile | null = null;
  if (state.activePhase && state.activeDraft) {
    const phaseDir = join(root, '.cadence/phases', state.activePhase);
    const draftPath = join(phaseDir, `${state.activeDraft}-DRAFT.md`);
    const draftRaw = await readTextIfExists(draftPath);
    if (draftRaw !== null) {
      try {
        draft = parseDraftMd(draftRaw);
      } catch {
        draft = null;
      }
    }
    progress = await readJsonIfExists<ProgressFile>(
      join(phaseDir, `${state.activeDraft}-PROGRESS.json`),
    );
  }
  let config: Pick<CadenceConfig, 'profile'> | null = null;
  try {
    config = await loadConfig(root);
  } catch {
    config = null;
  }
  return gatherStatus(state, draft, progress, config);
}
