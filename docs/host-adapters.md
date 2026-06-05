# Write your own host adapter

CADENCE has **one engine and two ways to drive it**: the host-agnostic `cadence`
CLI, and a *host adapter* that wires a coding agent's lifecycle into that engine.
The only shipped adapter today is `@manehorizons/cadence-host-claude-code`. This
guide documents the **host-adapter contract** so the adapter shape is explicit,
versioned, and reproducible.

> **Scope note.** For reaching agents other than Claude Code, the supported path
> is the [MCP server](mcp.md) (`cadence mcp serve`), not a fleet of bespoke
> adapters. This contract exists so the *one* adapter's shape is a stable,
> documented reference — and so a future adapter, if a real need pulls one into
> existence, has an exact target to hit. See [DESIGN.md](../DESIGN.md) decision
> **D11**. The engine stays host-unaware; an adapter only translates.

## The contract at a glance

The contract lives in `@manehorizons/cadence-types` as the `HostAdapter`
interface. An adapter provides six things:

| Member | Purpose |
|---|---|
| `contractVersion` | The contract version it targets — must equal `ADAPTER_CONTRACT_VERSION`. |
| `capabilities` | A `HostCapabilities` descriptor of what the host environment can do. |
| `mapEvent` | Translate a host lifecycle event name into a cadence `AbstractEvent`. |
| `extractPayload` | Pull the normalized `ExtractedPayload` (files / skill) out of a raw host event. |
| `installHooks` | Wire the host's lifecycle hooks to the cadence shim, under a project `root`. |
| `installCommands` | Install the host's slash-command (or equivalent) surface, under a project `root`. |

```ts
import type { HostAdapter } from '@manehorizons/cadence-types';

// Install option shapes are host-specific, so they are type parameters —
// the contract never couples to any one host's installer.
export interface HostAdapter<HookOpts = unknown, CommandOpts = unknown> {
  readonly contractVersion: number;
  readonly capabilities: HostCapabilities;
  mapEvent(hostEvent: string, toolName?: string): AbstractEvent | null;
  extractPayload(raw: unknown): ExtractedPayload | undefined;
  installHooks(root: string, options?: HookOpts): Promise<unknown> | unknown;
  installCommands(root: string, options?: CommandOpts): Promise<unknown> | unknown;
}
```

## 1. Speak the abstract event vocabulary

The engine never sees host-specific event names. It speaks seven
**abstract events** (`AbstractEvent`, validated by `AbstractEventZ`):

- `session-start` — a session begins
- `user-prompt` — the user submits a prompt
- `pre-tool-edit` — about to edit a file (blocking-capable)
- `post-tool-edit` — a file edit completed
- `session-stop` — the session ends (blocking-capable)
- `subagent-result` — a spawned subagent returned
- `skill-invoke` — a skill/command was invoked

Your adapter's whole job on the read path is to turn your host's lifecycle into
these. Anything your host can't express, it simply never emits.

## 2. Declare capabilities

`HostCapabilities` tells the engine what your environment supports. It has a Zod
schema (`HostCapabilitiesZ`) — validate your descriptor against it in a test.

```ts
import type { HostCapabilities } from '@manehorizons/cadence-types';

export const myHostCapabilities: HostCapabilities = {
  hooks: ['session-start', 'user-prompt', 'pre-tool-edit', 'post-tool-edit', 'session-stop'],
  slashCommands: true,
  skillSystem: 'native',          // 'native' | 'prompted' | 'none'
  blockingHooks: ['pre-tool-edit', 'session-stop'],
  subagentSpawn: 'native',        // 'native' | 'shell-out' | 'none'
  streamingOutput: true,
};
```

Declare only what the host actually does. The contract is the *leaner successor*
to an earlier over-built capability layer — resist speculative flags.

## 3. Map events and extract payloads

`mapEvent` turns a host event name (plus an optional tool name, to disambiguate)
into an `AbstractEvent` or `null`. `extractPayload` normalizes the raw event into
the `ExtractedPayload` the dispatcher consumes:

```ts
export interface ExtractedPayload {
  files?: string[];   // edit-tool events
  skill?: string;     // skill-invoke events
}
```

In the reference adapter these are `mapEvent` / `extractPayload` in
`packages/host-claude-code/src/event-map.ts`. Keep them pure — no I/O.

## 4. Install: hooks, commands, and the shim

Installation writes into the *consumer's* project so the host calls back into
cadence. The reference adapter:

- **`installHooks(root, opts)`** writes a shim invocation into the host's config
  (`packages/host-claude-code/src/install.ts`). The host runs the shim for every
  lifecycle event.
- **`installCommands(root, opts)`** writes the slash-command surface
  (`packages/host-claude-code/src/install-commands.ts`).
- **The shim** (`packages/host-claude-code/src/shim.ts`) reads a raw event on
  stdin, calls `mapEvent` + `extractPayload`, and dispatches into the core CLI.
- **`locate-self`** (`packages/host-claude-code/src/locate-self.ts`) resolves the
  local workspace build paths for monorepo dogfood installs.

The shim and locate-self are **host-internal plumbing** — the contract does not
pin their shapes, because how a host hands you a raw event and how you find your
own binary are intrinsically host-specific. The guide describes the
*responsibility*; you implement it however your host requires.

> **Install portability.** Never commit machine-absolute paths into a consumer's
> config. The reference adapter's `--local` mode embeds absolute paths for
> dogfood only and warns loudly; the committed form is the portable default. See
> the [Claude Code adapter guide](claude-code.md).

## 5. Version and conform

Set `contractVersion` to the `ADAPTER_CONTRACT_VERSION` your adapter targets.
It's a single integer, bumped only on a breaking change to the contract — so an
adapter can assert at runtime that it still matches the engine it ships against.

Prove conformance two ways, exactly as the reference adapter does:

```ts
import {
  ADAPTER_CONTRACT_VERSION,
  HostCapabilitiesZ,
  type HostAdapter,
} from '@manehorizons/cadence-types';

// Compile-time: `satisfies` is the conformance proof.
export const myAdapter = {
  contractVersion: ADAPTER_CONTRACT_VERSION,
  capabilities: myHostCapabilities,
  mapEvent,
  extractPayload,
  installHooks,
  installCommands,
} satisfies HostAdapter<MyHookOpts, MyCommandOpts>;

// Runtime: a test asserts the descriptor validates and the version matches.
HostCapabilitiesZ.parse(myAdapter.capabilities);
```

The reference assembly is `claudeCodeAdapter` in
`packages/host-claude-code/src/index.ts`, with the conformance test in
`packages/host-claude-code/tests/adapter-conformance.test.ts`. Use it as the
end-to-end worked example.

## Where this fits

An adapter is the only host-aware code in the system. Everything past
`mapEvent` — the DRAFT→BUILD→SETTLE loop, the gates, the state machine — is the
shared engine, described in [the loop & gates](concepts.md). Translate the
lifecycle, declare honest capabilities, install portably, and the engine does
the rest.
