import { describe, it, expect } from 'vitest';
import { selectNotifier } from '../../src/notify/factory.js';
import { NullNotifier } from '../../src/notify/null.js';
import { StderrNotifier } from '../../src/notify/stderr.js';
import { FileNotifier } from '../../src/notify/file.js';

describe('selectNotifier (AC-4)', () => {
  it('defaults to StderrNotifier when config is null', () => {
    expect(selectNotifier(null)).toBeInstanceOf(StderrNotifier);
  });

  it('returns StderrNotifier for transport=stderr', () => {
    expect(selectNotifier({ notify: { transport: 'stderr' } })).toBeInstanceOf(StderrNotifier);
  });

  it('returns NullNotifier for transport=none', () => {
    expect(selectNotifier({ notify: { transport: 'none' } })).toBeInstanceOf(NullNotifier);
  });

  it('returns FileNotifier for transport=file with default path', () => {
    const n = selectNotifier({ notify: { transport: 'file' } });
    expect(n).toBeInstanceOf(FileNotifier);
  });

  it('honors notify.file override for transport=file', () => {
    const n = selectNotifier({ notify: { transport: 'file', file: 'custom.log' } });
    expect(n).toBeInstanceOf(FileNotifier);
  });
});
