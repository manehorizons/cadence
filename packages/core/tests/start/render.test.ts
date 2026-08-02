import { describe, it, expect } from 'vitest';
import { renderMenu, renderJson, renderConfirm } from '../../src/start/render.js';
import { resolvePick } from '../../src/start/menu.js';

describe('start render', () => {
  it('lists all options and the quit line (AC-3)', () => {
    const text = renderMenu(false);
    expect(text).toContain('What are you doing?');
    expect(text).toContain('1. Try Cadence in a throwaway sandbox');
    expect(text).toContain('→ npx @thomas-powers-jr/cadence-host-codex install');
    expect(text).toContain('q. Quit');
  });

  it('shows an opinionated recommended command when provided', () => {
    const text = renderMenu(false, {
      command: 'npx -y @thomas-powers-jr/cadence-core tutorial',
      reason: 'Fastest first touch.',
    });
    expect(text).toContain('Recommended: npx -y @thomas-powers-jr/cadence-core tutorial');
    expect(text).toContain('Fastest first touch.');
  });

  it('annotates the init option only when initialized (AC-3)', () => {
    expect(renderMenu(false)).not.toContain('already set up');
    expect(renderMenu(true)).toContain('already set up — re-runs are safe');
  });

  it('emits the structured menu for --json (AC-4)', () => {
    const json = renderJson(true, {
      command: 'cadence draft new --title "Fix login timeout" --template bugfix',
      reason: 'You are set up and idle.',
    });
    expect(json.initialized).toBe(true);
    expect(json.options).toHaveLength(7);
    expect(json.options[0]).toHaveProperty('runner');
    expect(json.recommendation?.command).toContain('--template bugfix');
  });

  it('builds a confirm line naming the command (AC-3)', () => {
    const opt = resolvePick(2);
    expect(opt).toBeDefined();
    expect(renderConfirm(opt!)).toContain('cadence init');
    expect(renderConfirm(opt!)).toContain('[Y/n]');
  });
});
