---
"@thomas-powers-jr/cadence-core": patch
"@thomas-powers-jr/cadence-types": patch
---

Fix: a `files:` declaration containing a wildcard (e.g. `.changeset/*.md`) now actually matches the files it describes, in both `warn` and `block` `boundaryEnforcement` modes.

`runBoundaryCheck` previously compared declared `files:` entries against touched files via exact `Set` membership — no glob expansion at all, so a wildcard entry could never match anything. Under dispatch-scoped `block` mode this produced a hard, surprising refusal on correctly-scoped work; in `warn` mode it produced a spurious `files-outside-boundary` anomaly even when the touched file was exactly what the pattern was written to cover.

Declared entries containing `*` are now glob-expanded using the same matcher CADENCE's own coverage scanner already relies on (`globToRegExp`/`toMatcher`, extracted to a shared `packages/core/src/util/glob.ts` — no new runtime dependency). Literal (non-wildcard) declared entries are untouched and remain byte-identical to prior behavior — only entries containing `*` are routed through the new matcher.

A declared wildcard entry that matches zero touched files now surfaces a new, additive, advisory-only anomaly (`boundary-pattern-unmatched`, `@thomas-powers-jr/cadence-types`) printed by `cadence build task` at `severity: 'warn'` — hardcoded and structurally unable to escalate to a block-mode refusal (it is returned from a separate function, never merged into `runBoundaryCheck`'s own result, and wired into exactly one call site). A literal declared entry matching zero touched files stays silent exactly as before, since that is the ordinary, common case (a task declares three files and touches two of them).

Closes `rec-20260815-005`.
