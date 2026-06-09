import { describe, it, expect } from 'vitest';
import { selectPrunable } from '../../src/handoff/retention.js';

describe('selectPrunable (AC-2)', () => {
  const docs = [
    'SESSION-2026-06-05.md',
    'SESSION-2026-06-06.md',
    'SESSION-2026-06-07.md',
    'SESSION-2026-06-08.md',
  ];

  it('AC-2: keeps the newest N by lexicographic-descending order, prunes the rest', () => {
    const prune = selectPrunable(docs, 2, 'SESSION-2026-06-08.md');
    expect(prune.sort()).toEqual(['SESSION-2026-06-05.md', 'SESSION-2026-06-06.md']);
  });

  it('AC-2: returns [] when candidates are within the keep-count', () => {
    expect(selectPrunable(docs, 4, 'SESSION-2026-06-08.md')).toEqual([]);
    expect(selectPrunable(docs, 10, 'SESSION-2026-06-08.md')).toEqual([]);
  });

  it('AC-2: never prunes the current (lastHandoff) doc even when it is the oldest', () => {
    // current is the oldest; keep=1 would otherwise drop everything but the newest.
    const prune = selectPrunable(docs, 1, 'SESSION-2026-06-05.md');
    expect(prune).not.toContain('SESSION-2026-06-05.md');
    // newest is kept by recency, current is kept by force → both survive.
    expect(prune.sort()).toEqual(['SESSION-2026-06-06.md', 'SESSION-2026-06-07.md']);
  });

  it('AC-2: keep-count counts the current doc — current + (N-1) newest survive', () => {
    // current is newest already; keep=2 → current + next-newest survive, oldest two prune.
    const prune = selectPrunable(docs, 2, 'SESSION-2026-06-08.md');
    expect(prune).toHaveLength(2);
  });

  it('AC-2: deterministic — intra-day label ties break alphabetically', () => {
    const sameDay = [
      'SESSION-2026-06-08-alpha.md',
      'SESSION-2026-06-08-bravo.md',
      'SESSION-2026-06-08-charlie.md',
    ];
    const prune = selectPrunable(sameDay, 1, 'SESSION-2026-06-08-charlie.md');
    // newest lexicographically is 'charlie' (also current) → alpha + bravo prune.
    expect(prune).toEqual(['SESSION-2026-06-08-bravo.md', 'SESSION-2026-06-08-alpha.md']);
  });

  it('AC-2: empty input returns []', () => {
    expect(selectPrunable([], 3, 'SESSION-2026-06-08.md')).toEqual([]);
  });
});
