/**
 * Report model for `cadence doctor`. A check's `severity` is the source of
 * truth for roll-up; `status` mirrors it so the rendered/JSON shape carries both
 * (the SPEC's machine contract lists `status` and `severity` per check).
 */
export type DoctorSeverity = 'ok' | 'warning' | 'error';

export interface DoctorCheck {
  name: string;
  status: DoctorSeverity;
  severity: DoctorSeverity;
  detail: string;
  remediation: string | null;
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
  return { name, status: 'ok', severity: 'ok', detail, remediation: null };
}

export function fail(
  name: string,
  severity: 'warning' | 'error',
  detail: string,
  remediation: string,
): DoctorCheck {
  return { name, status: severity, severity, detail, remediation };
}

export function rollup(checks: DoctorCheck[]): DoctorReport {
  return { ok: checks.every((c) => c.severity !== 'error'), checks };
}
