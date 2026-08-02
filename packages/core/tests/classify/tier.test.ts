import { describe, it, expect } from 'vitest';
import { classifyTier } from '../../src/classify/tier.js';
import { defaultConfig } from '@thomas-powers-jr/cadence-types';

describe('classifyTier', () => {
  it('classifies a 1-task 1-file draft as quick-fix', () => {
    const tier = classifyTier(
      { tasks: [{ files: ['a.ts'] }], acceptanceCriteria: [] },
      defaultConfig.tier,
    );
    expect(tier).toBe('quick-fix');
  });

  it('classifies a 3-task 4-file draft as standard', () => {
    const tier = classifyTier(
      {
        tasks: [
          { files: ['a.ts', 'b.ts'] },
          { files: ['c.ts'] },
          { files: ['d.ts'] },
        ],
        acceptanceCriteria: [],
      },
      defaultConfig.tier,
    );
    expect(tier).toBe('standard');
  });

  it('classifies a 7-task draft as complex', () => {
    const tasks = Array.from({ length: 7 }, () => ({ files: ['a.ts'] }));
    expect(classifyTier({ tasks, acceptanceCriteria: [] }, defaultConfig.tier)).toBe('complex');
  });

  it('escalates beyond quick-fix when files > maxFiles', () => {
    const tier = classifyTier(
      { tasks: [{ files: ['a.ts', 'b.ts'] }], acceptanceCriteria: [] },
      defaultConfig.tier,
    );
    expect(tier).toBe('standard');
  });
});
