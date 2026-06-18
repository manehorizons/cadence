# CADENCE Competitive Positioning / Objection FAQ

> Local launch-prep note. Verified 2026-06-18. Do not publish verbatim.

## Positioning Claim

CADENCE is best described as an npm-distributed, host-agnostic DRAFT -> BUILD -> SETTLE loop engine that gates phase completion on acceptance-criteria coverage and verification while the agent is still working.

Short form:

> The in-loop acceptance-criteria gate for AI-assisted development.

Narrow external claim:

> CADENCE is an npm-distributed, host-agnostic workflow engine focused on in-loop enforcement of acceptance criteria and verification gates before a phase can settle.

## Why This Wedge Exists

Thoughtworks Radar Vol. 34 describes "coding agent harnesses" and feedback sensors: deterministic quality gates such as compilers, linters, type checkers, and test suites integrated directly into agent workflows so failures trigger correction before human review. CADENCE sits in that lane, with a narrower product surface: DRAFT -> BUILD -> SETTLE, acceptance-criteria coverage, task evidence, and settle refusal.

Source: [Thoughtworks Technology Radar, Vol. 34](https://www.thoughtworks.com/en-us/radar)

## Landscape

### Spec-first / scaffold-first workflows

- [GitHub Spec Kit](https://github.com/github/spec-kit) is an open-source toolkit for Spec-Driven Development. Its public workflow centers on commands such as `/speckit.constitution`, `/speckit.specify`, `/speckit.plan`, `/speckit.tasks`, and `/speckit.implement`. It is strong planning and generation infrastructure; CADENCE's distinct claim is the local settle loop that refuses phase closure until AC and verification conditions are accounted for.
- [OpenSpec](https://github.com/Fission-AI/openspec) presents itself as a lightweight spec layer for agreeing before building, explicitly avoiding rigid phase gates and supporting many assistants. That makes it compatible with CADENCE but different in posture: OpenSpec optimizes alignment and portability, while CADENCE enforces loop closure.
- [BMad Method](https://github.com/bmad-code-org/bmad-method) is an AI-driven agile framework with structured workflows, specialized agents, and a complete development lifecycle. CADENCE should not claim to replace this kind of method; its narrower surface is the CLI-backed gate that records task/AC outcomes and blocks settle when evidence is missing.

### PR review / post-hoc review tools

- [CodeRabbit](https://docs.coderabbit.ai/overview/pull-request-review) reviews pull requests automatically and incrementally.
- [Greptile](https://www.greptile.com/docs/introduction) reviews every pull request with repository context and posts findings as PR comments.
- [Qodo](https://docs.qodo.ai/code-review) provides multi-agent code review, rule enforcement, and context-aware feedback in Git workflows.
- [Graphite](https://graphite.com/) positions around AI code review, stacked PRs, and a modern PR workflow.

These tools are valuable review surfaces after code exists in a PR or PR-shaped workflow. CADENCE's wedge is earlier: it structures and closes the work unit before PR review, making the agent prove task, AC, and gate status before the phase is allowed to settle.

## Objection FAQ

### Is this just Spec Kit or OpenSpec?

No. Those tools help teams express and execute specs. CADENCE can coexist with them, but its distinguishing surface is settle-time enforcement: tasks, ACs, gates, SUMMARY artifacts, and loop state.

### Is this just CI?

No. CI is still necessary and remains the outer safety net. CADENCE brings deterministic checks and acceptance-criteria accounting into the agent loop so failures are visible while the agent is still responsible for correcting them.

### Is this just CodeRabbit, Greptile, Qodo, or Graphite?

No. Those tools primarily operate on pull requests or review-shaped changes. CADENCE is earlier in the lifecycle: it makes a phase auditable before work is handed to review.

### Does CADENCE replace human review?

No. It reduces unverified work reaching review. Humans still own product judgment, security risk, architecture, and final merge decisions.

### What is the honest elevator pitch?

CADENCE makes an AI agent finish the loop, not merely produce a diff: define ACs, record task outcomes, run gates, and settle only when the work is auditable.

## Overclaims To Avoid

- "Only tool that gates AI code."
- "Guarantees correct AI-generated code."
- "Replaces CI or review."
- "Competitors do not verify anything."
- "Spec-driven tools and PR review tools solve the same problem."
