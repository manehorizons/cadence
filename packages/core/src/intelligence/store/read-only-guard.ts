import { CadenceError } from '../../errors.js';

/**
 * Phase 289 T1 — structural read-only enforcement for the intelligence
 * ledger's write entry points. A sub-agent instructed (in prose) to run
 * read-only must be *structurally* unable to mutate `.cadence/intelligence/`
 * even if it ignores or forgets that instruction — enforcement has to live
 * in the store layer, not the CLI surface (see AC-5).
 *
 * `CADENCE_READ_ONLY` is treated as truthy on ANY non-empty string, not just
 * `'1'` — this is a deliberate, wider rule than e.g. the `CLAUDECODE==='1'`
 * self-invocation check in `verify/host-cli-client.ts`, because this is a
 * safety guard: fail closed. That means `CADENCE_READ_ONLY=0` also blocks
 * writes (surprising, but intentional) — only an *unset or empty* value is
 * treated as "not read-only".
 */
export function assertNotReadOnly(operation: string): void {
  const value = process.env.CADENCE_READ_ONLY;
  if (value === undefined || value === '') return;
  throw new CadenceError(
    `CADENCE_READ_ONLY is set — refusing "${operation}" (intelligence ledger write blocked). ` +
      'Unset CADENCE_READ_ONLY to allow ledger mutations.',
    'READ_ONLY_MODE_BLOCKED',
  );
}
