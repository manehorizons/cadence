/**
 * Report model for `cadence doctor`. A check's `severity` is the source of
 * truth for roll-up; `status` mirrors it so the rendered/JSON shape carries both
 * (the SPEC's machine contract lists `status` and `severity` per check).
 *
 * `indeterminate` (phase 268, `dec-20260810-005`): the check could not assess
 * the repo at all — e.g. missing or malformed corpus data — as opposed to
 * assessing it and finding a problem (`warning`/`error`) or finding none
 * (`ok`). It is NOT a synonym for `ok`: a caller must not silently fold it
 * into `ok`. It rolls up like `warning` (never fails `DoctorReport.ok`,
 * consistent with O.5's warning-not-refusal posture) but every consumer that
 * branches on severity (rendering, the fix-planner) handles it as its own
 * explicit case rather than falling through to another rung's behavior.
 */
export type DoctorSeverity = 'ok' | 'warning' | 'error' | 'indeterminate';

export interface DoctorCheck {
  name: string;
  status: DoctorSeverity;
  severity: DoctorSeverity;
  detail: string;
  remediation: string | null;
  /**
   * Stable id of a deterministic repair `cadence doctor --fix` can apply for this
   * finding, or `null` when the finding has no safe auto-repair (the fix-planner
   * classifies by this id, never by parsing `detail`). Phase 131.
   */
  fixId: string | null;
}

export interface DoctorReport {
  /** True iff no check is `error`-severity (warnings do not fail). */
  ok: boolean;
  checks: DoctorCheck[];
}

/** Environment injected into checks so they stay deterministic + testable. */
export interface DoctorEnv {
  nodeVersion: string;
  platform: NodeJS.Platform;
}

export function pass(name: string, detail: string): DoctorCheck {
  return { name, status: 'ok', severity: 'ok', detail, remediation: null, fixId: null };
}

/**
 * `severity` accepts `'indeterminate'` (phase 268) alongside `'warning'`/
 * `'error'` — a check unable to assess the repo (e.g. missing/malformed
 * corpus data) is still constructed through this one `fail()` path, never a
 * separate helper, so callers get the same shape regardless of rung.
 */
export function fail(
  name: string,
  severity: 'warning' | 'error' | 'indeterminate',
  detail: string,
  remediation: string,
  fixId: string | null = null,
): DoctorCheck {
  return { name, status: severity, severity, detail, remediation, fixId };
}

/**
 * `ok` is true iff no check is `error`-severity. `indeterminate` deliberately
 * rolls up the same way `warning` already does — both leave `ok: true` — so
 * this predicate needs no new branch for the phase-268 rung; only `error`
 * ever flips the roll-up (regression-tested in `tests/doctor/run.test.ts`).
 */
export function rollup(checks: DoctorCheck[]): DoctorReport {
  return { ok: checks.every((c) => c.severity !== 'error'), checks };
}
