import type { AbstractEvent, HookContext, HostCapabilities } from '@cadence/types';

const FULL_HOOKS: AbstractEvent[] = [
  'session-start',
  'user-prompt',
  'pre-tool-edit',
  'post-tool-edit',
  'session-stop',
  'subagent-result',
];

const defaultCapabilities: HostCapabilities = {
  hooks: FULL_HOOKS,
  slashCommands: true,
  skillSystem: 'native',
  blockingHooks: ['pre-tool-edit', 'session-stop'],
  subagentSpawn: 'native',
  streamingOutput: true,
};

export interface MockHostOptions {
  capabilities?: Partial<HostCapabilities>;
}

export class MockHostAdapter {
  readonly id = 'mock-host';
  readonly capabilities: HostCapabilities;
  readonly calls: HookContext[] = [];

  constructor(opts: MockHostOptions = {}) {
    this.capabilities = { ...defaultCapabilities, ...(opts.capabilities ?? {}) };
  }

  async dispatchHook(event: AbstractEvent, ctx: Omit<HookContext, 'event'>): Promise<void> {
    this.calls.push({ event, ...ctx });
  }

  reset(): void {
    this.calls.length = 0;
  }
}
