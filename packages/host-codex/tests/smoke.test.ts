import { describe, expect, it } from 'vitest';

describe('@keel/host-codex package', () => {
  it('exports the entrypoint module', async () => {
    const mod = await import('../src/index.js');
    expect(mod).toBeDefined();
  });
});
