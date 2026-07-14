---
phase: mil-rec-rec-20260712-011
id: 00-00
status: PENDING
---

# 00-00 — Define an MCP tool-trust envelope for 'cadence mcp serve' (origin + def-hash + capability scope + expiry)

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260712-011`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

Confirmed: mcp/tools.ts explicitly bypasses the interactive draft/spec-approve prompt over MCP ('the tool call IS the approval', e.g. cadence_draft_approve, cadence_spec_approve) with no expiry/capability-scope/origin-binding/revoke logic anywhere in packages/core/src/mcp/*.ts. Document exactly what that grants and constrain it: bind approval to caller identity/transport origin and tool-definition hash, attach a capability class, and add expiry with revoke-on-version-change so a schema-stable but changed server can't retain silent trust.

## Acceptance Criteria

### AC-1: Define an MCP tool-trust envelope for 'cadence mcp serve' (origin + def-hash + capability scope + expiry)
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- _(constraint)_

## Open Questions

- _(question)_
