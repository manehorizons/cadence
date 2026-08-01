---
'@manehorizons/cadence-core': minor
---

**The kernel / verifier / consumer boundary is now named and lint-enforced.**

The split has been ~80% built and unnamed for many phases: `GateImpl` /
`GATE_REGISTRY` totality plus injected verifier ports already formed a plugin
architecture with no published contract. Phase 234 names it without moving a
package or changing a single gate's behaviour.

A new `contracts/` module publishes the three roles (`kernel`, `verifier`,
`consumer`) as assertable data — including the governing rule that **no plugin
can pass; only the kernel calls green** — plus a generic
`VerifierPort<I, R>` that all seven verifier-backed gates (`deep-verify`,
`code-review`, `security-audit`, `plan-review`, `per-task-verify`,
`spec-review`, `ui-spec-review`) are expressed at, with no per-gate special
casing. It also re-exports every family's input/result types so callers never
reach into `verify/` internals for a type.

`spec-review` and `ui-spec-review` — previously the only two verifier-backed
gates with no injection seam — are now resolved through ports, and
`specApproveService` accepts an optional ports argument for testing. Default
resolution, argument fidelity, and lazy UI-path selection are unchanged, and
are now pinned by tests.

An ESLint `no-restricted-imports` zone fails the build when any module outside
`verify/` or `contracts/` imports one of the seven verifier-family modules
directly instead of the published contract, matching both extensioned and
extensionless specifiers. Statically-imported violations are caught; dynamic
`import()` is not reachable by this rule and is documented as such.

`GATE_ORDER` and every gate's pass/refuse semantics are unchanged, pinned by a
regression fixture that drives a real ten-gate settle through the production
registry, and the full settled-SUMMARY corpus still parses at both
`schemaVersion` 1 and 2.

No runtime dependency added. No package moved. No public CLI or config surface
changed.
