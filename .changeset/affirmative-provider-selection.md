---
"@thomas-powers-jr/cadence-core": minor
---

`cadence init` now presents the verifier-provider choice explicitly: unless an explicit `--verifier-provider <mock|anthropic|local|host-cli>` flag, `--activate`, or `--full` already settled it, init asks which provider should back deep-verify — with `mock` listed as a normal, unshamed, first-class option rather than a fallback to feel bad about. The prompt fires only when a prompter is available (a real TTY, or `CADENCE_PROMPTER_SCRIPT` for scripted/CI runs); with no prompter available it silently defaults to `mock` — never coerced onto a real provider.

On every completed scaffolding run — flag-resolved, prompted, or defaulted — the choice is now recorded as a retrievable decision in `.cadence/intelligence/decisions.json` (viewable via `cadence decision list`), so no repo runs indefinitely under an inherited default without the operator having made or seen that choice. `--dry-run` continues to preview the resolution without prompting or writing a decision.

Non-interactive paths with **no prompter available** (no TTY, no `CADENCE_PROMPTER_SCRIPT`) and explicit-flag paths (`--verifier-provider`/`--activate`/`--full`) resolve exactly as before, just with the resolution now logged. Scripted (`CADENCE_PROMPTER_SCRIPT`-driven) runs against a repo with `.claude/` present now need **one additional scripted answer** ahead of the pre-existing host-wire question, since the new verifier-provider prompt asks first — existing scripts relying on the old single-answer convention should account for this. If the script runs out at the host-wire step, that step degrades gracefully — loud stderr notice, exit 0, scaffold intact — rather than failing the run.
