import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Draft, KeelState, LoopPosition, TaskStatus, Tier } from '@keel/types';
import { nextAction, type NextAction } from './progress.js';
import { parseDraftMd } from './parse/draft-parser.js';
import { SimpleStateBackend } from './state/simple.js';

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
  state: 'pending' | 'pass' | 'blocked';
}

export interface StatusReport {
  /** Schema version for the --json output. Bump on breaking changes. */
  schemaVersion: 1;
  project: string;
  loopPosition: LoopPosition;
  activePhase: string | null;
  activeDraft: string | null;
  tier: Tier | null;
  draftTitle: string | null;
  tasks: TaskStatusEntry[];
  acs: AcStatus[];
  next: NextAction;
}

const BLOCKING_STATUSES: TaskStatus[] = ['BLOCKED', 'NEEDS_CONTEXT'];
const PASS_STATUSES: TaskStatus[] = ['DONE', 'DONE_WITH_CONCERNS'];

function parseAcRefs(done: string): string[] {
  return done
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^AC-\d+$/.test(s));
}

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
  state: KeelState,
  draft: Draft | null,
  progress: ProgressFile | null,
): StatusReport {
  const base: StatusReport = {
    schemaVersion: 1,
    project: state.project.name,
    loopPosition: state.loopPosition,
    activePhase: state.activePhase ?? null,
    activeDraft: state.activeDraft ?? null,
    tier: state.tier ?? null,
    draftTitle: null,
    tasks: [],
    acs: [],
    next: nextAction(state),
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
    if (linked.some((t) => BLOCKING_STATUSES.includes(t.status))) {
      return { id: ac.id, state: 'blocked' };
    }
    if (linked.every((t) => PASS_STATUSES.includes(t.status))) {
      return { id: ac.id, state: 'pass' };
    }
    return { id: ac.id, state: 'pending' };
  });

  return base;
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
    const glyph = ac.state === 'pass' ? '[x]' : ac.state === 'blocked' ? '[!]' : '[ ]';
    lines.push(`  ${glyph} ${ac.id}  ${ac.state}`);
  }
  return lines;
}

export function renderStatus(r: StatusReport): string {
  const out: string[] = [];
  out.push(`KEEL — ${r.project}`);
  out.push(`  loop:  ${r.loopPosition}`);
  if (r.activePhase) out.push(`  phase: ${r.activePhase}`);
  if (r.activeDraft) {
    const title = r.draftTitle ? ` — ${r.draftTitle}` : '';
    out.push(`  draft: ${r.activeDraft}${title}`);
  }
  if (r.tier) out.push(`  tier:  ${r.tier}`);
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
    const phaseDir = join(root, '.keel/phases', state.activePhase);
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
  return gatherStatus(state, draft, progress);
}
