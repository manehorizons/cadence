import { describe, it, expect } from 'vitest';
import { detectForeignCadenceBinary } from '../../src/services/settle.js';

// Phase 244 T1 (244-01, first acceptance criterion): pure, unit-testable
// detector for rec-20260729-001 — `cadence settle run` executing through a
// globally-installed `cadence` binary that predates this repo's own build,
// rather than this checkout's `packages/core/bin/cadence.cjs`. No fixtures,
// no filesystem/process access — the function takes already-resolved plain
// string/boolean facts, so these tests exercise it directly.
describe('detectForeignCadenceBinary (phase 244 T1)', () => {
  it('244-01/AC-1: reports a mismatch when the running binary sits outside the repo toplevel AND the repo is recognizably the CADENCE monorepo', () => {
    const runningBinaryRealpath = '/usr/local/lib/node_modules/@manehorizons/cadence-core/bin/cadence.cjs';
    const repoToplevel = '/home/thomas/projects/cadence';

    expect(
      detectForeignCadenceBinary(runningBinaryRealpath, repoToplevel, true),
    ).toBe(true);
  });

  it('244-01/AC-1: reports NO mismatch when the running binary resolves to a path inside the repo toplevel, even though the repo is recognizably CADENCE\'s own monorepo', () => {
    const repoToplevel = '/home/thomas/projects/cadence';
    const runningBinaryRealpath = '/home/thomas/projects/cadence/packages/core/bin/cadence.cjs';

    expect(
      detectForeignCadenceBinary(runningBinaryRealpath, repoToplevel, true),
    ).toBe(false);
  });

  it("244-01/AC-1: reports NO mismatch when the running binary is inside the repo toplevel even if repoHasOwnCadenceBuild is false — 'inside' wins regardless of the other flag", () => {
    const repoToplevel = '/home/thomas/projects/cadence';
    const runningBinaryRealpath = '/home/thomas/projects/cadence/packages/core/bin/cadence.cjs';

    expect(
      detectForeignCadenceBinary(runningBinaryRealpath, repoToplevel, false),
    ).toBe(false);
  });

  it('244-01/AC-1: reports NO mismatch when the running binary is outside the repo toplevel but the repo is NOT recognizably CADENCE\'s own monorepo (an ordinary consumer project using a globally-installed cadence) — the critical false-positive-avoidance case', () => {
    const runningBinaryRealpath = '/usr/local/lib/node_modules/@manehorizons/cadence-core/bin/cadence.cjs';
    const repoToplevel = '/home/someone/projects/my-app';

    expect(
      detectForeignCadenceBinary(runningBinaryRealpath, repoToplevel, false),
    ).toBe(false);
  });

  it('244-01/AC-1: containment is a real path-boundary check, not a naive string prefix match — a sibling directory sharing a name prefix with the repo toplevel is NOT treated as inside it', () => {
    const repoToplevel = '/home/thomas/projects/cadence';
    // Shares the literal string prefix "/home/thomas/projects/cadence" but is
    // actually a distinct sibling directory ("cadence-consumer"), not a path
    // nested under repoToplevel.
    const runningBinaryRealpath = '/home/thomas/projects/cadence-consumer/node_modules/.bin/cadence.cjs';

    expect(
      detectForeignCadenceBinary(runningBinaryRealpath, repoToplevel, true),
    ).toBe(true);
  });

  it('244-01/AC-1: the repo toplevel itself is trivially "inside" (edge case — a binary path equal to the toplevel is not reported as a mismatch)', () => {
    const repoToplevel = '/home/thomas/projects/cadence';

    expect(
      detectForeignCadenceBinary(repoToplevel, repoToplevel, true),
    ).toBe(false);
  });

  it('244-01/AC-1: a trailing slash on repoToplevel does not produce a false mismatch for a binary genuinely inside it (both absolute inputs are `resolve()`d before the containment check)', () => {
    const repoToplevel = '/home/thomas/projects/cadence/';
    const runningBinaryRealpath = '/home/thomas/projects/cadence/packages/core/bin/cadence.cjs';

    expect(
      detectForeignCadenceBinary(runningBinaryRealpath, repoToplevel, true),
    ).toBe(false);
  });
});
