import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { McpTrustLedgerZ, emptyMcpTrustLedger, type McpTrustLedger } from '@manehorizons/cadence-types';
import { atomicWriteText } from '../../state/atomic-write.js';

/** `.cadence/mcp-trust.json` — a sibling of `state.json`/`intelligence/*.json`,
 * never a `state.json` field (Phase 181 DRAFT Boundaries). */
export function trustLedgerPath(repoRoot: string): string {
  return join(repoRoot, '.cadence', 'mcp-trust.json');
}

/**
 * This deliberately diverges from `state.json`/`config.json`, which hard-
 * throw on corrupt or invalid data (`StateCorruptError`, `ConfigInvalidError`)
 * and only default on a genuinely missing file. The trust ledger does not
 * follow that precedent: a missing file is the normal first-run case and
 * degrades silently to an empty ledger, but so does a present-and-corrupt
 * one (unparseable JSON or schema-invalid) — loudly, via a stderr notice,
 * but never by throwing.
 *
 * That is a fail-closed choice specific to this file: an empty ledger means
 * every `APPROVAL_BYPASS` MCP call subsequently finds no valid grant and is
 * refused, rather than the MCP server crashing mid-session over a persisted
 * security-grant file that a human never directly hand-edits. "No valid
 * data" should mean "no trust," not "take down the server."
 */
export async function readTrustLedger(repoRoot: string): Promise<McpTrustLedger> {
  const path = trustLedgerPath(repoRoot);
  if (!existsSync(path)) return emptyMcpTrustLedger();

  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    process.stderr.write(
      `cadence: could not read ${path} (${(err as Error).message}) — falling back to an empty MCP trust ledger\n`,
    );
    return emptyMcpTrustLedger();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(
      `cadence: ${path} is not valid JSON (${(err as Error).message}) — falling back to an empty MCP trust ledger\n`,
    );
    return emptyMcpTrustLedger();
  }

  const result = McpTrustLedgerZ.safeParse(parsed);
  if (!result.success) {
    process.stderr.write(
      `cadence: ${path} failed schema validation (${result.error.message}) — falling back to an empty MCP trust ledger\n`,
    );
    return emptyMcpTrustLedger();
  }
  return result.data;
}

export async function writeTrustLedger(repoRoot: string, ledger: McpTrustLedger): Promise<void> {
  const path = trustLedgerPath(repoRoot);
  await mkdir(dirname(path), { recursive: true });
  McpTrustLedgerZ.parse(ledger);
  await atomicWriteText(path, `${JSON.stringify(ledger, null, 2)}\n`);
}
