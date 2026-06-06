# @manehorizons/cadence-host-codex

CADENCE host adapter for the OpenAI Codex CLI — the `cadence-host-codex` command
(hook install + slash-command prompts + event mapping).

Part of the [CADENCE](https://github.com/manehorizons/cadence) monorepo. MIT licensed.

```bash
# Install hooks into a project + the cadence slash commands (global prompts)
npx @manehorizons/cadence-host-codex install
```

`install` writes project-level hook config to `.codex/hooks.json` and the cadence
slash commands to the **global** Codex prompts dir (`$CODEX_HOME/prompts/`,
default `~/.codex/prompts/`) — Codex has no project-level prompt directory yet, so
the prompts apply to every project on the machine; the CLI warns accordingly. Use
`--no-commands` to skip them, or `--no-hooks` to skip the hook config.

The second conformance consumer of the CADENCE
[host-adapter contract](https://github.com/manehorizons/cadence/blob/main/docs/host-adapters.md);
see that guide for how the Codex adapter maps Codex's lifecycle onto the shared
engine.
