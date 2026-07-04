import { describe, it, expect } from 'vitest';
import { TOOLS } from '../../src/mcp/tools.js';

describe('TOOLS', () => {
  it('cadence_recommendation_promote description names the real next-step MCP tools', () => {
    const promote = TOOLS.find((t) => t.name === 'cadence_recommendation_promote');
    expect(promote).toBeDefined();
    expect(promote!.description).toContain('cadence_milestone_propose');
    expect(promote!.description).toContain('cadence_recommendation_convert');
  });
});
