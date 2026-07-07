import { z } from 'zod';
import { AbstractEventZ, type AbstractEvent } from './events.js';

/**
 * Capability descriptor a host adapter declares about its environment. The
 * core uses it to decide which abstract events the host can deliver and which
 * of them can block. Zod schema kept in parity with {@link AbstractEventZ}; the
 * `HostCapabilities` type is derived from it so the schema is the single
 * source of truth.
 */
export const HostCapabilitiesZ = z.object({
  hooks: z.array(AbstractEventZ),
  slashCommands: z.boolean(),
  skillSystem: z.enum(['native', 'prompted', 'none']),
  blockingHooks: z.array(AbstractEventZ),
  subagentSpawn: z.enum(['native', 'shell-out', 'none']),
  streamingOutput: z.boolean(),
});

export type HostCapabilities = z.infer<typeof HostCapabilitiesZ>;

/**
 * Version of the host-adapter contract (capabilities + event map + payload
 * extraction + install surface). Integer, breaking-only — bumped when an
 * existing adapter would need code changes to keep conforming.
 */
export const ADAPTER_CONTRACT_VERSION = 1;

/**
 * Normalized payload the core dispatcher consumes, extracted by an adapter
 * from a host's raw event. `files` for edit-tool events; `skill` for
 * skill-invoke events. Host-facing adapters own the extraction; this is the
 * core-facing shape they must produce.
 */
export interface ExtractedPayload {
  files?: string[];
  skill?: string;
  /** Present when the host's raw event fired inside a subagent's tool call. */
  agentId?: string;
  agentType?: string;
}

/**
 * The host-adapter contract. An adapter package translates a host's lifecycle
 * into the abstract events the core already speaks, declares its capabilities,
 * extracts payloads, and installs itself into the host.
 *
 * Only the core-facing surface is pinned here. Install option shapes are
 * intrinsically host-specific, so they are left as type parameters rather than
 * coupled to any one host. Runtime plumbing a host needs internally (request
 * routing, locating its own install) is a documented responsibility, not part
 * of this type — see the "write your own adapter" guide.
 *
 * @typeParam HookOpts - host-specific options for {@link HostAdapter.installHooks}
 * @typeParam CommandOpts - host-specific options for {@link HostAdapter.installCommands}
 */
export interface HostAdapter<HookOpts = unknown, CommandOpts = unknown> {
  /** Contract version this adapter targets; must equal {@link ADAPTER_CONTRACT_VERSION}. */
  readonly contractVersion: number;
  /** What the host environment can do. */
  readonly capabilities: HostCapabilities;
  /** Map a host lifecycle event name to its abstract event, or null if unmapped. */
  mapEvent(hostEvent: string, toolName?: string): AbstractEvent | null;
  /** Extract the normalized payload from a host's raw event. */
  extractPayload(raw: unknown): ExtractedPayload | undefined;
  /** Wire the host's lifecycle hooks to the cadence shim, under project `root`. */
  installHooks(root: string, options?: HookOpts): Promise<unknown> | unknown;
  /** Install the host's slash-command (or equivalent) surface, under project `root`. */
  installCommands(root: string, options?: CommandOpts): Promise<unknown> | unknown;
}
