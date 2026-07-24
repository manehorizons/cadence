---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
---

Close the trust envelope: extend the MCP tool-trust enforcement added in phase 181 to `cadence_settle`. Phase 181 classified `cadence_settle` as capability class `SETTLE` and allowed `cadence mcp trust grant --tool cadence_settle` to succeed, but deliberately left the tool itself ungated — an MCP call to `cadence_settle` ran immediately with no trust check. It is now wrapped with the same trust-envelope pre-check as the two `APPROVAL_BYPASS` tools (`cadence_draft_approve`, `cadence_spec_approve`): a call with no valid, matching, unexpired grant is refused — naming the failing check — before `settleService` runs, so no `state.json`/`SUMMARY.{json,md}` write occurs and the loop position is unchanged. A valid grant, issued via `cadence mcp trust grant --tool cadence_settle` on a real terminal, lets the call proceed exactly as before. The shared enforcement function is renamed `enforceApprovalBypassGrant` → `enforceGatedToolGrant` to reflect that it now gates three tools, not two. Closes rec-20260724-005.
