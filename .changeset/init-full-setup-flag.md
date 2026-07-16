---
'@manehorizons/cadence-core': minor
---

Add `cadence init --full`, a one-command full setup that composes the existing `--wire-host`, `--demo`, and `--activate` flags: when their preconditions are met it wires the detected host with no prompt, seeds the `01-demo` phase, and activates real verification when `ANTHROPIC_API_KEY` is present — printing one consolidated "Full setup summary" (done/skipped-with-reason per feature) in addition to the existing per-feature messages. Any explicitly-passed flag, including `--skip-host-wire`, still overrides its `--full`-implied default. Bare `cadence init` with no flags is unchanged. Fulfils rec-20260709-001.
