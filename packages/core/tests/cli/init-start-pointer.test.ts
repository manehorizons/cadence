import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('init points at cadence start', () => {
  it('mentions `cadence start` in the init command source copy (AC-13)', () => {
    const src = readFileSync(join(__dirname, '../../src/cli/commands/init.ts'), 'utf8');
    expect(src).toContain('cadence start');
  });
});
