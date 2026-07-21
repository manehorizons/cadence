---
'@manehorizons/cadence-types': minor
'@manehorizons/cadence-core': minor
---

Adds an opt-in `<id>-UI-SPEC.md` artifact, sibling to the existing pre-DRAFT `SPEC.md`, for a phase that touches UI surfaces. `cadence spec new --ui` scaffolds it with a fixed shape — per-component `Layout & Tokens` and `Precedent References` nested under each `### <Component>`, plus a whole-slice `Responsive & Interaction` section — so a design contract can be locked down before DRAFT tasks are written, closing rec-20260711-004.

`cadence spec approve` runs a new convergent `ui-spec-review` gate after the existing `spec-review` gate, only when a sibling UI-SPEC is present: same `nextConvergence` primitive, its own `<id>-UI-SPEC-REVIEW.json` sidecar, its own unconditional `ui-spec-review-unconverged` anomaly, and its own independent `--allow-ui-spec-review-failure` bypass flag. `cadence draft new` seeds an approved UI-SPEC's content into a new `## UI Contract` DRAFT section (bold-text rendering, no nested headings) between Acceptance Criteria and Tasks.

No new loop position and no `state.json` schema change — opt-in purely by the UI-SPEC file's own presence, the same pattern the SPEC stage itself uses. The new `uiSpecReview` config key is wired into `cadence config explain` and `cadence activate` alongside the other six provider blocks.
