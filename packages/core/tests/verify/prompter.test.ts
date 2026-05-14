import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { ScriptedPrompter, StdinPrompter } from '../../src/verify/prompter.js';

// AC-1: scripted ordering + exhaustion + stdin happy path

function fakeTtyInput(input: string): NodeJS.ReadableStream & { isTTY: true } {
  const stream = Readable.from([input]) as NodeJS.ReadableStream & { isTTY: true };
  stream.isTTY = true;
  return stream;
}

function captureOutput(chunks: string[]): NodeJS.WritableStream {
  return new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  }) as unknown as NodeJS.WritableStream;
}

describe('ScriptedPrompter (AC-1)', () => {
  it('returns answers in order', async () => {
    const p = new ScriptedPrompter(['pass', 'fail', 'skip']);
    expect(await p.ask('q1')).toBe('pass');
    expect(await p.ask('q2')).toBe('fail');
    expect(await p.ask('q3')).toBe('skip');
    expect(p.used).toBe(3);
  });

  it('throws on exhaustion', async () => {
    const p = new ScriptedPrompter(['only']);
    await p.ask('q1');
    await expect(p.ask('q2')).rejects.toThrow(/exhausted/);
  });

  it('reports zero-answer state', async () => {
    const p = new ScriptedPrompter([]);
    await expect(p.ask('q1')).rejects.toThrow(/exhausted/);
    expect(p.used).toBe(0);
  });
});

describe('StdinPrompter (AC-1)', () => {
  it('reads one line from a TTY-shaped readable stream', async () => {
    const chunks: string[] = [];
    const p = new StdinPrompter({
      input: fakeTtyInput('hello\n'),
      output: captureOutput(chunks),
    });
    const answer = await p.ask('say something: ');
    expect(answer).toBe('hello');
    expect(chunks.join('')).toMatch(/say something:/);
    p.close();
  });

  it('refuses when stdin is not a TTY', () => {
    // Simulate non-TTY: stream without isTTY flag set.
    const nonTty = Readable.from(['x']) as NodeJS.ReadableStream & {
      isTTY?: boolean;
    };
    nonTty.isTTY = false;
    // The constructor's TTY check is keyed to `process.stdin`. To exercise it
    // we need the default-stdin path. Vitest's harness has no TTY, so:
    expect(() => new StdinPrompter()).toThrow(/not a TTY/);
  });
});
