# @thomas-powers-jr/cadence-host-codex

CADENCE host adapter for the OpenAI Codex CLI — the `cadence-host-codex` command
(hook install + slash-command prompts + event mapping).

Part of the [CADENCE](https://github.com/thomas-powers-jr/cadence) monorepo. MIT licensed.

```bash
# First-run bootstrap from an uninitialized repo
cadence init --host codex

# Install hooks into a project + the cadence slash commands (global prompts)
npx -y @thomas-powers-jr/cadence-host-codex install
```

`install` writes project-level hook config to `.codex/hooks.json` and the cadence
slash commands to the **global** Codex prompts dir (`$CODEX_HOME/prompts/`,
default `~/.codex/prompts/`) — Codex has no project-level prompt directory yet, so
the prompts apply to every project on the machine; the CLI warns accordingly. Use
`--no-commands` to skip them, or `--no-hooks` to skip the hook config.

For a new repo, run `cadence init --host codex` before opening Codex. That
scaffolds `.cadence/`, writes the managed `AGENTS.md` Cadence instructions, and
runs this adapter installer. After install, approve the hooks in Codex and start
a new Codex session so prompt commands are loaded. If prompts are not loaded yet,
ask Codex to run the `cadence` CLI directly, for example `cadence progress`.

Use `npx -y @thomas-powers-jr/cadence-host-codex install` by itself only when the
repo is already initialized. It is adapter-only: it does not create `.cadence/`
state and it does not write `AGENTS.md`.

The second conformance consumer of the CADENCE
[host-adapter contract](https://github.com/thomas-powers-jr/cadence/blob/main/docs/host-adapters.md);
see that guide for how the Codex adapter maps Codex's lifecycle onto the shared
engine.
