import { ADAPTER_CONTRACT_VERSION, type HostAdapter } from '@manehorizons/cadence-types';
import { mapEvent, extractPayload } from './event-map.js';
import { claudeCodeCapabilities } from './capabilities.js';
import { installHooks, type InstallOptions } from './install.js';
import { installCommands, type InstallCommandsOptions } from './install-commands.js';

export { mapEvent, extractPayload, EDIT_TOOL_MATCHER } from './event-map.js';
export type { ExtractedPayload } from './event-map.js';
export { claudeCodeCapabilities } from './capabilities.js';
export type { HostCapabilities } from '@manehorizons/cadence-types';
export { ADAPTER_CONTRACT_VERSION } from '@manehorizons/cadence-types';
export type { HostAdapter } from '@manehorizons/cadence-types';
export { installHooks } from './install.js';
export type { InstallOptions } from './install.js';
export { installCommands } from './install-commands.js';
export type { InstallCommandsOptions } from './install-commands.js';

/**
 * The Claude Code host adapter — the reference implementation of the
 * {@link HostAdapter} contract. Assembled from the existing translation,
 * capability, and install pieces; the `satisfies` check is the compile-time
 * conformance proof (AC-4).
 */
export const claudeCodeAdapter = {
  contractVersion: ADAPTER_CONTRACT_VERSION,
  capabilities: claudeCodeCapabilities,
  mapEvent,
  extractPayload,
  installHooks,
  installCommands,
} satisfies HostAdapter<InstallOptions, InstallCommandsOptions>;
