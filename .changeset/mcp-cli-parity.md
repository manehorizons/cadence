---
'@manehorizons/cadence-core': patch
---

Closes three confirmed CLI/MCP parity gaps in the Praxis-adjacent surfaces:

- `cadence_recommendation_promote` (MCP) now accepts a `ref` argument and
  threads it into `shippedRef` exactly like the CLI's
  `recommendation promote --status=shipped --ref "<text>"` already does —
  previously the MCP tool silently dropped it. Also fixes a latent bug where
  a `status=shipped` promotion (which auto-archives by default) always
  returned `data: null` even on full success, because the lookup only
  checked the live `recommendations` array, not `archived`.
- The "did this `milestone propose` run produce any newly-proposed
  milestones" predicate — previously copy-pasted as an identical literal
  expression in both `cli/commands/milestone.ts` and
  `services/milestone-propose.ts`, a duplication class that had already
  caused one whole-branch-review-caught drift bug — is now a single
  exported `hasNewlyProposedMilestone()` both call sites invoke.
- `next`/`verify coverage`/`verify phase`/`explain` logic, which already had
  the right `(repoRoot, args, io) => CommandResult` service shape but lived
  in `cli/commands/` where the MCP surface couldn't reach it, is relocated
  into `services/{next,verify,explain}.ts`. The MCP server now registers
  `cadence_next`, `cadence_verify_coverage`, `cadence_verify_phase`, and
  `cadence_explain` (all read-only), with test coverage asserting output
  parity against their CLI counterparts. `docs/mcp.md` and
  `docs/reference/commands.md` are updated for the new tool count (18→22).

No CLI-facing behavior, flags, or exit codes changed for any of the affected
commands — this is a parity/dedup fix, not a rewrite.
