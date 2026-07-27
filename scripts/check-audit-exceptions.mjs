#!/usr/bin/env node
// Cross-checks `pnpm audit --json` output against the documented exceptions
// allowlist (docs/security/audit-exceptions.md). Any high/critical advisory
// that is not listed there, or whose listed expiry has passed, fails.
//
// Pure decision logic (parseExceptionsTable / isExpired / decideAdvisories /
// extractHighSeverityAdvisories) is exported and unit-tested in
// packages/core/tests/docs/security-ci.test.ts; main() is the thin,
// impure shell that runs `pnpm audit` and prints the result.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const HIGH_SEVERITIES = new Set(['high', 'critical']);

// Thrown when `pnpm audit --json` itself reports an error (e.g. the npm
// registry's legacy audit endpoint being retired/unavailable) rather than an
// advisory report. Distinct from "advisory found" so callers can give a
// clear diagnostic instead of misreporting registry trouble as a vulnerability.
export class AuditUnavailableError extends Error {}

// deja:new markdown-table parsing for the audit-exceptions allowlist. The
// row-splitting step (trim + strip leading/trailing `|` + split) structurally
// resembles run-handoff.ts's sanitizeLabel (also trim + chained replace),
// but that function sanitizes a CLI label string — an unrelated concern from
// parsing a `|`-delimited table row into 4 typed columns. Not reusable here.
/**
 * Parses a markdown table of the shape:
 *   | Advisory ID | Package | Justification | Expiry |
 *   | --- | --- | --- | --- |
 *   | GHSA-xxxx-xxxx-xxxx | some-pkg | reason | 2026-12-31 |
 * Only rows between the header (a `|`-delimited line containing "advisory",
 * case-insensitive) and the next non-table-row line are parsed, so content
 * outside the real table (prose, HTML-comment examples) is ignored.
 */
export function parseExceptionsTable(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const isRow = (line) => /^\s*\|.*\|\s*$/.test(line ?? '');
  const isSeparatorRow = (line) => isRow(line) && /^[\s|:-]+$/.test(line);

  const headerIdx = lines.findIndex((line) => isRow(line) && /advisory/i.test(line));
  if (headerIdx === -1) return [];
  if (!isSeparatorRow(lines[headerIdx + 1])) return [];

  const rows = [];
  for (let i = headerIdx + 2; i < lines.length && isRow(lines[i]); i += 1) {
    const cells = lines[i]
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    // Exactly 4 cells required — a justification containing a literal `|`
    // would otherwise silently shift the remaining columns (e.g. the real
    // expiry ending up unread) instead of being rejected.
    if (cells.length !== 4) continue;
    const [id, pkg, justification, expiry] = cells;
    if (!id) continue;
    rows.push({ id, package: pkg, justification, expiry });
  }
  return rows;
}

/** Is `expiry` (an ISO `YYYY-MM-DD` date) on or before `now`? */
export function isExpired(expiry, now = new Date()) {
  const parsed = new Date(`${expiry}T23:59:59Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid expiry date: ${expiry}`);
  }
  return parsed.getTime() < now.getTime();
}

/**
 * Decides, for each high/critical advisory, whether it is covered by a
 * non-expired documented exception. Returns `{ ok, allowed, failures }`.
 */
export function decideAdvisories(advisories, exceptions, now = new Date()) {
  const exceptionsById = new Map(exceptions.map((exception) => [exception.id, exception]));
  const allowed = [];
  const failures = [];

  for (const advisory of advisories) {
    const exception = exceptionsById.get(advisory.id);
    if (!exception) {
      failures.push({ ...advisory, reason: 'not listed in docs/security/audit-exceptions.md' });
      continue;
    }
    if (isExpired(exception.expiry, now)) {
      failures.push({ ...advisory, reason: `exception expired on ${exception.expiry}` });
      continue;
    }
    allowed.push({ ...advisory, justification: exception.justification, expiry: exception.expiry });
  }

  return { ok: failures.length === 0, allowed, failures };
}

/**
 * Normalizes `pnpm audit --json` output (which mirrors one of npm audit's two
 * historical shapes — the `advisories` map or the newer `vulnerabilities`
 * map) into a flat list of high/critical `{ id, package, severity }` entries.
 * Throws `AuditUnavailableError` if the payload is an error response (e.g.
 * the legacy audit endpoint being retired) rather than a report.
 */
export function extractHighSeverityAdvisories(auditJson) {
  if (auditJson && typeof auditJson === 'object' && auditJson.error) {
    const message =
      typeof auditJson.error.message === 'string' ? auditJson.error.message : JSON.stringify(auditJson.error);
    throw new AuditUnavailableError(message);
  }

  const isHighOrCritical = (severity) => HIGH_SEVERITIES.has(severity);
  const advisories = [];

  if (auditJson && typeof auditJson.advisories === 'object' && auditJson.advisories !== null) {
    for (const advisory of Object.values(auditJson.advisories)) {
      if (!isHighOrCritical(advisory.severity)) continue;
      advisories.push({
        id: String(advisory.github_advisory_id ?? advisory.id),
        package: advisory.module_name ?? advisory.package_name ?? 'unknown',
        severity: advisory.severity,
      });
    }
  }

  if (auditJson && typeof auditJson.vulnerabilities === 'object' && auditJson.vulnerabilities !== null) {
    for (const [pkgName, vuln] of Object.entries(auditJson.vulnerabilities)) {
      if (!isHighOrCritical(vuln.severity)) continue;
      const via = Array.isArray(vuln.via) ? vuln.via : [];
      const ids = via
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => (entry.url ? String(entry.url).split('/').pop() : entry.source ? String(entry.source) : ''))
        .filter(Boolean);
      advisories.push({ id: ids[0] ?? `${pkgName}-${vuln.severity}`, package: pkgName, severity: vuln.severity });
    }
  }

  return advisories;
}

// pnpm <11 calls npm's legacy audit endpoints, which npm retired (HTTP 410) —
// see pnpm/pnpm#11265. The fix shipped in pnpm v11.0.0-rc.1 and is stable as
// of v11.x, so `pnpm audit` runs through Node's bundled corepack against a
// pinned modern pnpm, rather than whatever version this repo's own tooling
// is pinned to (package.json stays on 9.12.0 for build/test/lint — bumping
// that repo-wide pin is out of scope here). `--pm-on-fail=ignore` is required
// because pnpm 11 refuses to run under corepack when package.json's
// `packageManager` field names a different version — see pnpm/pnpm#11265's
// resolution thread. pnpm v11 also requires Node >=22.13 (uses
// `node:sqlite`), which is stricter than this repo's own >=22 engines floor,
// so the CI `audit` job's setup-node step is pinned explicitly to 22.
// Verified working end-to-end against this repo's real pnpm-lock.yaml
// (phase 182): `pnpm dlx pnpm@<version>` was tried first and does NOT
// actually switch versions (pnpm 9.12.0 silently keeps running itself), so
// corepack is used instead.
const AUDIT_PNPM_VERSION = '11.13.0';
const AUDIT_PNPM_MIN_NODE_MAJOR = 22;

function runPnpmAudit(cwd) {
  const currentMajor = Number(process.versions.node.split('.')[0]);
  if (currentMajor < AUDIT_PNPM_MIN_NODE_MAJOR) {
    throw new Error(
      `pnpm@${AUDIT_PNPM_VERSION} (needed to work around pnpm/pnpm#11265's retired audit endpoint) requires ` +
        `Node >=${AUDIT_PNPM_MIN_NODE_MAJOR}, but this process is running Node ${process.versions.node}. ` +
        `Run this script under Node ${AUDIT_PNPM_MIN_NODE_MAJOR}+ (the CI audit job's actions/setup-node step ` +
        `must request node-version: ${AUDIT_PNPM_MIN_NODE_MAJOR}).`,
    );
  }

  const result = spawnSync(
    'corepack',
    [`pnpm@${AUDIT_PNPM_VERSION}`, '--pm-on-fail=ignore', 'audit', '--json'],
    {
      cwd,
      encoding: 'utf8',
      shell: false,
      env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
    },
  );
  if (result.error) {
    throw result.error;
  }
  const stdout = (result.stdout ?? '').trim();
  if (!stdout) {
    const detail = (result.stderr ?? '').trim();
    throw new Error(`pnpm audit produced no output${detail ? `:\n${detail}` : ''}`);
  }
  try {
    return JSON.parse(stdout);
  } catch (err) {
    throw new Error(`pnpm audit --json produced unparseable output: ${err.message}\n${stdout}`);
  }
}

async function main(root = DEFAULT_ROOT) {
  let auditJson;
  try {
    auditJson = runPnpmAudit(root);
  } catch (err) {
    process.stderr.write(`check-audit-exceptions: failed to run pnpm audit: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  let advisories;
  try {
    advisories = extractHighSeverityAdvisories(auditJson);
  } catch (err) {
    if (err instanceof AuditUnavailableError) {
      process.stderr.write(`check-audit-exceptions: pnpm audit could not produce a report: ${err.message}\n`);
      process.stderr.write(
        'check-audit-exceptions: treating an unavailable audit report as a failure — the policy cannot be verified until pnpm audit succeeds.\n',
      );
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  if (advisories.length === 0) {
    process.stdout.write('check-audit-exceptions: no high/critical advisories reported\n');
    return;
  }

  const exceptionsPath = join(root, 'docs', 'security', 'audit-exceptions.md');
  const exceptions = parseExceptionsTable(readFileSync(exceptionsPath, 'utf8'));
  const decision = decideAdvisories(advisories, exceptions);

  for (const item of decision.allowed) {
    process.stdout.write(
      `check-audit-exceptions: ALLOWED ${item.id} (${item.package}, ${item.severity}) — ${item.justification} — expires ${item.expiry}\n`,
    );
  }
  for (const item of decision.failures) {
    process.stderr.write(
      `check-audit-exceptions: FAIL ${item.id} (${item.package}, ${item.severity}) — ${item.reason}\n`,
    );
  }

  if (!decision.ok) {
    process.stderr.write(
      `check-audit-exceptions: ${decision.failures.length} undocumented or expired high/critical advisory(ies); see docs/security/audit-exceptions.md\n`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `check-audit-exceptions: ${decision.allowed.length} high/critical advisory(ies), all documented with a valid exception\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`check-audit-exceptions: ${err.message}\n`);
    process.exitCode = 1;
  });
}
