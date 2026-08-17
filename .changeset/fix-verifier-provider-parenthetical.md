---
"@thomas-powers-jr/cadence-core": patch
---

Docs: fix the "Heads-up on the default verifier" callout in `README.md` and `packages/core/README.md`, which said `cadence activate` turns on "a real AI verifier (Anthropic or a local model)" — omitting `host-cli`, the fourth provider `cadence activate --provider` actually accepts (`mock | anthropic | local | host-cli`, per `packages/core/src/cli/commands/activate.ts`). Now reads "Anthropic, a local model, or your host CLI".
