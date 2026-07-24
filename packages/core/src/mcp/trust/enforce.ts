import type { ToolDef } from '../tools.js';
import { computeToolDefHash } from './def-hash.js';
import { readTrustLedger } from './store.js';
import { readPackageVersion } from '../../version.js';

/** Result of `enforceGatedToolGrant` — `reason` names the FIRST failing check. */
export type EnforceResult = { ok: true } | { ok: false; reason: string };

/**
 * Pre-check gating any tool routed through `gatedRun` in `tools.ts` — the two
 * `APPROVAL_BYPASS` tools (`cadence_draft_approve`, `cadence_spec_approve`,
 * phase 181 T5) plus the `SETTLE` tool (`cadence_settle`, phase 216). For the
 * `APPROVAL_BYPASS` pair, "the tool call IS the approval": the interactive
 * TTY prompt the CLI would otherwise show is skipped over MCP. For
 * `cadence_settle`, an MCP call would otherwise run `settleService`
 * immediately with no trust check at all. This function is the
 * re-constraint in both cases — called from `tools.ts` BEFORE
 * `draftApproveService`/`specApproveService`/`settleService` ever runs, so a
 * refusal here means no `state.json`/DRAFT/SPEC/SUMMARY write and no
 * gate-ladder execution (AC-1).
 *
 * Checks run in order and stop at the first failure, so the returned reason
 * always names exactly which check failed — never a generic "denied":
 *   1. a grant exists for `tool.name`
 *   2. the grant's `defHash` matches `computeToolDefHash` on the tool's
 *      CURRENT live definition (name/description/inputSchema as registered
 *      right now in `TOOLS`) — revoke-on-def-change
 *   3. the grant's `grantedVersion` matches the current running version
 *      (`readPackageVersion()`) — revoke-on-version-change
 *   4. the grant is not expired (`expiresAt === null`, or in the future)
 */
export async function enforceGatedToolGrant(
  repoRoot: string,
  tool: ToolDef,
): Promise<EnforceResult> {
  const ledger = await readTrustLedger(repoRoot);
  const grant = ledger.grants.find((g) => g.toolName === tool.name);

  if (!grant) {
    return {
      ok: false,
      reason:
        `no trust grant found for tool "${tool.name}". Ask an operator to run ` +
        `\`cadence mcp trust grant --tool ${tool.name}\` on a real terminal first.`,
    };
  }

  const liveHash = computeToolDefHash(tool);
  if (grant.defHash !== liveHash) {
    return {
      ok: false,
      reason:
        `def-hash mismatch for tool "${tool.name}" — the tool's live definition ` +
        '(name/description/inputSchema) has changed since the grant was issued ' +
        `(revoke-on-version-change). Re-grant with \`cadence mcp trust grant --tool ${tool.name}\`.`,
    };
  }

  const currentVersion = readPackageVersion();
  if (grant.grantedVersion !== currentVersion) {
    return {
      ok: false,
      reason:
        `version mismatch for tool "${tool.name}" — the grant was issued against version ` +
        `${grant.grantedVersion}, but the running server is version ${currentVersion}. ` +
        `Re-grant with \`cadence mcp trust grant --tool ${tool.name}\`.`,
    };
  }

  if (grant.expiresAt !== null && new Date(grant.expiresAt).getTime() <= Date.now()) {
    return {
      ok: false,
      reason:
        `grant for tool "${tool.name}" expired at ${grant.expiresAt}. ` +
        `Re-grant with \`cadence mcp trust grant --tool ${tool.name}\`.`,
    };
  }

  return { ok: true };
}
