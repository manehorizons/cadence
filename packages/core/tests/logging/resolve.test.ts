import { describe, it, expect } from 'vitest';
import { resolveLogLevel, resolveLogFormat } from '../../src/logging/resolve.js';

describe('log level/format resolution (AC-5)', () => {
  it('AC-5: level — env wins over config wins over the silent default', () => {
    expect(resolveLogLevel({ env: 'debug', config: 'info' })).toBe('debug');
    expect(resolveLogLevel({ config: 'info' })).toBe('info');
    expect(resolveLogLevel({})).toBe('silent');
  });

  it('AC-5: an invalid env level is ignored and falls through to config/default', () => {
    expect(resolveLogLevel({ env: 'verbose', config: 'warn' })).toBe('warn');
    expect(resolveLogLevel({ env: 'verbose' })).toBe('silent');
  });

  it('AC-5: format — env wins over config wins over the TTY-derived default', () => {
    expect(resolveLogFormat({ env: 'json', config: 'pretty', isTTY: true })).toBe('json');
    expect(resolveLogFormat({ config: 'pretty', isTTY: false })).toBe('pretty');
    expect(resolveLogFormat({ isTTY: true })).toBe('pretty');
    expect(resolveLogFormat({ isTTY: false })).toBe('json');
  });

  it('AC-5: an invalid env format is ignored and falls through', () => {
    expect(resolveLogFormat({ env: 'xml', config: 'json', isTTY: true })).toBe('json');
    expect(resolveLogFormat({ env: 'xml', isTTY: true })).toBe('pretty');
  });
});
