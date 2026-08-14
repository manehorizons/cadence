---
"@thomas-powers-jr/cadence-core": minor
---

Added `cadence demo` — a fully non-interactive refuse-then-succeed walkthrough (a real DRAFT→BUILD→SETTLE loop against an assertion-mode gutted-but-green fixture, then the honest fix) that runs in an ephemeral sandbox and cleans up by default. `--keep` leaves the playground on disk, `--in-place` runs inside the current directory (refusing loudly instead of overwriting an existing `.cadence/` there), `--interactive`/`-i` opts into the tutorial's TTY-paced pauses. A bare `npx @thomas-powers-jr/cadence-core` or bare `cadence` invocation now dispatches straight into it. `cadence tutorial` keeps working unchanged, with one added stderr line pointing at `cadence demo`.

Added a minimal progressive-disclosure onboarding-stage system: a global `~/.cadence/onboarding.json` (or `$CADENCE_HOME/onboarding.json`) stage marker (0 First Contact, 1 Driver, 2 Operator, 3 Power User) that a successful `cadence demo` run advances to at least Driver. `cadence help` and `cadence start` now hide `doctor` below stage 2; a new top-level `--advanced` flag forces the full surface at any stage. Filtering is display-only — every command stays registered and directly invocable (`cadence doctor`, `cadence start --pick 6`) regardless of stage.
