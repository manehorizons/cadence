import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { atomicWriteJSON, type AtomicWriteOptions } from '../../state/atomic-write.js';

export interface LedgerRecords<TRec> {
  live: TRec[];
  archived: TRec[];
}

/**
 * A subject's simple status-flip transitions (assumptions' validate/reject/
 * reopen, decisions' supersede/rescind/reactivate) share this exact shape
 * today as two hand-duplicated maps per subject. Declaring it here lets a
 * spec describe it once; this module has no executor for it (deliberately —
 * bespoke transition logic with extra invariants or field mutations beyond a
 * status flip, e.g. recommendation promotion or decision's supersession-cycle
 * check, stays a subject-specific function on top of these primitives rather
 * than being forced into one generic shape it doesn't fit).
 */
export interface TransitionRule<TStatus extends string> {
  from: readonly TStatus[];
  to: TStatus;
}

/** Descriptor a subject (recommendations, evidence, assumptions, decisions,
 * milestones, ...) plugs in to get read/write/id-minting for free. */
export interface SubjectLedgerSpec<
  TRec,
  TLedger,
  TStatus extends string = string,
  TAction extends string = string,
  TPayload = void,
> {
  parse(data: unknown): TLedger;
  empty(): TLedger;
  idPrefix: string;
  idOf(record: TRec): string;
  records(ledger: TLedger): LedgerRecords<TRec>;
  withRecords(ledger: TLedger, records: LedgerRecords<TRec>): TLedger;
  // Extra id sources outside this ledger to guard against when minting — e.g.
  // a recommendation id already referenced by a dangling evidence[].recommendationId.
  // Phase 219's cross-ledger id-collision safeguard, generalized.
  crossCheckIds?(payload: TPayload): string[];
  transitions?: Record<TAction, TransitionRule<TStatus>>;
}

export async function readLedger<
  TRec,
  TLedger,
  TStatus extends string,
  TAction extends string,
  TPayload,
>(
  spec: SubjectLedgerSpec<TRec, TLedger, TStatus, TAction, TPayload>,
  path: string,
): Promise<TLedger> {
  if (!existsSync(path)) return spec.empty();
  const raw = await readFile(path, 'utf8');
  return spec.parse(JSON.parse(raw));
}

export async function writeLedger<
  TRec,
  TLedger,
  TStatus extends string,
  TAction extends string,
  TPayload,
>(
  spec: SubjectLedgerSpec<TRec, TLedger, TStatus, TAction, TPayload>,
  path: string,
  ledger: TLedger,
  opts?: AtomicWriteOptions,
): Promise<void> {
  spec.parse(ledger);
  await mkdir(dirname(path), { recursive: true });
  await atomicWriteJSON(path, ledger, opts);
}

function slugDate(now: Date): string {
  return now.toISOString().slice(0, 10).replaceAll('-', '');
}

export function mintId<TRec, TLedger, TStatus extends string, TAction extends string, TPayload>(
  spec: SubjectLedgerSpec<TRec, TLedger, TStatus, TAction, TPayload>,
  ledger: TLedger,
  now: Date,
  payload?: TPayload,
): string {
  const prefix = `${spec.idPrefix}-${slugDate(now)}-`;
  const { live, archived } = spec.records(ledger);
  const ledgerIds = [...live, ...archived].map((r) => spec.idOf(r));
  const crossIds =
    spec.crossCheckIds && payload !== undefined ? spec.crossCheckIds(payload) : [];
  const max = [...ledgerIds, ...crossIds]
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number.parseInt(id.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}
