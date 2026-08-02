import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  Logger,
  createLogger,
  getLogger,
  setLogger,
  resetLogger,
  configureLoggerFromConfig,
} from '../../src/logging/logger.js';
import type { LogLevel, LogFormat } from '@thomas-powers-jr/cadence-types';

function capture(level: LogLevel, format: LogFormat = 'json') {
  const lines: string[] = [];
  const logger = new Logger({
    level,
    format,
    write: (l) => lines.push(l),
    now: () => '2026-06-07T00:00:00.000Z',
  });
  return { logger, lines };
}

describe('Logger level gating (AC-3)', () => {
  it('AC-3: at level warn, trace/debug/info are suppressed; warn/error emit', () => {
    const { logger, lines } = capture('warn');
    logger.trace('t');
    logger.debug('d');
    logger.info('i');
    expect(lines).toHaveLength(0);
    logger.warn('w');
    logger.error('e');
    expect(lines).toHaveLength(2);
  });

  it('AC-3: the silent default emits nothing at any level', () => {
    const { logger, lines } = capture('silent');
    logger.error('e');
    logger.warn('w');
    logger.info('i');
    logger.debug('d');
    logger.trace('t');
    expect(lines).toHaveLength(0);
  });
});

describe('Logger child context (AC-4)', () => {
  it('AC-4: child binds seam + fields without mutating the parent', () => {
    const { logger, lines } = capture('info');
    const child = logger.child({ seam: 'gate', phase: '80' });
    child.info('decided', { ac: 'AC-4' });
    logger.info('plain');
    const childRec = JSON.parse(lines[0]!);
    const parentRec = JSON.parse(lines[1]!);
    expect(childRec.seam).toBe('gate');
    expect(childRec.fields).toMatchObject({ phase: '80', ac: 'AC-4' });
    expect(parentRec.seam).toBeUndefined();
    expect(parentRec.fields).toBeUndefined();
  });

  it('AC-4: nested children merge bound context', () => {
    const { logger, lines } = capture('info');
    logger.child({ seam: 'verify' }).child({ provider: 'anthropic' }).info('call');
    const rec = JSON.parse(lines[0]!);
    expect(rec.seam).toBe('verify');
    expect(rec.fields).toMatchObject({ provider: 'anthropic' });
  });
});

describe('Logger stdout invariant (AC-6)', () => {
  it('AC-6: the default sink writes to stderr and never stdout', () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const outSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      const logger = createLogger({ level: 'trace', format: 'json', now: () => 'T' });
      logger.error('e');
      logger.warn('w');
      logger.info('i');
      logger.debug('d');
      logger.trace('t');
      expect(errSpy).toHaveBeenCalledTimes(5);
      expect(outSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      outSpy.mockRestore();
    }
  });
});

describe('createLogger resolution + singleton', () => {
  it('AC-5: createLogger resolves level from env over config', () => {
    const lines: string[] = [];
    const logger = createLogger({
      env: { CADENCE_LOG_LEVEL: 'debug' },
      configLevel: 'silent',
      isTTY: false,
      write: (l) => lines.push(l),
      now: () => 'T',
    });
    logger.debug('hi');
    expect(lines).toHaveLength(1);
  });

  it('getLogger/setLogger/resetLogger manage the process singleton', () => {
    const lines: string[] = [];
    const custom = new Logger({
      level: 'info',
      format: 'json',
      write: (l) => lines.push(l),
      now: () => 'T',
    });
    setLogger(custom);
    getLogger().info('via singleton');
    expect(lines).toHaveLength(1);
    resetLogger();
  });
});

describe('configureLoggerFromConfig (AC-4)', () => {
  afterEach(() => resetLogger());

  it('AC-4: installs the process logger at config.logging.level (no env override)', () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const prev = process.env.CADENCE_LOG_LEVEL;
    delete process.env.CADENCE_LOG_LEVEL;
    try {
      configureLoggerFromConfig({ logging: { level: 'debug' } });
      getLogger().debug('x');
      expect(errSpy).toHaveBeenCalledTimes(1);
    } finally {
      errSpy.mockRestore();
      if (prev !== undefined) process.env.CADENCE_LOG_LEVEL = prev;
    }
  });

  it('AC-4: CADENCE_LOG_LEVEL env overrides config.logging.level', () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const prev = process.env.CADENCE_LOG_LEVEL;
    process.env.CADENCE_LOG_LEVEL = 'silent';
    try {
      configureLoggerFromConfig({ logging: { level: 'debug' } });
      getLogger().debug('x');
      getLogger().error('y');
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      if (prev === undefined) delete process.env.CADENCE_LOG_LEVEL;
      else process.env.CADENCE_LOG_LEVEL = prev;
    }
  });
});
