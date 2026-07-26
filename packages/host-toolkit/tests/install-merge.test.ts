import { describe, it, expect } from 'vitest';
import {
  isCadenceManagedEntry,
  mergeManagedHookEntries,
  type ManagedHookEntry,
} from '../src/install-merge.js';

// AC-2: the managed-marker merge logic (formerly duplicated — and diverging
// in surrounding behavior but identical in this core algorithm — between
// host-claude-code/src/install.ts and host-codex/src/install.ts) lives in
// one shared implementation. Each adapter's own install.test.ts continues to
// exercise it end-to-end via installHooks(); this suite is the single unit
// test of the merge algorithm itself.

function cadenceEntry(command: string, matcher?: string): ManagedHookEntry {
  return {
    ...(matcher !== undefined ? { matcher } : {}),
    hooks: [{ type: 'command', command }],
    _managedBy: 'cadence',
  };
}

function userEntry(command: string, matcher?: string): ManagedHookEntry {
  return {
    ...(matcher !== undefined ? { matcher } : {}),
    hooks: [{ type: 'command', command }],
  };
}

describe('isCadenceManagedEntry (AC-2)', () => {
  it('true for an entry tagged _managedBy: cadence', () => {
    expect(isCadenceManagedEntry(cadenceEntry('npx cadence hook'))).toBe(true);
  });

  it('false for an entry with no _managedBy field', () => {
    expect(isCadenceManagedEntry(userEntry('user-hook'))).toBe(false);
  });

  it('false for an entry tagged with a different (e.g. legacy) marker', () => {
    expect(isCadenceManagedEntry({ hooks: [{ type: 'command', command: 'x' }], _managedBy: 'keel' })).toBe(
      false,
    );
  });
});

describe('mergeManagedHookEntries (AC-2)', () => {
  it('adds desired entries to an empty existing map', () => {
    const merged = mergeManagedHookEntries({}, { SessionStart: [cadenceEntry('npx cadence hook')] });
    expect(merged.SessionStart).toEqual([cadenceEntry('npx cadence hook')]);
  });

  it('preserves user-authored entries on the same event untouched', () => {
    const existing = { SessionStart: [userEntry('user-custom-hook')] };
    const desired = { SessionStart: [cadenceEntry('npx cadence hook')] };

    const merged = mergeManagedHookEntries(existing, desired);

    expect(merged.SessionStart).toHaveLength(2);
    expect(merged.SessionStart).toContainEqual(userEntry('user-custom-hook'));
    expect(merged.SessionStart).toContainEqual(cadenceEntry('npx cadence hook'));
  });

  it('evicts a prior cadence-managed entry before appending the fresh one (idempotent re-install)', () => {
    const existing = { SessionStart: [cadenceEntry('npx old-cadence-hook')] };
    const desired = { SessionStart: [cadenceEntry('npx new-cadence-hook')] };

    const merged = mergeManagedHookEntries(existing, desired);

    expect(merged.SessionStart).toEqual([cadenceEntry('npx new-cadence-hook')]);
  });

  it('running the merge twice does not duplicate the cadence entry', () => {
    const desired = { SessionStart: [cadenceEntry('npx cadence hook')] };
    const once = mergeManagedHookEntries({}, desired);
    const twice = mergeManagedHookEntries(once, desired);

    expect(twice.SessionStart).toHaveLength(1);
  });

  it('leaves event keys present only in existing (untouched by this install) exactly as they were', () => {
    const existing = { Notification: [userEntry('third-party-notification-hook')] };
    const desired = { SessionStart: [cadenceEntry('npx cadence hook')] };

    const merged = mergeManagedHookEntries(existing, desired);

    expect(merged.Notification).toEqual([userEntry('third-party-notification-hook')]);
    expect(merged.SessionStart).toEqual([cadenceEntry('npx cadence hook')]);
  });

  it('merges multiple events in one call independently', () => {
    const existing = {
      PreToolUse: [userEntry('user-bash-hook', 'Bash')],
      PostToolUse: [cadenceEntry('npx old-cadence-hook', 'Edit')],
    };
    const desired = {
      PreToolUse: [cadenceEntry('npx cadence hook', 'Edit')],
      PostToolUse: [cadenceEntry('npx cadence hook', 'Edit'), cadenceEntry('npx cadence hook', 'Skill')],
    };

    const merged = mergeManagedHookEntries(existing, desired);

    expect(merged.PreToolUse).toHaveLength(2);
    expect(merged.PreToolUse).toContainEqual(userEntry('user-bash-hook', 'Bash'));
    expect(merged.PostToolUse).toEqual([
      cadenceEntry('npx cadence hook', 'Edit'),
      cadenceEntry('npx cadence hook', 'Skill'),
    ]);
  });

  it('accepts a custom isStale predicate to additionally evict legacy-marked entries', () => {
    const existing = {
      SessionStart: [
        { hooks: [{ type: 'command' as const, command: 'npx @keel/host hook' }], _managedBy: 'keel' },
        userEntry('user-hook'),
      ],
    };
    const desired = { SessionStart: [cadenceEntry('npx cadence hook')] };
    const isLegacyOrCadence = (e: ManagedHookEntry): boolean =>
      e._managedBy === 'cadence' || e._managedBy === 'keel';

    const merged = mergeManagedHookEntries(existing, desired, isLegacyOrCadence);

    expect(merged.SessionStart).toHaveLength(2);
    expect(merged.SessionStart).toContainEqual(userEntry('user-hook'));
    expect(merged.SessionStart).toContainEqual(cadenceEntry('npx cadence hook'));
    expect(merged.SessionStart?.some((e) => e._managedBy === 'keel')).toBe(false);
  });

  it('does not mutate the existing or desired inputs', () => {
    const existing = { SessionStart: [userEntry('user-hook')] };
    const desired = { SessionStart: [cadenceEntry('npx cadence hook')] };
    const existingSnapshot = JSON.parse(JSON.stringify(existing));
    const desiredSnapshot = JSON.parse(JSON.stringify(desired));

    mergeManagedHookEntries(existing, desired);

    expect(existing).toEqual(existingSnapshot);
    expect(desired).toEqual(desiredSnapshot);
  });
});
