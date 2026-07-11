---
phase: mil-rec-rec-20260710-002
id: 00-00
status: PENDING
---

# 00-00 — Host-CLI headless verifier provider: reuse Claude Code/Codex's own auth instead of requiring a raw API key

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260710-002`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

All 3 current verifier providers (mock/anthropic/local) either do no real judgment or require a directly-configured credential (ANTHROPIC_API_KEY, or an OpenAI-compatible endpoint's own key) -- there is no path for a user who already has Claude Code or Codex installed and authenticated to use that existing auth for cadence's independent-verifier gates. Proposal: a 4th provider that shells out to the host CLI in headless/non-interactive mode (e.g. 'claude -p <prompt> --output-format json', or an analogous 'codex exec') as a fresh out-of-band subprocess -- genuinely independent of the calling session (arguably MORE independent than same-session self-report, since it is a new process with no shared context), while reusing whatever auth that CLI already has configured, with zero new env var required. Open design questions: (1) does the host CLI's headless/print mode reliably emit structured JSON matching cadence's per-AC verdict Zod schema, or does it need a repair-retry loop like local-client.ts; (2) process-spawn latency/cost vs a direct API call, and whether it belongs behind a new HostAdapter capability (e.g. 'headlessVerify') so core does not hardcode 'claude'/'codex' binary names -- core never imports host code, so this needs the same core-spawns-host-as-subprocess pattern already used for host installs; (3) whether per-gate model selection still makes sense when the host CLI picks its own model. Directly addresses the competitive risk (see cadence-competitive-landscape notes) that mock-default undercuts the enforcement wedge for users without a standalone Anthropic API key.

## Acceptance Criteria

### AC-1: Host-CLI headless verifier provider: reuse Claude Code/Codex's own auth instead of requiring a raw API key
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- _(constraint)_

## Open Questions

- _(question)_
