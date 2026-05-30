# Security Policy

## Supported versions

CADENCE is pre-1.0 on npm and under active development. Security fixes land on
`main` and ship in the next release. Only the latest published version of each
package (`@cadence/core`, `@cadence/types`, `@cadence/host-claude-code`) is
supported — please upgrade before reporting.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Report privately via GitHub's **[Report a vulnerability](https://github.com/manehorizons/cadence/security/advisories/new)**
button (Security → Advisories). This opens a private advisory visible only to
maintainers. If private reporting is unavailable, open a minimal public issue
that says only "security report — please enable private contact" without
disclosing details, and a maintainer will follow up.

Please include, where possible:

- the affected package and version,
- a description of the issue and its impact,
- reproduction steps or a proof of concept,
- any suggested remediation.

We aim to acknowledge a report within **7 days** and to provide a remediation
timeline after triage. We will credit reporters in the advisory unless you ask
us not to.

## Scope and threat model

CADENCE runs code on your machine and integrates with external services. The
following are the highest-value areas for security review:

- **Shell execution.** The engine and the Claude Code adapter shell out (git,
  the gate pipeline, hooks). Command construction and any path that interpolates
  untrusted input into a shell are in scope.
- **LLM gate providers.** The `anthropic` and `local` verifier providers send
  diff and plan content to an external or local endpoint. Provider selection,
  credential handling (`ANTHROPIC_API_KEY` is read from the environment and
  never written to disk or logs), and prompt/response handling are in scope.
- **Generated and installed files.** `cadence init` and
  `cadence-host-claude-code install` write into a consumer's repo (`.cadence/`,
  `.claude/`). Path traversal or unexpected overwrites are in scope.
- **Notification webhooks.** Configurable notification targets (`DESIGN.md §4.4`)
  send event payloads to operator-supplied URLs. SSRF or payload-injection
  concerns are in scope.

### Out of scope

- Issues requiring a malicious local user who already has filesystem or shell
  access equivalent to the operator.
- The contents of `.cadence/` planning records (these are intentionally
  committed project state).
- Vulnerabilities in third-party dependencies that have no CADENCE-specific
  exploit path — report those upstream (Dependabot tracks dependency updates).

## CI note for self-hosted runners

If you fork CADENCE and use a **self-hosted CI runner** with a **public** repo,
be aware that untrusted pull requests can execute arbitrary code on the runner.
Restrict self-hosted runners to trusted, non-fork workflows, or use
GitHub-hosted runners (the default `ci.yml` already does).
