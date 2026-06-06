import { ADAPTER_CONTRACT_VERSION, type HostAdapter } from '@manehorizons/cadence-types';
import { mapEvent, extractPayload } from './event-map.js';
import { codexCapabilities } from './capabilities.js';
import { installHooks, type InstallOptions } from './install.js';
import { installCommands, type InstallCommandsOptions } from './install-commands.js';

export { mapEvent, extractPayload, EDIT_TOOL_MATCHER } from './event-map.js';
export type { ExtractedPayload } from './event-map.js';
export { codexCapabilities } from './capabilities.js';
export type { HostCapabilities } from '@manehorizons/cadence-types';
export { ADAPTER_CONTRACT_VERSION } from '@manehorizons/cadence-types';
export type { HostAdapter } from '@manehorizons/cadence-types';
export { installHooks } from './install.js';
export type { InstallOptions } from './install.js';
export { installCommands } from './install-commands.js';
export type { InstallCommandsOptions } from './install-commands.js';

/**
 * The OpenAI Codex CLI host adapter — the second consumer of the
 * {@link HostAdapter} contract (phase 60), proving it is not Claude-Code-shaped.
 * Capabilities + event translation + apply_patch payload extraction (phase 66)
 * and the install surface — project `.codex/hooks.json` + global
 * `~/.codex/prompts/` (phase 67) — are wired here; the `hook` shim follows in
 * phase 68. The `satisfies` check is the compile-time conformance proof.
 */
export const codexAdapter = {
  contractVersion: ADAPTER_CONTRACT_VERSION,
  capabilities: codexCapabilities,
  mapEvent,
  extractPayload,
  installHooks,
  installCommands,
} satisfies HostAdapter<InstallOptions, InstallCommandsOptions>;
